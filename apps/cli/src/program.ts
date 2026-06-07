import { NodeServices } from "@effect/platform-node";
import { CodeReviewAgentLayer } from "@skopeo/code-review-agent";
import { SkopeoConfig } from "@skopeo/config";
import { Effect, Layer } from "effect";

import { runCli } from "./cli/run.js";
import { handleCliFailure } from "./runtime/failures.js";
import { telemetryLayer } from "./runtime/telemetry.js";

const SkopeoConfigLayer = SkopeoConfig.layer;
const TelemetryLayer = telemetryLayer.pipe(Layer.provide(SkopeoConfigLayer));
const CodeReviewAgentConfiguredLayer = CodeReviewAgentLayer.pipe(Layer.provide(SkopeoConfigLayer));
const MainLayer = Layer.mergeAll(SkopeoConfigLayer, TelemetryLayer, CodeReviewAgentConfiguredLayer).pipe(
	Layer.provideMerge(NodeServices.layer),
);

export const program = runCli.pipe(Effect.provide(MainLayer), Effect.catchTags(handleCliFailure));
