import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repositoryRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

const nextConfig: NextConfig = {
	output: "standalone",
	outputFileTracingRoot: repositoryRoot,
	reactStrictMode: true,
};

export default nextConfig;
