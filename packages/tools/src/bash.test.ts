import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { normalizeTimeout, runBash } from "./bash.js";
import { bashOutputLimitBytes } from "./shared.js";
import { isProcessAlive, makeDir, makeSymlink, tempRepoScoped, waitUntil, writeText } from "./test-helpers.js";

describe("normalizeTimeout", () => {
	it("defaults, floors, and clamps timeout values", () => {
		assert.strictEqual(normalizeTimeout(undefined), 30_000);
		assert.strictEqual(normalizeTimeout(0), 1);
		assert.strictEqual(normalizeTimeout(-10), 1);
		assert.strictEqual(normalizeTimeout(10.9), 10);
		assert.strictEqual(normalizeTimeout(999_999), 120_000);
	});

	it("treats non-finite timeout values as the default", () => {
		assert.strictEqual(normalizeTimeout(Number.NaN), 30_000);
		assert.strictEqual(normalizeTimeout(Number.POSITIVE_INFINITY), 30_000);
		assert.strictEqual(normalizeTimeout(Number.NEGATIVE_INFINITY), 30_000);
	});
});

describe("runBash", () => {
	it.effect("rejects blocked commands by policy", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;

			for (const command of ["git clean -fd", "git reset --hard", "sudo whoami"]) {
				const rejected = yield* Effect.flip(runBash({ command }, { repositoryRoot: root }));
				assert.strictEqual(rejected._tag, "ToolInputError");
			}
		}),
	);

	it.effect("runs in the requested working directory with process environment and exact output streams", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* makeDir(join(root, "sub"));
			const previousValue = process.env.SKOPEO_TOOLS_TEST_VALUE;
			process.env.SKOPEO_TOOLS_TEST_VALUE = "visible";

			try {
				const output = yield* runBash(
					{
						command: "printf 'out'; printf 'err' >&2; printf \"$SKOPEO_TOOLS_TEST_VALUE\"; pwd",
						workingDirectory: "sub",
					},
					{ repositoryRoot: root },
				);

				assert.strictEqual(output.exitCode, 0);
				assert.include(output.stdout, "outvisible");
				assert.include(output.stdout, "/sub");
				assert.strictEqual(output.stderr, "err");
				assert.strictEqual(output.timedOut, false);
			} finally {
				if (previousValue === undefined) {
					delete process.env.SKOPEO_TOOLS_TEST_VALUE;
				} else {
					process.env.SKOPEO_TOOLS_TEST_VALUE = previousValue;
				}
			}
		}),
	);

	it.effect("rejects working directories outside the repository or through symlinks", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const outside = yield* tempRepoScoped;
			yield* makeDir(join(outside, "sub"));
			yield* makeSymlink(join(outside, "sub"), join(root, "outside-link"));

			const traversal = yield* Effect.flip(
				runBash({ command: "pwd", workingDirectory: ".." }, { repositoryRoot: root }),
			);
			assert.strictEqual(traversal._tag, "RepositoryBoundaryError");

			const symlinkEscape = yield* Effect.flip(
				runBash({ command: "pwd", workingDirectory: "outside-link" }, { repositoryRoot: root }),
			);
			assert.strictEqual(symlinkEscape._tag, "RepositoryBoundaryError");
		}),
	);

	it.effect("returns non-zero exit codes and validates working directory kind", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "not-a-directory"), "file");

			const failed = yield* runBash({ command: "printf 'bad' >&2; exit 7" }, { repositoryRoot: root });
			assert.strictEqual(failed.exitCode, 7);
			assert.strictEqual(failed.stderr, "bad");
			assert.strictEqual(failed.timedOut, false);

			const invalidWorkingDirectory = yield* Effect.flip(
				runBash({ command: "pwd", workingDirectory: "not-a-directory" }, { repositoryRoot: root }),
			);
			assert.strictEqual(invalidWorkingDirectory._tag, "ToolInputError");
		}),
	);

	it.effect("times out foreground commands and reports self-terminated commands separately", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const timeoutPidFile = join(root, ".skopeo-timeout-pid");
			const timeoutFiber = yield* Effect.forkChild(
				runBash(
					{ command: "printf $$ > .skopeo-timeout-pid; sleep 2", timeoutMs: 10 },
					{ repositoryRoot: root },
				),
			);
			yield* Effect.promise(() =>
				waitUntil(async () => {
					try {
						const pid = Number((await readFile(timeoutPidFile, "utf8")).trim());
						return Number.isInteger(pid) && pid > 0;
					} catch {
						return false;
					}
				}, "timeout bash child pid"),
			);
			yield* TestClock.adjust(10);
			const timedOut = yield* Fiber.join(timeoutFiber);
			assert.strictEqual(timedOut.timedOut, true);

			const selfTerminated = yield* runBash({ command: "kill -TERM $$" }, { repositoryRoot: root });
			assert.strictEqual(selfTerminated.timedOut, false);
		}),
	);

	it.effect("times out shell process groups with background descendants", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const pidFile = join(root, ".skopeo-descendant-pid");
			const fiber = yield* Effect.forkChild(
				runBash(
					{ command: "sleep 60 & echo $! > .skopeo-descendant-pid; wait", timeoutMs: 10 },
					{ repositoryRoot: root },
				),
			);
			let descendantPid = 0;
			try {
				yield* Effect.promise(() =>
					waitUntil(async () => {
						try {
							descendantPid = Number((await readFile(pidFile, "utf8")).trim());
							return Number.isInteger(descendantPid) && descendantPid > 0;
						} catch {
							return false;
						}
					}, "background descendant pid"),
				);

				yield* TestClock.adjust(10);
				const output = yield* Fiber.join(fiber);
				assert.strictEqual(output.timedOut, true);
				yield* Effect.promise(() =>
					waitUntil(() => !isProcessAlive(descendantPid), "background descendant exit after timeout"),
				);
			} finally {
				if (descendantPid > 0 && isProcessAlive(descendantPid)) {
					process.kill(descendantPid, "SIGKILL");
				}
			}
		}),
	);

	it.effect("uses pinned bash shell and kills interrupted bash children", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const previousShell = process.env.SHELL;
			process.env.SHELL = join(root, "missing-shell");
			try {
				const output = yield* runBash({ command: "printf bash" }, { repositoryRoot: root });
				assert.strictEqual(output.stdout, "bash");
			} finally {
				if (previousShell === undefined) {
					delete process.env.SHELL;
				} else {
					process.env.SHELL = previousShell;
				}
			}

			const pidFile = join(root, ".skopeo-child-pid");
			const fiber = yield* Effect.forkChild(
				runBash({ command: "printf $$ > .skopeo-child-pid; sleep 60" }, { repositoryRoot: root }),
			);
			let childPid = 0;
			try {
				yield* Effect.promise(() =>
					waitUntil(async () => {
						try {
							childPid = Number((await readFile(pidFile, "utf8")).trim());
							return Number.isInteger(childPid) && childPid > 0;
						} catch {
							return false;
						}
					}, "bash child pid"),
				);

				yield* Fiber.interrupt(fiber);
				yield* Effect.promise(() =>
					waitUntil(() => !isProcessAlive(childPid), "bash child exit after interruption"),
				);
			} finally {
				if (childPid > 0 && isProcessAlive(childPid)) {
					process.kill(childPid, "SIGKILL");
				}
			}
		}),
	);

	it.effect("bounds bash stdout and stderr output", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const stdout = yield* runBash(
				{ command: `printf '${"a".repeat(bashOutputLimitBytes + 10)}'` },
				{ repositoryRoot: root },
			);
			const stderr = yield* runBash(
				{ command: `printf '${"b".repeat(bashOutputLimitBytes + 10)}' >&2` },
				{ repositoryRoot: root },
			);

			assert.strictEqual(stdout.stdoutTruncated, true);
			assert.strictEqual(stdout.stderrTruncated, false);
			assert.isAtMost(Buffer.byteLength(stdout.stdout, "utf8"), bashOutputLimitBytes);
			assert.strictEqual(stdout.stderr, "");
			assert.strictEqual(stderr.stderrTruncated, true);
			assert.strictEqual(stderr.stdoutTruncated, false);
			assert.isAtMost(Buffer.byteLength(stderr.stderr, "utf8"), bashOutputLimitBytes);
			assert.strictEqual(stderr.stdout, "");
		}),
	);
});
