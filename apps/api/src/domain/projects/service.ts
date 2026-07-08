import { Context, Effect, Layer } from "effect";
import {
	type InvalidProjectInput,
	ProjectConflict,
	type ProjectNotFound,
	type ProjectPersistenceError,
} from "./errors.js";
import type { CreateProjectCommand, Project, UpdateProjectCommand } from "./project.js";
import { validateCreateProject, validateUpdateProject } from "./project.js";
import { ProjectsRepository } from "./repository.js";

export class ProjectsService extends Context.Service<
	ProjectsService,
	{
		readonly create: (
			command: CreateProjectCommand,
		) => Effect.Effect<Project, InvalidProjectInput | ProjectConflict | ProjectPersistenceError>;
		readonly get: (projectId: string) => Effect.Effect<Project, ProjectNotFound | ProjectPersistenceError>;
		readonly list: () => Effect.Effect<ReadonlyArray<Project>, ProjectPersistenceError>;
		readonly softDelete: (projectId: string) => Effect.Effect<void, ProjectNotFound | ProjectPersistenceError>;
		readonly update: (
			projectId: string,
			command: UpdateProjectCommand,
		) => Effect.Effect<Project, InvalidProjectInput | ProjectConflict | ProjectNotFound | ProjectPersistenceError>;
	}
>()("skopeo/api/ProjectsService") {}

export const ProjectsServiceLive = Layer.effect(
	ProjectsService,
	Effect.gen(function* () {
		const repository = yield* ProjectsRepository;

		return ProjectsService.of({
			create: (command) =>
				Effect.fn("skopeo.api.projects.create")(function* () {
					const validated = yield* validateCreateProject(command);
					const existing = yield* repository.findActiveBySourceControlUrl(validated.sourceControlUrl);

					if (existing !== null) {
						return yield* Effect.fail(
							new ProjectConflict({
								message: "An active project already exists for this source control URL.",
							}),
						);
					}

					return yield* repository.create(validated);
				})(),

			get: (projectId) => repository.get(projectId),
			list: () => repository.list(),
			softDelete: (projectId) => repository.softDelete(projectId),

			update: (projectId, command) =>
				Effect.fn("skopeo.api.projects.update")(function* () {
					const validated = yield* validateUpdateProject(command);
					const project = yield* repository.get(projectId);

					if (validated.sourceControlUrl !== undefined) {
						const existing = yield* repository.findActiveBySourceControlUrl(validated.sourceControlUrl);
						if (existing !== null && existing.id !== project.id) {
							return yield* Effect.fail(
								new ProjectConflict({
									message: "An active project already exists for this source control URL.",
								}),
							);
						}
					}

					return yield* repository.update(projectId, validated);
				})(),
		});
	}),
);
