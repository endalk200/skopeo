import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { BashTool, makeBashTool, makeReadTool, ReadTool } from "./index.js";
import type { BashToolOutput as BashToolOutputType, ReadToolOutput as ReadToolOutputType } from "./schema.js";
import { tempRepoScoped, writeText } from "./test-helpers.js";

describe("@skopeo/tools package API", () => {
	it.effect("executes read tool with repository context and rejects missing context", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), "content");

			const tool = makeReadTool((effect) => Effect.runPromise(effect.pipe(Effect.provide(ReadTool.Live))));
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("read tool execute function is missing");
			}

			const output = yield* Effect.tryPromise({
				try: async () =>
					(await execute({ path: "file.txt" }, {
						experimental_context: { repositoryRoot: root },
					} as never)) as ReadToolOutputType,
				catch: (cause) => cause,
			});
			assert.strictEqual(output.kind, "file");
			assert.include(output.content, "content");

			const missingContext = yield* Effect.flip(
				Effect.tryPromise({
					try: () => Promise.resolve(execute({ path: "file.txt" }, { experimental_context: {} } as never)),
					catch: (cause) => cause,
				}),
			);
			assert.instanceOf(missingContext, Error);
			assert.strictEqual(missingContext.message, "Missing repository tool context.");
		}),
	);

	it.effect("passes read tool abort signals to the effect runner", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), "content");
			const abortController = new AbortController();
			let capturedSignal: AbortSignal | undefined;
			const tool = makeReadTool((effect, options) => {
				capturedSignal = options?.signal;
				return Effect.runPromise(effect.pipe(Effect.provide(ReadTool.Live)));
			});
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("read tool execute function is missing");
			}

			const output = yield* Effect.tryPromise({
				try: async () =>
					(await execute({ path: "file.txt" }, {
						abortSignal: abortController.signal,
						experimental_context: { repositoryRoot: root },
					} as never)) as ReadToolOutputType,
				catch: (cause) => cause,
			});

			assert.strictEqual(output.content, "content");
			assert.strictEqual(capturedSignal, abortController.signal);
		}),
	);

	it.effect("makeBashTool dispatches through runEffect and rejects missing context", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			let invoked = 0;
			const tool = makeBashTool((effect) => {
				invoked += 1;
				return Effect.runPromise(effect.pipe(Effect.provide(BashTool.Live)));
			});
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("bash tool execute function is missing");
			}

			const output = yield* Effect.tryPromise({
				try: async () =>
					(await execute({ command: "printf tool" }, {
						experimental_context: { repositoryRoot: root },
					} as never)) as BashToolOutputType,
				catch: (cause) => cause,
			});
			assert.strictEqual(output.stdout, "tool");
			assert.strictEqual(invoked, 1);

			const missingContext = yield* Effect.flip(
				Effect.tryPromise({
					try: () =>
						Promise.resolve(execute({ command: "printf tool" }, { experimental_context: {} } as never)),
					catch: (cause) => cause,
				}),
			);
			assert.instanceOf(missingContext, Error);
			assert.strictEqual(missingContext.message, "Missing repository tool context.");
		}),
	);

	it.effect("passes bash tool abort signals to the effect runner", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			const abortController = new AbortController();
			let capturedSignal: AbortSignal | undefined;
			const tool = makeBashTool((effect, options) => {
				capturedSignal = options?.signal;
				return Effect.runPromise(effect.pipe(Effect.provide(BashTool.Live)));
			});
			const execute = tool.execute;
			if (execute === undefined) {
				assert.fail("bash tool execute function is missing");
			}

			const output = yield* Effect.tryPromise({
				try: async () =>
					(await execute({ command: "printf tool" }, {
						abortSignal: abortController.signal,
						experimental_context: { repositoryRoot: root },
					} as never)) as BashToolOutputType,
				catch: (cause) => cause,
			});

			assert.strictEqual(output.stdout, "tool");
			assert.strictEqual(capturedSignal, abortController.signal);
		}),
	);

	it.effect("ReadTool.Live and BashTool.Live provide service access through layers", () =>
		Effect.gen(function* () {
			const root = yield* tempRepoScoped;
			yield* writeText(join(root, "file.txt"), "content");

			const readOutput = yield* Effect.flatMap(ReadTool, (service) =>
				service.read({ path: "file.txt" }, { repositoryRoot: root }),
			).pipe(Effect.provide(ReadTool.Live));
			assert.strictEqual(readOutput.kind, "file");
			assert.include(readOutput.content, "content");

			const bashOutput = yield* Effect.flatMap(BashTool, (service) =>
				service.run({ command: "printf layered" }, { repositoryRoot: root }),
			).pipe(Effect.provide(BashTool.Live));
			assert.strictEqual(bashOutput.stdout, "layered");
		}),
	);
});
