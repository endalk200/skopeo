import { NodeServices } from "@effect/platform-node";
import { SkopeoConfig } from "@skopeo/config";
import { Effect, Layer } from "effect";

import { runCli } from "./cli/run.js";
import { handleCliFailure } from "./runtime/failures.js";
import { telemetryLayer } from "./runtime/telemetry.js";

const SkopeoConfigLayer = SkopeoConfig.layer.pipe(Layer.provide(NodeServices.layer));
const TelemetryLayer = telemetryLayer.pipe(Layer.provide(SkopeoConfigLayer));
const MainLayer = Layer.mergeAll(NodeServices.layer, SkopeoConfigLayer, TelemetryLayer);

export const program = runCli.pipe(Effect.provide(MainLayer), Effect.catchTags(handleCliFailure));
