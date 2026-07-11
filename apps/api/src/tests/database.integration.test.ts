import { assert, it, vi } from "@effect/vitest";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { Database, DatabaseHealth } from "../infra/db/database.js";
import { runDatabaseMigrations } from "../infra/db/migrations.js";
import { ContainerDatabaseLive, PgContainer } from "./support/pg-container.js";

it.effect(
	"connects to PostgreSQL and releases the container",
	() =>
		Effect.gen(function* () {
			let stopSpy: ReturnType<typeof vi.spyOn> | undefined;

			yield* Effect.scoped(
				Effect.gen(function* () {
					const container = yield* PgContainer;
					stopSpy = vi.spyOn(container, "stop");

					const health = yield* DatabaseHealth;
					yield* health.ping;
				}).pipe(Effect.provide(ContainerDatabaseLive)),
			);

			assert.strictEqual(stopSpy?.mock.calls.length, 1);
		}),
	120_000,
);

it.effect(
	"reruns the one-shot migration without reapplying completed migrations",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;
			const readMigrationCount = Effect.map(
				database.execute<{ count: number }>(
					sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
				),
				(rows) => rows[0]?.count,
			);
			const before = yield* readMigrationCount;
			yield* runDatabaseMigrations;
			const afterFirstRun = yield* readMigrationCount;
			yield* runDatabaseMigrations;
			const afterSecondRun = yield* readMigrationCount;

			assert.strictEqual(afterFirstRun, before);
			assert.strictEqual(afterSecondRun, afterFirstRun);
		}).pipe(Effect.provide(ContainerDatabaseLive)),
	120_000,
);
