import { Layer } from "effect";
import { HttpMiddleware } from "effect/unstable/http";

const staticRoutes = new Set(["/docs", "/healthz", "/openapi.json", "/readyz"]);

/**
 * Maps only known request shapes to route names. The fallback never contains
 * caller-controlled path data, so invalid and unmatched requests cannot create
 * unbounded span-name cardinality.
 */
const routeShapedPath = (url: string) => {
	const queryStart = url.indexOf("?");
	const path = queryStart === -1 ? url : url.slice(0, queryStart);

	if (staticRoutes.has(path)) {
		return path;
	}

	return null;
};

export const spanNameForRequest = (method: string, url: string) => {
	const route = routeShapedPath(url);
	return route === null ? `http.server ${method}` : `${method} ${route}`;
};

/**
 * Gives known static routes stable HTTP server span names. The name is
 * generated before routing, so the matched route is not available here — the
 * router still records the exact match as the `http.route` span attribute.
 */
export const SpanNamesLive = Layer.succeed(HttpMiddleware.SpanNameGenerator)((request) =>
	spanNameForRequest(request.method, request.url),
);
