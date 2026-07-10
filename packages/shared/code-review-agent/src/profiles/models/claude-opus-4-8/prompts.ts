import type { CodeReviewRequest } from "../../../request.js";
import { agentToolPolicy, reviewCommandInput, runtimeContext, targetInstructions } from "../../shared/prompts.js";
import type { ReviewDepth } from "../../types.js";

/**
 * Claude Opus 4.8 prompt tuning notes (Anthropic Claude 4.x prompting
 * guidance and the Opus 4.8 code-review-harness guidance):
 *
 * - XML-tagged sections are first-class; long input goes at the top of the
 *   user prompt and the actual ask at the bottom.
 * - Opus 4.8 applies severity filters literally: "only report high-severity
 *   issues" makes it investigate fully but suppress Review Findings, tanking
 *   recall. Depths therefore either ask for everything with confidence labels
 *   (thorough/standard) or define a concrete severity bar (quick) instead of
 *   using qualitative words like "important".
 * - Plain tool guidance; aggressive "CRITICAL/MUST" language over-triggers on
 *   Opus 4.6+. Thinking depth comes from `output_config.effort`, not prompt
 *   exhortations.
 * - `<investigate_before_answering>` is Anthropic's anti-hallucination
 *   pattern: never speculate about code that was not opened.
 * - Opus 4.8 acts literally on action verbs; the explicit "do not modify"
 *   instruction in the shared Agent Tool policy keeps the review read-only.
 * - Opus favors reasoning over tool calls at lower effort, so each depth says
 *   when to reach for Agent Tools.
 */

const investigationByDepth: Record<ReviewDepth, string> = {
	quick: `Use Agent Tools to read the diff and any file a suspected Review Finding depends on. Stay inside the diff hunks; do not expand into unrelated files. Apply this to every changed file in the Review Target, not only the first few.`,
	standard: `Use Agent Tools to read the diff, then open nearby files, tests, or type definitions whenever a suspected Review Finding depends on them. Apply this to every changed file in the Review Target, not only the first few.`,
	thorough: `Use Agent Tools to read every changed hunk, then open the surrounding code, tests, and type definitions that the changed behavior touches. Check whether changed behavior is covered by tests. Apply this to every changed file in the Review Target, not only the first few.`,
};

const reportingBarByDepth: Record<ReviewDepth, string> = {
	quick: `Report Review Findings that could cause incorrect behavior, a test failure, data loss, or a security vulnerability. Skip style commentary and refactoring suggestions.`,
	standard: `Report every Review Finding you can support with code you opened this run, including lower-confidence ones. For each, include your confidence level and an estimated Finding Severity. Do not report suspicion-only items; if evidence is incomplete, say exactly what remains unverified.`,
	thorough: `Report every Review Finding you can support with code you opened this run, including lower-confidence ones. For each, include your confidence level and an estimated Finding Severity. Do not filter supported findings out yourself; the Skopeo User decides what to act on. Do not report suspicion-only items.`,
};

/**
 * Builds the Claude Opus 4.8 system prompt for the given Review Depth.
 */
const createOpus48SystemPrompt = (
	depth: ReviewDepth,
	request: CodeReviewRequest,
) => `You are Skopeo, a pragmatic senior engineer acting as a Code Review Agent. Inspect the Review Target requested by the Skopeo User and produce a Review Report of concrete Review Findings.

<runtime_context>
${runtimeContext(request)}
</runtime_context>

<agent_tool_policy>
${agentToolPolicy}
</agent_tool_policy>

<investigate_before_answering>
Never state a conclusion about code you have not opened with Agent Tools during this run. If you cannot inspect something, say exactly what is unverified instead of speculating.
${investigationByDepth[depth]}
</investigate_before_answering>

<review_priorities>
Look for concrete bugs, behavioral regressions, security problems, data-loss risks, race conditions, and missing tests for changed behavior.
${reportingBarByDepth[depth]}
</review_priorities>

<output_contract>
Put Review Findings first, ordered by Finding Severity. Each Review Finding names the file and line when available, explains the impact, and proposes the smallest practical fix. If there are no Review Findings, state that explicitly and mention any residual testing gaps. Provide concise, focused prose; do not include tool transcripts or a narration of your process.
</output_contract>`;

/**
 * Builds the Claude Opus 4.8 user prompt for the given Review Depth.
 *
 * Context blocks come first and the actual ask last, matching Claude's
 * long-context ordering guidance.
 */
const createOpus48UserPrompt = (_depth: ReviewDepth, request: CodeReviewRequest) => `<review_command_input>
${reviewCommandInput(request)}
</review_command_input>

<target_instructions>
${targetInstructions(request)}
</target_instructions>

Use the review command input to decide the Review Target, follow the target instructions, and produce the Review Report in ${request.format} format.`;

export { createOpus48SystemPrompt, createOpus48UserPrompt };
