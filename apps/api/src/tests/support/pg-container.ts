import { PgClient } from "@effect/sql-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Context, Effect, Layer, Redacted } from "effect";
import { DatabaseHealthLive, DatabaseLayer } from "../../infra/db/database.js";
import { runDatabaseMigrations } from "../../infra/db/migrations.js";

export class PgContainer extends Context.Service<PgContainer, StartedPostgreSqlContainer>()(
	"skopeo/api/test/PgContainer",
) {}

export const PgContainerLive = Layer.effect(
	PgContainer,
	Effect.acquireRelease(
		Effect.promise(() => new PostgreSqlContainer("postgres:17.6").start()),
		(container) => Effect.promise(() => container.stop()),
	),
);

const PgClientTestLive = Layer.unwrap(
	Effect.map(PgContainer, (container) => PgClient.layer({ url: Redacted.make(container.getConnectionUri()) })),
);

const MigrationsLive = Layer.effectDiscard(runDatabaseMigrations);

/**
 * A real Postgres database in a throwaway container, with the production
 * drizzle migrations applied. Building the layer starts the container;
 * releasing the test scope stops it.
 */
const ContainerClientLive = PgClientTestLive.pipe(Layer.provideMerge(PgContainerLive));

const MigratedDatabaseLive = MigrationsLive.pipe(
	Layer.provideMerge(DatabaseLayer.pipe(Layer.provideMerge(ContainerClientLive))),
);

export const ContainerDatabaseLive = DatabaseHealthLive.pipe(Layer.provideMerge(MigratedDatabaseLive));
