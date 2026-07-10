import { assert, it, vi } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseHealth } from "../infra/db/database.js";
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
