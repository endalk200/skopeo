import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { InvalidProjectInput, ProjectConflict, ProjectNotFound } from "../domain/projects/errors.js";
import { ProjectsService, ProjectsServiceLive } from "../domain/projects/service.js";
import { InMemoryProjectsRepositoryLive } from "./support/in-memory-projects-repository.js";

const TestLayer = ProjectsServiceLive.pipe(Layer.provide(InMemoryProjectsRepositoryLive));

describe("ProjectsService", () => {
	const skopeoProject = {
		name: "Skopeo",
		sourceControlProvider: "github" as const,
		sourceControlUrl: "https://github.com/endalk200/skopeo",
	};

	it.effect("creates a normalized project", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const project = yield* service.create({
				name: "  Skopeo   Platform  ",
				sourceControlProvider: "github",
				sourceControlUrl: "https://github.com/endalk200/skopeo?tab=readme",
			});

			assert.strictEqual(project.name, "Skopeo Platform");
			assert.strictEqual(project.sourceControlUrl, "https://github.com/endalk200/skopeo");
			assert.strictEqual(project.sourceControlProvider, "github");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("canonicalizes GitHub repository URL aliases", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const project = yield* service.create({
				name: "Skopeo",
				sourceControlProvider: "github",
				sourceControlUrl: "https://www.github.com/Endalk200/Skopeo.git?tab=readme",
			});

			assert.strictEqual(project.sourceControlUrl, "https://github.com/endalk200/skopeo");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("accepts canonical GitLab subgroup repository paths", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const project = yield* service.create({
				name: "Skopeo",
				sourceControlProvider: "gitlab",
				sourceControlUrl: "https://www.gitlab.com/skopeo/platform/api.git",
			});

			assert.strictEqual(project.sourceControlUrl, "https://gitlab.com/skopeo/platform/api");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects provider pages that are not repository roots", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const githubError = yield* Effect.flip(
				service.create({
					...skopeoProject,
					sourceControlUrl: "https://github.com/endalk200/skopeo/issues/1",
				}),
			);
			const gitlabError = yield* Effect.flip(
				service.create({
					...skopeoProject,
					sourceControlProvider: "gitlab",
					sourceControlUrl: "https://gitlab.com/endalk200/skopeo/-/issues/1",
				}),
			);

			assert.instanceOf(githubError, InvalidProjectInput);
			assert.instanceOf(gitlabError, InvalidProjectInput);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects a provider and URL host mismatch", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const error = yield* Effect.flip(
				service.create({
					name: "Skopeo",
					sourceControlProvider: "gitlab",
					sourceControlUrl: "https://github.com/endalk200/skopeo",
				}),
			);

			assert.instanceOf(error, InvalidProjectInput);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects non-https source control URLs", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const error = yield* Effect.flip(
				service.create({
					...skopeoProject,
					sourceControlUrl: "http://github.com/endalk200/skopeo",
				}),
			);

			assert.instanceOf(error, InvalidProjectInput);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects source control URLs with embedded credentials", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const error = yield* Effect.flip(
				service.create({
					...skopeoProject,
					sourceControlUrl: "https://token@github.com/endalk200/skopeo",
				}),
			);

			assert.instanceOf(error, InvalidProjectInput);
			assert.strictEqual(error.message, "Source control URL must not include credentials.");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects duplicate active source control URLs", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;

			yield* service.create(skopeoProject);
			const error = yield* Effect.flip(service.create(skopeoProject));

			assert.instanceOf(error, ProjectConflict);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects duplicate aliases of an active source control URL", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;

			yield* service.create(skopeoProject);
			const error = yield* Effect.flip(
				service.create({
					...skopeoProject,
					sourceControlUrl: "https://www.github.com/ENDALK200/SKOPEO.git",
				}),
			);

			assert.instanceOf(error, ProjectConflict);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("gets a project by id", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const created = yield* service.create(skopeoProject);
			const project = yield* service.get(created.id);

			assert.strictEqual(project.id, created.id);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects getting a missing project", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const error = yield* Effect.flip(service.get("missing-project"));

			assert.instanceOf(error, ProjectNotFound);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("lists active projects", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const empty = yield* service.list();
			assert.deepStrictEqual(empty, []);

			const created = yield* service.create(skopeoProject);
			const projects = yield* service.list();

			assert.deepStrictEqual(
				projects.map((project) => project.id),
				[created.id],
			);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("updates a project", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const created = yield* service.create(skopeoProject);
			const updated = yield* service.update(created.id, { name: "Skopeo Platform" });

			assert.strictEqual(updated.id, created.id);
			assert.strictEqual(updated.name, "Skopeo Platform");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects an update with no fields", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const created = yield* service.create(skopeoProject);
			const error = yield* Effect.flip(service.update(created.id, {}));

			assert.instanceOf(error, InvalidProjectInput);
			assert.strictEqual(error.message, "At least one project field must be provided.");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects updating the provider without the URL", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const created = yield* service.create(skopeoProject);
			const error = yield* Effect.flip(service.update(created.id, { sourceControlProvider: "gitlab" }));

			assert.instanceOf(error, InvalidProjectInput);
			assert.strictEqual(error.message, "sourceControlProvider and sourceControlUrl must be updated together.");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects updating the URL without the provider", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const created = yield* service.create(skopeoProject);
			const error = yield* Effect.flip(
				service.update(created.id, { sourceControlUrl: "https://gitlab.com/endalk200/skopeo" }),
			);

			assert.instanceOf(error, InvalidProjectInput);
			assert.strictEqual(error.message, "sourceControlProvider and sourceControlUrl must be updated together.");
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects update conflicts on duplicate source control URLs", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const first = yield* service.create(skopeoProject);
			const second = yield* service.create({
				name: "Other",
				sourceControlProvider: "github",
				sourceControlUrl: "https://github.com/endalk200/other",
			});

			const error = yield* Effect.flip(
				service.update(first.id, {
					sourceControlProvider: second.sourceControlProvider,
					sourceControlUrl: second.sourceControlUrl,
				}),
			);

			assert.instanceOf(error, ProjectConflict);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("returns not found before checking update source control URL conflicts", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const existing = yield* service.create(skopeoProject);
			const error = yield* Effect.flip(
				service.update("missing-project", {
					sourceControlProvider: existing.sourceControlProvider,
					sourceControlUrl: existing.sourceControlUrl,
				}),
			);

			assert.instanceOf(error, ProjectNotFound);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects updating a missing project", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const error = yield* Effect.flip(service.update("missing-project", { name: "Missing" }));

			assert.instanceOf(error, ProjectNotFound);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("soft-deletes a project", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const created = yield* service.create(skopeoProject);

			yield* service.softDelete(created.id);
			const projects = yield* service.list();
			const getError = yield* Effect.flip(service.get(created.id));

			assert.deepStrictEqual(projects, []);
			assert.instanceOf(getError, ProjectNotFound);
		}).pipe(Effect.provide(TestLayer)),
	);

	it.effect("rejects soft-deleting a missing project", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const error = yield* Effect.flip(service.softDelete("missing-project"));

			assert.instanceOf(error, ProjectNotFound);
		}).pipe(Effect.provide(TestLayer)),
	);
});
