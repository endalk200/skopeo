import { afterEach, describe, expect, it, vi } from "vitest";

const originalBuildId = process.env.SKOPEO_BUILD_ID;

afterEach(() => {
	vi.resetModules();
	if (originalBuildId === undefined) {
		delete process.env.SKOPEO_BUILD_ID;
	} else {
		process.env.SKOPEO_BUILD_ID = originalBuildId;
	}
});

describe("Next.js build configuration", () => {
	it("uses the immutable image revision as the build ID", async () => {
		process.env.SKOPEO_BUILD_ID = "test-revision";
		const { default: nextConfig } = await import("./next.config");
		expect(await nextConfig.generateBuildId?.()).toBe("test-revision");
	});

	it("keeps the Next.js-generated build ID outside image builds", async () => {
		delete process.env.SKOPEO_BUILD_ID;
		const { default: nextConfig } = await import("./next.config");
		expect(nextConfig.generateBuildId).toBeUndefined();
	});
});
