import type { makeBashToolDefinition, makeReadFileToolDefinition } from "@skopeo/tools";
import type { ChatMiddleware } from "@tanstack/ai";
import type { CodeReviewRequest } from "../request.js";

/**
 * Review depth axis of a Review Profile.
 *
 * Depth expresses the Skopeo User's intent — how much scrutiny, latency, and
 * cost one Code Review Agent run should spend:
 *
 * - `quick`: fast, diff-focused pass that reports only clear-cut Review Findings.
 * - `standard`: balanced default for everyday branch and working-tree reviews.
 * - `thorough`: deep audit that verifies every Review Finding against source
 *   and inspects adjacent tests and type definitions.
 */
type ReviewDepth = "quick" | "standard" | "thorough";

/**
 * Models with tuned Review Profile variants.
 *
 * Prompts and reasoning configuration are only valid for the model they were
 * tuned against, so each model gets its own variant per Review Depth.
 */
type ReviewProfileModel = "gpt-5.5" | "gpt-5.4" | "claude-opus-4-8";

/**
 * The Agent Tool definitions handed to a Review Profile for one run.
 */
type ReviewAgentToolDefinitions = readonly [
	ReturnType<typeof makeReadFileToolDefinition>,
	ReturnType<typeof makeBashToolDefinition>,
];

/**
 * Per-run inputs a Review Profile needs to execute the Code Review Agent loop.
 */
type ReviewProfileChatParams = {
	readonly request: CodeReviewRequest;
	readonly tools: ReviewAgentToolDefinitions;
	readonly middleware: ReadonlyArray<ChatMiddleware>;
};

/**
 * A Review Profile bundles everything that shapes Code Review Agent behavior
 * for one (Review Depth, model) pairing:
 *
 * - the model and its reasoning configuration,
 * - the model-tuned system and user prompts,
 * - the agent-loop budget.
 *
 * `run` owns adapter creation so provider API keys are only required when the
 * profile actually executes, and returns the Review Report text.
 */
type ReviewProfile = {
	readonly id: `${ReviewDepth}:${ReviewProfileModel}`;
	readonly depth: ReviewDepth;
	readonly model: ReviewProfileModel;
	readonly description: string;
	readonly run: (params: ReviewProfileChatParams) => Promise<string>;
};

export type { ReviewAgentToolDefinitions, ReviewDepth, ReviewProfile, ReviewProfileChatParams, ReviewProfileModel };
