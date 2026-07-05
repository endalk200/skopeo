import {
	type ModelProviderConfig,
	type ModelProviderProtocol,
	type ModelRouteConfig,
	SkopeoConfig,
	type SkopeoConfiguration,
	WELL_KNOWN_MODEL_PROVIDERS,
	type WellKnownModelProviderName,
} from "@skopeo/config";
import type { AnyTextAdapter } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { createOpenaiChat, createOpenaiChatCompletions } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { Context, Data, Effect, Layer, Redacted } from "effect";

/**
 * Models with code-defined Review Profiles. Each entry pairs the model with
 * its access defaults: the wire protocol its profile settings require, the
 * vendor that serves it when no `[models]` route says otherwise, and the slug
 * OpenRouter uses for it.
 *
 * Adding a Review Profile model requires an entry here — the registry is what
 * lets routing validation reject typos and protocol mismatches at config
 * validation time instead of mid-review.
 */
export const SUPPORTED_REVIEW_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.2", "claude-opus-4-8"] as const;
export type SupportedReviewModel = (typeof SUPPORTED_REVIEW_MODELS)[number];

type ModelAccessDefaults = {
	readonly requiredProtocol: ModelProviderProtocol;
	readonly defaultProvider: WellKnownModelProviderName;
	readonly openrouterModelId: string;
};

export const modelAccessRegistry: Record<SupportedReviewModel, ModelAccessDefaults> = {
	"gpt-5.5": {
		requiredProtocol: "openai",
		defaultProvider: "openai",
		openrouterModelId: "openai/gpt-5.5",
	},
	"gpt-5.4": {
		requiredProtocol: "openai",
		defaultProvider: "openai",
		openrouterModelId: "openai/gpt-5.4",
	},
	"gpt-5.2": {
		requiredProtocol: "openai",
		defaultProvider: "openai",
		openrouterModelId: "openai/gpt-5.2",
	},
	"claude-opus-4-8": {
		requiredProtocol: "anthropic",
		defaultProvider: "anthropic",
		openrouterModelId: "anthropic/claude-opus-4.8",
	},
};

const WELL_KNOWN_API_KEY_ENVS: Record<WellKnownModelProviderName, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
};

/**
 * Placeholder credential for custom Model Providers that need no key (local
 * ollama/vLLM endpoints ignore the Authorization header). The vendor SDK
 * clients require a non-empty key string, so this stands in for "none".
 */
const UNAUTHENTICATED_PLACEHOLDER_KEY = "skopeo-unauthenticated";

export const isSupportedReviewModel = (value: string): value is SupportedReviewModel =>
	(SUPPORTED_REVIEW_MODELS as ReadonlyArray<string>).includes(value);

export class UnknownReviewModel extends Data.TaggedError("UnknownReviewModel")<{
	readonly model: string;
}> {}

export class UnknownModelProviderRoute extends Data.TaggedError("UnknownModelProviderRoute")<{
	readonly model: string;
	readonly provider: string;
}> {}

export class IncompatibleModelProviderProtocol extends Data.TaggedError("IncompatibleModelProviderProtocol")<{
	readonly model: string;
	readonly provider: string;
	readonly requiredProtocol: ModelProviderProtocol;
	readonly providerProtocol: ModelProviderProtocol;
}> {}

export class MissingModelProviderApiKey extends Data.TaggedError("MissingModelProviderApiKey")<{
	readonly provider: string;
	readonly envVar: string;
}> {}

export type ModelProviderError =
	| IncompatibleModelProviderProtocol
	| MissingModelProviderApiKey
	| UnknownModelProviderRoute
	| UnknownReviewModel;

export const formatModelProviderError = (error: ModelProviderError): string => {
	switch (error._tag) {
		case "IncompatibleModelProviderProtocol":
			return `Model "${error.model}" requires the "${error.requiredProtocol}" protocol, but provider "${error.provider}" speaks "${error.providerProtocol}". Route it through a compatible provider (its vendor or openrouter).`;
		case "MissingModelProviderApiKey":
			return `Provider "${error.provider}" has no API key: set the ${error.envVar} environment variable.`;
		case "UnknownModelProviderRoute":
			return `Model "${error.model}" is routed to provider "${error.provider}", which is not well-known and is not declared under [providers].`;
		case "UnknownReviewModel":
			return `"${error.model}" is not a code-defined Review Profile model. Known models: ${SUPPORTED_REVIEW_MODELS.join(", ")}.`;
	}
};

export const parseSupportedReviewModel = (value: string): Effect.Effect<SupportedReviewModel, UnknownReviewModel> =>
	isSupportedReviewModel(value) ? Effect.succeed(value) : Effect.fail(new UnknownReviewModel({ model: value }));

/**
 * The exact wire dialect a resolved adapter speaks. Finer-grained than the
 * configured `protocol`, because "openai" covers two different wire APIs:
 *
 * - `openai-responses`: the official OpenAI Responses API (`/v1/responses`),
 *   used for the well-known `openai` provider. Model options use the
 *   Responses shape (e.g. `reasoning: { effort }`).
 * - `openai-chat-completions`: the de-facto "OpenAI-compatible" standard
 *   (`/v1/chat/completions`) that gateways, ollama, and vLLM actually
 *   implement — used for custom providers with `protocol = "openai"`. Model
 *   options use the Chat Completions shape (e.g. `reasoning_effort`).
 *
 * Review Profiles use this to pick the matching model-option shape.
 */
export type ModelWireDialect = "openai-responses" | "openai-chat-completions" | "anthropic" | "openrouter";

/**
 * One resolved model access: the Model Provider chosen for a model, the
 * identifier the wire request uses for it, the wire dialect spoken, and a
 * ready chat adapter.
 */
export type ResolvedModelAccess = {
	readonly model: SupportedReviewModel;
	readonly provider: string;
	readonly wireModelId: string;
	readonly wireDialect: ModelWireDialect;
	readonly adapter: AnyTextAdapter;
};

const isWellKnownModelProvider = (name: string): name is WellKnownModelProviderName =>
	(WELL_KNOWN_MODEL_PROVIDERS as ReadonlyArray<string>).includes(name);

const builtInProviderEntry = (name: WellKnownModelProviderName): ModelProviderConfig => ({
	_tag: "wellKnown",
	name,
	baseUrl: undefined,
	apiKeyEnv: undefined,
});

const findProviderEntry = (config: SkopeoConfiguration, name: string): ModelProviderConfig | undefined =>
	config.providers.find((entry) => entry.name === name) ??
	(isWellKnownModelProvider(name) ? builtInProviderEntry(name) : undefined);

const findModelRoute = (config: SkopeoConfiguration, model: string): ModelRouteConfig | undefined =>
	config.models.find((route) => route.model === model);

const isOpenRouterEntry = (entry: ModelProviderConfig): boolean =>
	entry._tag === "wellKnown" && entry.name === "openrouter";

/**
 * The wire protocol a provider entry speaks, or `undefined` for OpenRouter,
 * whose dedicated adapter translates natively and is therefore
 * protocol-compatible with every model.
 */
const providerProtocol = (entry: ModelProviderConfig): ModelProviderProtocol | undefined => {
	if (entry._tag === "custom") {
		return entry.protocol;
	}
	switch (entry.name) {
		case "anthropic":
			return "anthropic";
		case "openai":
			return "openai";
		case "openrouter":
			return undefined;
	}
};

const apiKeyEnvName = (entry: ModelProviderConfig): string =>
	entry.apiKeyEnv ??
	(entry._tag === "wellKnown"
		? WELL_KNOWN_API_KEY_ENVS[entry.name]
		: `SKOPEO_PROVIDER_${entry.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`);

const resolveApiKey = (
	entry: ModelProviderConfig,
	env: Record<string, string | undefined>,
): Effect.Effect<Redacted.Redacted<string> | undefined, MissingModelProviderApiKey> => {
	const envVar = apiKeyEnvName(entry);
	const value = env[envVar];
	if (value !== undefined && value.trim() !== "") {
		return Effect.succeed(Redacted.make(value));
	}
	// Keys are required lazily. Well-known providers always need one, and an
	// explicit `api_key_env` declares the intent to authenticate — a missing
	// variable is an error, not a silent fall-through to an unauthenticated
	// request. Only custom providers without `api_key_env` may be local
	// endpoints that need no credential.
	if (entry._tag === "wellKnown" || entry.apiKeyEnv !== undefined) {
		return Effect.fail(new MissingModelProviderApiKey({ provider: entry.name, envVar }));
	}
	return Effect.succeed(undefined);
};

type OpenAIChatModel = Parameters<typeof createOpenaiChat>[0];
type AnthropicChatModel = Parameters<typeof createAnthropicChat>[0];
type OpenRouterChatModel = Parameters<typeof createOpenRouterText>[0];

const wireDialectFor = (entry: ModelProviderConfig): ModelWireDialect => {
	if (entry._tag === "wellKnown") {
		switch (entry.name) {
			case "anthropic":
				return "anthropic";
			case "openai":
				// Official OpenAI gets the Responses API — the richest surface
				// for GPT reasoning options. Deliberately unchanged by a
				// base_url override (ADR 0008): the override target must serve
				// /v1/responses (official mirrors, Azure's v1 API surface);
				// Chat-Completions-only endpoints belong under a custom
				// provider, not an override of this entry.
				return "openai-responses";
			case "openrouter":
				return "openrouter";
		}
	}
	// Custom "OpenAI-compatible" endpoints (gateways, ollama, vLLM) implement
	// /v1/chat/completions; the Responses API is far less supported (e.g.
	// LiteLLM->Azure rejects its streaming options), so custom providers with
	// protocol "openai" speak Chat Completions.
	return entry.protocol === "anthropic" ? "anthropic" : "openai-chat-completions";
};

const makeAdapter = (
	entry: ModelProviderConfig,
	wireDialect: ModelWireDialect,
	wireModelId: string,
	apiKey: Redacted.Redacted<string> | undefined,
): AnyTextAdapter => {
	const key = apiKey === undefined ? UNAUTHENTICATED_PLACEHOLDER_KEY : Redacted.value(apiKey);
	const clientOptions = entry.baseUrl === undefined ? {} : { baseURL: entry.baseUrl };

	// Routed wire model ids (and gateway-renamed models generally) are not
	// statically known to the adapters' model unions, hence the casts.
	switch (wireDialect) {
		case "openrouter":
			return createOpenRouterText(
				wireModelId as OpenRouterChatModel,
				key,
				entry.baseUrl === undefined ? {} : { serverURL: entry.baseUrl },
			);
		case "anthropic":
			return createAnthropicChat(wireModelId as AnthropicChatModel, key, clientOptions);
		case "openai-chat-completions":
			return createOpenaiChatCompletions(wireModelId as OpenAIChatModel, key, clientOptions);
		case "openai-responses":
			return createOpenaiChat(wireModelId as OpenAIChatModel, key, clientOptions);
	}
};

/**
 * Resolves how the Code Review Agent reaches `model`: routing rule (or vendor
 * default) -> provider entry -> protocol compatibility -> lazily resolved
 * credential -> ready adapter.
 */
export const resolveModelAccess = (
	config: SkopeoConfiguration,
	env: Record<string, string | undefined>,
	modelValue: string,
): Effect.Effect<ResolvedModelAccess, ModelProviderError> =>
	Effect.gen(function* () {
		const model = yield* parseSupportedReviewModel(modelValue);
		const defaults = modelAccessRegistry[model];
		const route = findModelRoute(config, model);
		const providerName = route?.provider ?? defaults.defaultProvider;

		const entry = findProviderEntry(config, providerName);
		if (entry === undefined) {
			return yield* Effect.fail(new UnknownModelProviderRoute({ model, provider: providerName }));
		}

		const protocol = providerProtocol(entry);
		if (protocol !== undefined && protocol !== defaults.requiredProtocol) {
			return yield* Effect.fail(
				new IncompatibleModelProviderProtocol({
					model,
					provider: entry.name,
					providerProtocol: protocol,
					requiredProtocol: defaults.requiredProtocol,
				}),
			);
		}

		const wireModelId = route?.modelId ?? (isOpenRouterEntry(entry) ? defaults.openrouterModelId : model);
		const wireDialect = wireDialectFor(entry);
		const apiKey = yield* resolveApiKey(entry, env);
		const adapter = makeAdapter(entry, wireDialect, wireModelId, apiKey);

		yield* Effect.annotateCurrentSpan({
			"skopeo.provider.name": entry.name,
			"skopeo.provider.model": model,
			"skopeo.provider.wire_model_id": wireModelId,
			"skopeo.provider.wire_dialect": wireDialect,
			"skopeo.provider.base_url_overridden": entry.baseUrl !== undefined,
		});

		return { adapter, model, provider: entry.name, wireDialect, wireModelId };
	}).pipe(Effect.withSpan("skopeo.providers.resolve_model_access"));

export type ModelAccessIssue = {
	readonly severity: "error" | "warning";
	readonly message: string;
};

/**
 * Semantic validation of Model Provider configuration against the model
 * registry. Structural facts about the file are already hard errors in
 * `@skopeo/config`; this layer adds the registry-dependent checks:
 *
 * - errors for unknown model names (in `[review]` and `[models]`) and
 *   protocol-incompatible routes — facts about the file;
 * - warnings for environment- or intent-dependent facts (unresolvable API
 *   key for the effective profile, declared providers nothing routes to).
 */
export const analyzeModelAccess = (
	config: SkopeoConfiguration,
	env: Record<string, string | undefined> = process.env,
): ReadonlyArray<ModelAccessIssue> => {
	const issues: Array<ModelAccessIssue> = [];
	const error = (message: string) => issues.push({ message, severity: "error" });
	const warning = (message: string) => issues.push({ message, severity: "warning" });

	if (!isSupportedReviewModel(config.review.model)) {
		error(`[review] model: ${formatModelProviderError(new UnknownReviewModel({ model: config.review.model }))}`);
	}

	for (const route of config.models) {
		if (!isSupportedReviewModel(route.model)) {
			error(
				`[models.${route.model}]: ${formatModelProviderError(new UnknownReviewModel({ model: route.model }))}`,
			);
			continue;
		}
		const entry = findProviderEntry(config, route.provider);
		if (entry === undefined) {
			continue;
		}
		const protocol = providerProtocol(entry);
		const required = modelAccessRegistry[route.model].requiredProtocol;
		if (protocol !== undefined && protocol !== required) {
			error(
				`[models.${route.model}]: ${formatModelProviderError(
					new IncompatibleModelProviderProtocol({
						model: route.model,
						provider: entry.name,
						providerProtocol: protocol,
						requiredProtocol: required,
					}),
				)}`,
			);
		}
	}

	if (isSupportedReviewModel(config.review.model)) {
		const defaults = modelAccessRegistry[config.review.model];
		const route = findModelRoute(config, config.review.model);
		const entry = findProviderEntry(config, route?.provider ?? defaults.defaultProvider);
		// Custom providers without api_key_env are intentionally
		// unauthenticated (local endpoints); everything else needs a key.
		if (entry !== undefined && (entry._tag === "wellKnown" || entry.apiKeyEnv !== undefined)) {
			const envVar = apiKeyEnvName(entry);
			const value = env[envVar];
			if (value === undefined || value.trim() === "") {
				warning(
					`The default Review Profile model "${config.review.model}" uses provider "${entry.name}", but ${envVar} is not set in the current environment.`,
				);
			}
		}
	}

	const routedProviders = new Set<string>();
	for (const model of SUPPORTED_REVIEW_MODELS) {
		routedProviders.add(findModelRoute(config, model)?.provider ?? modelAccessRegistry[model].defaultProvider);
	}
	for (const declared of config.providers) {
		if (!routedProviders.has(declared.name)) {
			warning(`Provider "${declared.name}" is declared under [providers], but no model routes to it.`);
		}
	}

	return issues;
};

/**
 * Effect service that resolves a ready chat adapter for a Review Profile
 * model by consulting Skopeo Configuration: `[models]` routing, `[providers]`
 * entries, and lazily resolved credentials.
 */
export class ModelProviderService extends Context.Service<
	ModelProviderService,
	{
		readonly adapterFor: (model: string) => Effect.Effect<ResolvedModelAccess, ModelProviderError>;
	}
>()("ModelProviderService") {
	static readonly layerFromEnvironment = (env: Record<string, string | undefined>) =>
		Layer.effect(
			ModelProviderService,
			Effect.gen(function* () {
				const config = yield* SkopeoConfig;
				return ModelProviderService.of({
					adapterFor: (model) => resolveModelAccess(config, env, model),
				});
			}),
		);
}

/**
 * Live layer: credentials come from the process environment. `process.env` is
 * captured by reference and read at resolution time, so a key set after
 * startup is still honored.
 */
export const ModelProviderServiceLive = ModelProviderService.layerFromEnvironment(process.env);
