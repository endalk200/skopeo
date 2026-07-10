import { Context, Effect, FileSystem, Layer, Path } from "effect";
import {
	AgentToolPolicy,
	AgentToolPolicyDenied,
	enforcePolicy,
	InvalidAgentToolInput,
	resolveToolPath,
} from "../tool-policy.js";
import { readFileToolDefinition, type ToolDefinitionFactoryOptions } from "./definition.js";

const utf8Encoder = new TextEncoder();

export type ReadFileAgentToolInput = {
	readonly path: string;
};

export type ReadFileAgentToolOutput = {
	readonly path: string;
	readonly content: string;
};

export class ReadFileAgentTool extends Context.Service<
	ReadFileAgentTool,
	{
		readonly readFile: (input: ReadFileAgentToolInput) => Effect.Effect<ReadFileAgentToolOutput, unknown>;
	}
>()("ReadFileAgentTool") {}

export const ReadFileAgentToolLive = Layer.effect(
	ReadFileAgentTool,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const pathService = yield* Path.Path;
		const policy = yield* AgentToolPolicy;

		return ReadFileAgentTool.of({
			readFile: (input) =>
				Effect.fn("skopeo.agent_tool.read_file")(function* () {
					const requestedPath = resolveToolPath(pathService, policy.repositoryRoot, input.path);
					yield* Effect.logInfo("Read Agent Tool invoked").pipe(
						Effect.annotateLogs({
							"agent_tool.name": "read_file",
							"agent_tool.path": requestedPath,
						}),
					);

					const decision = yield* policy.canReadFile({ path: requestedPath });
					yield* Effect.logInfo("Read Agent Tool policy evaluated").pipe(
						Effect.annotateLogs({
							"agent_tool.name": "read_file",
							"agent_tool.approved": decision.approved,
							...(decision.approved ? {} : { "agent_tool.denial_reason": decision.reason }),
						}),
					);
					yield* enforcePolicy(decision);

					const path = yield* fs.realPath(requestedPath);
					const content = yield* fs.readFileString(path);
					const outputBytes = utf8Encoder.encode(content).byteLength;

					yield* Effect.logInfo("Read Agent Tool completed").pipe(
						Effect.annotateLogs({
							"agent_tool.name": "read_file",
							"agent_tool.path": path,
							"agent_tool.output_bytes": outputBytes,
						}),
					);

					return {
						content,
						path,
					};
				})(),
		});
	}),
);

export const makeReadFileToolDefinition = ({ runEffect }: ToolDefinitionFactoryOptions) =>
	readFileToolDefinition.server(async (input) => {
		try {
			return await runEffect(
				Effect.gen(function* () {
					const tool = yield* ReadFileAgentTool;
					return yield* tool.readFile(input);
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
