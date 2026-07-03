import { chat, maxIterations } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import { chatContext } from "../../shared/chat-context.js";
import type { ReviewDepth, ReviewProfile } from "../../types.js";
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

const makeOpus48Profile = (depth: ReviewDepth, description: string): ReviewProfile => ({
	depth,
	description,
	id: `${depth}:claude-opus-4-8`,
	model: "claude-opus-4-8",
	// The adapter is created inside `run` so ANTHROPIC_API_KEY is only required
	// when an Opus 4.8 profile is the active Review Profile.
	run: ({ request, tools, middleware }) => {
		const tuning = tuningByDepth[depth];

		return chat({
			adapter: anthropicText("claude-opus-4-8"),
			agentLoopStrategy: maxIterations(tuning.maxIterations),
			context: chatContext(request),
			messages: [
				{
					content: createOpus48UserPrompt(depth, request),
					role: "user",
				},
			],
			middleware: [...middleware],
			modelOptions: {
				max_tokens: tuning.maxTokens,
				output_config: { effort: tuning.effort },
				thinking: { type: "adaptive" },
			},
			stream: false,
			systemPrompts: [createOpus48SystemPrompt(depth, request)],
			tools: [...tools],
		});
	},
});

const opus48QuickProfile = makeOpus48Profile(
	"quick",
	"Fast diff-focused pass on Claude Opus 4.8 with medium effort and a concrete severity bar.",
);

const opus48StandardProfile = makeOpus48Profile(
	"standard",
	"Balanced everyday review on Claude Opus 4.8 with high effort and confidence-labeled Review Findings.",
);

const opus48ThoroughProfile = makeOpus48Profile(
	"thorough",
	"Deep audit on Claude Opus 4.8 with xhigh effort, adaptive thinking, and unfiltered Review Findings.",
);

export { opus48QuickProfile, opus48StandardProfile, opus48ThoroughProfile };
