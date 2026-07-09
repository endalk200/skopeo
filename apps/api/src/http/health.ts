import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { DatabaseHealth } from "../infra/db/database.js";

const ok = HttpServerResponse.text("ok");

/**
 * Liveness: the process is up and serving requests. No dependencies, so a
 * struggling database never causes restarts.
 */
const HealthzLive = HttpRouter.add("GET", "/healthz", ok).pipe(Layer.provide(HttpRouter.disableLogger));

/**
 * Readiness: the service can do useful work, which requires the database.
 * Returns 503 so orchestrators stop routing traffic until the ping recovers.
 */
const ReadyzLive = HttpRouter.add(
	"GET",
	"/readyz",
	Effect.gen(function* () {
		const health = yield* DatabaseHealth;
		yield* health.ping;
		return ok;
	}).pipe(
		Effect.catch((error) =>
			Effect.logWarning("Readiness check failed", error).pipe(
				Effect.as(HttpServerResponse.text("unavailable", { status: 503 })),
			),
		),
	),
).pipe(Layer.provide(HttpRouter.disableLogger));

export const HealthRoutesLive = Layer.mergeAll(HealthzLive, ReadyzLive);
