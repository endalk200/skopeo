import { assert, describe, it } from "@effect/vitest";
import { spanNameForRequest } from "../observability/span-names.js";

describe("HTTP span names", () => {
	it("uses the project route shape for valid and invalid ids", () => {
		assert.strictEqual(
			spanNameForRequest("GET", "/api/projects/55c0b707-2686-497a-94ce-ad9c2e1d7e36"),
			"GET /api/projects/:projectId",
		);
		assert.strictEqual(spanNameForRequest("GET", "/api/projects/not-a-uuid"), "GET /api/projects/:projectId");
	});

	it("drops query strings from known routes", () => {
		assert.strictEqual(spanNameForRequest("GET", "/api/projects?cursor=secret"), "GET /api/projects");
	});

	it("uses a bounded fallback for unmatched paths", () => {
		assert.strictEqual(spanNameForRequest("GET", "/attacker-controlled-one"), "http.server GET");
		assert.strictEqual(spanNameForRequest("GET", "/attacker-controlled-two"), "http.server GET");
	});
});
