import type { ModelWireDialect } from "@skopeo/providers";
import { chat, maxIterations } from "@tanstack/ai";
import { chatContext } from "../../shared/chat-context.js";
import type { ReviewDepth, ReviewProfile, ReviewProfileModule } from "../../types.js";
import { createOpus48SystemPrompt, createOpus48UserPrompt } from "./prompts.js";

/**
 * Claude Opus 4.8 tuning per Review Depth (Anthropic effort guidance):
 *
 * - Thinking is off on Opus 4.8 unless `thinking: { type: "adaptive" }` is set
 *   explicitly; manual `budget_tokens` is rejected on Opus 4.7+.
 * - `output_config.effort` governs all token spend (thinking, text, and tool
 *   calls). Anthropic calls `xhigh` the best setting for coding/agentic use
 *   and recommends `max_tokens` of at least 64k with it; `max` risks
 *   overthinking. Opus 4.8 respects `low` strictly and under-thinks
 *   moderately complex reviews, so `quick` uses `medium`.
 * - Higher effort also raises Agent Tool usage, which the depth prompts rely
 *   on for wider investigation.
 */
type Opus48Tuning = {
	readonly effort: "medium" | "high" | "xhigh";
	readonly maxTokens: number;
	readonly maxIterations: number;
};

const tuningByDepth: Record<ReviewDepth, Opus48Tuning> = {
	quick: { effort: "medium", maxIterations: 10, maxTokens: 32000 },
	standard: { effort: "high", maxIterations: 20, maxTokens: 64000 },
	thorough: { effort: "xhigh", maxIterations: 40, maxTokens: 64000 },
};

/**
 * Same tuning intent, one shape per wire dialect:
 *
 * - Anthropic-protocol providers take native snake_case options
 *   (`max_tokens`, `output_config.effort`, adaptive `thinking`).
 * - OpenRouter's chat surface uses camelCase `maxTokens` and normalizes
 *   reasoning as `reasoning.effort` (its effort enum includes Anthropic's
 *   `xhigh`); Anthropic-native snake_case options would be silently
 *   stripped by its SDK's outbound schema, and `reasoning.effort` is what
 *   enables thinking on Anthropic routes.
 */
const wireModelOptions = (depth: ReviewDepth, wireDialect: ModelWireDialect): Record<string, unknown> => {
	const tuning = tuningByDepth[depth];
	switch (wireDialect) {
		case "openrouter":
			return { maxTokens: tuning.maxTokens, reasoning: { effort: tuning.effort } };
		case "anthropic":
		case "openai-responses":
		case "openai-chat-completions":
			// The openai-* dialects are unreachable: protocol validation
			// rejects routing Opus through OpenAI-protocol providers rather
			// than silently dropping these options.
			return {
				max_tokens: tuning.maxTokens,
				output_config: { effort: tuning.effort },
				thinking: { type: "adaptive" },
			};
	}
};

const makeOpus48Profile = (depth: ReviewDepth, description: string): ReviewProfile => ({
	depth,
	description,
	id: `${depth}:claude-opus-4-8`,
	model: "claude-opus-4-8",
	// The adapter arrives resolved from the ModelProviderService, so which
	// Model Provider serves Opus 4.8 and its API key are access concerns
	// handled outside the profile.
	run: ({ adapter, wireDialect, request, tools, middleware }) => {
		const tuning = tuningByDepth[depth];

		return chat({
			adapter,
			agentLoopStrategy: maxIterations(tuning.maxIterations),
			context: chatContext(request),
			messages: [
				{
					content: createOpus48UserPrompt(depth, request),
					role: "user",
				},
			],
			middleware: [...middleware],
			modelOptions: wireModelOptions(depth, wireDialect),
			stream: false,
			systemPrompts: [createOpus48SystemPrompt(depth, request)],
			tools: [...tools],
		});
	},
});

const { quick, standard, thorough } = {
	quick: makeOpus48Profile(
		"quick",
		"Fast diff-focused pass on Claude Opus 4.8 with medium effort and a concrete severity bar.",
	),
	standard: makeOpus48Profile(
		"standard",
		"Balanced everyday review on Claude Opus 4.8 with high effort and confidence-labeled Review Findings.",
	),
	thorough: makeOpus48Profile(
		"thorough",
		"Deep audit on Claude Opus 4.8 with xhigh effort, adaptive thinking, and unfiltered Review Findings.",
	),
} satisfies ReviewProfileModule;

export { quick, standard, thorough, wireModelOptions };
