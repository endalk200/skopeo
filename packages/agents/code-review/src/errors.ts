import { Data } from "effect";

export class ReviewTargetCollectionError extends Data.TaggedError("ReviewTargetCollectionError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class CodeReviewAgentRuntimeError extends Data.TaggedError("CodeReviewAgentRuntimeError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export type CodeReviewAgentError = ReviewTargetCollectionError | CodeReviewAgentRuntimeError;

export const formatCodeReviewAgentError = (error: CodeReviewAgentError): string => error.message;
