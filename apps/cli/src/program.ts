import { NodeServices } from "@effect/platform-node";
import { CodeReviewServiceLive } from "@skopeo/code-review-agent";
import { SkopeoConfig } from "@skopeo/config";
import { GitServiceLive } from "@skopeo/utils";
import { Effect, Layer } from "effect";
import { runCli } from "./cli/run.js";
import { handleCliFailure } from "./runtime/failures.js";
import { telemetryLayer } from "./runtime/telemetry.js";

const configLayer = SkopeoConfig.layer;

const telemetryLayerWithConfig = telemetryLayer.pipe(Layer.provide(configLayer));

const applicationLayer = Layer.mergeAll(configLayer, telemetryLayerWithConfig, GitServiceLive, CodeReviewServiceLive);

const cliLayer = applicationLayer.pipe(Layer.provideMerge(NodeServices.layer));

const cliWithServices = runCli.pipe(Effect.provide(cliLayer));

export const program = cliWithServices.pipe(Effect.catchTags(handleCliFailure));
