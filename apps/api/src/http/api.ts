import { HttpApi, OpenApi } from "effect/unstable/httpapi";

export const SkopeoApi = HttpApi.make("skopeo-api")
	.prefix("/api")
	.annotate(OpenApi.Title, "Skopeo API")
	.annotate(OpenApi.Description, "Hosted platform API for Skopeo code review workflows.");
