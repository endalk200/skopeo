import { Context, Effect, Layer, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { GitCommandError, type GitError, NotGitRepositoryError } from "./errors.js";

/**
 * Git object identifier or symbolic ref resolved from a repository.
 */
type GitRef = string;

/**
 * Filesystem path used as the Git working-tree context for Skopeo operations.
 */
type RepositoryPath = string;

type GitCommandResult = {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
};

/**
 * Git repository access used to resolve Review Target metadata.
 *
 * Methods fail for invalid repository contexts and return `null` when Git has
 * no value for an otherwise valid state, such as detached HEAD, unborn HEAD, or
 * no discoverable main branch.
 */
class GitService extends Context.Service<
	GitService,
	{
		/**
		 * Returns the checked-out branch name, or `null` when the repository is in
		 * detached HEAD state.
		 */
		readonly getCurrentBranch: (path: RepositoryPath) => Effect.Effect<string | null, GitError>;

		/**
		 * Returns the current HEAD object id, or `null` when HEAD is not yet born.
		 */
		readonly getCurrentBranchHead: (path: RepositoryPath) => Effect.Effect<GitRef | null, GitError>;

		/**
		 * Resolves the repository's main branch from origin HEAD, local `main`, or
		 * local `master`, returning `null` when none can be found.
		 */
		readonly getMainBranch: (path: RepositoryPath) => Effect.Effect<string | null, GitError>;

		/**
		 * Returns the top-level working-tree directory for the repository.
		 */
		readonly getRepositoryRoot: (path: RepositoryPath) => Effect.Effect<RepositoryPath, GitError>;
	}
>()("GitService") {}

const textDecoder = new TextDecoder();

const decodeChunks = (chunks: ReadonlyArray<Uint8Array>) => chunks.map((chunk) => textDecoder.decode(chunk)).join("");

const runGit = (
	path: RepositoryPath,
	args: ReadonlyArray<string>,
): Effect.Effect<GitCommandResult, GitCommandError, ChildProcessSpawner> =>
	Effect.gen(function* () {
		const command = ChildProcess.make("git", ["-C", path, ...args]);
		const process = yield* command;

		return yield* Effect.all(
			{
				exitCode: process.exitCode,
				stderr: process.stderr.pipe(Stream.runCollect, Effect.map(decodeChunks)),
				stdout: process.stdout.pipe(Stream.runCollect, Effect.map(decodeChunks)),
			},
			{ concurrency: "unbounded" },
		).pipe(
			Effect.map(({ exitCode, stderr, stdout }) => ({
				exitCode,
				stderr,
				stdout,
			})),
		);
	}).pipe(
		Effect.scoped,
		Effect.mapError(
			(error) =>
				new GitCommandError({
					command: ["git", "-C", path, ...args],
					exitCode: -1,
					stdout: "",
					stderr: "",
					message: String(error),
				}),
		),
	);

type RunGitCommand = (
	path: RepositoryPath,
	args: ReadonlyArray<string>,
) => Effect.Effect<GitCommandResult, GitCommandError>;

const makeGitCommandRunner =
	(childProcessSpawner: ChildProcessSpawner["Service"]): RunGitCommand =>
	(path, args) =>
		runGit(path, args).pipe(Effect.provideService(ChildProcessSpawner, childProcessSpawner));

const validateRepository = (runGitCommand: RunGitCommand, path: RepositoryPath): Effect.Effect<void, GitError> =>
	Effect.gen(function* () {
		const args = ["rev-parse", "--is-inside-work-tree"];
		const result = yield* runGitCommand(path, args);

		if (result.stderr.includes("cannot change to")) {
			return yield* Effect.fail(
				new GitCommandError({
					command: ["git", "-C", path, ...args],
					exitCode: result.exitCode,
					stdout: result.stdout,
					stderr: result.stderr,
					message: `Path is not inside a Git working tree: ${path}`,
				}),
			);
		}

		if (result.exitCode !== 0 || result.stdout.trim() !== "true") {
			return yield* Effect.fail(
				new NotGitRepositoryError({
					path,
					message: `Path is not inside a Git working tree: ${path}`,
				}),
			);
		}
	});

const getOptionalGitOutput = (
	runGitCommand: RunGitCommand,
	path: RepositoryPath,
	args: ReadonlyArray<string>,
): Effect.Effect<string | null, GitError> =>
	Effect.gen(function* () {
		const result = yield* runGitCommand(path, args);

		if (result.exitCode !== 0) {
			return null;
		}

		const output = result.stdout.trim();
		return output.length === 0 ? null : output;
	});

const getLocalBranch = (
	runGitCommand: RunGitCommand,
	path: RepositoryPath,
	branch: string,
): Effect.Effect<string | null, GitError> =>
	Effect.gen(function* () {
		const ref = yield* getOptionalGitOutput(runGitCommand, path, ["show-ref", "--verify", `refs/heads/${branch}`]);

		return ref === null ? null : branch;
	});

const GitServiceLive = Layer.effect(
	GitService,
	Effect.gen(function* () {
		const childProcessSpawner = yield* ChildProcessSpawner;
		const runGitCommand = makeGitCommandRunner(childProcessSpawner);

		return GitService.of({
			getCurrentBranch: (path) =>
				Effect.fn("skopeo.git.get_current_branch")(function* () {
					yield* validateRepository(runGitCommand, path);

					const branch = yield* getOptionalGitOutput(runGitCommand, path, [
						"symbolic-ref",
						"--quiet",
						"--short",
						"HEAD",
					]);

					return branch;
				})(),

			getCurrentBranchHead: (path) =>
				Effect.fn("skopeo.git.get_current_branch_head")(function* () {
					yield* validateRepository(runGitCommand, path);

					return yield* getOptionalGitOutput(runGitCommand, path, ["rev-parse", "--verify", "HEAD"]);
				})(),

			getMainBranch: (path) =>
				Effect.fn("skopeo.git.get_main_branch")(function* () {
					yield* validateRepository(runGitCommand, path);

					const originHead = yield* getOptionalGitOutput(runGitCommand, path, [
						"symbolic-ref",
						"--quiet",
						"--short",
						"refs/remotes/origin/HEAD",
					]);

					if (originHead?.startsWith("origin/")) {
						return originHead.slice("origin/".length);
					}

					const main = yield* getLocalBranch(runGitCommand, path, "main");
					if (main !== null) {
						return main;
					}

					return yield* getLocalBranch(runGitCommand, path, "master");
				})(),

			getRepositoryRoot: (path) =>
				Effect.fn("skopeo.git.get_repository_root")(function* () {
					yield* validateRepository(runGitCommand, path);

					const root = yield* getOptionalGitOutput(runGitCommand, path, ["rev-parse", "--show-toplevel"]);
					if (root === null) {
						return yield* Effect.fail(
							new NotGitRepositoryError({
								message: `Path is not inside a Git working tree: ${path}`,
								path,
							}),
						);
					}

					return root;
				})(),
		});
	}),
);

export type { GitRef, RepositoryPath };
export { GitService, GitServiceLive };
