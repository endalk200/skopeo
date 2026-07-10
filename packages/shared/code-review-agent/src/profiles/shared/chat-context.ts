import type { CodeReviewRequest } from "../../request.js";

/**
 * The TanStack AI chat `context` object shared by every Review Profile.
 *
 * This is model-agnostic runtime infrastructure (consumed by Agent Tools and
 * middleware), not model-tuned prompting, so it lives in the shared module
 * per ADR 0007.
 */
const chatContext = (request: CodeReviewRequest) => ({
	currentBranch: request.currentBranch ?? "unknown",
	workingDirectory: request.environment.currentPath,
});

export { chatContext };
