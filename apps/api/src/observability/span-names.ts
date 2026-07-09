import { Layer } from "effect";
import { HttpMiddleware } from "effect/unstable/http";

const staticRoutes = new Set(["/api/projects", "/docs", "/healthz", "/openapi.json", "/readyz"]);
const projectRoute = /^\/api\/projects\/[^/]+\/?$/;

/**
 * Maps only known request shapes to route names. The fallback never contains
 * caller-controlled path data, so invalid and unmatched requests cannot create
 * unbounded span-name cardinality.
 */
const routeShapedPath = (url: string) => {
	const path = url.split("?")[0] ?? "/";

	if (staticRoutes.has(path)) {
		return path;
	}

	if (projectRoute.test(path)) {
		return "/api/projects/:projectId";
	}

	return null;
};

export const spanNameForRequest = (method: string, url: string) => {
	const route = routeShapedPath(url);
	return route === null ? `http.server ${method}` : `${method} ${route}`;
};

/**
 * Names HTTP server spans `GET /api/projects/:projectId` instead of the default
 * `http.server GET`. The span name is generated before routing, so the
 * matched route is not available here — the router still records the exact
 * match as the `http.route` span attribute.
 */
export const SpanNamesLive = Layer.succeed(HttpMiddleware.SpanNameGenerator)((request) =>
	spanNameForRequest(request.method, request.url),
);
