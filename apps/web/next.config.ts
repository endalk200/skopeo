import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repositoryRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

const nextConfig: NextConfig = {
	generateBuildId: async () => process.env.SKOPEO_BUILD_ID ?? "development",
	output: "standalone",
	outputFileTracingRoot: repositoryRoot,
	reactStrictMode: true,
};

export default nextConfig;
