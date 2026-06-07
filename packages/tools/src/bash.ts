import { NodeServices } from "@effect/platform-node";
import type { Tool } from "ai";
import { Context, Duration, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";
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

type LimitedOutput = {
	readonly value: string;
	readonly truncated: boolean;
};

type ExitResult = {
	readonly exitCode: number;
	readonly timedOut: boolean;
};

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
	if (timeoutMs === undefined || !Number.isFinite(timeoutMs)) {
		return defaultBashTimeoutMs;
	}
	return Math.max(1, Math.min(Math.floor(timeoutMs), maxBashTimeoutMs));
};

const collectLimitedUtf8 = <E, R>(stream: Stream.Stream<Uint8Array, E, R>, limitBytes: number) =>
	stream.pipe(
		Stream.decodeText,
		Stream.runFold(
			() => ({ value: "", truncated: false }) as LimitedOutput,
			(output, chunk) => (output.truncated ? output : truncateUtf8(`${output.value}${chunk}`, limitBytes)),
		),
		Effect.mapError(
			(cause) => new ToolExecutionError({ message: `Unable to read command output: ${String(cause)}`, cause }),
		),
	);

export const runBash = (input: BashToolInput, context: RepositoryToolContext) =>
	Effect.gen(function* () {
		const timeoutMs = normalizeTimeout(input.timeoutMs);
		yield* Effect.annotateCurrentSpan({
			"skopeo.tool.name": "bash",
			"skopeo.tool.bash.timeout_ms": timeoutMs,
			"skopeo.tool.bash.working_directory_shape":
				input.workingDirectory === undefined || input.workingDirectory === ""
					? "repository_root"
					: input.workingDirectory === "."
						? "dot"
						: "relative",
		});
		yield* rejectBlockedCommand(input.command);
		const workingDirectory = yield* resolveRepositoryPath(context.repositoryRoot, input.workingDirectory);
		yield* requireDirectory(workingDirectory);

		return yield* Effect.gen(function* () {
			const handle = yield* ChildProcess.make("/bin/bash", ["-lc", input.command], {
				cwd: workingDirectory,
				env: process.env,
				extendEnv: false,
				forceKillAfter: "2 seconds",
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			});

			const stdoutFiber = yield* collectLimitedUtf8(handle.stdout, bashOutputLimitBytes).pipe(Effect.forkScoped);
			const stderrFiber = yield* collectLimitedUtf8(handle.stderr, bashOutputLimitBytes).pipe(Effect.forkScoped);
			const exit = yield* Effect.race(
				handle.exitCode.pipe(
					Effect.match({
						onFailure: () => ({ exitCode: 1, timedOut: false }) satisfies ExitResult,
						onSuccess: (exitCode) => ({ exitCode: Number(exitCode), timedOut: false }) satisfies ExitResult,
					}),
				),
				Effect.sleep(Duration.millis(timeoutMs)).pipe(
					Effect.as({ exitCode: 1, timedOut: true } satisfies ExitResult),
				),
			);
			if (exit.timedOut) {
				yield* handle.kill({ killSignal: "SIGTERM", forceKillAfter: "2 seconds" }).pipe(Effect.ignore);
			}
			const stdoutResult = yield* Fiber.join(stdoutFiber);
			const stderrResult = yield* Fiber.join(stderrFiber);

			return {
				exitCode: exit.exitCode,
				stdout: stdoutResult.value,
				stderr: stderrResult.value,
				stdoutTruncated: stdoutResult.truncated,
				stderrTruncated: stderrResult.truncated,
				timedOut: exit.timedOut,
			};
		}).pipe(
			Effect.scoped,
			Effect.provide(NodeServices.layer),
			Effect.mapError((cause) =>
				cause instanceof ToolExecutionError
					? cause
					: new ToolExecutionError({ message: `Unable to run command: ${String(cause)}`, cause }),
			),
			Effect.tap((output) =>
				Effect.annotateCurrentSpan({
					"skopeo.tool.bash.exit_code": output.exitCode,
					"skopeo.tool.bash.timed_out": output.timedOut,
					"skopeo.tool.bash.stdout_truncated": output.stdoutTruncated,
					"skopeo.tool.bash.stderr_truncated": output.stderrTruncated,
				}),
			),
			Effect.tap((output) =>
				Effect.logInfo("Ran repository bash command", {
					"skopeo.tool.name": "bash",
					"skopeo.tool.bash.exit_code": output.exitCode,
					"skopeo.tool.bash.timed_out": output.timedOut,
					"skopeo.tool.bash.stdout_truncated": output.stdoutTruncated,
					"skopeo.tool.bash.stderr_truncated": output.stderrTruncated,
				}),
			),
		);
	}).pipe(
		Effect.tapError((error) =>
			Effect.annotateCurrentSpan({
				"skopeo.tool.bash.failure": error._tag,
				"skopeo.tool.bash.policy_rejected":
					error._tag === "ToolInputError" && error.message.includes("local trust policy"),
			}),
		),
		Effect.withSpan("skopeo.tool.bash"),
	);

export const makeBashTool = (
	runEffect: <A, E>(
		effect: Effect.Effect<A, E, BashTool>,
		options?: { readonly signal?: AbortSignal | undefined },
	) => Promise<A>,
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
		return await runEffect(
			Effect.flatMap(BashTool, (service) => service.run(input, context)),
			{
				signal: options.abortSignal,
			},
		);
	},
});
