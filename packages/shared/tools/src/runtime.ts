import type { FileSystem, Path } from "effect";
import { Layer } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { BashAgentToolLive } from "./bash/bash.tool.js";
import { ReadFileAgentToolLive } from "./read-file/read-file.tool.js";
import { AgentToolPolicy } from "./tool-policy.js";

export type AgentToolRuntimeDependencies = FileSystem.FileSystem | Path.Path | ChildProcessSpawner;

export const makeAgentToolsLayer = (options: { readonly repositoryRoot: string }) =>
	Layer.mergeAll(ReadFileAgentToolLive, BashAgentToolLive).pipe(
		Layer.provide(AgentToolPolicy.layer({ repositoryRoot: options.repositoryRoot })),
	);
