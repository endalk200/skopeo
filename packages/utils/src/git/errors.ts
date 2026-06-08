import { Data } from "effect";

class NotGitRepositoryError extends Data.TaggedError("NotGitRepositoryError")<{
	readonly path: string;
	readonly message: string;
}> {}

class GitCommandError extends Data.TaggedError("GitCommandError")<{
	readonly command: ReadonlyArray<string>;
	readonly cwd?: string;
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly message: string;
}> {}

type GitError = NotGitRepositoryError | GitCommandError;

export type { GitError };
export { GitCommandError, NotGitRepositoryError };
