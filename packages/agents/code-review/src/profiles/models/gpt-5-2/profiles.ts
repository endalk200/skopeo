import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { chatContext } from "../../shared/chat-context.js";
import type { ReviewDepth, ReviewProfile, ReviewProfileModule } from "../../types.js";
import { createGpt52SystemPrompt, createGpt52UserPrompt } from "./prompts.js";

/**
 * GPT-5.2 reasoning tuning per Review Depth (OpenAI reasoning guidance):
 *
 * - `low`: efficient reasoning for execution-oriented passes over small scopes.
 * - `medium`: OpenAI's balanced default for agentic coding work.
 * - `high`: complex debugging and deep review where latency matters less.
 *
 * `verbosity` shapes the Review Report length independently of reasoning.
 * Higher effort is not automatically better: without the stop rules in the
 * prompts it over-searches, so effort and prompt budgets move together.
 */
type Gpt52Tuning = {
	readonly reasoningEffort: "low" | "medium" | "high";
	readonly verbosity: "low" | "medium";
	readonly maxIterations: number;
};

const tuningByDepth: Record<ReviewDepth, Gpt52Tuning> = {
	quick: { maxIterations: 10, reasoningEffort: "low", verbosity: "low" },
	standard: { maxIterations: 20, reasoningEffort: "medium", verbosity: "medium" },
	thorough: { maxIterations: 40, reasoningEffort: "high", verbosity: "medium" },
};

const modelOptions = (depth: ReviewDepth): Record<string, unknown> => {
	const tuning = tuningByDepth[depth];
	return { reasoning: { effort: tuning.reasoningEffort }, text: { verbosity: tuning.verbosity } };
};

const makeGpt52Profile = (depth: ReviewDepth, description: string): ReviewProfile => ({
	depth,
	description,
	id: `${depth}:gpt-5.2`,
	model: "gpt-5.2",
	// The adapter is created inside `run` so OPENAI_API_KEY is only required
	// when a GPT-5.2 profile is the active Review Profile.
	run: ({ request, tools, middleware }) => {
		const tuning = tuningByDepth[depth];

		return chat({
			adapter: openaiText("gpt-5.2"),
			agentLoopStrategy: maxIterations(tuning.maxIterations),
			context: chatContext(request),
			messages: [
				{
					content: createGpt52UserPrompt(depth, request),
					role: "user",
				},
			],
			middleware: [...middleware],
			modelOptions: modelOptions(depth),
			stream: false,
			systemPrompts: [createGpt52SystemPrompt(depth, request)],
			tools: [...tools],
		});
	},
});

const { quick, standard, thorough } = {
	quick: makeGpt52Profile(
		"quick",
		"Fast diff-focused pass on GPT-5.2 with low reasoning effort and a strict retrieval budget.",
	),
	standard: makeGpt52Profile("standard", "Balanced everyday review on GPT-5.2 with medium reasoning effort."),
	thorough: makeGpt52Profile(
		"thorough",
		"Deep audit on GPT-5.2 with high reasoning effort and evidence-verified Review Findings.",
	),
} satisfies ReviewProfileModule;

export { modelOptions, quick, standard, thorough };
