import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import {
	InvalidProjectInput,
	ProjectConflict,
	ProjectNotFound,
	ProjectPersistenceError,
} from "../domain/projects/errors.js";
import { SourceControlProvider } from "../domain/projects/project.js";

export const ProjectResponse = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	sourceControlProvider: SourceControlProvider,
	sourceControlUrl: Schema.String,
	createdAt: Schema.String,
	updatedAt: Schema.String,
	deletedAt: Schema.NullOr(Schema.String),
}).annotate({
	description: "A repository-backed project configured for hosted Skopeo code review workflows.",
	identifier: "Project",
});

export const CreateProjectRequest = Schema.Struct({
	name: Schema.String,
	sourceControlProvider: SourceControlProvider,
	sourceControlUrl: Schema.String,
}).annotate({
	description: "Fields required to register a project.",
	identifier: "CreateProjectRequest",
});

export const UpdateProjectRequest = Schema.Struct({
	name: Schema.optionalKey(Schema.String),
	sourceControlProvider: Schema.optionalKey(SourceControlProvider),
	sourceControlUrl: Schema.optionalKey(Schema.String),
}).annotate({
	description: "Fields that can be changed for a project.",
	identifier: "UpdateProjectRequest",
});

const ProjectParams = {
	projectId: Schema.String.pipe(Schema.check(Schema.isUUID())),
};

const PersistenceErrors = [ProjectPersistenceError] as const;
const CreateProjectErrors = [InvalidProjectInput, ProjectConflict, ProjectPersistenceError] as const;
const LookupProjectErrors = [ProjectNotFound, ProjectPersistenceError] as const;
const UpdateProjectErrors = [InvalidProjectInput, ProjectConflict, ProjectNotFound, ProjectPersistenceError] as const;

const listProjects = HttpApiEndpoint.get("listProjects", "/projects", {
	success: Schema.Array(ProjectResponse),
	error: PersistenceErrors,
}).annotate(OpenApi.Summary, "List projects");

const createProject = HttpApiEndpoint.post("createProject", "/projects", {
	payload: CreateProjectRequest,
	success: HttpApiSchema.status(201)(ProjectResponse),
	error: CreateProjectErrors,
}).annotate(OpenApi.Summary, "Create project");

const getProject = HttpApiEndpoint.get("getProject", "/projects/:projectId", {
	params: ProjectParams,
	success: ProjectResponse,
	error: LookupProjectErrors,
}).annotate(OpenApi.Summary, "Get project");

const updateProject = HttpApiEndpoint.patch("updateProject", "/projects/:projectId", {
	params: ProjectParams,
	payload: UpdateProjectRequest,
	success: ProjectResponse,
	error: UpdateProjectErrors,
}).annotate(OpenApi.Summary, "Update project");

const deleteProject = HttpApiEndpoint.make("DELETE")("deleteProject", "/projects/:projectId", {
	params: ProjectParams,
	success: HttpApiSchema.NoContent,
	error: LookupProjectErrors,
}).annotate(OpenApi.Summary, "Delete project");

export const ProjectsApiGroup = HttpApiGroup.make("projects")
	.add(listProjects)
	.add(createProject)
	.add(getProject)
	.add(updateProject)
	.add(deleteProject)
	.annotate(OpenApi.Title, "Projects")
	.annotate(OpenApi.Description, "Project lifecycle endpoints for the hosted Skopeo platform.");

export const SkopeoApi = HttpApi.make("skopeo-api")
	.add(ProjectsApiGroup)
	.prefix("/api")
	.annotate(OpenApi.Title, "Skopeo API")
	.annotate(OpenApi.Description, "Hosted platform API for Skopeo code review workflows.");
