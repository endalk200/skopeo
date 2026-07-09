import { assert, describe, it } from "@effect/vitest";
import { OpenApi } from "effect/unstable/httpapi";
import { SkopeoApi } from "../http/api.js";

describe("SkopeoApi OpenAPI", () => {
	it("documents the project resource endpoints", () => {
		const spec = OpenApi.fromApi(SkopeoApi);

		assert.strictEqual(spec.info.title, "Skopeo API");
		assert.property(spec.paths, "/api/projects");
		assert.property(spec.paths, "/api/projects/{projectId}");
		assert.property(spec.components?.schemas, "Project");
		assert.property(spec.components?.schemas, "CreateProjectRequest");
		assert.property(spec.components?.schemas, "RequestBodyTooLarge");
		assert.property(spec.components?.schemas, "UpdateProjectRequest");
		assert.property(spec.paths["/api/projects"]?.post?.responses ?? {}, "413");
		assert.property(spec.paths["/api/projects/{projectId}"]?.patch?.responses ?? {}, "413");
	});
});
