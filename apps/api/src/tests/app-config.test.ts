import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Option } from "effect";
import { AppConfig, AppConfigLive } from "../config/app-config.js";

describe("AppConfig", () => {
	it.effect("starts without an OTLP collector", () =>
		Effect.gen(function* () {
			const config = yield* AppConfig;

			assert.isTrue(Option.isNone(config.otlpBaseUrl));
		}).pipe(
			Effect.provide(AppConfigLive),
			Effect.provideService(
				ConfigProvider.ConfigProvider,
				ConfigProvider.fromUnknown({ DATABASE_URL: "postgres://skopeo:secret@postgres:5432/skopeo" }),
			),
		),
	);

	it.effect("explains how to set DATABASE_URL when it is missing", () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(Layer.build(AppConfigLive)).pipe(
				Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
				Effect.scoped,
			);

			// Config.redacted redacts the offending value in the failure message;
			// the config path still tells the operator which variable to set.
			assert.match(error.message, /Invalid data <redacted>/);
			assert.match(error.message, /\["DATABASE_URL"\]/);
		}),
	);
});
