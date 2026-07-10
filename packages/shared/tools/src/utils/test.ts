import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { assert } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
	AgentToolPolicy,
	BashAgentToolLive,
	makeBashToolDefinition,
	makeReadFileToolDefinition,
	ReadFileAgentToolLive,
} from "../index.js";

export const makeTempDirectory = () => mkdtempSync(join(tmpdir(), "skopeo-tools-"));

export const initializeRepository = (path: string) => {
	execFileSync("git", ["init", "-b", "main"], {
		cwd: path,
		stdio: "ignore",
	});
};

const makeToolLayer = (repositoryRoot: string) =>
	Layer.mergeAll(ReadFileAgentToolLive, BashAgentToolLive).pipe(
		Layer.provide(AgentToolPolicy.layer({ repositoryRoot })),
	);

export const makeReadFileTool = (repositoryRoot: string) =>
	makeReadFileToolDefinition({
		runEffect: (effect) =>
			Effect.runPromise(
				effect.pipe(Effect.provide(makeToolLayer(repositoryRoot)), Effect.provide(NodeServices.layer)),
			),
	});

export const makeBashTool = (repositoryRoot: string) =>
	makeBashToolDefinition({
		runEffect: (effect) =>
			Effect.runPromise(
				effect.pipe(Effect.provide(makeToolLayer(repositoryRoot)), Effect.provide(NodeServices.layer)),
			),
	});

export type ReadFileTool = ReturnType<typeof makeReadFileTool>;
export type BashTool = ReturnType<typeof makeBashTool>;

export const executeReadFileTool = (tool: ReadFileTool, input: { readonly path: string }) => {
	if (tool.execute === undefined) {
		throw new Error("Expected read_file server tool to have an execute function.");
	}

	return Promise.resolve(tool.execute(input));
};

export const executeBashTool = (
	tool: BashTool,
	input: { readonly command: string; readonly path: string; readonly timeoutMs?: number | undefined },
) => {
	if (tool.execute === undefined) {
		throw new Error("Expected bash server tool to have an execute function.");
	}

	return Promise.resolve(tool.execute(input));
};

export const assertToolDenied = async (operation: unknown | Promise<unknown>, expectedMessage: RegExp) => {
	try {
		await Promise.resolve(operation);
		assert.fail("Expected tool call to fail.");
	} catch (error) {
		assert.instanceOf(error, Error);
		assert.match(error.message, expectedMessage);
	}
};
