import { Context, Effect, Layer } from "effect";
import type { GitError } from "./errors.js";

type GitRef = string;
type RepositoryPath = string;

class GitService extends Context.Service<
	GitService,
	{
		readonly getCurrentBranch: (path: RepositoryPath) => Effect.Effect<string | null, GitError>;
		readonly getCurrentBranchHead: (path: RepositoryPath) => Effect.Effect<GitRef | null, GitError>;
		readonly getMainBranch: (path: RepositoryPath) => Effect.Effect<string | null, GitError>;
	}
>()("GitService") {}

const GitServiceLive = Layer.effect(
	GitService,
	Effect.gen(function* () {
		return GitService.of({
			getCurrentBranch: (path) =>
				Effect.fn("GitService.GetCurrentBranch")(function* () {
					void path;
					return yield* Effect.succeed(null);
				})(),

			getCurrentBranchHead: (path) =>
				Effect.fn("GitService.GetCurrentBranchHead")(function* () {
					void path;
					return yield* Effect.succeed(null);
				})(),

			getMainBranch: (path) =>
				Effect.fn("GitService.GetMainBranch")(function* () {
					void path;
					return yield* Effect.succeed(null);
				})(),
		});
	}),
);

export type { GitRef, RepositoryPath };
export { GitService, GitServiceLive };
