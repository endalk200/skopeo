import { execFile } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assert, describe, it } from "@effect/vitest";
import { SkopeoConfig, type SkopeoConfiguration } from "@skopeo/config";
import { Effect, Layer } from "effect";
import { CodeReviewAgent, DevToolsMiddlewareLoader, ReviewModelExecutor, type ReviewModelRequest } from "./index.js";
import { defaultReviewProfile, fastProfile, reviewProfiles } from "./profiles/index.js";
import { collectReviewTarget, formatChangedFileSummary, noFindingsReport } from "./review-target/collector.js";

const execFileAsync = promisify(execFile);

const tempGitRepo = async () => {
	const root = await mkdtemp(join(tmpdir(), "skopeo-agent-"));
	await execFileAsync("git", ["init"], { cwd: root });
	await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
	await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root });
	return root;
};

const testConfig = (overrides: Partial<SkopeoConfiguration> = {}) =>
	Layer.succeed(SkopeoConfig, {
		telemetry: {
			enabled: false,
			otlpEndpoint: "http://localhost:4318",
			...overrides.telemetry,
		},
		devtools: {
			enabled: false,
			...overrides.devtools,
		},
	});

describe("@skopeo/code-review-agent", () => {
	it.effect("collects staged, unstaged, and untracked non-ignored files once", () =>
		Effect.promise(async () => {
			const root = await tempGitRepo();
			await writeFile(join(root, ".gitignore"), "ignored.txt\n");
			await writeFile(join(root, "tracked.txt"), "one\n");
			await execFileAsync("git", ["add", ".gitignore", "tracked.txt"], { cwd: root });
			await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });

			await writeFile(join(root, "tracked.txt"), "two\n");
			await execFileAsync("git", ["add", "tracked.txt"], { cwd: root });
			await writeFile(join(root, "tracked.txt"), "three\n");
			await writeFile(join(root, "new.txt"), "new\n");
			await writeFile(join(root, "ignored.txt"), "ignored\n");

			const target = await Effect.runPromise(collectReviewTarget(root));

			assert.strictEqual(target.changedFileCount, 2);
			assert.deepStrictEqual(
				target.files.map((file) => `${file.status} ${file.path}`),
				["? new.txt", "M tracked.txt"],
			);
			assert.include(target.changedFileSummary, "Changed file count: 2");
		}),
	);

	it.effect("collects decoded porcelain paths and rename destinations", () =>
		Effect.promise(async () => {
			const root = await tempGitRepo();
			const accentedPath = "\u00e9.ts";
			await execFileAsync("git", ["config", "core.quotePath", "true"], { cwd: root });
			await writeFile(join(root, "old.ts"), "old\n");
			await execFileAsync("git", ["add", "old.ts"], { cwd: root });
			await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });

			await execFileAsync("git", ["mv", "old.ts", "new name.ts"], { cwd: root });
			await writeFile(join(root, accentedPath), "new\n");

			const target = await Effect.runPromise(collectReviewTarget(root));
			const filesByPath = new Map(target.files.map((file) => [file.path, file]));

			assert.strictEqual(target.changedFileCount, 2);
			assert.strictEqual(filesByPath.get("new name.ts")?.status, "R");
			assert.strictEqual(filesByPath.get(accentedPath)?.status, "?");
			assert.strictEqual(filesByPath.has("old.ts"), false);
		}),
	);

	it.effect("keeps staged rename entries intact when the destination is deleted in the worktree", () =>
		Effect.promise(async () => {
			const root = await tempGitRepo();
			await writeFile(join(root, "old.ts"), "old\n");
			await execFileAsync("git", ["add", "old.ts"], { cwd: root });
			await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });

			await execFileAsync("git", ["mv", "old.ts", "new.ts"], { cwd: root });
			await execFileAsync("rm", ["new.ts"], { cwd: root });

			const target = await Effect.runPromise(collectReviewTarget(root));

			assert.deepStrictEqual(
				target.files.map((file) => `${file.status} ${file.path}`),
				["R new.ts"],
			);
		}),
	);

	it.effect("fails outside Git and formats empty/no-findings output exactly", () =>
		Effect.promise(async () => {
			const dir = await mkdtemp(join(tmpdir(), "skopeo-nongit-"));
			const failure = await Effect.runPromiseExit(collectReviewTarget(dir));
			assert.strictEqual(failure._tag, "Failure");

			assert.strictEqual(noFindingsReport(0), "Skopeo reviewed 0 changed files. No review findings.");
			assert.strictEqual(
				formatChangedFileSummary([{ status: "A", path: "a.ts" }]),
				"Changed file count: 1\n\nChanged files:\n- A a.ts",
			);
		}),
	);

	it.effect("selects deep by default and keeps fast internal", () =>
		Effect.sync(() => {
			assert.strictEqual(defaultReviewProfile.id, "deep");
			assert.strictEqual(defaultReviewProfile.modelId, "gpt-5.5");
			assert.strictEqual(defaultReviewProfile.reasoningEffort, "medium");
			assert.strictEqual(fastProfile.reasoningEffort, "low");
			assert.strictEqual(reviewProfiles.fast.id, "fast");
			assert.include(defaultReviewProfile.systemPrompt, "P1, P2, and P3");
			assert.include(defaultReviewProfile.systemPrompt, "Correctness, Security, Architecture");
			assert.include(
				defaultReviewProfile.systemPrompt,
				"Do not assume repository-specific documentation files exist",
			);
			assert.strictEqual(
				defaultReviewProfile.buildUserPrompt("Changed file count: 1").includes("repositoryRoot"),
				false,
			);
		}),
	);

	it.effect("returns empty Review Target without invoking model boundary", () =>
		Effect.promise(async () => {
			const root = await tempGitRepo();
			const previousCwd = process.cwd();
			process.chdir(root);
			let invoked = false;
			const FakeExecutor = Layer.succeed(ReviewModelExecutor, {
				execute: () =>
					Effect.sync(() => {
						invoked = true;
						return "unexpected";
					}),
			});

			try {
				const report = await Effect.runPromise(
					Effect.flatMap(CodeReviewAgent, (agent) => agent.reviewLocalWorktree()).pipe(
						Effect.provide(CodeReviewAgent.Live),
						Effect.provide(FakeExecutor),
						Effect.provide(testConfig()),
					),
				);
				assert.strictEqual(report, "Skopeo reviewed 0 changed files. No review findings.");
				assert.strictEqual(invoked, false);
			} finally {
				process.chdir(previousCwd);
			}
		}),
	);

	it.effect("passes final report through with lean prompt and repository tool context", () =>
		Effect.promise(async () => {
			const root = await tempGitRepo();
			await writeFile(join(root, "changed.ts"), "export const x = 1;\n");
			const realRoot = await realpath(root);
			const previousCwd = process.cwd();
			process.chdir(root);
			let request: ReviewModelRequest | undefined;
			const FakeExecutor = Layer.succeed(ReviewModelExecutor, {
				execute: (nextRequest) =>
					Effect.sync(() => {
						request = nextRequest;
						return "MODEL AUTHORED REPORT";
					}),
			});

			try {
				const report = await Effect.runPromise(
					Effect.flatMap(CodeReviewAgent, (agent) => agent.reviewLocalWorktree()).pipe(
						Effect.provide(CodeReviewAgent.Live),
						Effect.provide(FakeExecutor),
						Effect.provide(testConfig()),
					),
				);

				assert.strictEqual(report, "MODEL AUTHORED REPORT");
				assert.strictEqual(request?.profile.id, "deep");
				assert.strictEqual(request?.telemetryEnabled, false);
				assert.strictEqual(request?.devToolsEnabled, false);
				assert.strictEqual(request?.prompt, "Changed file count: 1\n\nChanged files:\n- ? changed.ts");
				assert.strictEqual(request?.prompt.includes(root), false);
				assert.strictEqual(request?.toolContext.repositoryRoot, realRoot);
				assert.deepStrictEqual(Object.keys(request?.tools ?? {}).sort(), ["bash", "read"]);
			} finally {
				process.chdir(previousCwd);
			}
		}),
	);

	it.effect("passes independent telemetry and DevTools configuration to the model boundary", () =>
		Effect.promise(async () => {
			const root = await tempGitRepo();
			await writeFile(join(root, "changed.ts"), "export const x = 1;\n");
			const previousCwd = process.cwd();
			process.chdir(root);
			let request: ReviewModelRequest | undefined;
			const FakeExecutor = Layer.succeed(ReviewModelExecutor, {
				execute: (nextRequest) =>
					Effect.sync(() => {
						request = nextRequest;
						return "MODEL AUTHORED REPORT";
					}),
			});

			try {
				await Effect.runPromise(
					Effect.flatMap(CodeReviewAgent, (agent) => agent.reviewLocalWorktree()).pipe(
						Effect.provide(CodeReviewAgent.Live),
						Effect.provide(FakeExecutor),
						Effect.provide(
							testConfig({
								telemetry: { enabled: true, otlpEndpoint: "http://localhost:4318" },
								devtools: { enabled: false },
							}),
						),
					),
				);

				assert.strictEqual(request?.telemetryEnabled, true);
				assert.strictEqual(request?.devToolsEnabled, false);
			} finally {
				process.chdir(previousCwd);
			}
		}),
	);

	it.effect("does not load DevTools when disabled and skips wrapping in production", () =>
		Effect.gen(function* () {
			let wrapped = 0;
			const Loader = Layer.succeed(DevToolsMiddlewareLoader, {
				wrapModel: (model) =>
					Effect.sync(() => {
						wrapped += 1;
						return model;
					}),
			});
			const FakeModel = Layer.provide(ReviewModelExecutor.Live, Loader);

			const request = {
				profile: defaultReviewProfile,
				prompt: "Changed file count: 1",
				target: {
					repositoryRoot: process.cwd(),
					changedFileCount: 1,
					files: [],
					changedFileSummary: "Changed file count: 1",
				},
				tools: {},
				toolContext: { repositoryRoot: process.cwd() },
				telemetryEnabled: false,
				devToolsEnabled: true,
				nodeEnv: "production",
			} satisfies ReviewModelRequest;

			const executor = yield* ReviewModelExecutor.pipe(Effect.provide(FakeModel));
			const failed = yield* Effect.exit(executor.execute(request));

			assert.strictEqual(wrapped, 0);
			assert.strictEqual(failed._tag, "Failure");
		}),
	);
});
