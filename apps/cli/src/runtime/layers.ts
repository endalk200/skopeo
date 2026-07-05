import { CodeReviewServiceLive } from "@skopeo/code-review-agent";
import { SkopeoConfig } from "@skopeo/config";
import { ModelProviderServiceLive } from "@skopeo/providers";
import { Layer } from "effect";

/**
 * Layers that require a loadable Skopeo Configuration.
 *
 * These are provided per-command (currently only `review`) instead of at the
 * program root, so config-independent commands — `config init`, `config
 * path`, `config validate`, `version`, `--help` — still run when the config
 * file is missing or invalid and can be used to repair it.
 */
export const configLayer = SkopeoConfig.layer;

const modelProviderLayer = ModelProviderServiceLive.pipe(Layer.provide(configLayer));

export const codeReviewLayer = CodeReviewServiceLive.pipe(
	Layer.provide(Layer.mergeAll(configLayer, modelProviderLayer)),
);
