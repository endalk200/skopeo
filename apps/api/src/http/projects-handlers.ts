import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ProjectsService } from "../domain/projects/service.js";
import { SkopeoApi } from "./api.js";

export const ProjectsHandlersLive = HttpApiBuilder.group(SkopeoApi, "projects", (handlers) =>
	handlers
		.handle("listProjects", () => Effect.flatMap(ProjectsService, (service) => service.list()))
		.handle("createProject", ({ payload }) => Effect.flatMap(ProjectsService, (service) => service.create(payload)))
		.handle("getProject", ({ params }) =>
			Effect.flatMap(ProjectsService, (service) => service.get(params.projectId)),
		)
		.handle("updateProject", ({ params, payload }) =>
			Effect.flatMap(ProjectsService, (service) => service.update(params.projectId, payload)),
		)
		.handle("deleteProject", ({ params }) =>
			Effect.flatMap(ProjectsService, (service) => service.softDelete(params.projectId)).pipe(Effect.asVoid),
		),
);

export const ProjectsHttpLive = Layer.mergeAll(ProjectsHandlersLive);
