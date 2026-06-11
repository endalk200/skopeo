import { realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
	assertToolDenied,
	executeBashTool,
	initializeRepository,
	makeBashTool,
	makeTempDirectory,
} from "../utils/test.js";

describe("Bash Agent Tool", () => {
	it.effect("runs safe shell commands from the repository and returns non-zero exit codes", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);

			const bashTool = makeBashTool(repositoryRoot);
			const result = yield* Effect.promise(() =>
				executeBashTool(bashTool, {
					command: "printf hello && exit 7",
					path: ".",
				}),
			);

			assert.strictEqual(result.path, realpathSync(repositoryRoot));
			assert.strictEqual(result.stdout, "hello");
			assert.strictEqual(result.stderr, "");
			assert.strictEqual(result.exitCode, 7);

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("blocks destructive and permission commands", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);

			const bashTool = makeBashTool(repositoryRoot);
			for (const command of ["rm file.txt", "chmod 600 file.txt"]) {
				yield* Effect.promise(() =>
					assertToolDenied(
						executeBashTool(bashTool, { command, path: repositoryRoot }),
						/Running (destructive filesystem commands|permission or ownership changes) is blocked/,
					),
				);
			}

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("blocks command directories outside the repository", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);
			const outsideRoot = makeTempDirectory();

			const bashTool = makeBashTool(repositoryRoot);
			yield* Effect.promise(() =>
				assertToolDenied(
					executeBashTool(bashTool, { command: "pwd", path: outsideRoot }),
					/Running commands outside the repository is blocked/,
				),
			);

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
			yield* Effect.promise(() => rm(outsideRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("rejects timeout values above the maximum and times out long-running commands", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);

			const bashTool = makeBashTool(repositoryRoot);
			yield* Effect.promise(() =>
				assertToolDenied(
					executeBashTool(bashTool, { command: "pwd", path: ".", timeoutMs: 120_001 }),
					/Command timeout cannot exceed 120 seconds/,
				),
			);

			yield* Effect.promise(() =>
				assertToolDenied(
					executeBashTool(bashTool, {
						command: 'node -e "setTimeout(() => {}, 2000)"',
						path: ".",
						timeoutMs: 100,
					}),
					/Command timed out after 100 ms/,
				),
			);

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
		}),
	);
});
