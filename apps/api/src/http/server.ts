import { createServer } from "node:http";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpMiddleware, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";
import { AppConfig, AppConfigLive } from "../config/app-config.js";
import { DatabaseHealthLive, DatabaseLive } from "../infra/db/database.js";
import { SpanNamesLive } from "../observability/span-names.js";
import { TelemetryLive } from "../observability/telemetry.js";
import { SkopeoApi } from "./api.js";
import { HealthRoutesLive } from "./health.js";
import { RequestBodyLimitMiddlewareLive, RequestBodySizeLive } from "./request-limits.js";

const ApiRoutesLive = Layer.mergeAll(
	HttpApiBuilder.layer(SkopeoApi, { openapiPath: "/api/openapi.json" }),
	HttpApiSwagger.layer(SkopeoApi, { path: "/api/docs" }),
	HealthRoutesLive,
).pipe(Layer.provide(RequestBodyLimitMiddlewareLive));

const NodeServerLive = Layer.unwrap(
	Effect.map(AppConfig, (config) =>
		NodeHttpServer.layer(createServer, {
			host: config.host,
			port: config.port,
		}),
	),
);

export const ServerLive = HttpRouter.serve(ApiRoutesLive).pipe(
	Layer.provide(DatabaseHealthLive),
	Layer.provide(DatabaseLive),
	Layer.provide(NodeServerLive),
	// Telemetry must be provided into the server so its tracer, metrics exporter,
	// and additional OTLP logger reach request fibers.
	Layer.provide(TelemetryLive),
	Layer.provide(HttpMiddleware.layerTracerDisabledForUrls(["/healthz", "/readyz"])),
	Layer.provide(SpanNamesLive),
	Layer.provide(RequestBodySizeLive),
	Layer.provide(AppConfigLive),
);
