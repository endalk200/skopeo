import { toolDefinition } from "@tanstack/ai";
import type { Effect } from "effect";
import z from "zod";
import type { ReadFileAgentTool } from "./read-file.tool.js";

export type ToolDefinitionFactoryOptions = {
	readonly runEffect: <A, E>(effect: Effect.Effect<A, E, ReadFileAgentTool>) => Promise<A>;
};

const readFileInputSchema = z.object({
	path: z.string().meta({
		description:
			"File path to read. Use a repository-relative path such as 'packages/tools/src/index.ts' or an absolute file path inside the repository; secret-like files are blocked.",
	}),
});

const readFileOutputSchema = z.object({
	content: z.string().meta({ description: "Full UTF-8 text contents of the requested file." }),
	path: z.string().meta({
		description: "Real absolute file path that was read after resolving repository-relative input and symlinks.",
	}),
});

export const readFileToolDefinition = toolDefinition({
	description: `Read a UTF-8 text file from the repository when exact file contents are needed for analysis, debugging, or implementation.
Use this before editing or explaining code so decisions are based on the current workspace contents.

Usage examples:
- Read a source file: { "path": "packages/tools/src/read-file/definition.ts" }
- Read project documentation: { "path": "CONTEXT.md" }
- Read configuration: { "path": "package.json" }`,
	inputSchema: readFileInputSchema,
	name: "read_file",
	outputSchema: readFileOutputSchema,
});
