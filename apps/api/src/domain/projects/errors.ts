import { Schema } from "effect";

export class InvalidProjectInput extends Schema.TaggedErrorClass<InvalidProjectInput>()(
	"InvalidProjectInput",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 400 },
) {}

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
	"ProjectNotFound",
	{
		message: Schema.String,
		projectId: Schema.String,
	},
	{ httpApiStatus: 404 },
) {}

export class ProjectConflict extends Schema.TaggedErrorClass<ProjectConflict>()(
	"ProjectConflict",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 409 },
) {}

export class ProjectPersistenceError extends Schema.TaggedErrorClass<ProjectPersistenceError>()(
	"ProjectPersistenceError",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 500 },
) {}

export type ProjectError = InvalidProjectInput | ProjectConflict | ProjectNotFound | ProjectPersistenceError;
