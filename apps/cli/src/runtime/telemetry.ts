import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { DEFAULT_OTLP_HTTP_ENDPOINT, SkopeoConfig, type SkopeoConfiguration } from "@skopeo/config";
import { Data, Effect, Layer, Logger } from "effect";

import { VERSION } from "../version.js";

export { DEFAULT_OTLP_HTTP_ENDPOINT } from "@skopeo/config";

export class TelemetryCollectorUnavailable extends Data.TaggedError("TelemetryCollectorUnavailable")<{
	readonly endpoint: string;
	readonly cause: unknown;
}> {}

export type TelemetryMode = "enabled" | "disabled";

export const withoutConsoleLogger = Logger.layer([], {
	mergeWithExisting: false,
});

const checkCollector = (endpoint: string) =>
	Effect.tryPromise({
		try: async () => {
			const response = await fetch(endpoint, {
				signal: AbortSignal.timeout(1_000),
			});

			return response;
		},
		catch: (cause) => new TelemetryCollectorUnavailable({ endpoint, cause }),
	}).pipe(Effect.asVoid);

const makeTelemetryLayer = (endpoint: string) =>
	NodeSdk.layer(
		Effect.gen(function* () {
			yield* checkCollector(endpoint);

			return {
				resource: {
					serviceName: "skopeo-cli",
					serviceVersion: VERSION,
				},
				spanProcessor: [
					new SimpleSpanProcessor(
						new OTLPTraceExporter({
							url: `${endpoint}/v1/traces`,
						}),
					),
				],
				logRecordProcessor: [
					new SimpleLogRecordProcessor(
						new OTLPLogExporter({
							url: `${endpoint}/v1/logs`,
						}),
					),
				],
				loggerMergeWithExisting: false,
			};
		}),
	);

export const telemetryLayerFromMode = (
	mode: TelemetryMode,
	endpoint = DEFAULT_OTLP_HTTP_ENDPOINT,
): Layer.Layer<never, TelemetryCollectorUnavailable> =>
	mode === "enabled" ? makeTelemetryLayer(endpoint) : withoutConsoleLogger;

export const telemetryLayerFromConfiguration = (
	config: SkopeoConfiguration,
): Layer.Layer<never, TelemetryCollectorUnavailable> =>
	telemetryLayerFromMode(config.telemetry.enabled ? "enabled" : "disabled", config.telemetry.otlpEndpoint);

export const telemetryLayer = Layer.unwrap(
	Effect.gen(function* () {
		const config = yield* SkopeoConfig;
		return telemetryLayerFromConfiguration(config);
	}),
);
