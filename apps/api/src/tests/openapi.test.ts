import { assert, describe, it } from "@effect/vitest";
import { OpenApi } from "effect/unstable/httpapi";
import { SkopeoApi } from "../http/api.js";

describe("SkopeoApi OpenAPI", () => {
	it("retains an empty API document", () => {
		const spec = OpenApi.fromApi(SkopeoApi);

		assert.strictEqual(spec.info.title, "Skopeo API");
		assert.deepStrictEqual(spec.paths, {});
	});
});
