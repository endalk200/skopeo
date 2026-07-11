import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "./next.config";

const originalBuildId = process.env.SKOPEO_BUILD_ID;

afterEach(() => {
	if (originalBuildId === undefined) {
		delete process.env.SKOPEO_BUILD_ID;
	} else {
		process.env.SKOPEO_BUILD_ID = originalBuildId;
	}
});

describe("Next.js build configuration", () => {
	it("uses the immutable image revision as the build ID", async () => {
		process.env.SKOPEO_BUILD_ID = "test-revision";
		expect(await nextConfig.generateBuildId?.()).toBe("test-revision");
	});
});
