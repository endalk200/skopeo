import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import { BashToolInput, BashToolOutput, ReadToolInput, ReadToolOutput, RepositoryToolContext } from "./schema.js";

describe("tool schemas", () => {
	it("accepts valid inputs and outputs", () => {
		assert.strictEqual(Schema.decodeUnknownExit(ReadToolInput)({ path: "x" })._tag, "Success");
		assert.strictEqual(Schema.decodeUnknownExit(BashToolInput)({ command: "pwd" })._tag, "Success");
		assert.strictEqual(
			Schema.decodeUnknownExit(ReadToolOutput)({
				kind: "file",
				path: "x",
				content: "content",
				truncated: false,
			})._tag,
			"Success",
		);
		assert.strictEqual(
			Schema.decodeUnknownExit(BashToolOutput)({
				exitCode: 0,
				stdout: "",
				stderr: "",
				stdoutTruncated: false,
				stderrTruncated: false,
				timedOut: false,
			})._tag,
			"Success",
		);
	});

	it("rejects missing required fields and wrong field types", () => {
		assert.strictEqual(Schema.decodeUnknownExit(RepositoryToolContext)({})._tag, "Failure");
		assert.strictEqual(Schema.decodeUnknownExit(RepositoryToolContext)({ repositoryRoot: 1 })._tag, "Failure");
		assert.strictEqual(Schema.decodeUnknownExit(ReadToolInput)({})._tag, "Failure");
		assert.strictEqual(Schema.decodeUnknownExit(ReadToolInput)({ path: "x", startLine: "1" })._tag, "Failure");
		assert.strictEqual(Schema.decodeUnknownExit(BashToolInput)({})._tag, "Failure");
		assert.strictEqual(Schema.decodeUnknownExit(BashToolInput)({ command: 1 })._tag, "Failure");
		assert.strictEqual(Schema.decodeUnknownExit(BashToolOutput)({})._tag, "Failure");
		assert.strictEqual(
			Schema.decodeUnknownExit(BashToolOutput)({
				exitCode: "0",
				stdout: "",
				stderr: "",
				stdoutTruncated: false,
				stderrTruncated: false,
				timedOut: false,
			})._tag,
			"Failure",
		);
	});

	it("rejects invalid read output variants", () => {
		assert.strictEqual(
			Schema.decodeUnknownExit(ReadToolOutput)({
				kind: "other",
				path: "x",
				content: "",
				truncated: false,
			})._tag,
			"Failure",
		);
	});
});
