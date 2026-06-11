import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Layer } from "effect";
import { GitCommandError, NotGitRepositoryError } from "./errors.js";
import { GitService, GitServiceLive } from "./service.js";

const gitTestLayer = GitServiceLive.pipe(Layer.provideMerge(NodeServices.layer));

const runGit = (cwd: string, args: ReadonlyArray<string>) => {
	execFileSync("git", args, {
		cwd,
		stdio: "ignore",
	});
};

const makeTempDirectory = () => mkdtempSync(join(tmpdir(), "skopeo-git-service-"));

const initializeRepository = (path: string, branch = "main") => {
	runGit(path, ["init", "-b", branch]);
	runGit(path, ["config", "user.email", "skopeo@example.test"]);
	runGit(path, ["config", "user.name", "Skopeo Test"]);
};

const commitEmpty = (path: string, message = "Initial commit") => {
	runGit(path, ["commit", "--allow-empty", "-m", message]);
};

const runWithGitService = <A, E>(effect: Effect.Effect<A, E, GitService>) => effect.pipe(Effect.provide(gitTestLayer));

describe("GitServiceLive", () => {
	it.effect("fails with NotGitRepositoryError outside a Git repository", () =>
		Effect.gen(function* () {
			const path = makeTempDirectory();
			const result = yield* Effect.exit(
				runWithGitService(
					Effect.gen(function* () {
						const git = yield* GitService;
						return yield* git.getCurrentBranch(path);
					}),
				),
			);

			assert.strictEqual(result._tag, "Failure");
			if (result._tag === "Failure") {
				const failure = result.cause.reasons.find(Cause.isFailReason);
				assert.instanceOf(failure?.error, NotGitRepositoryError);
			}

			rmSync(path, { force: true, recursive: true });
		}),
	);

	it.effect("fails with GitCommandError when the directory does not exist", () =>
		Effect.gen(function* () {
			const parentPath = makeTempDirectory();
			const path = join(parentPath, "missing");
			const result = yield* Effect.exit(
				runWithGitService(
					Effect.gen(function* () {
						const git = yield* GitService;
						return yield* git.getCurrentBranch(path);
					}),
				),
			);

			assert.strictEqual(result._tag, "Failure");
			if (result._tag === "Failure") {
				const failure = result.cause.reasons.find(Cause.isFailReason);
				assert.instanceOf(failure?.error, GitCommandError);
			}

			rmSync(parentPath, { force: true, recursive: true });
		}),
	);

	it.effect("returns the current branch name", () =>
		Effect.gen(function* () {
			const repositoryPath = makeTempDirectory();
			initializeRepository(repositoryPath, "main");
			commitEmpty(repositoryPath);
			runGit(repositoryPath, ["switch", "-c", "feature/review"]);

			const branch = yield* runWithGitService(
				Effect.gen(function* () {
					const git = yield* GitService;
					return yield* git.getCurrentBranch(repositoryPath);
				}),
			);

			assert.strictEqual(branch, "feature/review");

			rmSync(repositoryPath, { force: true, recursive: true });
		}),
	);

	it.effect("returns null for current branch and the full head ref in detached HEAD", () =>
		Effect.gen(function* () {
			const repositoryPath = makeTempDirectory();
			initializeRepository(repositoryPath, "main");
			commitEmpty(repositoryPath);
			const detachedHead = execFileSync("git", ["rev-parse", "HEAD"], {
				cwd: repositoryPath,
				encoding: "utf8",
			}).trim();
			runGit(repositoryPath, ["switch", "--detach", detachedHead]);

			const result = yield* runWithGitService(
				Effect.gen(function* () {
					const git = yield* GitService;
					const branch = yield* git.getCurrentBranch(repositoryPath);
					const head = yield* git.getCurrentBranchHead(repositoryPath);
					return { branch, head };
				}),
			);

			assert.strictEqual(result.branch, null);
			assert.match(result.head ?? "", /^[0-9a-f]{40}$/);

			rmSync(repositoryPath, { force: true, recursive: true });
		}),
	);

	it.effect("returns null for current branch head in an unborn repository", () =>
		Effect.gen(function* () {
			const repositoryPath = makeTempDirectory();
			initializeRepository(repositoryPath, "main");

			const head = yield* runWithGitService(
				Effect.gen(function* () {
					const git = yield* GitService;
					return yield* git.getCurrentBranchHead(repositoryPath);
				}),
			);

			assert.strictEqual(head, null);

			rmSync(repositoryPath, { force: true, recursive: true });
		}),
	);

	it.effect("detects the main branch from origin HEAD before local fallbacks", () =>
		Effect.gen(function* () {
			const repositoryPath = makeTempDirectory();
			initializeRepository(repositoryPath, "main");
			commitEmpty(repositoryPath);
			runGit(repositoryPath, ["branch", "develop"]);
			runGit(repositoryPath, ["update-ref", "refs/remotes/origin/develop", "HEAD"]);
			runGit(repositoryPath, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"]);

			const branch = yield* runWithGitService(
				Effect.gen(function* () {
					const git = yield* GitService;
					return yield* git.getMainBranch(repositoryPath);
				}),
			);

			assert.strictEqual(branch, "develop");

			rmSync(repositoryPath, { force: true, recursive: true });
		}),
	);

	it.effect("falls back to local main, then master, then null", () =>
		Effect.gen(function* () {
			const mainRepositoryPath = makeTempDirectory();
			initializeRepository(mainRepositoryPath, "main");
			commitEmpty(mainRepositoryPath);
			const masterRepositoryPath = makeTempDirectory();
			initializeRepository(masterRepositoryPath, "master");
			commitEmpty(masterRepositoryPath);
			const noMainRepositoryPath = makeTempDirectory();
			initializeRepository(noMainRepositoryPath, "develop");
			commitEmpty(noMainRepositoryPath);

			const result = yield* runWithGitService(
				Effect.gen(function* () {
					const git = yield* GitService;
					const main = yield* git.getMainBranch(mainRepositoryPath);
					const master = yield* git.getMainBranch(masterRepositoryPath);
					const none = yield* git.getMainBranch(noMainRepositoryPath);
					return { main, master, none };
				}),
			);

			assert.deepStrictEqual(result, {
				main: "main",
				master: "master",
				none: null,
			});

			rmSync(mainRepositoryPath, { force: true, recursive: true });
			rmSync(masterRepositoryPath, { force: true, recursive: true });
			rmSync(noMainRepositoryPath, { force: true, recursive: true });
		}),
	);

	it.effect("returns the repository root from a subdirectory", () =>
		Effect.gen(function* () {
			const repositoryPath = makeTempDirectory();
			initializeRepository(repositoryPath, "main");
			const subdirectory = join(repositoryPath, "packages", "cli");
			mkdirSync(subdirectory, { recursive: true });

			const root = yield* runWithGitService(
				Effect.gen(function* () {
					const git = yield* GitService;
					return yield* git.getRepositoryRoot(subdirectory);
				}),
			);

			assert.strictEqual(root, realpathSync(repositoryPath));

			rmSync(repositoryPath, { force: true, recursive: true });
		}),
	);
});
