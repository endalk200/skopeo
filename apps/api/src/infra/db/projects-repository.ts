import { and, desc, eq, isNull } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Cause, DateTime, Effect, Layer } from "effect";
import * as SqlError from "effect/unstable/sql/SqlError";
import { ProjectConflict, ProjectNotFound, ProjectPersistenceError } from "../../domain/projects/errors.js";
import type { Project, ValidatedCreateProject, ValidatedUpdateProject } from "../../domain/projects/project.js";
import { ProjectsRepository } from "../../domain/projects/repository.js";
import { Database } from "./database.js";
import { projects } from "./schema.js";

const activeSourceControlUrlUniqueIndex = "projects_active_source_control_url_unique";

type ProjectRow = typeof projects.$inferSelect;

type ProjectUpdate = Partial<Pick<ProjectRow, "name" | "sourceControlProvider" | "sourceControlUrl">> & {
	readonly updatedAt: Date;
};

const toProject = (row: ProjectRow): Project => ({
	id: row.id,
	name: row.name,
	sourceControlProvider: row.sourceControlProvider,
	sourceControlUrl: row.sourceControlUrl,
	createdAt: DateTime.fromDateUnsafe(row.createdAt),
	updatedAt: DateTime.fromDateUnsafe(row.updatedAt),
	deletedAt: row.deletedAt === null ? null : DateTime.fromDateUnsafe(row.deletedAt),
});

/**
 * The underlying query error is attached as the native `Error.cause` so spans
 * and logs can see it, without it being part of the schema-encoded (and
 * therefore HTTP-serialized) payload.
 */
const persistenceError = (message: string, cause?: unknown): ProjectPersistenceError => {
	const error = new ProjectPersistenceError({ message });
	if (cause !== undefined) {
		error.cause = cause;
	}
	return error;
};

const sourceControlUrlConflict = () =>
	new ProjectConflict({
		message: "A project with this source control URL already exists.",
	});

const extractSqlError = (cause: unknown): SqlError.SqlError | null => {
	if (SqlError.isSqlError(cause)) {
		return cause;
	}

	if (!Cause.isCause(cause)) {
		return null;
	}

	const squashed = Cause.squash(cause);
	return SqlError.isSqlError(squashed) ? squashed : null;
};

export const mapProjectPersistenceError = (
	error: EffectDrizzleQueryError,
): ProjectConflict | ProjectPersistenceError => {
	const sqlError = extractSqlError(error.cause);
	const reason = sqlError?.reason;

	if (reason?._tag === "UniqueViolation" && reason.constraint === activeSourceControlUrlUniqueIndex) {
		return sourceControlUrlConflict();
	}

	return persistenceError("Project persistence operation failed.", error);
};

const failLogged = <E>(error: EffectDrizzleQueryError, mapped: E) =>
	Effect.logError("Project persistence query failed", error).pipe(Effect.flatMap(() => Effect.fail(mapped)));

const mapPersistence = <A, R>(
	effect: Effect.Effect<A, EffectDrizzleQueryError, R>,
): Effect.Effect<A, ProjectPersistenceError, R> =>
	effect.pipe(
		Effect.catch((error) => failLogged(error, persistenceError("Project persistence operation failed.", error))),
	);

const mapMutationPersistence = <A, R>(
	effect: Effect.Effect<A, EffectDrizzleQueryError, R>,
): Effect.Effect<A, ProjectConflict | ProjectPersistenceError, R> =>
	effect.pipe(
		Effect.catch((error): Effect.Effect<never, ProjectConflict | ProjectPersistenceError> => {
			const mapped = mapProjectPersistenceError(error);
			// Conflicts are expected business outcomes; only log unexpected failures.
			return mapped instanceof ProjectConflict ? Effect.fail(mapped) : failLogged(error, mapped);
		}),
	);

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
					const rows = yield* mapMutationPersistence(
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
					const now = DateTime.toDateUtc(yield* DateTime.now);
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
						updatedAt: DateTime.toDateUtc(yield* DateTime.now),
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

					const rows = yield* mapMutationPersistence(
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
