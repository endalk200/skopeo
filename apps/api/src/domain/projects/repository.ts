import { Context, type Effect } from "effect";
import type { ProjectConflict, ProjectNotFound, ProjectPersistenceError } from "./errors.js";
import type { Project, ValidatedCreateProject, ValidatedUpdateProject } from "./project.js";

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
		/**
		 * Returns every active project. Pagination is deliberately deferred
		 * until project counts warrant it; revisit before exposing this to
		 * multi-tenant workloads.
		 */
		readonly list: () => Effect.Effect<ReadonlyArray<Project>, ProjectPersistenceError>;
		/**
		 * Deletes are not idempotent by design: soft-deleting an unknown or
		 * already-deleted project fails with `ProjectNotFound`.
		 */
		readonly softDelete: (projectId: string) => Effect.Effect<void, ProjectNotFound | ProjectPersistenceError>;
		readonly update: (
			projectId: string,
			project: ValidatedUpdateProject,
		) => Effect.Effect<Project, ProjectConflict | ProjectNotFound | ProjectPersistenceError>;
	}
>()("skopeo/api/ProjectsRepository") {}
