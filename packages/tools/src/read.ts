import { lstat, readdir, readFile } from "node:fs/promises";
import type { Tool } from "ai";
import { Context, Effect, Layer, Schema } from "effect";
import { ToolExecutionError } from "./errors.js";
import { ReadToolInput, type ReadToolOutput, RepositoryToolContext, standardSchema } from "./schema.js";
import {
	directoryEntryLimit,
	normalizeLineRange,
	repositoryRelativePath,
	resolveRepositoryPath,
	truncateUtf8,
	wholeFileLimitBytes,
} from "./shared.js";

export type ReadToolServiceShape = {
	readonly read: (
		input: ReadToolInput,
		context: RepositoryToolContext,
	) => Effect.Effect<
		ReadToolOutput,
		ToolExecutionError | import("./errors.js").RepositoryBoundaryError | import("./errors.js").ToolInputError
	>;
};

export class ReadTool extends Context.Service<ReadTool, ReadToolServiceShape>()("@skopeo/tools/ReadTool") {
	static readonly Live = Layer.succeed(ReadTool, {
		read: (input: ReadToolInput, context: RepositoryToolContext) => readPath(input, context),
	});
}

export const readPath = (input: ReadToolInput, context: RepositoryToolContext) =>
	Effect.gen(function* () {
		const targetPath = yield* resolveRepositoryPath(context.repositoryRoot, input.path);
		const stat = yield* Effect.tryPromise({
			try: () => lstat(targetPath),
			catch: (cause) => new ToolExecutionError({ message: `Unable to stat path: ${String(cause)}`, cause }),
		});
		const relativePath = repositoryRelativePath(context.repositoryRoot, targetPath);

		if (stat.isDirectory()) {
			const entries = yield* Effect.tryPromise({
				try: () => readdir(targetPath, { withFileTypes: true }),
				catch: (cause) =>
					new ToolExecutionError({ message: `Unable to read directory: ${String(cause)}`, cause }),
			});
			const sorted = entries
				.map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
				.sort((a, b) => a.localeCompare(b));
			const visible = sorted.slice(0, directoryEntryLimit);
			const omittedEntries = Math.max(0, sorted.length - visible.length);
			const content =
				omittedEntries > 0 ? `${visible.join("\n")}\n[${omittedEntries} entries omitted]` : visible.join("\n");

			return {
				kind: "directory" as const,
				path: relativePath,
				content,
				truncated: omittedEntries > 0,
				omittedEntries,
			};
		}

		if (!stat.isFile()) {
			return yield* Effect.fail(new ToolExecutionError({ message: "Path is neither a file nor directory." }));
		}

		const range = yield* normalizeLineRange(input.startLine, input.endLine);
		const text = yield* Effect.tryPromise({
			try: () => readFile(targetPath, "utf8"),
			catch: (cause) => new ToolExecutionError({ message: `Unable to read file: ${String(cause)}`, cause }),
		});

		const startLine = range.startLine;
		const endLine = range.endLine;
		if (startLine !== undefined && endLine !== undefined) {
			const lines = text.split(/\r?\n/);
			const selected = lines.slice(startLine - 1, endLine);
			const content = selected.map((line, index) => `${startLine + index}: ${line}`).join("\n");
			return { kind: "file" as const, path: relativePath, content, truncated: false };
		}

		const truncated = truncateUtf8(text, wholeFileLimitBytes);
		return { kind: "file" as const, path: relativePath, content: truncated.value, truncated: truncated.truncated };
	});

export const makeReadTool = (
	runEffect: <A, E>(
		effect: Effect.Effect<A, E, ReadTool>,
		options?: { readonly signal?: AbortSignal | undefined },
	) => Promise<A>,
): Tool<ReadToolInput, ReadToolOutput> => ({
	description:
		"Read a repository file with optional line range, or list immediate children of a repository directory.",
	inputSchema: standardSchema(ReadToolInput) as unknown as Tool<ReadToolInput, ReadToolOutput>["inputSchema"],
	execute: async (input, options) => {
		let context: RepositoryToolContext;
		try {
			context = Schema.decodeUnknownSync(RepositoryToolContext)(options.experimental_context);
		} catch {
			throw new Error("Missing repository tool context.");
		}
		return await runEffect(
			Effect.flatMap(ReadTool, (service) => service.read(input, context)),
			{
				signal: options.abortSignal,
			},
		);
	},
});
