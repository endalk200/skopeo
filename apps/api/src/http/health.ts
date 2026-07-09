import { Cause, Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { DatabaseHealth } from "../infra/db/database.js";

const ok = HttpServerResponse.text("ok");
const unavailable = HttpServerResponse.text("unavailable", { status: 503 });

const readinessFailed = (cause: unknown) =>
	Effect.logWarning("Readiness check failed", cause).pipe(Effect.as(unavailable));

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
		// Defects indicate an unexpected implementation failure, so keep the 500
		// response while making it visible even though probe tracing is disabled.
		Effect.tapDefect((defect) => Effect.logError("Readiness check defect", Cause.die(defect))),
		Effect.catch(readinessFailed),
	),
).pipe(Layer.provide(HttpRouter.disableLogger));

export const HealthRoutesLive = Layer.mergeAll(HealthzLive, ReadyzLive);
