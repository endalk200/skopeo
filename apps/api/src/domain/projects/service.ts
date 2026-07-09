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

const sourceControlUrlConflict = () =>
	new ProjectConflict({
		message: "An active project already exists for this source control URL.",
	});

export const ProjectsServiceLive = Layer.effect(
	ProjectsService,
	Effect.gen(function* () {
		const repository = yield* ProjectsRepository;

		// The findActiveBySourceControlUrl pre-checks below exist only to give a
		// friendly conflict message. The partial unique index
		// `projects_active_source_control_url_unique` is the real guard against
		// concurrent creates/updates; the repository maps its violation to
		// `ProjectConflict`, so racing requests still receive a 409.
		const create = Effect.fn("skopeo.api.projects.create")(function* (command: CreateProjectCommand) {
			const validated = yield* validateCreateProject(command);
			const existing = yield* repository.findActiveBySourceControlUrl(validated.sourceControlUrl);

			if (existing !== null) {
				return yield* Effect.fail(sourceControlUrlConflict());
			}

			return yield* repository.create(validated);
		});

		const update = Effect.fn("skopeo.api.projects.update")(function* (
			projectId: string,
			command: UpdateProjectCommand,
		) {
			const validated = yield* validateUpdateProject(command);
			const project = yield* repository.get(projectId);

			if (validated.sourceControlUrl !== undefined) {
				const existing = yield* repository.findActiveBySourceControlUrl(validated.sourceControlUrl);
				if (existing !== null && existing.id !== project.id) {
					return yield* Effect.fail(sourceControlUrlConflict());
				}
			}

			return yield* repository.update(projectId, validated);
		});

		const get = Effect.fn("skopeo.api.projects.get")(function* (projectId: string) {
			return yield* repository.get(projectId);
		});

		const list = Effect.fn("skopeo.api.projects.list")(function* () {
			return yield* repository.list();
		});

		const softDelete = Effect.fn("skopeo.api.projects.softDelete")(function* (projectId: string) {
			return yield* repository.softDelete(projectId);
		});

		return ProjectsService.of({
			create,
			get,
			list,
			softDelete,
			update,
		});
	}),
);
