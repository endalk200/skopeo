import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import {
	InvalidProjectInput,
	ProjectConflict,
	ProjectNotFound,
	ProjectPersistenceError,
} from "../domain/projects/errors.js";
import { CreateProjectCommand, Project, UpdateProjectCommand } from "../domain/projects/project.js";
import { RequestBodyLimitMiddleware } from "./request-limits.js";

// Responses reuse the domain `Project` schema directly, so the wire format
// cannot drift from the domain model. Requests reuse the command schemas with
// wire-level annotations layered on top.
export const ProjectResponse = Project;

export const CreateProjectRequest = CreateProjectCommand.annotate({
	description: "Fields required to register a project.",
	identifier: "CreateProjectRequest",
});

export const UpdateProjectRequest = UpdateProjectCommand.annotate({
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
})
	.middleware(RequestBodyLimitMiddleware)
	.annotate(OpenApi.Summary, "Create project");

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
})
	.middleware(RequestBodyLimitMiddleware)
	.annotate(OpenApi.Summary, "Update project");

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
