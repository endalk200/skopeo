import { PgClient } from "@effect/sql-pg";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import * as Drizzle from "drizzle-orm/effect-postgres";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { Pool } from "pg";
import { AppConfig } from "../../config/app-config.js";

export class Database extends Context.Service<Database, EffectPgDatabase>()("skopeo/api/Database") {}

const acquirePool = (databaseUrl: Redacted.Redacted<string>) =>
	Effect.acquireRelease(
		Effect.sync(() => {
			const pool = new Pool({
				application_name: "skopeo-api",
				connectionString: Redacted.value(databaseUrl),
				connectionTimeoutMillis: 5_000,
				max: 10,
			});
			pool.on("error", () => {});
			return pool;
		}),
		(pool) => Effect.promise(() => pool.end()).pipe(Effect.timeoutOption(1_000), Effect.asVoid),
	);

const PgClientLive = Layer.unwrap(
	Effect.map(AppConfig, (config) =>
		PgClient.layerFrom(
			PgClient.fromPool({
				acquire: acquirePool(config.databaseUrl),
			}),
		),
	),
);

/**
 * Builds the drizzle database from whichever `PgClient` is in context.
 * Production wires `PgClientLive` below; integration tests provide a
 * testcontainers-backed client instead.
 */
export const DatabaseLayer = Layer.effect(
	Database,
	Effect.map(Drizzle.makeWithDefaults(), (database) => Database.of(database)),
);

export const DatabaseLive = DatabaseLayer.pipe(Layer.provide(PgClientLive));

export class DatabaseUnavailable extends Schema.TaggedErrorClass<DatabaseUnavailable>()("DatabaseUnavailable", {
	message: Schema.String,
}) {}

/**
 * Small port for readiness probing, so HTTP health routes do not depend on
 * the full drizzle database surface and tests can fake it with one function.
 */
export class DatabaseHealth extends Context.Service<
	DatabaseHealth,
	{
		readonly ping: Effect.Effect<void, DatabaseUnavailable>;
	}
>()("skopeo/api/DatabaseHealth") {}

export const DatabaseHealthLive = Layer.effect(
	DatabaseHealth,
	Effect.map(Database, (database) =>
		DatabaseHealth.of({
			ping: database.execute("select 1").pipe(
				Effect.asVoid,
				Effect.mapError((cause) => {
					const error = new DatabaseUnavailable({ message: "Database is unreachable." });
					error.cause = cause;
					return error;
				}),
			),
		}),
	),
);
