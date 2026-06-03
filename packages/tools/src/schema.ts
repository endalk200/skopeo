import { Schema } from "effect";

export const RepositoryToolContext = Schema.Struct({
	repositoryRoot: Schema.String,
});

export type RepositoryToolContext = typeof RepositoryToolContext.Type;

export const ReadToolInput = Schema.Struct({
	path: Schema.String,
	startLine: Schema.optional(Schema.Number),
	endLine: Schema.optional(Schema.Number),
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
	command: Schema.String,
	workingDirectory: Schema.optional(Schema.String),
	timeoutMs: Schema.optional(Schema.Number),
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
	Schema.toStandardSchemaV1(schema);
