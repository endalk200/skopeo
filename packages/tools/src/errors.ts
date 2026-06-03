import { Data } from "effect";

export class ToolInputError extends Data.TaggedError("ToolInputError")<{
	readonly message: string;
}> {}

export class RepositoryBoundaryError extends Data.TaggedError("RepositoryBoundaryError")<{
	readonly path: string;
	readonly message: string;
}> {}

export class ToolExecutionError extends Data.TaggedError("ToolExecutionError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export type ToolError = ToolInputError | RepositoryBoundaryError | ToolExecutionError;
