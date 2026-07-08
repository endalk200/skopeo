import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { InvalidProjectInput, ProjectConflict, ProjectNotFound } from "../domain/projects/errors.js";
import type { Project, ValidatedCreateProject, ValidatedUpdateProject } from "../domain/projects/project.js";
import { ProjectsRepository } from "../domain/projects/repository.js";
import { ProjectsService, ProjectsServiceLive } from "../domain/projects/service.js";

const now = "2026-07-08T00:00:00.000Z";

const makeProject = (id: string, project: ValidatedCreateProject): Project => ({
	id,
	name: project.name,
	sourceControlProvider: project.sourceControlProvider,
	sourceControlUrl: project.sourceControlUrl,
	createdAt: now,
	updatedAt: now,
	deletedAt: null,
});

const InMemoryProjectsRepositoryLive = Layer.sync(ProjectsRepository)(() => {
	const projects = new Map<string, Project>();
	let nextId = 1;

	return ProjectsRepository.of({
		create: (project) =>
			Effect.sync(() => {
				const created = makeProject(`project-${nextId}`, project);
				nextId += 1;
				projects.set(created.id, created);
				return created;
			}),
		findActiveBySourceControlUrl: (sourceControlUrl) =>
			Effect.sync(() => {
				for (const project of projects.values()) {
					if (project.sourceControlUrl === sourceControlUrl && project.deletedAt === null) {
						return project;
					}
				}

				return null;
			}),
		get: (projectId) =>
			Effect.sync(() => projects.get(projectId) ?? null).pipe(
				Effect.flatMap((project) =>
					project === null
						? Effect.fail(new ProjectNotFound({ message: "Project was not found.", projectId }))
						: Effect.succeed(project),
				),
			),
		list: () => Effect.sync(() => Array.from(projects.values()).filter((project) => project.deletedAt === null)),
		softDelete: (projectId) =>
			Effect.sync(() => projects.get(projectId) ?? null).pipe(
				Effect.flatMap((project) => {
					if (project === null) {
						return Effect.fail(new ProjectNotFound({ message: "Project was not found.", projectId }));
					}

					projects.set(projectId, { ...project, deletedAt: now, updatedAt: now });
					return Effect.void;
				}),
			),
		update: (projectId: string, changes: ValidatedUpdateProject) =>
			Effect.sync(() => projects.get(projectId) ?? null).pipe(
				Effect.flatMap((project) => {
					if (project === null) {
						return Effect.fail(new ProjectNotFound({ message: "Project was not found.", projectId }));
					}

					const updated: Project = {
						...project,
						name: changes.name ?? project.name,
						sourceControlProvider: changes.sourceControlProvider ?? project.sourceControlProvider,
						sourceControlUrl: changes.sourceControlUrl ?? project.sourceControlUrl,
						updatedAt: now,
					};
					projects.set(projectId, updated);
					return Effect.succeed(updated);
				}),
			),
	});
});

const TestLayer = ProjectsServiceLive.pipe(Layer.provide(InMemoryProjectsRepositoryLive));

describe("ProjectsService", () => {
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

	it.effect("rejects duplicate active source control URLs", () =>
		Effect.gen(function* () {
			const service = yield* ProjectsService;
			const command = {
				name: "Skopeo",
				sourceControlProvider: "github" as const,
				sourceControlUrl: "https://github.com/endalk200/skopeo",
			};

			yield* service.create(command);
			const error = yield* Effect.flip(service.create(command));

			assert.instanceOf(error, ProjectConflict);
		}).pipe(Effect.provide(TestLayer)),
	);
});
