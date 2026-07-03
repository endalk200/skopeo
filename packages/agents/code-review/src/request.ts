/**
 * Review Target selected for a Code Review Agent run.
 *
 * `working` reviews the current working tree, while `branch` reviews committed
 * branch changes against a base ref.
 */
type CodeReviewTarget = "working" | "branch";

/**
 * Serialization format requested for the Review Report.
 */
type CodeReviewFormat = "json" | "markdown";

/**
 * Runtime facts passed to the Code Review Agent for prompt context.
 *
 * These values describe the execution environment; they are not user
 * configuration.
 */
type CodeReviewEnvironment = {
	readonly os: string;
	readonly currentPath: string;
	readonly dateTime: string;
};

/**
 * Complete request contract for one Code Review Agent run.
 *
 * The request identifies the Review Target, Repository Root, branch metadata,
 * output format, and runtime environment used to produce the Review Report.
 */
type CodeReviewRequest = {
	readonly target: CodeReviewTarget;
	readonly base: string;
	readonly format: CodeReviewFormat;
	readonly currentBranch: string | null;
	readonly currentBranchHead: string | null;
	readonly environment: CodeReviewEnvironment;
	readonly repositoryRoot: string;
};

export type { CodeReviewEnvironment, CodeReviewFormat, CodeReviewRequest, CodeReviewTarget };
