import { assert, describe, it } from "@effect/vitest";
import { type CodeReviewRequest, createReviewSystemPrompt } from "./index.js";

const request: CodeReviewRequest = {
	base: "main",
	currentBranch: "feature/tools",
	currentBranchHead: "abc123",
	environment: {
		currentPath: "/workspace/skopeo",
		dateTime: "2026-06-11T00:00:00.000Z",
		os: "darwin",
	},
	format: "markdown",
	repositoryRoot: "/workspace/skopeo",
	target: "working",
};

describe("createReviewSystemPrompt", () => {
	it("includes runtime context and Agent Tool rules", () => {
		const prompt = createReviewSystemPrompt(request);

		assert.include(prompt, "OS: darwin");
		assert.include(prompt, "Current path: /workspace/skopeo");
		assert.include(prompt, "Date/time: 2026-06-11T00:00:00.000Z");
		assert.include(prompt, "Tool paths may be absolute or relative");
		assert.include(prompt, "repository-scoped");
	});
});
