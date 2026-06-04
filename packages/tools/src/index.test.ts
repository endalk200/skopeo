import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, Schema } from "effect";
import {
	BashToolInput,
	BashToolOutput,
	bashOutputLimitBytes,
	normalizeLineRange,
	normalizeTimeout,
	ReadToolInput,
	readPath,
	rejectBlockedCommand,
	runBash,
	truncateUtf8,
} from "./index.js";

const tempRepo = () => mkdtemp(join(tmpdir(), "skopeo-tools-"));

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
		Effect.promise(async () => {
			const root = await tempRepo();
			await writeFile(join(root, "file.txt"), Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n"));

			const whole = await Effect.runPromise(readPath({ path: "file.txt" }, { repositoryRoot: root }));
			assert.strictEqual(whole.kind, "file");
			assert.include(whole.content, "line 1");

			const range = await Effect.runPromise(
				readPath({ path: "file.txt", startLine: 2, endLine: 3 }, { repositoryRoot: root }),
			);
			assert.strictEqual(range.content, "2: line 2\n3: line 3");

			const windowed = await Effect.runPromise(
				readPath({ path: "file.txt", startLine: 95 }, { repositoryRoot: root }),
			);
			assert.include(windowed.content, "95: line 95");
			assert.include(windowed.content, "100: line 100");
		}),
	);

	it.effect("lists directories non-recursively in sorted bounded output", () =>
		Effect.promise(async () => {
			const root = await tempRepo();
			await mkdir(join(root, "dir"));
			await mkdir(join(root, "dir", "b-sub"));
			await writeFile(join(root, "dir", "a.txt"), "a");

			const output = await Effect.runPromise(readPath({ path: "dir" }, { repositoryRoot: root }));

			assert.strictEqual(output.kind, "directory");
			assert.deepStrictEqual(output.content.split("\n"), ["a.txt", "b-sub/"]);
		}),
	);

	it.effect("rejects ambiguous ranges and repository escapes including symlinks", () =>
		Effect.promise(async () => {
			const root = await tempRepo();
			const outside = await tempRepo();
			await writeFile(join(root, "file.txt"), "ok");
			await writeFile(join(outside, "secret.txt"), "secret");
			await symlink(join(outside, "secret.txt"), join(root, "secret-link"));

			const ambiguous = await Effect.runPromiseExit(
				readPath({ path: "file.txt", endLine: 2 }, { repositoryRoot: root }),
			);
			assert.strictEqual(ambiguous._tag, "Failure");

			const traversal = await Effect.runPromiseExit(readPath({ path: "../outside" }, { repositoryRoot: root }));
			assert.strictEqual(traversal._tag, "Failure");

			const symlinkEscape = await Effect.runPromiseExit(
				readPath({ path: "secret-link" }, { repositoryRoot: root }),
			);
			assert.strictEqual(symlinkEscape._tag, "Failure");
		}),
	);

	it.effect("bounds output and validates schemas", () =>
		Effect.sync(() => {
			const truncated = truncateUtf8("a".repeat(300_000), 10);
			assert.strictEqual(truncated.truncated, true);
			assert.strictEqual(Buffer.byteLength(truncated.value), 10);

			assert.deepStrictEqual(Effect.runSync(normalizeLineRange(1, undefined)), { startLine: 1, endLine: 80 });
			assert.strictEqual(Schema.decodeUnknownExit(ReadToolInput)({ path: "x" })._tag, "Success");
			assert.strictEqual(Schema.decodeUnknownExit(BashToolOutput)({})._tag, "Failure");
		}),
	);

	it.effect("enforces bash policy, working directory, environment, timeout, and exact output", () =>
		Effect.promise(async () => {
			const root = await tempRepo();
			await mkdir(join(root, "sub"));
			process.env.SKOPEO_TOOLS_TEST_VALUE = "visible";

			for (const command of ["git clean -fd", "git reset --hard", "sudo whoami"]) {
				const rejected = await Effect.runPromiseExit(rejectBlockedCommand(command));
				assert.strictEqual(rejected._tag, "Failure");
			}

			const allowed = await Effect.runPromise(
				runBash(
					{
						command: "printf 'out'; printf 'err' >&2; printf \"$SKOPEO_TOOLS_TEST_VALUE\"; pwd",
						workingDirectory: "sub",
					},
					{ repositoryRoot: root },
				),
			);
			assert.include(allowed.stdout, "outvisible");
			assert.include(allowed.stdout, "/sub");
			assert.strictEqual(allowed.stderr, "err");

			const outside = await Effect.runPromiseExit(
				runBash({ command: "pwd", workingDirectory: ".." }, { repositoryRoot: root }),
			);
			assert.strictEqual(outside._tag, "Failure");

			const timedOut = await Effect.runPromise(
				runBash({ command: "sleep 2", timeoutMs: 10 }, { repositoryRoot: root }),
			);
			assert.strictEqual(timedOut.timedOut, true);

			const selfTerminated = await Effect.runPromise(
				runBash({ command: "kill -TERM $$" }, { repositoryRoot: root }),
			);
			assert.strictEqual(selfTerminated.timedOut, false);
		}),
	);

	it.effect("fails failed shell spawns and kills interrupted bash children", () =>
		Effect.promise(async () => {
			const root = await tempRepo();
			const previousShell = process.env.SHELL;
			process.env.SHELL = join(root, "missing-shell");
			try {
				const failedSpawn = await Effect.runPromiseExit(runBash({ command: "true" }, { repositoryRoot: root }));
				assert.strictEqual(failedSpawn._tag, "Failure");
			} finally {
				if (previousShell === undefined) {
					delete process.env.SHELL;
				} else {
					process.env.SHELL = previousShell;
				}
			}

			const pidFile = join(root, ".skopeo-child-pid");
			const fiber = Effect.runFork(
				runBash({ command: "printf $$ > .skopeo-child-pid; sleep 60" }, { repositoryRoot: root }),
			);
			let childPid = 0;
			try {
				await waitUntil(async () => {
					try {
						childPid = Number((await readFile(pidFile, "utf8")).trim());
						return Number.isInteger(childPid) && childPid > 0;
					} catch {
						return false;
					}
				}, "bash child pid");

				await Effect.runPromise(Fiber.interrupt(fiber));
				await waitUntil(() => !isProcessAlive(childPid), "bash child exit after interruption");
			} finally {
				if (childPid > 0 && isProcessAlive(childPid)) {
					process.kill(childPid, "SIGKILL");
				}
			}
		}),
	);

	it.effect("bounds bash output and decodes bash input schema", () =>
		Effect.promise(async () => {
			const root = await tempRepo();
			const output = await Effect.runPromise(
				runBash({ command: `printf '${"a".repeat(bashOutputLimitBytes + 10)}'` }, { repositoryRoot: root }),
			);

			assert.strictEqual(output.stdoutTruncated, true);
			assert.strictEqual(normalizeTimeout(999_999), 120_000);
			assert.strictEqual(Schema.decodeUnknownExit(BashToolInput)({ command: "pwd" })._tag, "Success");
		}),
	);
});
