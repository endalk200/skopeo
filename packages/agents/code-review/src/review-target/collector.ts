import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect } from "effect";
import { ReviewTargetCollectionError } from "../errors.js";

const execFileAsync = promisify(execFile);

export type ReviewTargetFile = {
	readonly status: "A" | "M" | "D" | "R" | "C" | "?" | "!";
	readonly path: string;
};

export type ReviewTarget = {
	readonly repositoryRoot: string;
	readonly changedFileCount: number;
	readonly files: ReadonlyArray<ReviewTargetFile>;
	readonly changedFileSummary: string;
};

const runGit = (args: ReadonlyArray<string>, cwd: string) =>
	Effect.tryPromise({
		try: async () => {
			const result = await execFileAsync("git", [...args], {
				cwd,
				encoding: "utf8",
				maxBuffer: 10 * 1024 * 1024,
			});
			return result.stdout;
		},
		catch: (cause) =>
			new ReviewTargetCollectionError({
				message: "Unable to collect local Git Review Target.",
				cause,
			}),
	});

const parseStatusLine = (line: string): ReviewTargetFile | undefined => {
	if (line.trim() === "") {
		return undefined;
	}
	const marker = line.slice(0, 2);
	const rawPath = line.slice(3);
	const renamedPath = rawPath.includes(" -> ") ? (rawPath.split(" -> ").at(-1) ?? rawPath) : rawPath;
	const status = marker.includes("?")
		? "?"
		: marker.includes("A")
			? "A"
			: marker.includes("D")
				? "D"
				: marker.includes("R")
					? "R"
					: marker.includes("C")
						? "C"
						: "M";
	return { status, path: renamedPath };
};

export const formatChangedFileSummary = (files: ReadonlyArray<ReviewTargetFile>): string =>
	[
		`Changed file count: ${files.length}`,
		"",
		"Changed files:",
		...files.map((file) => `- ${file.status} ${file.path}`),
	].join("\n");

export const collectReviewTarget = (cwd = process.cwd()): Effect.Effect<ReviewTarget, ReviewTargetCollectionError> =>
	Effect.gen(function* () {
		const root = (yield* runGit(["rev-parse", "--show-toplevel"], cwd)).trim();
		if (root === "") {
			return yield* Effect.fail(
				new ReviewTargetCollectionError({ message: "Skopeo review must be run inside a Git repository." }),
			);
		}

		const statusOutput = yield* runGit(["status", "--porcelain=v1", "--untracked-files=all"], root);
		const filesByPath = new Map<string, ReviewTargetFile>();
		for (const line of statusOutput.split(/\r?\n/)) {
			const parsed = parseStatusLine(line);
			if (parsed !== undefined) {
				filesByPath.set(parsed.path, parsed);
			}
		}
		const files = [...filesByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
		return {
			repositoryRoot: root,
			changedFileCount: files.length,
			files,
			changedFileSummary: formatChangedFileSummary(files),
		};
	}).pipe(
		Effect.catchTag("ReviewTargetCollectionError", (error) => {
			if (String(error.cause).includes("not a git repository")) {
				return Effect.fail(
					new ReviewTargetCollectionError({
						message: "Skopeo review must be run inside a Git repository.",
						cause: error.cause,
					}),
				);
			}
			return Effect.fail(error);
		}),
	);

export const noFindingsReport = (changedFileCount: number): string =>
	`Skopeo reviewed ${changedFileCount} changed files. No review findings.`;
