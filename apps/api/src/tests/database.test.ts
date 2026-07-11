import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../config/app-config.js";
import { DatabaseHealth, DatabaseHealthLive, DatabaseLive, DatabaseUnavailable } from "../infra/db/database.js";

const UnavailableDatabaseConfig = Layer.succeed(AppConfig)(
	AppConfig.of({
		databaseUrl: Redacted.make("postgres://postgres:postgres@127.0.0.1:1/skopeo"),
		host: "127.0.0.1",
		otlpBaseUrl: Option.none(),
		port: 4000,
	}),
);

const TestLayer = DatabaseHealthLive.pipe(Layer.provideMerge(DatabaseLive), Layer.provide(UnavailableDatabaseConfig));

describe("Database", () => {
	it.effect("builds while Postgres is unavailable and reports the outage through readiness", () =>
		Effect.gen(function* () {
			const health = yield* DatabaseHealth;
			const error = yield* Effect.flip(health.ping);

			assert.instanceOf(error, DatabaseUnavailable);
		}).pipe(Effect.provide(TestLayer)),
	);
});
