import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { chatContext } from "../../shared/chat-context.js";
import type { ReviewDepth, ReviewProfile, ReviewProfileModule } from "../../types.js";
import { createGpt54SystemPrompt, createGpt54UserPrompt } from "./prompts.js";

/**
 * The adapter's typed model union does not include bare "gpt-5.4" yet — only
 * its -mini/-nano/-image-2 variants. The cast borrows the sibling variant's
 * provider-options schema, which is identical across the GPT-5.4 family
 * (reasoning + verbosity + tools), while sending the real model ID to the
 * API at runtime.
 *
 * TODO(gpt-5.4-cast): remove the cast once @tanstack/ai-openai types
 * "gpt-5.4" natively, and re-verify the modelOptions schema against the new
 * typed entry during that dependency bump.
 */
const gpt54AdapterModelId = "gpt-5.4" as "gpt-5.4-mini";

/**
 * GPT-5.4 reasoning tuning per Review Depth (OpenAI reasoning guidance):
 *
 * - `low`: efficient reasoning for execution-oriented passes over small scopes.
 * - `medium`: OpenAI's balanced default for agentic coding work.
 * - `high`: complex debugging and deep review where latency matters less.
 *
 * `verbosity` shapes the Review Report length independently of reasoning.
 * Higher effort is not automatically better: without the stop rules in the
 * prompts it over-searches, so effort and prompt budgets move together.
 */
type Gpt54Tuning = {
	readonly reasoningEffort: "low" | "medium" | "high";
	readonly verbosity: "low" | "medium";
	readonly maxIterations: number;
};

const tuningByDepth: Record<ReviewDepth, Gpt54Tuning> = {
	quick: { maxIterations: 10, reasoningEffort: "low", verbosity: "low" },
	standard: { maxIterations: 20, reasoningEffort: "medium", verbosity: "medium" },
	thorough: { maxIterations: 40, reasoningEffort: "high", verbosity: "medium" },
};

const modelOptions = (depth: ReviewDepth): Record<string, unknown> => {
	const tuning = tuningByDepth[depth];
	return { reasoning: { effort: tuning.reasoningEffort }, text: { verbosity: tuning.verbosity } };
};

const makeGpt54Profile = (depth: ReviewDepth, description: string): ReviewProfile => ({
	depth,
	description,
	id: `${depth}:gpt-5.4`,
	model: "gpt-5.4",
	// The adapter is created inside `run` so OPENAI_API_KEY is only required
	// when a GPT-5.4 profile is the active Review Profile.
	run: ({ request, tools, middleware }) => {
		const tuning = tuningByDepth[depth];

		return chat({
			adapter: openaiText(gpt54AdapterModelId),
			agentLoopStrategy: maxIterations(tuning.maxIterations),
			context: chatContext(request),
			messages: [
				{
					content: createGpt54UserPrompt(depth, request),
					role: "user",
				},
			],
			middleware: [...middleware],
			modelOptions: modelOptions(depth),
			stream: false,
			systemPrompts: [createGpt54SystemPrompt(depth, request)],
			tools: [...tools],
		});
	},
});

const { quick, standard, thorough } = {
	quick: makeGpt54Profile(
		"quick",
		"Fast diff-focused pass on GPT-5.4 with low reasoning effort and a strict retrieval budget.",
	),
	standard: makeGpt54Profile(
		"standard",
		"Balanced everyday review on GPT-5.4 with medium reasoning effort at lower cost than GPT-5.5.",
	),
	thorough: makeGpt54Profile(
		"thorough",
		"Deep audit on GPT-5.4 with high reasoning effort and evidence-verified Review Findings.",
	),
} satisfies ReviewProfileModule;

export { modelOptions, quick, standard, thorough };
