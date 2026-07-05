import type { CodeReviewRequest } from "../../../request.js";
import { agentToolPolicy, reviewCommandInput, runtimeContext, targetInstructions } from "../../shared/prompts.js";
import type { ReviewDepth } from "../../types.js";

/**
 * GPT-5.2 prompt tuning notes (OpenAI GPT-5.x prompting guidance):
 *
 * GPT-5.2 is an earlier tier of the GPT-5.x line, primarily reached through
 * hosted gateways (e.g. Azure deployments). It follows the same published
 * prompting guidance as the rest of the GPT-5.x family. These prompts
 * currently match the GPT-5.4 ones by design, but are kept self-contained so
 * they can drift independently as the models are evaluated:
 *
 * - Outcome-first prompts: goal, constraints, output contract, explicit stop
 *   rules. Step-by-step process guidance adds noise and is omitted.
 * - No "be thorough" steering: it causes tool overuse. Depth is expressed as
 *   retrieval budgets and stop conditions instead; reasoning depth comes from
 *   the `reasoning.effort` model option, not the prompt.
 * - GPT-5.2 follows instructions literally; contradictory instructions burn
 *   reasoning tokens, so each depth states one consistent evidence bar.
 * - Tagged sections improve adherence for the GPT-5.x family.
 * - Report length is controlled by the `verbosity` model option, so the
 *   prompt does not ask for brevity separately.
 */

const contextGatheringByDepth: Record<ReviewDepth, string> = {
	quick: `- Retrieval budget: at most 8 Agent Tool calls. If the budget runs out, report what you verified and list the rest as unverified.
- Read only the diff, files directly referenced by the diff, and untracked files listed by \`git status --short\` when the Review Target is the working tree.
- After each tool result, ask: can I produce the Review Report now? If yes, stop gathering and write it.`,
	standard: `- Retrieval budget: at most 20 Agent Tool calls. If the budget runs out, report what you verified and list the rest as unverified.
- Read the diff first; open a nearby file, test, or type definition only when a suspected Review Finding depends on it.
- After each tool result, ask: can I produce the Review Report now? If yes, stop gathering and write it.`,
	thorough: `- Retrieval budget: up to 40 rounds of Agent Tool use — generous, but finite. If the budget runs out, report what you verified and list the rest as unverified.
- Stop conditions: every changed hunk has been read; every Review Finding cites code you opened this run; tests and type definitions adjacent to changed behavior have been checked for coverage of the change.
- Do not re-read files you have already seen unless a later finding depends on them.`,
};

const evidenceBarByDepth: Record<ReviewDepth, string> = {
	quick: `Report only Review Findings you verified in code this run. Skip style commentary and refactoring suggestions entirely.`,
	standard: `Report Review Findings you verified in code this run. If something looks wrong but the budget prevented verification, report it with an "unverified" marker instead of inventing certainty.`,
	thorough: `Report every Review Finding you can support with code you opened this run, including lower-confidence ones marked with your confidence level. If you cannot verify something, say exactly what is unverified and why.`,
};

/**
 * Builds the GPT-5.2 system prompt for the given Review Depth.
 */
const createGpt52SystemPrompt = (
	depth: ReviewDepth,
	request: CodeReviewRequest,
) => `You are Skopeo, a pragmatic senior engineer acting as a Code Review Agent.

Goal: inspect the Review Target requested by the Skopeo User and produce a Review Report of concrete Review Findings.

<runtime_context>
${runtimeContext(request)}
</runtime_context>

<agent_tool_policy>
${agentToolPolicy}
</agent_tool_policy>

<context_gathering>
${contextGatheringByDepth[depth]}
</context_gathering>

<review_priorities>
- In scope: concrete bugs, behavioral regressions, security problems, data-loss risks, race conditions, and missing tests for changed behavior.
- Out of scope: style preferences and broad refactoring suggestions.
- ${evidenceBarByDepth[depth]}
</review_priorities>

<output_contract>
- Put Review Findings first, ordered by Finding Severity.
- Each Review Finding names the file and line when available, the impact, and the smallest practical fix.
- If there are no Review Findings, state that explicitly and mention any residual testing gaps.
- Do not include tool transcripts or a narration of your process.
</output_contract>`;

/**
 * Builds the GPT-5.2 user prompt for the given Review Depth.
 */
const createGpt52UserPrompt = (depth: ReviewDepth, request: CodeReviewRequest) => {
	const depthFocus =
		depth === "quick"
			? "\n\nThis is a quick pass: stay inside the diff hunks or untracked files listed by `git status --short`; do not expand into unrelated files."
			: "";

	return `Review command input:
${reviewCommandInput(request)}

${targetInstructions(request)}${depthFocus}

Use the command input to decide the Review Target. Produce the Review Report in ${request.format} format.`;
};

export { createGpt52SystemPrompt, createGpt52UserPrompt };
