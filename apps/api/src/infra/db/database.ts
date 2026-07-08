import { PgClient } from "@effect/sql-pg";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import * as Drizzle from "drizzle-orm/effect-postgres";
import { Context, Effect, Layer } from "effect";
import { AppConfig } from "../../config/app-config.js";

export class Database extends Context.Service<Database, EffectPgDatabase>()("skopeo/api/Database") {}

const PgClientLive = Layer.unwrap(
	Effect.map(AppConfig, (config) =>
		PgClient.layer({
			applicationName: "skopeo-api",
			maxConnections: 10,
			url: config.databaseUrl,
		}),
	),
);

export const DatabaseLive = Layer.effect(
	Database,
	Effect.map(Drizzle.makeWithDefaults(), (database) => Database.of(database)),
).pipe(Layer.provide(PgClientLive));
