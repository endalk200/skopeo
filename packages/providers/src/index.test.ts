import { assert, describe, it } from "@effect/vitest";
import { SkopeoConfig, type SkopeoConfiguration } from "@skopeo/config";
import { Effect, Layer } from "effect";
import {
	analyzeModelAccess,
	ModelProviderService,
	parseSupportedReviewModel,
	resolveModelAccess,
	SUPPORTED_REVIEW_MODELS,
} from "./index.js";

const baseConfig: SkopeoConfiguration = {
	telemetry: { enabled: false, otlpEndpoint: "http://localhost:4318" },
	devtools: { enabled: false },
	review: { model: "gpt-5.5", depth: "standard" },
	providers: [],
	models: [],
};

const withConfig = (overrides: Partial<SkopeoConfiguration>): SkopeoConfiguration => ({
	...baseConfig,
	...overrides,
});

describe("resolveModelAccess", () => {
	it.effect("routes each model to its vendor by default", () =>
		Effect.gen(function* () {
			const gpt = yield* resolveModelAccess(baseConfig, { OPENAI_API_KEY: "sk-test" }, "gpt-5.5");
			assert.strictEqual(gpt.provider, "openai");
			assert.strictEqual(gpt.wireModelId, "gpt-5.5");
			assert.strictEqual(gpt.wireDialect, "openai-responses");
			assert.strictEqual(gpt.adapter.name, "openai");
			assert.strictEqual(gpt.adapter.model, "gpt-5.5");

			const opus = yield* resolveModelAccess(baseConfig, { ANTHROPIC_API_KEY: "sk-test" }, "claude-opus-4-8");
			assert.strictEqual(opus.provider, "anthropic");
			assert.strictEqual(opus.wireDialect, "anthropic");
			assert.strictEqual(opus.adapter.name, "anthropic");
		}),
	);

	it.effect("fails lazily when a well-known provider has no API key", () =>
		Effect.gen(function* () {
			const failure = yield* Effect.flip(resolveModelAccess(baseConfig, {}, "gpt-5.5"));

			assert.strictEqual(failure._tag, "MissingModelProviderApiKey");
			if (failure._tag !== "MissingModelProviderApiKey") {
				return;
			}
			assert.strictEqual(failure.envVar, "OPENAI_API_KEY");
		}),
	);

	it.effect("honors api_key_env overrides on well-known providers", () =>
		Effect.gen(function* () {
			const config = withConfig({
				providers: [{ _tag: "wellKnown", name: "openai", baseUrl: undefined, apiKeyEnv: "MY_OPENAI_KEY" }],
			});

			const missing = yield* Effect.flip(resolveModelAccess(config, { OPENAI_API_KEY: "ignored" }, "gpt-5.5"));
			assert.strictEqual(missing._tag, "MissingModelProviderApiKey");

			const resolved = yield* resolveModelAccess(config, { MY_OPENAI_KEY: "sk-test" }, "gpt-5.5");
			assert.strictEqual(resolved.provider, "openai");
		}),
	);

	it.effect("routes through OpenRouter with its model slug", () =>
		Effect.gen(function* () {
			const config = withConfig({
				models: [{ model: "claude-opus-4-8", provider: "openrouter", modelId: undefined }],
			});

			const access = yield* resolveModelAccess(config, { OPENROUTER_API_KEY: "sk-or" }, "claude-opus-4-8");

			assert.strictEqual(access.provider, "openrouter");
			assert.strictEqual(access.wireModelId, "anthropic/claude-opus-4.8");
			assert.strictEqual(access.wireDialect, "openrouter");
			assert.strictEqual(access.adapter.name, "openrouter");
		}),
	);

	it.effect("routes through a custom provider with a renamed wire model and no key", () =>
		Effect.gen(function* () {
			const config = withConfig({
				models: [{ model: "gpt-5.5", provider: "my-gateway", modelId: "azure-gpt-55-prod" }],
				providers: [
					{
						_tag: "custom",
						name: "my-gateway",
						baseUrl: "https://llm.corp.example/v1",
						protocol: "openai",
						apiKeyEnv: undefined,
					},
				],
			});

			const access = yield* resolveModelAccess(config, {}, "gpt-5.5");

			assert.strictEqual(access.provider, "my-gateway");
			assert.strictEqual(access.wireModelId, "azure-gpt-55-prod");
			// Custom "OpenAI-compatible" endpoints speak Chat Completions, not
			// the Responses API only official OpenAI reliably serves.
			assert.strictEqual(access.wireDialect, "openai-chat-completions");
			assert.strictEqual(access.adapter.name, "openai-chat");
			assert.strictEqual(access.adapter.model, "azure-gpt-55-prod");
		}),
	);

	it.effect("reads custom provider keys from the derived environment variable", () =>
		Effect.gen(function* () {
			const config = withConfig({
				models: [{ model: "claude-opus-4-8", provider: "my-gateway", modelId: undefined }],
				providers: [
					{
						_tag: "custom",
						name: "my-gateway",
						baseUrl: "https://llm.corp.example",
						protocol: "anthropic",
						apiKeyEnv: undefined,
					},
				],
			});

			const access = yield* resolveModelAccess(
				config,
				{ SKOPEO_PROVIDER_MY_GATEWAY_API_KEY: "corp-key" },
				"claude-opus-4-8",
			);

			assert.strictEqual(access.adapter.name, "anthropic");
			assert.strictEqual(access.wireModelId, "claude-opus-4-8");
		}),
	);

	it.effect("requires an explicitly configured api_key_env on custom providers", () =>
		Effect.gen(function* () {
			const config = withConfig({
				models: [{ model: "gpt-5.5", provider: "my-gateway", modelId: undefined }],
				providers: [
					{
						_tag: "custom",
						name: "my-gateway",
						baseUrl: "https://llm.corp.example/v1",
						protocol: "openai",
						apiKeyEnv: "CORP_GATEWAY_TOKEN",
					},
				],
			});

			// Declaring api_key_env states the intent to authenticate; a missing
			// variable must fail at resolution instead of silently sending the
			// unauthenticated placeholder.
			const failure = yield* Effect.flip(resolveModelAccess(config, {}, "gpt-5.5"));

			assert.strictEqual(failure._tag, "MissingModelProviderApiKey");
			if (failure._tag !== "MissingModelProviderApiKey") {
				return;
			}
			assert.strictEqual(failure.envVar, "CORP_GATEWAY_TOKEN");

			const resolved = yield* resolveModelAccess(config, { CORP_GATEWAY_TOKEN: "corp-key" }, "gpt-5.5");
			assert.strictEqual(resolved.provider, "my-gateway");
		}),
	);

	it.effect("rejects protocol-incompatible routes instead of degrading profiles", () =>
		Effect.gen(function* () {
			const config = withConfig({
				models: [{ model: "claude-opus-4-8", provider: "my-gateway", modelId: undefined }],
				providers: [
					{
						_tag: "custom",
						name: "my-gateway",
						baseUrl: "https://llm.corp.example",
						protocol: "openai",
						apiKeyEnv: undefined,
					},
				],
			});

			const failure = yield* Effect.flip(resolveModelAccess(config, {}, "claude-opus-4-8"));

			assert.strictEqual(failure._tag, "IncompatibleModelProviderProtocol");
			if (failure._tag !== "IncompatibleModelProviderProtocol") {
				return;
			}
			assert.strictEqual(failure.requiredProtocol, "anthropic");
			assert.strictEqual(failure.providerProtocol, "openai");
		}),
	);

	it.effect("rejects models without a code-defined Review Profile", () =>
		Effect.gen(function* () {
			const failure = yield* Effect.flip(resolveModelAccess(baseConfig, {}, "gpt-6"));

			assert.strictEqual(failure._tag, "UnknownReviewModel");

			for (const model of SUPPORTED_REVIEW_MODELS) {
				assert.strictEqual(yield* parseSupportedReviewModel(model), model);
			}
		}),
	);
});

describe("analyzeModelAccess", () => {
	it("reports unknown models and protocol mismatches as errors", () => {
		const issues = analyzeModelAccess(
			withConfig({
				review: { model: "gpt-6", depth: "standard" },
				models: [
					{ model: "gpt-6000", provider: "openai", modelId: undefined },
					{ model: "claude-opus-4-8", provider: "my-gateway", modelId: undefined },
				],
				providers: [
					{
						_tag: "custom",
						name: "my-gateway",
						baseUrl: "https://llm.corp.example",
						protocol: "openai",
						apiKeyEnv: undefined,
					},
				],
			}),
			{ OPENAI_API_KEY: "sk-test" },
		);

		const errors = issues.filter((issue) => issue.severity === "error");
		assert.lengthOf(errors, 3);
		assert.include(errors[0]?.message, '"gpt-6" is not a code-defined Review Profile model');
		assert.include(errors[1]?.message, '"gpt-6000" is not a code-defined Review Profile model');
		assert.include(errors[2]?.message, 'requires the "anthropic" protocol');
	});

	it("warns when the effective profile's provider key is unresolvable", () => {
		const issues = analyzeModelAccess(baseConfig, {});

		assert.deepStrictEqual(
			issues.map((issue) => issue.severity),
			["warning"],
		);
		assert.include(issues[0]?.message, "OPENAI_API_KEY is not set");
	});

	it("warns when a custom provider's explicit api_key_env is unresolvable", () => {
		const issues = analyzeModelAccess(
			withConfig({
				models: [{ model: "gpt-5.5", provider: "my-gateway", modelId: undefined }],
				providers: [
					{
						_tag: "custom",
						name: "my-gateway",
						baseUrl: "https://llm.corp.example/v1",
						protocol: "openai",
						apiKeyEnv: "CORP_GATEWAY_TOKEN",
					},
				],
			}),
			{},
		);

		assert.deepStrictEqual(
			issues.map((issue) => issue.severity),
			["warning"],
		);
		assert.include(issues[0]?.message, "CORP_GATEWAY_TOKEN is not set");
	});

	it("warns about declared providers nothing routes to", () => {
		const issues = analyzeModelAccess(
			withConfig({
				providers: [
					{
						_tag: "custom",
						name: "spare-gateway",
						baseUrl: "https://spare.example",
						protocol: "openai",
						apiKeyEnv: undefined,
					},
				],
			}),
			{ OPENAI_API_KEY: "sk-test" },
		);

		assert.lengthOf(issues, 1);
		assert.strictEqual(issues[0]?.severity, "warning");
		assert.include(issues[0]?.message, '"spare-gateway" is declared under [providers], but no model routes to it');
	});

	it("reports a clean well-known setup as issue-free", () => {
		const issues = analyzeModelAccess(baseConfig, { OPENAI_API_KEY: "sk-test" });

		assert.deepStrictEqual(issues, []);
	});
});

describe("ModelProviderService", () => {
	it.effect("resolves adapters through the Effect layer", () =>
		Effect.gen(function* () {
			const providers = yield* ModelProviderService;
			const access = yield* providers.adapterFor("gpt-5.5");

			assert.strictEqual(access.provider, "openai");
			assert.strictEqual(access.adapter.kind, "text");
		}).pipe(
			Effect.provide(
				ModelProviderService.layerFromEnvironment({ OPENAI_API_KEY: "sk-test" }).pipe(
					Layer.provide(Layer.succeed(SkopeoConfig)(baseConfig)),
				),
			),
		),
	);
});
