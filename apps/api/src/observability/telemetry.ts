import { Effect, Layer, Option } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Otlp } from "effect/unstable/observability";
import { AppConfig } from "../config/app-config.js";

/**
 * Exports logs, metrics, and traces over OTLP/HTTP (JSON) to
 * `${otlpBaseUrl}/v1/{logs,metrics,traces}`. The exporter's HttpClient is
 * provided locally so it never leaks into the application context.
 */
export const TelemetryLive = Layer.unwrap(
	Effect.map(AppConfig, (config) =>
		Option.match(config.otlpBaseUrl, {
			onNone: () => Layer.empty,
			onSome: (baseUrl) =>
				Otlp.layerJson({
					baseUrl,
					loggerMergeWithExisting: true,
					resource: { serviceName: "skopeo-api" },
				}).pipe(Layer.provide(FetchHttpClient.layer)),
		}),
	),
);
