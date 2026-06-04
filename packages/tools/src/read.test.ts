import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { readPath } from "./read.js";
import { directoryEntryLimit, truncateUtf8, wholeFileLimitBytes } from "./shared.js";
import { makeDir, makeSymlink, tempRepoScoped, writeText } from "./test-helpers.js";

describe("readPath", () => {
	it.effect("reads whole files, line ranges, and default line windows", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n"));

			const whole = yield* readPath({ path: "file.txt" }, { repositoryRoot: root });
			assert.strictEqual(whole.kind, "file");
			assert.strictEqual(whole.path, "file.txt");
			assert.include(whole.content, "line 1");

			const range = yield* readPath({ path: "file.txt", startLine: 2, endLine: 3 }, { repositoryRoot: root });
			assert.strictEqual(range.content, "2: line 2\n3: line 3");

			const windowed = yield* readPath({ path: "file.txt", startLine: 95 }, { repositoryRoot: root });
			assert.include(windowed.content, "95: line 95");
			assert.include(windowed.content, "100: line 100");
		}),
	);

	it.effect("handles empty files, CRLF ranges, and ranges beyond EOF", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "empty.txt"), "");
			yield* writeText(join(root, "crlf.txt"), "one\r\ntwo\r\nthree");

			const empty = yield* readPath({ path: "empty.txt" }, { repositoryRoot: root });
			assert.strictEqual(empty.kind, "file");
			assert.strictEqual(empty.content, "");
			assert.strictEqual(empty.truncated, false);

			const crlf = yield* readPath({ path: "crlf.txt", startLine: 2, endLine: 3 }, { repositoryRoot: root });
			assert.strictEqual(crlf.content, "2: two\n3: three");

			const beyondEof = yield* readPath(
				{ path: "crlf.txt", startLine: 10, endLine: 12 },
				{ repositoryRoot: root },
			);
			assert.strictEqual(beyondEof.content, "");
			assert.strictEqual(beyondEof.truncated, false);
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
			assert.strictEqual(output.path, "dir");
			assert.deepStrictEqual(output.content.split("\n"), ["a.txt", "b-sub/"]);
			assert.strictEqual(output.truncated, false);
			assert.strictEqual(output.omittedEntries, 0);
		}),
	);

	it.effect("lists the repository root when path is empty or dot", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* makeDir(join(root, "src"));
			yield* writeText(join(root, "README.md"), "readme");

			const emptyPath = yield* readPath({ path: "" }, { repositoryRoot: root });
			const dotPath = yield* readPath({ path: "." }, { repositoryRoot: root });

			assert.strictEqual(emptyPath.kind, "directory");
			assert.strictEqual(emptyPath.path, ".");
			assert.deepStrictEqual(emptyPath.content.split("\n"), ["README.md", "src/"]);
			assert.deepStrictEqual(dotPath, emptyPath);
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

	it.effect("rejects repository escapes including symlinks", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const outside = yield* tempRepoScoped;
			yield* writeText(join(root, "..inside.txt"), "still inside");
			yield* writeText(join(outside, "secret.txt"), "secret");
			yield* makeSymlink(join(outside, "secret.txt"), join(root, "secret-link"));

			const dotPrefixed = yield* readPath({ path: "..inside.txt" }, { repositoryRoot: root });
			assert.strictEqual(dotPrefixed.kind, "file");
			assert.include(dotPrefixed.content, "still inside");

			const traversal = yield* Effect.flip(readPath({ path: "../outside" }, { repositoryRoot: root }));
			assert.strictEqual(traversal._tag, "RepositoryBoundaryError");

			const symlinkEscape = yield* Effect.flip(readPath({ path: "secret-link" }, { repositoryRoot: root }));
			assert.strictEqual(symlinkEscape._tag, "RepositoryBoundaryError");
		}),
	);

	it.effect("reports missing paths as execution errors", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;

			const missing = yield* Effect.flip(readPath({ path: "missing.txt" }, { repositoryRoot: root }));
			assert.strictEqual(missing._tag, "ToolExecutionError");
			assert.include(missing.message, "Unable to resolve repository path");
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
});
