import { fileURLToPath } from "node:url";
import { PgClient } from "@effect/sql-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Context, Effect, Layer, Redacted } from "effect";
import { Database, DatabaseLayer } from "../../infra/db/database.js";

export class PgContainer extends Context.Service<PgContainer, StartedPostgreSqlContainer>()(
	"skopeo/api/test/PgContainer",
) {}

const PgContainerLive = Layer.effect(
	PgContainer,
	Effect.acquireRelease(
		Effect.promise(() => new PostgreSqlContainer("postgres:17.6").start()),
		(container) => Effect.promise(() => container.stop()),
	),
);

const PgClientTestLive = Layer.unwrap(
	Effect.map(PgContainer, (container) => PgClient.layer({ url: Redacted.make(container.getConnectionUri()) })),
).pipe(Layer.provide(PgContainerLive));

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

const MigrationsLive = Layer.effectDiscard(
	Effect.flatMap(Database, (database) => migrate(database, { migrationsFolder })),
);

/**
 * A real Postgres database in a throwaway container, with the production
 * drizzle migrations applied. Building the layer starts the container;
 * releasing the test scope stops it.
 */
export const ContainerDatabaseLive = MigrationsLive.pipe(
	Layer.provideMerge(DatabaseLayer),
	Layer.provide(PgClientTestLive),
);
