import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export const appRoot = dirname(moduleDirectory);

export function fromAppRoot(...segments: string[]) {
	return resolve(appRoot, ...segments);
}
