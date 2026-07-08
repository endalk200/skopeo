import { and, desc, eq, isNull } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { ProjectNotFound, ProjectPersistenceError } from "../../domain/projects/errors.js";
import type { Project, ValidatedCreateProject, ValidatedUpdateProject } from "../../domain/projects/project.js";
import { ProjectsRepository } from "../../domain/projects/repository.js";
import { Database } from "./database.js";
import { projects } from "./schema.js";

type ProjectRow = typeof projects.$inferSelect;

type ProjectUpdate = Partial<Pick<ProjectRow, "name" | "sourceControlProvider" | "sourceControlUrl">> & {
	readonly updatedAt: Date;
};

const toProject = (row: ProjectRow): Project => ({
	id: row.id,
	name: row.name,
	sourceControlProvider: row.sourceControlProvider,
	sourceControlUrl: row.sourceControlUrl,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
	deletedAt: row.deletedAt?.toISOString() ?? null,
});

const persistenceError = (message: string) => new ProjectPersistenceError({ message });

const mapPersistence = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ProjectPersistenceError, R> =>
	effect.pipe(Effect.mapError(() => persistenceError("Project persistence operation failed.")));

const notFound = (projectId: string) =>
	new ProjectNotFound({
		message: "Project was not found.",
		projectId,
	});

export const DrizzleProjectsRepositoryLive = Layer.effect(
	ProjectsRepository,
	Effect.map(Database, (database) =>
		ProjectsRepository.of({
			create: (project: ValidatedCreateProject) =>
				Effect.gen(function* () {
					const rows = yield* mapPersistence(
						database
							.insert(projects)
							.values({
								name: project.name,
								sourceControlProvider: project.sourceControlProvider,
								sourceControlUrl: project.sourceControlUrl,
							})
							.returning(),
					);

					const row = rows[0];
					if (row === undefined) {
						return yield* Effect.fail(persistenceError("Project insert did not return a row."));
					}

					return toProject(row);
				}),

			findActiveBySourceControlUrl: (sourceControlUrl: string) =>
				Effect.gen(function* () {
					const rows = yield* mapPersistence(
						database
							.select()
							.from(projects)
							.where(and(eq(projects.sourceControlUrl, sourceControlUrl), isNull(projects.deletedAt)))
							.limit(1),
					);

					return rows[0] === undefined ? null : toProject(rows[0]);
				}),

			get: (projectId: string) =>
				Effect.gen(function* () {
					const rows = yield* mapPersistence(
						database
							.select()
							.from(projects)
							.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
							.limit(1),
					);

					const row = rows[0];
					if (row === undefined) {
						return yield* Effect.fail(notFound(projectId));
					}

					return toProject(row);
				}),

			list: () =>
				Effect.gen(function* () {
					const rows = yield* mapPersistence(
						database
							.select()
							.from(projects)
							.where(isNull(projects.deletedAt))
							.orderBy(desc(projects.createdAt)),
					);

					return rows.map(toProject);
				}),

			softDelete: (projectId: string) =>
				Effect.gen(function* () {
					const now = new Date();
					const rows = yield* mapPersistence(
						database
							.update(projects)
							.set({ deletedAt: now, updatedAt: now })
							.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
							.returning({ id: projects.id }),
					);

					if (rows.length === 0) {
						return yield* Effect.fail(notFound(projectId));
					}
				}),

			update: (projectId: string, project: ValidatedUpdateProject) =>
				Effect.gen(function* () {
					const changes: ProjectUpdate = {
						updatedAt: new Date(),
					};

					if (project.name !== undefined) {
						changes.name = project.name;
					}
					if (project.sourceControlProvider !== undefined) {
						changes.sourceControlProvider = project.sourceControlProvider;
					}
					if (project.sourceControlUrl !== undefined) {
						changes.sourceControlUrl = project.sourceControlUrl;
					}

					const rows = yield* mapPersistence(
						database
							.update(projects)
							.set(changes)
							.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
							.returning(),
					);

					const row = rows[0];
					if (row === undefined) {
						return yield* Effect.fail(notFound(projectId));
					}

					return toProject(row);
				}),
		}),
	),
);
