import { realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
	assertToolDenied,
	executeReadFileTool,
	initializeRepository,
	makeReadFileTool,
	makeTempDirectory,
} from "../utils/test.js";

describe("Read File Agent Tool", () => {
	it.effect("reads a normal repository file and returns the full path", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);
			const filePath = join(repositoryRoot, "src", "index.ts");
			yield* Effect.promise(() => mkdir(join(repositoryRoot, "src"), { recursive: true }));
			yield* Effect.promise(() => writeFile(filePath, "export const value = 1;\n"));

			const readFileTool = makeReadFileTool(repositoryRoot);
			const result = yield* Effect.promise(() => executeReadFileTool(readFileTool, { path: "src/index.ts" }));

			assert.strictEqual(result.path, realpathSync(filePath));
			assert.strictEqual(result.content, "export const value = 1;\n");

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("blocks environment, key, and local credential files", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);
			const blockedPaths = [
				".env",
				".env.local",
				"service.env",
				"private.pem",
				"deploy.key",
				"certificate.p12",
				"certificate.pfx",
				".aws/credentials",
				".azure/config",
				".gcloud/application_default_credentials.json",
				".ssh/id_ed25519",
			];
			for (const path of blockedPaths) {
				const fullPath = join(repositoryRoot, path);
				yield* Effect.promise(() => mkdir(join(fullPath, ".."), { recursive: true }));
				yield* Effect.promise(() => writeFile(fullPath, "secret"));
			}

			const readFileTool = makeReadFileTool(repositoryRoot);
			for (const path of blockedPaths) {
				yield* Effect.promise(() =>
					assertToolDenied(
						executeReadFileTool(readFileTool, { path }),
						/Reading (environment files|private key files|local credential directories) is blocked/,
					),
				);
			}

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
		}),
	);

	it.effect("blocks symlink escapes outside the repository", () =>
		Effect.gen(function* () {
			const repositoryRoot = makeTempDirectory();
			initializeRepository(repositoryRoot);
			const outsideRoot = makeTempDirectory();
			const outsideFile = join(outsideRoot, "outside.txt");
			writeFileSync(outsideFile, "outside");
			symlinkSync(outsideFile, join(repositoryRoot, "linked-outside.txt"));

			const readFileTool = makeReadFileTool(repositoryRoot);
			yield* Effect.promise(() =>
				assertToolDenied(
					executeReadFileTool(readFileTool, { path: "linked-outside.txt" }),
					/outside the repository is blocked/,
				),
			);

			yield* Effect.promise(() => rm(repositoryRoot, { force: true, recursive: true }));
			yield* Effect.promise(() => rm(outsideRoot, { force: true, recursive: true }));
		}),
	);
});
