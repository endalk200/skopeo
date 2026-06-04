import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Effect } from "effect";
import { RepositoryBoundaryError, ToolExecutionError, ToolInputError } from "./errors.js";

export const wholeFileLimitBytes = 200 * 1024;
export const directoryEntryLimit = 300;
export const defaultLineWindow = 80;
export const bashOutputLimitBytes = 60 * 1024;
export const defaultBashTimeoutMs = 30_000;
export const maxBashTimeoutMs = 120_000;

export const truncateUtf8 = (
	value: string,
	limitBytes: number,
	marker = "\n[truncated]\n",
): { readonly value: string; readonly truncated: boolean } => {
	const bytes = Buffer.byteLength(value, "utf8");
	if (bytes <= limitBytes) {
		return { value, truncated: false };
	}

	const markerBytes = Buffer.byteLength(marker, "utf8");
	if (markerBytes >= limitBytes) {
		return { value: marker.slice(0, limitBytes), truncated: true };
	}
	const allowed = Math.max(0, limitBytes - markerBytes);
	let end = 0;
	let used = 0;

	for (const char of value) {
		const charBytes = Buffer.byteLength(char, "utf8");
		if (used + charBytes > allowed) {
			break;
		}
		used += charBytes;
		end += char.length;
	}

	return { value: `${value.slice(0, end)}${marker}`, truncated: true };
};

export const isInsidePath = (root: string, candidate: string): boolean => {
	const relativePath = relative(root, candidate);
	return (
		relativePath === "" ||
		(!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
	);
};

export const resolveRepositoryPath = (
	repositoryRoot: string,
	inputPath: string | undefined,
): Effect.Effect<string, RepositoryBoundaryError | ToolExecutionError> =>
	Effect.tryPromise({
		try: async () => {
			const root = await realpath(repositoryRoot);
			const rawPath = inputPath === undefined || inputPath === "" ? "." : inputPath;
			const resolved = resolve(root, rawPath);

			if (!isInsidePath(root, resolved)) {
				throw new RepositoryBoundaryError({
					path: rawPath,
					message: "Path resolves outside the repository root.",
				});
			}

			const existingRealPath = await realpath(resolved);
			if (!isInsidePath(root, existingRealPath)) {
				throw new RepositoryBoundaryError({
					path: rawPath,
					message: "Path resolves through a symlink outside the repository root.",
				});
			}

			return existingRealPath;
		},
		catch: (cause) => {
			if (cause instanceof RepositoryBoundaryError) {
				return cause;
			}
			return new ToolExecutionError({ message: `Unable to resolve repository path: ${String(cause)}`, cause });
		},
	});

export const repositoryRelativePath = (repositoryRoot: string, absolutePath: string): string => {
	const relativePath = relative(repositoryRoot, absolutePath);
	return relativePath === "" ? "." : relativePath.split(sep).join("/");
};

export const normalizeLineRange = (
	startLine: number | undefined,
	endLine: number | undefined,
): Effect.Effect<{ readonly startLine: number | undefined; readonly endLine: number | undefined }, ToolInputError> => {
	if (startLine === undefined && endLine !== undefined) {
		return Effect.fail(new ToolInputError({ message: "endLine cannot be supplied without startLine." }));
	}
	if (startLine !== undefined && (!Number.isInteger(startLine) || startLine < 1)) {
		return Effect.fail(new ToolInputError({ message: "startLine must be a positive integer." }));
	}
	if (endLine !== undefined && (!Number.isInteger(endLine) || endLine < 1)) {
		return Effect.fail(new ToolInputError({ message: "endLine must be a positive integer." }));
	}
	if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
		return Effect.fail(new ToolInputError({ message: "endLine must be greater than or equal to startLine." }));
	}
	return Effect.succeed({
		startLine,
		endLine: startLine !== undefined && endLine === undefined ? startLine + defaultLineWindow - 1 : endLine,
	});
};

export const rejectBlockedCommand = (command: string): Effect.Effect<void, ToolInputError> => {
	const blocked = [
		{ pattern: /(^|[;&|()\s])git\s+clean(\s|$)/, label: "git clean" },
		{ pattern: /(^|[;&|()\s])git\s+reset(\s|$)/, label: "git reset" },
		{ pattern: /(^|[;&|()\s])sudo(\s|$)/, label: "sudo" },
	].find(({ pattern }) => pattern.test(command));

	return blocked === undefined
		? Effect.void
		: Effect.fail(new ToolInputError({ message: `Command rejected by local trust policy: ${blocked.label}.` }));
};

export const requireDirectory = (path: string) =>
	Effect.tryPromise({
		try: async () => {
			const stat = await lstat(path);
			if (!stat.isDirectory()) {
				throw new Error("not a directory");
			}
		},
		catch: (cause) => new ToolInputError({ message: `Working directory is not a directory: ${String(cause)}` }),
	});
