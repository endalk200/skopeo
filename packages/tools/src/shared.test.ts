import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
	defaultBashTimeoutMs,
	normalizeLineRange,
	rejectBlockedCommand,
	repositoryRelativePath,
	resolveRepositoryPath,
	truncateUtf8,
} from "./shared.js";
import { assertToolInputError, makeDir, makeSymlink, tempRepoScoped, writeText } from "./test-helpers.js";

describe("shared helpers", () => {
	it("truncates output within byte limits without splitting multibyte characters", () => {
		const ascii = truncateUtf8("a".repeat(300_000), 10);
		assert.strictEqual(ascii.truncated, true);
		assert.strictEqual(Buffer.byteLength(ascii.value), 10);

		const multibyte = truncateUtf8("\u00e9".repeat(100), 11);
		assert.strictEqual(multibyte.truncated, true);
		assert.isAtMost(Buffer.byteLength(multibyte.value), 11);
		assert.notInclude(multibyte.value, "\uFFFD");

		const markerTooLarge = truncateUtf8("abcdef", 3, "[truncated]");
		assert.deepStrictEqual(markerTooLarge, { value: "[tr", truncated: true });
	});

	it.effect("normalizes line ranges and default windows", () =>
		Effect.gen(function* () {
			assert.deepStrictEqual(yield* normalizeLineRange(undefined, undefined), {
				startLine: undefined,
				endLine: undefined,
			});
			assert.deepStrictEqual(yield* normalizeLineRange(1, undefined), { startLine: 1, endLine: 80 });
			assert.deepStrictEqual(yield* normalizeLineRange(4, 4), { startLine: 4, endLine: 4 });
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

			const fractionalEnd = yield* Effect.flip(normalizeLineRange(1, 2.5));
			assertToolInputError(fractionalEnd, "endLine must be a positive integer.");

			const reversed = yield* Effect.flip(normalizeLineRange(3, 2));
			assertToolInputError(reversed, "endLine must be greater than or equal to startLine.");
		}),
	);

	it.effect("resolves repository paths and rejects traversal or symlink escapes", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const outside = yield* tempRepoScoped;
			yield* makeDir(join(root, "src"));
			yield* writeText(join(root, "src", "index.ts"), "export {};");
			yield* writeText(join(outside, "secret.txt"), "secret");
			yield* makeSymlink(join(outside, "secret.txt"), join(root, "secret-link"));

			const resolved = yield* resolveRepositoryPath(root, "src/index.ts");
			assert.strictEqual(repositoryRelativePath(root, resolved), "src/index.ts");

			const rootResolved = yield* resolveRepositoryPath(root, undefined);
			assert.strictEqual(repositoryRelativePath(root, rootResolved), ".");

			const traversal = yield* Effect.flip(resolveRepositoryPath(root, "../outside"));
			assert.strictEqual(traversal._tag, "RepositoryBoundaryError");

			const symlinkEscape = yield* Effect.flip(resolveRepositoryPath(root, "secret-link"));
			assert.strictEqual(symlinkEscape._tag, "RepositoryBoundaryError");
		}),
	);

	it.effect("rejects blocked commands with exact policy labels", () =>
		Effect.gen(function* () {
			for (const [command, label] of [
				["git clean -fd", "git clean"],
				["git reset --hard", "git reset"],
				["sudo whoami", "sudo"],
				["printf ok && sudo whoami", "sudo"],
			] as const) {
				const rejected = yield* Effect.flip(rejectBlockedCommand(command));
				assertToolInputError(rejected, `Command rejected by local trust policy: ${label}.`);
			}

			yield* rejectBlockedCommand("printf 'git reset --hardly a command'");
			assert.strictEqual(defaultBashTimeoutMs, 30_000);
		}),
	);
});
