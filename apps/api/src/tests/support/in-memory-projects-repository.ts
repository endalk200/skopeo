import { DateTime, Effect, Layer } from "effect";
import { ProjectNotFound } from "../../domain/projects/errors.js";
import type { Project, ValidatedCreateProject, ValidatedUpdateProject } from "../../domain/projects/project.js";
import { ProjectsRepository } from "../../domain/projects/repository.js";

const now = DateTime.fromDateUnsafe(new Date("2026-07-08T00:00:00.000Z"));

const makeProject = (id: string, project: ValidatedCreateProject): Project => ({
	id,
	name: project.name,
	sourceControlProvider: project.sourceControlProvider,
	sourceControlUrl: project.sourceControlUrl,
	createdAt: now,
	updatedAt: now,
	deletedAt: null,
});

const notFound = (projectId: string) => new ProjectNotFound({ message: "Project was not found.", projectId });

export const InMemoryProjectsRepositoryLive = Layer.sync(ProjectsRepository)(() => {
	const projects = new Map<string, Project>();

	const getActive = (projectId: string) => {
		const project = projects.get(projectId);
		return project === undefined || project.deletedAt !== null ? null : project;
	};

	return ProjectsRepository.of({
		create: (project) =>
			Effect.sync(() => {
				const created = makeProject(crypto.randomUUID(), project);
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
			Effect.suspend(() => {
				const project = getActive(projectId);
				return project === null ? Effect.fail(notFound(projectId)) : Effect.succeed(project);
			}),
		list: () => Effect.sync(() => Array.from(projects.values()).filter((project) => project.deletedAt === null)),
		softDelete: (projectId) =>
			Effect.suspend(() => {
				const project = getActive(projectId);
				if (project === null) {
					return Effect.fail(notFound(projectId));
				}

				projects.set(projectId, { ...project, deletedAt: now, updatedAt: now });
				return Effect.void;
			}),
		update: (projectId, changes: ValidatedUpdateProject) =>
			Effect.suspend(() => {
				const project = getActive(projectId);
				if (project === null) {
					return Effect.fail(notFound(projectId));
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
	});
});
