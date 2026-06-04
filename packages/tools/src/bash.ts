import { spawn } from "node:child_process";
import type { Tool } from "ai";
import { Context, Effect, Layer, Schema } from "effect";
import { ToolExecutionError } from "./errors.js";
import { BashToolInput, type BashToolOutput, RepositoryToolContext, standardSchema } from "./schema.js";
import {
	bashOutputLimitBytes,
	defaultBashTimeoutMs,
	maxBashTimeoutMs,
	rejectBlockedCommand,
	requireDirectory,
	resolveRepositoryPath,
	truncateUtf8,
} from "./shared.js";

export type BashToolServiceShape = {
	readonly run: (
		input: BashToolInput,
		context: RepositoryToolContext,
	) => Effect.Effect<
		BashToolOutput,
		ToolExecutionError | import("./errors.js").RepositoryBoundaryError | import("./errors.js").ToolInputError
	>;
};

export class BashTool extends Context.Service<BashTool, BashToolServiceShape>()("@skopeo/tools/BashTool") {
	static readonly Live = Layer.succeed(BashTool, {
		run: (input: BashToolInput, context: RepositoryToolContext) => runBash(input, context),
	});
}

export const normalizeTimeout = (timeoutMs: number | undefined) => {
	if (timeoutMs === undefined) {
		return defaultBashTimeoutMs;
	}
	return Math.max(1, Math.min(Math.floor(timeoutMs), maxBashTimeoutMs));
};

export const runBash = (input: BashToolInput, context: RepositoryToolContext) =>
	Effect.gen(function* () {
		yield* rejectBlockedCommand(input.command);
		const workingDirectory = yield* resolveRepositoryPath(context.repositoryRoot, input.workingDirectory);
		yield* requireDirectory(workingDirectory);
		const timeoutMs = normalizeTimeout(input.timeoutMs);

		return yield* Effect.callback<BashToolOutput, ToolExecutionError>((resume) => {
			const shell = process.env.SHELL?.trim() || "/bin/sh";
			const child = spawn(shell, ["-lc", input.command], {
				cwd: workingDirectory,
				env: process.env,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let completed = false;
			let timedOut = false;
			let stdout = "";
			let stderr = "";
			const timer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
			}, timeoutMs);
			const finish = (effect: Effect.Effect<BashToolOutput, ToolExecutionError>) => {
				if (completed) {
					return;
				}
				completed = true;
				clearTimeout(timer);
				resume(effect);
			};

			child.stdout?.setEncoding("utf8");
			child.stderr?.setEncoding("utf8");
			child.stdout?.on("data", (chunk) => {
				stdout += String(chunk);
			});
			child.stderr?.on("data", (chunk) => {
				stderr += String(chunk);
			});
			child.on("error", (cause) => {
				finish(
					Effect.fail(new ToolExecutionError({ message: `Unable to run command: ${cause.message}`, cause })),
				);
			});
			child.on("close", (code, signal) => {
				const stdoutResult = truncateUtf8(stdout, bashOutputLimitBytes);
				const stderrResult = truncateUtf8(stderr, bashOutputLimitBytes);
				finish(
					Effect.succeed({
						exitCode: code ?? (signal === null ? 0 : 1),
						stdout: stdoutResult.value,
						stderr: stderrResult.value,
						stdoutTruncated: stdoutResult.truncated,
						stderrTruncated: stderrResult.truncated,
						timedOut,
					}),
				);
			});
			return Effect.sync(() => {
				if (completed) {
					return;
				}
				completed = true;
				clearTimeout(timer);
				child.kill("SIGTERM");
			});
		});
	});

export const makeBashTool = (
	runEffect: <A, E>(effect: Effect.Effect<A, E, BashTool>) => Promise<A>,
): Tool<BashToolInput, BashToolOutput> => ({
	description: "Run a shell command in the repository root or a repository-contained working directory.",
	inputSchema: standardSchema(BashToolInput) as unknown as Tool<BashToolInput, BashToolOutput>["inputSchema"],
	execute: async (input, options) => {
		let context: RepositoryToolContext;
		try {
			context = Schema.decodeUnknownSync(RepositoryToolContext)(options.experimental_context);
		} catch {
			throw new Error("Missing repository tool context.");
		}
		return await runEffect(Effect.flatMap(BashTool, (service) => service.run(input, context)));
	},
});
