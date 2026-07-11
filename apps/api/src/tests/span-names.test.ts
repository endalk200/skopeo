import { assert, describe, it } from "@effect/vitest";
import { spanNameForRequest } from "../observability/span-names.js";

describe("HTTP span names", () => {
	it("drops query strings from known routes", () => {
		assert.strictEqual(spanNameForRequest("GET", "/api/openapi.json?cursor=secret"), "GET /api/openapi.json");
	});

	it("uses a bounded fallback for unmatched paths", () => {
		assert.strictEqual(spanNameForRequest("GET", "/attacker-controlled-one"), "http.server GET");
		assert.strictEqual(spanNameForRequest("GET", "/attacker-controlled-two"), "http.server GET");
	});
});
