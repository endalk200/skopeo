import { Context, type Effect } from "effect";
import type { ProjectConflict, ProjectNotFound, ProjectPersistenceError } from "./errors.js";
import type { Project, ValidatedCreateProject, ValidatedUpdateProject } from "./project.js";

export type ProjectRepositoryError = ProjectConflict | ProjectNotFound | ProjectPersistenceError;

export class ProjectsRepository extends Context.Service<
	ProjectsRepository,
	{
		readonly create: (
			project: ValidatedCreateProject,
		) => Effect.Effect<Project, ProjectConflict | ProjectPersistenceError>;
		readonly findActiveBySourceControlUrl: (
			sourceControlUrl: string,
		) => Effect.Effect<Project | null, ProjectPersistenceError>;
		readonly get: (projectId: string) => Effect.Effect<Project, ProjectNotFound | ProjectPersistenceError>;
		readonly list: () => Effect.Effect<ReadonlyArray<Project>, ProjectPersistenceError>;
		readonly softDelete: (projectId: string) => Effect.Effect<void, ProjectNotFound | ProjectPersistenceError>;
		readonly update: (
			projectId: string,
			project: ValidatedUpdateProject,
		) => Effect.Effect<Project, ProjectConflict | ProjectNotFound | ProjectPersistenceError>;
	}
>()("skopeo/api/ProjectsRepository") {}
