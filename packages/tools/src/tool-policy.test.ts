import { realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { AgentToolPolicy, InvalidAgentToolInput } from "./tool-policy.js";
import { initializeRepository, makeTempDirectory } from "./utils/test.js";

const runWithPolicy = <A, E>(repositoryRoot: string, effect: Effect.Effect<A, E, AgentToolPolicy>) =>
	effect.pipe(Effect.provide(AgentToolPolicy.layer({ repositoryRoot })), Effect.provide(NodeServices.layer));

describe("Agent Tool Policy", () => {
	it.effect("approves repository reads and commands", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);
			const filePath = join(repositoryRoot, "src", "index.ts");
			yield* Effect.promise(() => mkdir(join(repositoryRoot, "src"), { recursive: true }));
			writeFileSync(filePath, "export const value = 1;\n");

			const decisions = yield* runWithPolicy(
				repositoryRoot,
				Effect.gen(function* () {
					const policy = yield* AgentToolPolicy;
					return {
						read: yield* policy.canReadFile({ path: filePath }),
						command: yield* policy.canRunCommand({ command: "printf hello", path: repositoryRoot }),
						repositoryRoot: policy.repositoryRoot,
					};
				}),
			);

			assert.deepStrictEqual(decisions.read, { approved: true });
			assert.deepStrictEqual(decisions.command, { approved: true });
			assert.strictEqual(decisions.repositoryRoot, realpathSync(repositoryRoot));

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("denies unsafe reads", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);
			const outsideRoot = makeTempDirectory();
			const outsideFile = join(outsideRoot, "outside.txt");
			const envFile = join(repositoryRoot, ".env.local");
			const keyFile = join(repositoryRoot, "PRIVATE.PEM");
			const credentialFile = join(repositoryRoot, ".ssh", "id_ed25519");
			const missingFile = join(repositoryRoot, "missing.txt");

			writeFileSync(outsideFile, "outside");
			writeFileSync(envFile, "secret");
			writeFileSync(keyFile, "secret");
			yield* Effect.promise(() => mkdir(join(repositoryRoot, ".ssh"), { recursive: true }));
			writeFileSync(credentialFile, "secret");
			symlinkSync(outsideFile, join(repositoryRoot, "linked-outside.txt"));

			const decisions = yield* runWithPolicy(
				repositoryRoot,
				Effect.gen(function* () {
					const policy = yield* AgentToolPolicy;
					return {
						outside: yield* policy.canReadFile({ path: outsideFile }),
						linkedOutside: yield* policy.canReadFile({ path: join(repositoryRoot, "linked-outside.txt") }),
						environment: yield* policy.canReadFile({ path: envFile }),
						privateKey: yield* policy.canReadFile({ path: keyFile }),
						credentialDirectory: yield* policy.canReadFile({ path: credentialFile }),
						missing: yield* policy.canReadFile({ path: missingFile }),
					};
				}),
			);

			assert.deepStrictEqual(decisions.outside, {
				approved: false,
				reason: "Reading files outside the repository is blocked.",
			});
			assert.deepStrictEqual(decisions.linkedOutside, {
				approved: false,
				reason: "Reading files outside the repository is blocked.",
			});
			assert.deepStrictEqual(decisions.environment, {
				approved: false,
				reason: "Reading environment files is blocked because they often contain secrets.",
			});
			assert.deepStrictEqual(decisions.privateKey, {
				approved: false,
				reason: "Reading private key files is blocked because they often contain credentials.",
			});
			assert.deepStrictEqual(decisions.credentialDirectory, {
				approved: false,
				reason: "Reading local credential directories is blocked because they often contain secrets.",
			});
			assert.deepStrictEqual(decisions.missing, {
				approved: false,
				reason: "Unable to verify that the path is safe to read.",
			});

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
			yield* Effect.promise(() => rm(outsideRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("denies unsafe commands", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);
			const outsideRoot = makeTempDirectory();
			const missingPath = join(repositoryRoot, "missing");
			symlinkSync(outsideRoot, join(repositoryRoot, "linked-outside"));

			const decisions = yield* runWithPolicy(
				repositoryRoot,
				Effect.gen(function* () {
					const policy = yield* AgentToolPolicy;
					return {
						outside: yield* policy.canRunCommand({ command: "pwd", path: outsideRoot }),
						linkedOutside: yield* policy.canRunCommand({
							command: "pwd",
							path: join(repositoryRoot, "linked-outside"),
						}),
						missing: yield* policy.canRunCommand({ command: "pwd", path: missingPath }),
						destructive: yield* policy.canRunCommand({ command: "rm file.txt", path: repositoryRoot }),
						permission: yield* policy.canRunCommand({
							command: "chmod 600 file.txt",
							path: repositoryRoot,
						}),
					};
				}),
			);

			assert.deepStrictEqual(decisions.outside, {
				approved: false,
				reason: "Running commands outside the repository is blocked.",
			});
			assert.deepStrictEqual(decisions.linkedOutside, {
				approved: false,
				reason: "Running commands outside the repository is blocked.",
			});
			assert.deepStrictEqual(decisions.missing, {
				approved: false,
				reason: "Unable to verify that the command directory is inside the repository.",
			});
			assert.deepStrictEqual(decisions.destructive, {
				approved: false,
				reason: "Running destructive filesystem commands is blocked.",
			});
			assert.deepStrictEqual(decisions.permission, {
				approved: false,
				reason: "Running permission or ownership changes is blocked.",
			});

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
			yield* Effect.promise(() => rm(outsideRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("rejects non-directory repository roots", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			const filePath = join(repositoryRoot, "not-a-directory");
			writeFileSync(filePath, "not a directory");

			const result = yield* Effect.result(
				runWithPolicy(
					filePath,
					Effect.gen(function* () {
						return yield* AgentToolPolicy;
					}),
				),
			);

			if (!Result.isFailure(result)) {
				assert.fail("Expected policy layer construction to fail.");
			}

			assert.instanceOf(result.failure, InvalidAgentToolInput);
			assert.strictEqual(result.failure.message, "Repository root must be a directory.");

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
		}),
	);
});
