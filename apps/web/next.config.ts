import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repositoryRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const buildId = process.env.SKOPEO_BUILD_ID;

const nextConfig: NextConfig = {
	...(buildId ? { generateBuildId: async () => buildId } : {}),
	output: "standalone",
	outputFileTracingRoot: repositoryRoot,
	reactStrictMode: true,
};

export default nextConfig;
