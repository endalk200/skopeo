import { NodeServices } from "@effect/platform-node";
import { GitServiceLive } from "@skopeo/utils";
import { Effect, Layer } from "effect";
import { runCli } from "./cli/run.js";
import { handleCliFailure } from "./runtime/failures.js";
import { configLayer } from "./runtime/layers.js";
import { telemetryLayer, withoutConsoleLogger } from "./runtime/telemetry.js";

// Telemetry reads Skopeo Configuration, but a broken config must not take
// down config-independent commands (config init/path/validate, version,
// --help). On config errors telemetry degrades to the disabled-telemetry
// logger set; the commands that actually need config (review) load it
// themselves and surface the error properly.
const telemetryLayerWithConfig = telemetryLayer.pipe(
	Layer.provide(configLayer),
	Layer.catch(() => withoutConsoleLogger),
);

// Config-dependent services (SkopeoConfig, ModelProviderService,
// CodeReviewService) are provided inside the review command handler — see
// runtime/layers.ts — so they are only constructed when a command needs them.
const applicationLayer = Layer.mergeAll(telemetryLayerWithConfig, GitServiceLive);

const cliLayer = applicationLayer.pipe(Layer.provideMerge(NodeServices.layer));

const cliWithServices = runCli.pipe(Effect.provide(cliLayer));

export const program = cliWithServices.pipe(Effect.catchTags(handleCliFailure));
