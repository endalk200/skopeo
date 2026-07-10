import { Context, Data, Duration, Effect, FileSystem, Layer, Path, Stream } from "effect";
import type * as PlatformError from "effect/PlatformError";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import {
	AgentToolPolicy,
	AgentToolPolicyDenied,
	enforcePolicy,
	InvalidAgentToolInput,
	resolveToolPath,
} from "../tool-policy.js";
import { BASH_FORCE_KILL_AFTER_MS, DEFAULT_BASH_TIMEOUT_MS, MAXIMUM_BASH_TIMEOUT_MS } from "./config.js";
import { bashToolDefinition } from "./definition.js";

export type BashAgentToolInput = {
	readonly path: string;
	readonly command: string;
	readonly timeoutMs?: number | undefined;
};

export type BashAgentToolOutput = {
	readonly path: string;
	readonly command: string;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
};

export class AgentToolTimeoutExceeded extends Data.TaggedError("AgentToolTimeoutExceeded")<{
	readonly timeoutMs: number;
	readonly message: string;
}> {}

export class BashAgentTool extends Context.Service<
	BashAgentTool,
	{
		readonly run: (input: BashAgentToolInput) => Effect.Effect<BashAgentToolOutput, unknown>;
	}
>()("BashAgentTool") {}

export const BashAgentToolLive = Layer.effect(
	BashAgentTool,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const childProcessSpawner = yield* ChildProcessSpawner;
		const pathService = yield* Path.Path;
		const policy = yield* AgentToolPolicy;

		return BashAgentTool.of({
			run: (input) =>
				Effect.fn("skopeo.agent_tool.bash")(function* () {
					const timeoutMs = yield* validateTimeoutMs(input.timeoutMs);
					const requestedPath = resolveToolPath(pathService, policy.repositoryRoot, input.path);

					yield* Effect.logInfo("Bash Agent Tool invoked").pipe(
						Effect.annotateLogs({
							"agent_tool.name": "bash",
							"agent_tool.path": requestedPath,
							"agent_tool.command": input.command,
							"agent_tool.timeout_ms": timeoutMs,
						}),
					);

					const decision = yield* policy.canRunCommand({ command: input.command, path: requestedPath });
					yield* Effect.logInfo("Bash Agent Tool policy evaluated").pipe(
						Effect.annotateLogs({
							"agent_tool.name": "bash",
							"agent_tool.approved": decision.approved,
							...(decision.approved ? {} : { "agent_tool.denial_reason": decision.reason }),
						}),
					);
					yield* enforcePolicy(decision);

					const path = yield* fs.realPath(requestedPath);
					const info = yield* fs.stat(path);
					if (info.type !== "Directory") {
						return yield* Effect.fail(
							new InvalidAgentToolInput({
								message: "Command path must be a repository directory.",
							}),
						);
					}

					const result = yield* runShellCommand({
						command: input.command,
						path,
						timeoutMs,
					}).pipe(Effect.provideService(ChildProcessSpawner, childProcessSpawner));

					yield* Effect.logInfo("Bash Agent Tool completed").pipe(
						Effect.annotateLogs({
							"agent_tool.name": "bash",
							"agent_tool.path": path,
							"agent_tool.command": input.command,
							"agent_tool.exit_code": result.exitCode,
							"agent_tool.stdout_bytes": result.stdout.length,
							"agent_tool.stderr_bytes": result.stderr.length,
						}),
					);

					return result;
				})(),
		});
	}),
);

const runShellCommand = ({
	command,
	path,
	timeoutMs,
}: {
	readonly command: string;
	readonly path: string;
	readonly timeoutMs: number;
}): Effect.Effect<BashAgentToolOutput, PlatformError.PlatformError | AgentToolTimeoutExceeded, ChildProcessSpawner> =>
	Effect.gen(function* () {
		const childProcess = yield* ChildProcess.make(command, [], {
			cwd: path,
			extendEnv: true,
			forceKillAfter: `${BASH_FORCE_KILL_AFTER_MS} millis`,
			shell: true,
		});

		const collectOutput = Effect.all(
			{
				exitCode: childProcess.exitCode,
				stderr: childProcess.stderr.pipe(Stream.runCollect, Effect.map(decodeChunks)),
				stdout: childProcess.stdout.pipe(Stream.runCollect, Effect.map(decodeChunks)),
			},
			{ concurrency: "unbounded" },
		).pipe(
			Effect.map(({ exitCode, stderr, stdout }) => ({
				command,
				exitCode,
				path,
				stderr,
				stdout,
			})),
		);

		const timeout = Effect.sleep(Duration.millis(timeoutMs)).pipe(
			Effect.andThen(
				Effect.fail(
					new AgentToolTimeoutExceeded({
						message: `Command timed out after ${timeoutMs} ms.`,
						timeoutMs,
					}),
				),
			),
		);

		return yield* collectOutput.pipe(Effect.raceFirst(timeout));
	}).pipe(Effect.scoped);

const textDecoder = new TextDecoder();

const decodeChunks = (chunks: ReadonlyArray<Uint8Array>) => chunks.map((chunk) => textDecoder.decode(chunk)).join("");

const validateTimeoutMs = (timeoutMs: number | undefined): Effect.Effect<number, InvalidAgentToolInput> => {
	if (timeoutMs === undefined) {
		return Effect.succeed(DEFAULT_BASH_TIMEOUT_MS);
	}

	if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
		return Effect.fail(
			new InvalidAgentToolInput({
				message: "Command timeout must be a positive integer number of milliseconds.",
			}),
		);
	}

	if (timeoutMs > MAXIMUM_BASH_TIMEOUT_MS) {
		return Effect.fail(
			new InvalidAgentToolInput({
				message: `Command timeout cannot exceed ${MAXIMUM_BASH_TIMEOUT_MS / 1_000} seconds.`,
			}),
		);
	}

	return Effect.succeed(timeoutMs);
};

export type BashToolDefinitionFactoryOptions = {
	readonly runEffect: <A, E>(effect: Effect.Effect<A, E, BashAgentTool>) => Promise<A>;
};

export const makeBashToolDefinition = ({ runEffect }: BashToolDefinitionFactoryOptions) =>
	bashToolDefinition.server(async (input) => {
		try {
			return await runEffect(
				Effect.gen(function* () {
					const tool = yield* BashAgentTool;

					return yield* tool.run(input);
				}),
			);
		} catch (error) {
			if (error instanceof AgentToolPolicyDenied) {
				throw new Error(error.reason);
			}

			if (error instanceof InvalidAgentToolInput) {
				throw new Error(error.message);
			}

			throw error instanceof Error ? error : new Error(String(error));
		}
	});
