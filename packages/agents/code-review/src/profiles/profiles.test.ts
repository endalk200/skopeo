import { assert, describe, it } from "@effect/vitest";
import { SUPPORTED_REVIEW_MODELS } from "@skopeo/providers";
import type { CodeReviewRequest } from "../request.js";
import { isReviewProfileModel, resolveReviewProfile, reviewProfiles } from "./index.js";
import { wireModelOptions as opus48WireModelOptions } from "./models/claude-opus-4-8/profiles.js";
import { createOpus48SystemPrompt, createOpus48UserPrompt } from "./models/claude-opus-4-8/prompts.js";
import { wireModelOptions as gpt52WireModelOptions } from "./models/gpt-5-2/profiles.js";
import { createGpt52SystemPrompt, createGpt52UserPrompt } from "./models/gpt-5-2/prompts.js";
import { wireModelOptions as gpt54WireModelOptions } from "./models/gpt-5-4/profiles.js";
import { createGpt54SystemPrompt, createGpt54UserPrompt } from "./models/gpt-5-4/prompts.js";
import { wireModelOptions as gpt55WireModelOptions } from "./models/gpt-5-5/profiles.js";
import { createGpt55SystemPrompt, createGpt55UserPrompt } from "./models/gpt-5-5/prompts.js";
import type { ReviewDepth, ReviewProfileModel } from "./types.js";

const request: CodeReviewRequest = {
	base: "main",
	currentBranch: "feature/tools",
	currentBranchHead: "abc123",
	environment: {
		currentPath: "/workspace/skopeo",
		dateTime: "2026-06-11T00:00:00.000Z",
		os: "darwin",
	},
	format: "markdown",
	repositoryRoot: "/workspace/skopeo",
	target: "working",
};

const depths: ReadonlyArray<ReviewDepth> = ["quick", "standard", "thorough"];
const models: ReadonlyArray<ReviewProfileModel> = ["gpt-5.5", "gpt-5.4", "gpt-5.2", "claude-opus-4-8"];

describe("reviewProfiles", () => {
	it("provides one variant per Review Depth and model", () => {
		for (const depth of depths) {
			for (const model of models) {
				const profile = reviewProfiles[depth][model];

				assert.strictEqual(profile.depth, depth);
				assert.strictEqual(profile.model, model);
				assert.strictEqual(profile.id, `${depth}:${model}`);
			}
		}
	});

	it("resolves the Default Review Profile selection from configuration values", () => {
		for (const depth of depths) {
			for (const model of models) {
				const profile = resolveReviewProfile({ depth, model });

				assert.strictEqual(profile, reviewProfiles[depth][model]);
			}
		}
	});

	it("returns undefined for models without a code-defined Review Profile", () => {
		assert.isUndefined(resolveReviewProfile({ depth: "standard", model: "gpt-6" }));
		assert.isFalse(isReviewProfileModel("gpt-6"));
		assert.isTrue(isReviewProfileModel("claude-opus-4-8"));
	});

	it("rejects inherited object keys as Review Profile models", () => {
		assert.isFalse(isReviewProfileModel("toString"));
		assert.isFalse(isReviewProfileModel("constructor"));
		assert.isUndefined(resolveReviewProfile({ depth: "standard", model: "toString" }));
	});

	it("registers a Review Profile for every provider-supported review model", () => {
		// The provider registry and the profile registry are maintained
		// separately; this invariant keeps them from drifting apart (a model
		// resolvable by ModelProviderService but missing a profile dies at
		// review time).
		for (const depth of depths) {
			assert.deepStrictEqual(
				Object.keys(reviewProfiles[depth]).sort(),
				[...SUPPORTED_REVIEW_MODELS].sort(),
				`reviewProfiles.${depth} must cover exactly the provider-supported review models`,
			);
		}
	});
});

describe("wireModelOptions", () => {
	const gptWireModelOptions = [
		["gpt-5.5", gpt55WireModelOptions],
		["gpt-5.4", gpt54WireModelOptions],
		["gpt-5.2", gpt52WireModelOptions],
	] as const;

	for (const [model, wireModelOptions] of gptWireModelOptions) {
		it(`shapes ${model} options for each wire dialect`, () => {
			assert.deepStrictEqual(wireModelOptions("standard", "openai-responses"), {
				reasoning: { effort: "medium" },
				text: { verbosity: "medium" },
			});
			assert.deepStrictEqual(wireModelOptions("standard", "openai-chat-completions"), {
				reasoning_effort: "medium",
				verbosity: "medium",
			});
			// OpenRouter accepts `reasoning.effort` but has no verbosity knob;
			// Responses-only fields would be silently stripped on its wire.
			assert.deepStrictEqual(wireModelOptions("standard", "openrouter"), {
				reasoning: { effort: "medium" },
			});
		});
	}

	it("shapes claude-opus-4-8 options for each wire dialect", () => {
		assert.deepStrictEqual(opus48WireModelOptions("thorough", "anthropic"), {
			max_tokens: 64000,
			output_config: { effort: "xhigh" },
			thinking: { type: "adaptive" },
		});
		// OpenRouter's chat surface uses camelCase maxTokens and normalized
		// reasoning.effort; Anthropic-native snake_case options would be
		// silently stripped by its SDK's outbound schema.
		assert.deepStrictEqual(opus48WireModelOptions("thorough", "openrouter"), {
			maxTokens: 64000,
			reasoning: { effort: "xhigh" },
		});
	});
});

const gptPromptBuilders = [
	["createGpt55SystemPrompt", createGpt55SystemPrompt, createGpt55UserPrompt],
	["createGpt54SystemPrompt", createGpt54SystemPrompt, createGpt54UserPrompt],
	["createGpt52SystemPrompt", createGpt52SystemPrompt, createGpt52UserPrompt],
] as const;

for (const [name, createSystemPrompt, createUserPrompt] of gptPromptBuilders) {
	describe(name, () => {
		it("includes runtime context and the Agent Tool policy", () => {
			const prompt = createSystemPrompt("standard", request);

			assert.include(prompt, "OS: darwin");
			assert.include(prompt, "Current path: /workspace/skopeo");
			assert.include(prompt, "Date/time: 2026-06-11T00:00:00.000Z");
			assert.include(prompt, "Tool paths may be absolute or relative");
			assert.include(prompt, "relative paths resolve from the repository root");
			assert.include(prompt, "repository-scoped");
			assert.include(prompt, "you are reviewing, not editing");
		});

		it("scales the retrieval budget with Review Depth", () => {
			assert.include(createSystemPrompt("quick", request), "at most 8 Agent Tool calls");
			assert.include(createSystemPrompt("standard", request), "at most 20 Agent Tool calls");
			assert.include(createSystemPrompt("thorough", request), "up to 40 rounds of Agent Tool use");
		});

		it("keeps the quick pass inside the diff in the user prompt", () => {
			assert.include(createSystemPrompt("quick", request), "untracked files listed by `git status --short`");
			assert.include(createUserPrompt("quick", request), "stay inside the diff hunks");
			assert.include(createUserPrompt("quick", request), "untracked files listed by `git status --short`");
			assert.notInclude(createUserPrompt("standard", request), "stay inside the diff hunks");
		});
	});
}

describe("createOpus48SystemPrompt", () => {
	it("includes runtime context and the Agent Tool policy", () => {
		const prompt = createOpus48SystemPrompt("standard", request);

		assert.include(prompt, "OS: darwin");
		assert.include(prompt, "Current path: /workspace/skopeo");
		assert.include(prompt, "Date/time: 2026-06-11T00:00:00.000Z");
		assert.include(prompt, "Tool paths may be absolute or relative");
		assert.include(prompt, "relative paths resolve from the repository root");
		assert.include(prompt, "repository-scoped");
		assert.include(prompt, "you are reviewing, not editing");
	});

	it("never asks Opus to self-filter Review Findings on thorough runs", () => {
		const prompt = createOpus48SystemPrompt("thorough", request);

		assert.include(prompt, "Report every Review Finding you can support with code you opened this run");
		assert.include(prompt, "Do not report suspicion-only items");
		assert.include(prompt, "confidence level");
	});

	it("defines a concrete severity bar for quick runs", () => {
		const prompt = createOpus48SystemPrompt("quick", request);

		assert.include(prompt, "incorrect behavior, a test failure, data loss, or a security vulnerability");
	});

	it("puts the ask after the context blocks in the user prompt", () => {
		const prompt = createOpus48UserPrompt("standard", request);

		assert.isBelow(prompt.indexOf("<review_command_input>"), prompt.indexOf("produce the Review Report"));
		assert.include(prompt, "markdown format");
	});
});
