import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { normalizeTimeout, runBash } from "./bash.js";
import { ToolInputError } from "./errors.js";
import { BashTool, makeBashTool, makeReadTool, ReadTool } from "./index.js";
import { readPath } from "./read.js";
import {
	BashToolInput,
	BashToolOutput,
	type BashToolOutput as BashToolOutputType,
	ReadToolInput,
	type ReadToolOutput as ReadToolOutputType,
} from "./schema.js";
import {
	bashOutputLimitBytes,
	directoryEntryLimit,
	normalizeLineRange,
	rejectBlockedCommand,
	truncateUtf8,
	wholeFileLimitBytes,
} from "./shared.js";

const tempRepo = () => mkdtemp(join(tmpdir(), "skopeo-tools-"));
const tempRepoScoped = Effect.acquireRelease(Effect.promise(tempRepo), (root) =>
	Effect.promise(() => rm(root, { recursive: true, force: true })),
);

const writeText = (path: string, content: string) => Effect.promise(() => writeFile(path, content));
const makeDir = (path: string) => Effect.promise(() => mkdir(path));
const makeSymlink = (target: string, path: string) => Effect.promise(() => symlink(target, path));

const assertToolInputError = (error: unknown, message: string) => {
	assert.instanceOf(error, ToolInputError);
	assert.strictEqual(error.message, message);
};

const waitUntil = async (predicate: () => boolean | Promise<boolean>, label: string) => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 2_000) {
		if (await predicate()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`Timed out waiting for ${label}.`);
};

const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") {
			return false;
		}
		throw cause;
	}
};

describe("@skopeo/tools", () => {
	it.effect("reads whole files, line ranges, and default line windows", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n"));

			const whole = yield* readPath({ path: "file.txt" }, { repositoryRoot: root });
			assert.strictEqual(whole.kind, "file");
			assert.include(whole.content, "line 1");

			const range = yield* readPath({ path: "file.txt", startLine: 2, endLine: 3 }, { repositoryRoot: root });
			assert.strictEqual(range.content, "2: line 2\n3: line 3");

			const windowed = yield* readPath({ path: "file.txt", startLine: 95 }, { repositoryRoot: root });
			assert.include(windowed.content, "95: line 95");
			assert.include(windowed.content, "100: line 100");
		}),
	);

	it.effect("lists directories non-recursively in sorted bounded output", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* makeDir(join(root, "dir"));
			yield* makeDir(join(root, "dir", "b-sub"));
			yield* writeText(join(root, "dir", "a.txt"), "a");

			const output = yield* readPath({ path: "dir" }, { repositoryRoot: root });

			assert.strictEqual(output.kind, "directory");
			assert.deepStrictEqual(output.content.split("\n"), ["a.txt", "b-sub/"]);
		}),
	);

	it.effect("truncates directory output after the entry limit", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* makeDir(join(root, "dir"));
			yield* Effect.all(
				Array.from({ length: directoryEntryLimit + 2 }, (_, index) =>
					writeText(join(root, "dir", `entry-${String(index).padStart(3, "0")}.txt`), "entry"),
				),
			);

			const output = yield* readPath({ path: "dir" }, { repositoryRoot: root });
			const lines = output.content.split("\n");

			assert.strictEqual(output.kind, "directory");
			assert.strictEqual(output.truncated, true);
			assert.strictEqual(output.omittedEntries, 2);
			assert.lengthOf(lines, directoryEntryLimit + 1);
			assert.strictEqual(lines.at(-1), "[2 entries omitted]");
		}),
	);

	it.effect("rejects ambiguous ranges and repository escapes including symlinks", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const outside = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), "ok");
			yield* writeText(join(root, "..inside.txt"), "still inside");
			yield* writeText(join(outside, "secret.txt"), "secret");
			yield* makeSymlink(join(outside, "secret.txt"), join(root, "secret-link"));

			const dotPrefixed = yield* readPath({ path: "..inside.txt" }, { repositoryRoot: root });
			assert.strictEqual(dotPrefixed.kind, "file");
			assert.include(dotPrefixed.content, "still inside");

			const ambiguous = yield* Effect.flip(readPath({ path: "file.txt", endLine: 2 }, { repositoryRoot: root }));
			assertToolInputError(ambiguous, "endLine cannot be supplied without startLine.");

			const traversal = yield* Effect.flip(readPath({ path: "../outside" }, { repositoryRoot: root }));
			assert.strictEqual(traversal._tag, "RepositoryBoundaryError");

			const symlinkEscape = yield* Effect.flip(readPath({ path: "secret-link" }, { repositoryRoot: root }));
			assert.strictEqual(symlinkEscape._tag, "RepositoryBoundaryError");
		}),
	);

	it.effect("bounds output and validates schemas", () =>
		Effect.gen(function* () {
			const truncated = truncateUtf8("a".repeat(300_000), 10);
			assert.strictEqual(truncated.truncated, true);
			assert.strictEqual(Buffer.byteLength(truncated.value), 10);

			assert.deepStrictEqual(yield* normalizeLineRange(1, undefined), { startLine: 1, endLine: 80 });
			assert.strictEqual(Schema.decodeUnknownExit(ReadToolInput)({ path: "x" })._tag, "Success");
			assert.strictEqual(Schema.decodeUnknownExit(BashToolOutput)({})._tag, "Failure");
		}),
	);

	it.effect("reports exact line range validation errors", () =>
		Effect.gen(function* () {
			const missingStart = yield* Effect.flip(normalizeLineRange(undefined, 2));
			assertToolInputError(missingStart, "endLine cannot be supplied without startLine.");

			const zeroStart = yield* Effect.flip(normalizeLineRange(0, undefined));
			assertToolInputError(zeroStart, "startLine must be a positive integer.");

			const fractionalStart = yield* Effect.flip(normalizeLineRange(1.5, undefined));
			assertToolInputError(fractionalStart, "startLine must be a positive integer.");

			const zeroEnd = yield* Effect.flip(normalizeLineRange(1, 0));
			assertToolInputError(zeroEnd, "endLine must be a positive integer.");

			const reversed = yield* Effect.flip(normalizeLineRange(3, 2));
			assertToolInputError(reversed, "endLine must be greater than or equal to startLine.");
		}),
	);

	it.effect("truncates whole file output without splitting multibyte characters", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "large.txt"), "\u00e9".repeat(wholeFileLimitBytes));

			const output = yield* readPath({ path: "large.txt" }, { repositoryRoot: root });

			assert.strictEqual(output.kind, "file");
			assert.strictEqual(output.truncated, true);
			assert.isAtMost(Buffer.byteLength(output.content, "utf8"), wholeFileLimitBytes);
			assert.include(output.content, "[truncated]");
			assert.notInclude(output.content, "\uFFFD");
		}),
	);

	it.effect("truncates line range output with the same byte limit as whole files", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const content = Array.from({ length: 1_000 }, () => "x".repeat(1_000)).join("\n");
			yield* writeText(join(root, "large.txt"), content);

			const output = yield* readPath(
				{ path: "large.txt", startLine: 1, endLine: 1_000 },
				{ repositoryRoot: root },
			);
			const expected = truncateUtf8(
				content
					.split(/\r?\n/)
					.map((line, index) => `${index + 1}: ${line}`)
					.join("\n"),
				wholeFileLimitBytes,
			);

			assert.strictEqual(output.kind, "file");
			assert.strictEqual(output.truncated, true);
			assert.strictEqual(output.content, expected.value);
		}),
	);

	it.effect("executes read tool with repository context and rejects missing context", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), "content");

			const tool = makeReadTool((effect) => Effect.runPromise(effect.pipe(Effect.provide(ReadTool.Live))));
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("read tool execute function is missing");
			}

			const output = yield* Effect.tryPromise({
				try: async () =>
					(await execute({ path: "file.txt" }, {
						experimental_context: { repositoryRoot: root },
					} as never)) as ReadToolOutputType,
				catch: (cause) => cause,
			});
			assert.strictEqual(output.kind, "file");
			assert.include(output.content, "content");

			const missingContext = yield* Effect.flip(
				Effect.tryPromise({
					try: () => Promise.resolve(execute({ path: "file.txt" }, { experimental_context: {} } as never)),
					catch: (cause) => cause,
				}),
			);
			assert.instanceOf(missingContext, Error);
			assert.strictEqual(missingContext.message, "Missing repository tool context.");
		}),
	);

	it.effect("passes read tool abort signals to the effect runner", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), "content");
			const abortController = new AbortController();
			let capturedSignal: AbortSignal | undefined;
			const tool = makeReadTool((effect, options) => {
				capturedSignal = options?.signal;
				return Effect.runPromise(effect.pipe(Effect.provide(ReadTool.Live)));
			});
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("read tool execute function is missing");
			}

			const output = yield* Effect.tryPromise({
				try: async () =>
					(await execute({ path: "file.txt" }, {
						abortSignal: abortController.signal,
						experimental_context: { repositoryRoot: root },
					} as never)) as ReadToolOutputType,
				catch: (cause) => cause,
			});

			assert.strictEqual(output.content, "content");
			assert.strictEqual(capturedSignal, abortController.signal);
		}),
	);

	it.effect("makeBashTool dispatches through runEffect and requires the live layer", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			let invoked = 0;
			const tool = makeBashTool((effect) => {
				invoked += 1;
				return Effect.runPromise(effect.pipe(Effect.provide(BashTool.Live)));
			});
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("bash tool execute function is missing");
			}

			const output = yield* Effect.tryPromise({
				try: async () =>
					(await execute({ command: "printf tool" }, {
						experimental_context: { repositoryRoot: root },
					} as never)) as BashToolOutputType,
				catch: (cause) => cause,
			});
			assert.strictEqual(output.stdout, "tool");
			assert.strictEqual(invoked, 1);

			const unprovidedTool = makeBashTool(<A, E>(effect: Effect.Effect<A, E, BashTool>) =>
				Effect.runPromise(effect as Effect.Effect<A, E>),
			);
			const unprovidedExecute = unprovidedTool.execute;
			if (unprovidedExecute === undefined) {
				assert.fail("bash tool execute function is missing");
			}

			const missingLayer = yield* Effect.flip(
				Effect.tryPromise({
					try: () =>
						Promise.resolve(
							unprovidedExecute({ command: "printf tool" }, {
								experimental_context: { repositoryRoot: root },
							} as never),
						),
					catch: (cause) => cause,
				}),
			);
			assert.instanceOf(missingLayer, Error);
			assert.include(missingLayer.message, "Service not found: @skopeo/tools/BashTool");
		}),
	);

	it.effect("aborts in-flight bash tool execution through the effect runner signal", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const pidFile = join(root, ".skopeo-aborted-tool-pid");
			const abortController = new AbortController();
			const tool = makeBashTool((effect, options) =>
				Effect.runPromise(effect.pipe(Effect.provide(BashTool.Live)), options),
			);
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("bash tool execute function is missing");
			}

			const promise = execute({ command: "printf $$ > .skopeo-aborted-tool-pid; sleep 60" }, {
				abortSignal: abortController.signal,
				experimental_context: { repositoryRoot: root },
			} as never);
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
					}, "aborted bash tool child pid"),
				);

				abortController.abort();
				const aborted = yield* Effect.promise(async () => {
					try {
						await promise;
						return false;
					} catch {
						return true;
					}
				});
				assert.strictEqual(aborted, true);
				yield* Effect.promise(() =>
					waitUntil(() => !isProcessAlive(childPid), "bash tool child exit after abort"),
				);
			} finally {
				if (childPid > 0 && isProcessAlive(childPid)) {
					process.kill(childPid, "SIGKILL");
				}
			}
		}),
	);

	it.effect("ReadTool.Live and BashTool.Live provide service access through layers", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), "content");

			const readOutput = yield* Effect.flatMap(ReadTool, (service) =>
				service.read({ path: "file.txt" }, { repositoryRoot: root }),
			).pipe(Effect.provide(ReadTool.Live));
			assert.strictEqual(readOutput.kind, "file");
			assert.include(readOutput.content, "content");

			const bashOutput = yield* Effect.flatMap(BashTool, (service) =>
				service.run({ command: "printf layered" }, { repositoryRoot: root }),
			).pipe(Effect.provide(BashTool.Live));
			assert.strictEqual(bashOutput.stdout, "layered");
		}),
	);

	it.effect("enforces bash policy, working directory, environment, timeout, and exact output", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* makeDir(join(root, "sub"));
			const previousValue = process.env.SKOPEO_TOOLS_TEST_VALUE;
			process.env.SKOPEO_TOOLS_TEST_VALUE = "visible";

			try {
				for (const command of ["git clean -fd", "git reset --hard", "sudo whoami"]) {
					const rejected = yield* Effect.flip(rejectBlockedCommand(command));
					assert.strictEqual(rejected._tag, "ToolInputError");
				}

				const allowed = yield* runBash(
					{
						command: "printf 'out'; printf 'err' >&2; printf \"$SKOPEO_TOOLS_TEST_VALUE\"; pwd",
						workingDirectory: "sub",
					},
					{ repositoryRoot: root },
				);
				assert.include(allowed.stdout, "outvisible");
				assert.include(allowed.stdout, "/sub");
				assert.strictEqual(allowed.stderr, "err");

				const outside = yield* Effect.flip(
					runBash({ command: "pwd", workingDirectory: ".." }, { repositoryRoot: root }),
				);
				assert.strictEqual(outside._tag, "RepositoryBoundaryError");

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
			} finally {
				if (previousValue === undefined) {
					delete process.env.SKOPEO_TOOLS_TEST_VALUE;
				} else {
					process.env.SKOPEO_TOOLS_TEST_VALUE = previousValue;
				}
			}
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

	it.effect("fails failed shell spawns and kills interrupted bash children", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const previousShell = process.env.SHELL;
			process.env.SHELL = join(root, "missing-shell");
			try {
				const failedSpawn = yield* Effect.flip(runBash({ command: "true" }, { repositoryRoot: root }));
				assert.strictEqual(failedSpawn._tag, "ToolExecutionError");
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

	it.effect("bounds bash stdout and stderr output and decodes bash input schema", () =>
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
			assert.strictEqual(normalizeTimeout(999_999), 120_000);
			assert.strictEqual(Schema.decodeUnknownExit(BashToolInput)({ command: "pwd" })._tag, "Success");
		}),
	);
});
