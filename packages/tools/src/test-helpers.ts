import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "@effect/vitest";
import { Effect } from "effect";
import { ToolInputError } from "./errors.js";

export const tempRepo = async () => realpath(await mkdtemp(join(tmpdir(), "skopeo-tools-")));

export const tempRepoScoped = Effect.acquireRelease(Effect.promise(tempRepo), (root) =>
	Effect.promise(() => rm(root, { recursive: true, force: true })),
);

export const writeText = (path: string, content: string) => Effect.promise(() => writeFile(path, content));
export const makeDir = (path: string) => Effect.promise(() => mkdir(path));
export const makeSymlink = (target: string, path: string) => Effect.promise(() => symlink(target, path));

export const assertToolInputError = (error: unknown, message: string) => {
	assert.instanceOf(error, ToolInputError);
	assert.strictEqual(error.message, message);
};

export const waitUntil = async (predicate: () => boolean | Promise<boolean>, label: string) => {
	const startedAt = Date.now();
	while (Date.now() - startedAt < 2_000) {
		if (await predicate()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`Timed out waiting for ${label}.`);
};

export const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") {
			return false;
		}
		throw cause;
	}
};
