import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpRouter } from "effect/unstable/http";
import { HealthRoutesLive } from "../http/health.js";
import { DatabaseHealth, DatabaseUnavailable } from "../infra/db/database.js";

const makeTestLayer = (ping: Effect.Effect<void, DatabaseUnavailable>) =>
	HttpRouter.serve(HealthRoutesLive, { disableListenLog: true, disableLogger: true }).pipe(
		Layer.provideMerge(NodeHttpServer.layerTest),
		Layer.provide(Layer.succeed(DatabaseHealth)(DatabaseHealth.of({ ping }))),
	);

const HealthyLayer = makeTestLayer(Effect.void);
const UnhealthyLayer = makeTestLayer(Effect.fail(new DatabaseUnavailable({ message: "Database is unreachable." })));

describe("Health endpoints", () => {
	it.effect("healthz responds 200 without touching the database", () =>
		Effect.gen(function* () {
			const response = yield* HttpClient.get("/healthz");

			assert.strictEqual(response.status, 200);
			assert.strictEqual(yield* response.text, "ok");
		}).pipe(Effect.provide(UnhealthyLayer)),
	);

	it.effect("readyz responds 200 when the database is reachable", () =>
		Effect.gen(function* () {
			const response = yield* HttpClient.get("/readyz");

			assert.strictEqual(response.status, 200);
			assert.strictEqual(yield* response.text, "ok");
		}).pipe(Effect.provide(HealthyLayer)),
	);

	it.effect("readyz responds 503 when the database is unreachable", () =>
		Effect.gen(function* () {
			const response = yield* HttpClient.get("/readyz");

			assert.strictEqual(response.status, 503);
			assert.strictEqual(yield* response.text, "unavailable");
		}).pipe(Effect.provide(UnhealthyLayer)),
	);
});
