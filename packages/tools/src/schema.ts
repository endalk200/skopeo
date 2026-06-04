import { Schema } from "effect";

export const RepositoryToolContext = Schema.Struct({
	repositoryRoot: Schema.String,
});

export type RepositoryToolContext = typeof RepositoryToolContext.Type;

export const ReadToolInput = Schema.Struct({
	path: Schema.String.annotate({
		description:
			"Repository-relative file or directory path to read. Use this to inspect source files, configuration, tests, or directory contents without leaving the repository boundary.",
		examples: ["packages/tools/src/schema.ts", "apps/cli/src/index.ts", "docs/adr"],
	}),
	startLine: Schema.optional(
		Schema.Number.annotate({
			description:
				"Optional 1-based first line to include when reading a file. Use with endLine to keep reads focused on the relevant section.",
			examples: [1, 42],
		}),
	),
	endLine: Schema.optional(
		Schema.Number.annotate({
			description:
				"Optional 1-based last line to include when reading a file. Must be paired with startLine for a bounded line-range read.",
			examples: [80, 160],
		}),
	),
});

export type ReadToolInput = typeof ReadToolInput.Type;

export const ReadToolOutput = Schema.Struct({
	kind: Schema.Literals(["file", "directory"]),
	path: Schema.String,
	content: Schema.String,
	truncated: Schema.Boolean,
	omittedEntries: Schema.optional(Schema.Number),
});

export type ReadToolOutput = typeof ReadToolOutput.Type;

export const BashToolInput = Schema.Struct({
	command: Schema.String.annotate({
		description:
			"Shell command to run through /bin/bash -lc. Prefer targeted, non-interactive commands that inspect, build, test, or format the repository.",
		examples: ["bun run check-types", 'rg -n "makeReadTool" packages', "bun test packages/tools/src"],
	}),
	workingDirectory: Schema.optional(
		Schema.String.annotate({
			description:
				"Optional repository-relative working directory for the command. Omit it to run from the repository root.",
			examples: ["packages/tools", "apps/cli"],
		}),
	),
	timeoutMs: Schema.optional(
		Schema.Number.annotate({
			description:
				"Optional command timeout in milliseconds. Values are normalized by the tool, so use this only when a command legitimately needs more or less time than the default.",
			examples: [5000, 30000, 120000],
		}),
	),
});

export type BashToolInput = typeof BashToolInput.Type;

export const BashToolOutput = Schema.Struct({
	exitCode: Schema.Number,
	stdout: Schema.String,
	stderr: Schema.String,
	stdoutTruncated: Schema.Boolean,
	stderrTruncated: Schema.Boolean,
	timedOut: Schema.Boolean,
});

export type BashToolOutput = typeof BashToolOutput.Type;

export const standardSchema = <S extends Schema.Decoder<unknown>>(schema: S): unknown =>
	Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(schema));
