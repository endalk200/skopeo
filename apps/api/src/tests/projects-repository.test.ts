import { assert, describe, it } from "@effect/vitest";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Cause } from "effect";
import * as SqlError from "effect/unstable/sql/SqlError";
import { ProjectConflict, ProjectPersistenceError } from "../domain/projects/errors.js";
import { mapProjectPersistenceError } from "../infra/db/projects-repository.js";

const makeQueryError = (constraint: string) =>
	new EffectDrizzleQueryError({
		cause: Cause.fail(
			new SqlError.SqlError({
				reason: new SqlError.UniqueViolation({
					cause: { code: "23505", constraint },
					constraint,
					message: "Failed to execute statement",
					operation: "execute",
				}),
			}),
		),
		params: [],
		query: "insert into projects",
	});

describe("DrizzleProjectsRepository", () => {
	it("maps the active source URL unique index to a project conflict", () => {
		const error = mapProjectPersistenceError(makeQueryError("projects_active_source_control_url_unique"));

		assert.instanceOf(error, ProjectConflict);
		assert.strictEqual(error.message, "A project with this source control URL already exists.");
	});

	it("maps other query failures to persistence errors", () => {
		const error = mapProjectPersistenceError(makeQueryError("other_unique_index"));

		assert.instanceOf(error, ProjectPersistenceError);
		assert.strictEqual(error.message, "Project persistence operation failed.");
	});
});
