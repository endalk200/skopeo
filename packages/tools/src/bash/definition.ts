import { toolDefinition } from "@tanstack/ai";
import z from "zod";

import { DEFAULT_BASH_TIMEOUT_MS, MAXIMUM_BASH_TIMEOUT_MS } from "./config.js";

const bashInputSchema = z.object({
	command: z.string().meta({
		description:
			"Shell command to execute. Use safe, focused commands for inspection, package scripts, or CLI operations; destructive filesystem and permission commands are blocked.",
	}),
	path: z.string().meta({
		description:
			"Directory to run the command from. Use '.' for the repository root, a repository-relative directory such as 'packages/tools', or an absolute directory inside the repository.",
	}),
	timeoutMs: z
		.number()
		.int()
		.positive()
		.optional()
		.meta({
			description: `Command timeout in milliseconds for long-running commands. Defaults to ${DEFAULT_BASH_TIMEOUT_MS}; maximum is ${MAXIMUM_BASH_TIMEOUT_MS}.`,
		}),
});

const bashOutputSchema = z.object({
	command: z.string().meta({ description: "The exact shell command that was executed." }),
	exitCode: z.number().meta({
		description:
			"Process exit code. Zero usually means success; non-zero means the command failed or reported a problem.",
	}),
	path: z.string().meta({ description: "Real absolute directory path used as the command working directory." }),
	stderr: z.string().meta({ description: "Text written to standard error by the command." }),
	stdout: z.string().meta({ description: "Text written to standard output by the command." }),
});

export const bashToolDefinition = toolDefinition({
	name: "bash",
	description: `Run a shell command from a repository directory when you need to inspect project state, execute package scripts, or use CLI tools.
Use read-only commands for exploration, and prefer repository-relative paths unless an absolute path is required.

Usage examples:
- List workspace files: { "command": "ls", "path": "." }
- Run tests from the repo root: { "command": "bun run test", "path": ".", "timeoutMs": 120000 }
- Check a package script from a subdirectory: { "command": "bun run check-types", "path": "packages/tools" }`,
	inputSchema: bashInputSchema,
	outputSchema: bashOutputSchema,
});
