import type { CodeReviewRequest } from "../../request.js";

/**
 * Runtime context lines shared by every Review Profile system prompt.
 */
const runtimeContext = (request: CodeReviewRequest) => `- OS: ${request.environment.os}
- Current path: ${request.environment.currentPath}
- Date/time: ${request.environment.dateTime}`;

/**
 * Cross-tool Agent Tool policy shared by every Review Profile system prompt.
 *
 * Per-tool usage guidance belongs in each Agent Tool's own description; only
 * policy that spans tools lives here.
 */
const agentToolPolicy = `- Tool paths may be absolute or relative; relative paths resolve from the repository root.
- The tools are repository-scoped and cannot read or run commands outside the repository root.
- Do not attempt to read secret-bearing files or run destructive commands.
- Do not modify files or repository state; you are reviewing, not editing.`;

/**
 * Review command input block shared by every Review Profile user prompt.
 */
const reviewCommandInput = (request: CodeReviewRequest) => `- target: ${request.target}
- base: ${request.base}
- format: ${request.format}
- currentBranch: ${request.currentBranch ?? "unknown"}
- currentBranchHead: ${request.currentBranchHead ?? "unknown"}
- repositoryRoot: ${request.repositoryRoot}`;

/**
 * Target-specific git instructions shared by every Review Profile user prompt.
 */
const targetInstructions = (request: CodeReviewRequest) =>
	request.target === "working"
		? "Review staged, unstaged, and untracked working-tree changes. Start with `git status --short`, `git diff --stat`, and `git diff --cached --stat`, then inspect `git diff` and `git diff --cached`. Inspect untracked files with Agent Tools when they are part of the Review Target."
		: `Review committed branch changes against base ${request.base}. Start with \`git diff --stat ${request.base}...HEAD\`, then inspect \`git diff ${request.base}...HEAD\`.`;

export { agentToolPolicy, reviewCommandInput, runtimeContext, targetInstructions };
