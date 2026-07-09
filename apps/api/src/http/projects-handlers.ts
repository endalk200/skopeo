import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ProjectsService } from "../domain/projects/service.js";
import { SkopeoApi } from "./api.js";

export const ProjectsHandlersLive = HttpApiBuilder.group(SkopeoApi, "projects", (handlers) =>
	Effect.gen(function* () {
		const projects = yield* ProjectsService;

		return handlers
			.handle("listProjects", () => projects.list())
			.handle("createProject", ({ payload }) => projects.create(payload))
			.handle("getProject", ({ params }) => projects.get(params.projectId))
			.handle("updateProject", ({ params, payload }) => projects.update(params.projectId, payload))
			.handle("deleteProject", ({ params }) => projects.softDelete(params.projectId));
	}),
);
