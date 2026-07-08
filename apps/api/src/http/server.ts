import { createServer } from "node:http";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi";
import { AppConfig, AppConfigLive } from "../config/app-config.js";
import { ProjectsServiceLive } from "../domain/projects/service.js";
import { DatabaseLive } from "../infra/db/database.js";
import { DrizzleProjectsRepositoryLive } from "../infra/db/projects-repository.js";
import { SkopeoApi } from "./api.js";
import { ProjectsHttpLive } from "./projects-handlers.js";

const ApiRoutesLive = Layer.mergeAll(
	HttpApiBuilder.layer(SkopeoApi, { openapiPath: "/openapi.json" }),
	HttpApiSwagger.layer(SkopeoApi, { path: "/docs" }),
).pipe(Layer.provide(ProjectsHttpLive));

const DomainLive = ProjectsServiceLive.pipe(Layer.provide(DrizzleProjectsRepositoryLive), Layer.provide(DatabaseLive));

const NodeServerLive = Layer.unwrap(
	Effect.map(AppConfig, (config) =>
		NodeHttpServer.layer(createServer, {
			host: config.host,
			port: config.port,
		}),
	),
);

export const makeServerLayer = () =>
	HttpRouter.serve(ApiRoutesLive).pipe(
		Layer.provide(DomainLive),
		Layer.provide(NodeServerLive),
		Layer.provide(AppConfigLive),
	);
