import { NodeHttpServer } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiClient } from "effect/unstable/httpapi";
import { InvalidProjectInput, ProjectConflict, ProjectNotFound } from "../domain/projects/errors.js";
import { ProjectsServiceLive } from "../domain/projects/service.js";
import { SkopeoApi } from "../http/api.js";
import { ProjectsHandlersLive } from "../http/projects-handlers.js";
import { maxRequestBodyBytes, RequestBodyLimitMiddlewareLive, RequestBodySizeLive } from "../http/request-limits.js";
import { InMemoryProjectsRepositoryLive } from "./support/in-memory-projects-repository.js";

const HandlersLive = ProjectsHandlersLive.pipe(
	Layer.provide(ProjectsServiceLive.pipe(Layer.provide(InMemoryProjectsRepositoryLive))),
);

const ApiTestLive = HttpRouter.serve(HttpApiBuilder.layer(SkopeoApi).pipe(Layer.provide(HandlersLive)), {
	disableListenLog: true,
	disableLogger: true,
}).pipe(
	Layer.provide(RequestBodyLimitMiddlewareLive),
	Layer.provide(RequestBodySizeLive),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const skopeoProject = {
	name: "Skopeo",
	sourceControlProvider: "github" as const,
	sourceControlUrl: "https://github.com/endalk200/skopeo",
};

const missingProjectId = "00000000-0000-4000-8000-000000000000";

describe("Projects HTTP API", () => {
	it.effect("creates, gets, and lists projects over HTTP", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(SkopeoApi);

			const created = yield* client.projects.createProject({
				payload: {
					name: "  Skopeo   Platform  ",
					sourceControlProvider: "github",
					sourceControlUrl: "https://github.com/endalk200/skopeo?tab=readme",
				},
			});

			assert.strictEqual(created.name, "Skopeo Platform");
			assert.strictEqual(created.sourceControlUrl, "https://github.com/endalk200/skopeo");
			assert.strictEqual(created.deletedAt, null);

			const fetched = yield* client.projects.getProject({ params: { projectId: created.id } });
			assert.deepStrictEqual(fetched, created);

			const listed = yield* client.projects.listProjects();
			assert.deepStrictEqual(
				listed.map((project) => project.id),
				[created.id],
			);
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("responds 201 to project creation", () =>
		Effect.gen(function* () {
			const response = yield* HttpClient.post("/api/projects", {
				body: HttpBody.jsonUnsafe(skopeoProject),
			});

			assert.strictEqual(response.status, 201);
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("responds 400 to an invalid project id path parameter", () =>
		Effect.gen(function* () {
			const response = yield* HttpClient.get("/api/projects/not-a-uuid");

			assert.strictEqual(response.status, 400);
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("responds 413 before decoding an oversized request body", () =>
		Effect.gen(function* () {
			const response = yield* HttpClient.post("/api/projects", {
				body: HttpBody.jsonUnsafe({
					...skopeoProject,
					name: "x".repeat(maxRequestBodyBytes),
				}),
			});

			assert.strictEqual(response.status, 413);
			assert.deepStrictEqual(JSON.parse(yield* response.text), {
				_tag: "RequestBodyTooLarge",
				message: "Request body must be 1 MiB or smaller.",
			});
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("returns InvalidProjectInput for a non-https source control URL", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(SkopeoApi);

			const error = yield* Effect.flip(
				client.projects.createProject({
					payload: { ...skopeoProject, sourceControlUrl: "http://github.com/endalk200/skopeo" },
				}),
			);

			assert.instanceOf(error, InvalidProjectInput);
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("returns ProjectConflict for duplicate source control URLs", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(SkopeoApi);

			yield* client.projects.createProject({ payload: skopeoProject });
			const error = yield* Effect.flip(client.projects.createProject({ payload: skopeoProject }));

			assert.instanceOf(error, ProjectConflict);
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("returns ProjectNotFound for a missing project", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(SkopeoApi);

			const error = yield* Effect.flip(client.projects.getProject({ params: { projectId: missingProjectId } }));

			assert.instanceOf(error, ProjectNotFound);
			assert.strictEqual(error.projectId, missingProjectId);
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("updates a project over HTTP", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(SkopeoApi);

			const created = yield* client.projects.createProject({ payload: skopeoProject });
			const updated = yield* client.projects.updateProject({
				params: { projectId: created.id },
				payload: { name: "Skopeo Platform" },
			});

			assert.strictEqual(updated.id, created.id);
			assert.strictEqual(updated.name, "Skopeo Platform");
		}).pipe(Effect.provide(ApiTestLive)),
	);

	it.effect("soft-deletes a project over HTTP with a 204 response", () =>
		Effect.gen(function* () {
			const client = yield* HttpApiClient.make(SkopeoApi);
			const created = yield* client.projects.createProject({ payload: skopeoProject });

			const response = yield* HttpClient.del(`/api/projects/${created.id}`);
			assert.strictEqual(response.status, 204);

			const error = yield* Effect.flip(client.projects.getProject({ params: { projectId: created.id } }));
			assert.instanceOf(error, ProjectNotFound);
		}).pipe(Effect.provide(ApiTestLive)),
	);
});
