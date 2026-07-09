import { Effect, FileSystem, Layer, Schema } from "effect";
import { HttpServerError, HttpServerRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

export const maxRequestBodyBytes = 1024 * 1024;

export class RequestBodyTooLarge extends Schema.TaggedErrorClass<RequestBodyTooLarge>()(
	"RequestBodyTooLarge",
	{
		message: Schema.String,
	},
	{ httpApiStatus: 413 },
) {}

export class RequestBodyLimitMiddleware extends HttpApiMiddleware.Service<RequestBodyLimitMiddleware>()(
	"skopeo/api/RequestBodyLimitMiddleware",
	{ error: RequestBodyTooLarge },
) {}

const isRequestBodyTooLarge = (defect: unknown) => {
	if (!HttpServerError.isHttpServerError(defect) || defect.reason._tag !== "RequestParseError") {
		return false;
	}

	return defect.reason.cause instanceof Error && defect.reason.cause.message === "maxBytes exceeded";
};

export const RequestBodyLimitMiddlewareLive = Layer.succeed(RequestBodyLimitMiddleware)((effect) =>
	Effect.catchDefect(effect, (defect) =>
		isRequestBodyTooLarge(defect)
			? Effect.fail(new RequestBodyTooLarge({ message: "Request body must be 1 MiB or smaller." }))
			: Effect.die(defect),
	),
);

export const RequestBodySizeLive = Layer.succeed(HttpServerRequest.MaxBodySize)(FileSystem.Size(maxRequestBodyBytes));
