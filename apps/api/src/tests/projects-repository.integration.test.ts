import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { ProjectConflict, ProjectNotFound } from "../domain/projects/errors.js";
import { validateCreateProject, validateUpdateProject } from "../domain/projects/project.js";
import { ProjectsRepository } from "../domain/projects/repository.js";
import { Database } from "../infra/db/database.js";
import { DrizzleProjectsRepositoryLive } from "../infra/db/projects-repository.js";
import { ContainerDatabaseLive } from "./support/pg-container.js";

// The container (and its database) is shared across this suite; every test
// starts from a clean table via `resetProjects`.
const TestLayer = DrizzleProjectsRepositoryLive.pipe(Layer.provideMerge(ContainerDatabaseLive));

const resetProjects = Effect.flatMap(Database, (database) => database.execute("truncate table projects"));

const skopeoCommand = {
	name: "Skopeo",
	sourceControlProvider: "github" as const,
	sourceControlUrl: "https://github.com/endalk200/skopeo",
};

const createSkopeoProject = Effect.gen(function* () {
	const repository = yield* ProjectsRepository;
	const validated = yield* validateCreateProject(skopeoCommand);
	return yield* repository.create(validated);
});

describe("DrizzleProjectsRepository (integration)", () => {
	// excludeTestServices: integration tests run against the live clock, so
	// repository-written timestamps line up with Postgres `now()` defaults.
	it.layer(TestLayer, { timeout: "120 seconds", excludeTestServices: true })(
		"with a real Postgres database",
		(it) => {
			it.effect("creates and gets a project", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					const created = yield* createSkopeoProject;
					assert.strictEqual(created.name, "Skopeo");
					assert.strictEqual(created.sourceControlProvider, "github");
					assert.strictEqual(created.deletedAt, null);

					const fetched = yield* repository.get(created.id);
					assert.deepStrictEqual(fetched, created);
				}),
			);

			it.effect("maps a duplicate active source control URL to ProjectConflict", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;
					const validated = yield* validateCreateProject(skopeoCommand);

					yield* repository.create(validated);
					const error = yield* Effect.flip(repository.create(validated));

					assert.instanceOf(error, ProjectConflict);
				}),
			);

			it.effect("allows reusing a source control URL after a soft delete", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					const first = yield* createSkopeoProject;
					yield* repository.softDelete(first.id);

					// The partial unique index only covers active rows.
					const second = yield* createSkopeoProject;
					assert.notStrictEqual(second.id, first.id);
					assert.strictEqual(second.deletedAt, null);
				}),
			);

			it.effect("fails with ProjectNotFound for a missing project", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					const error = yield* Effect.flip(repository.get(crypto.randomUUID()));

					assert.instanceOf(error, ProjectNotFound);
				}),
			);

			it.effect("lists only active projects", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					const active = yield* createSkopeoProject;
					const deleted = yield* repository.create(
						yield* validateCreateProject({
							...skopeoCommand,
							sourceControlUrl: "https://github.com/endalk200/other",
						}),
					);
					yield* repository.softDelete(deleted.id);

					const projects = yield* repository.list();
					assert.deepStrictEqual(
						projects.map((project) => project.id),
						[active.id],
					);
				}),
			);

			it.effect("updates a project and bumps updatedAt", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					const created = yield* createSkopeoProject;
					const changes = yield* validateUpdateProject({ name: "Skopeo Platform" });
					const updated = yield* repository.update(created.id, changes);

					assert.strictEqual(updated.name, "Skopeo Platform");
					assert.isAtLeast(updated.updatedAt.epochMilliseconds, created.updatedAt.epochMilliseconds);
				}),
			);

			it.effect("maps an update to a taken source control URL to ProjectConflict", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					yield* createSkopeoProject;
					const other = yield* repository.create(
						yield* validateCreateProject({
							...skopeoCommand,
							name: "Other",
							sourceControlUrl: "https://github.com/endalk200/other",
						}),
					);

					const changes = yield* validateUpdateProject({
						sourceControlProvider: "github",
						sourceControlUrl: skopeoCommand.sourceControlUrl,
					});
					const error = yield* Effect.flip(repository.update(other.id, changes));

					assert.instanceOf(error, ProjectConflict);
				}),
			);

			it.effect("fails with ProjectNotFound when updating a missing project", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					const changes = yield* validateUpdateProject({ name: "Missing" });
					const error = yield* Effect.flip(repository.update(crypto.randomUUID(), changes));

					assert.instanceOf(error, ProjectNotFound);
				}),
			);

			it.effect("fails with ProjectNotFound when soft-deleting a missing project", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					const error = yield* Effect.flip(repository.softDelete(crypto.randomUUID()));

					assert.instanceOf(error, ProjectNotFound);
				}),
			);

			it.effect("finds active projects by source control URL", () =>
				Effect.gen(function* () {
					yield* resetProjects;
					const repository = yield* ProjectsRepository;

					assert.isNull(yield* repository.findActiveBySourceControlUrl(skopeoCommand.sourceControlUrl));

					const created = yield* createSkopeoProject;
					const found = yield* repository.findActiveBySourceControlUrl(skopeoCommand.sourceControlUrl);
					assert.strictEqual(found?.id, created.id);

					yield* repository.softDelete(created.id);
					assert.isNull(yield* repository.findActiveBySourceControlUrl(skopeoCommand.sourceControlUrl));
				}),
			);
		},
	);
});
