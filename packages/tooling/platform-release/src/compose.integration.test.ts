import { execFileSync } from "node:child_process";
import path from "node:path";
import { it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");

it("runs the single-host deployment and blocks startup after migration failure", () => {
	execFileSync("bash", [path.join(repositoryRoot, "deploy/self-host/smoke.sh")], {
		cwd: repositoryRoot,
		env: process.env,
		stdio: "inherit",
		timeout: 180_000,
	});
}, 180_000);
