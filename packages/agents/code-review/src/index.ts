import {
	type AgentToolRuntimeDependencies,
	type BashAgentTool,
	makeAgentToolsLayer,
	makeBashToolDefinition,
	makeReadFileToolDefinition,
	type ReadFileAgentTool,
} from "@skopeo/tools";
import type { ChatMiddleware } from "@tanstack/ai";
import { Console, Context, Effect, Layer } from "effect";
import { activeReviewProfile } from "./profiles/index.js";
import type { CodeReviewEnvironment, CodeReviewFormat, CodeReviewRequest, CodeReviewTarget } from "./request.js";

type CodeReviewAgentToolServices = ReadFileAgentTool | BashAgentTool;

/**
 * Effect service that runs Skopeo's Code Review Agent.
 */
class CodeReviewService extends Context.Service<
	CodeReviewService,
	{
		readonly review: (request: CodeReviewRequest) => Effect.Effect<void, unknown, AgentToolRuntimeDependencies>;
	}
>()("CodeReviewService") {}

/**
 * Live Code Review Agent service layer.
 *
 * The implementation creates repository-scoped Agent Tools for each request,
 * runs the active Review Profile, and prints the resulting Review Report.
 */
const CodeReviewServiceLive = Layer.effect(
	CodeReviewService,
	Effect.gen(function* () {
		return CodeReviewService.of({
			review: (request) =>
				Effect.fn("review")(function* () {
					const context = yield* Effect.context<AgentToolRuntimeDependencies>();
					const runEffect = Effect.runPromiseWith(context);
					const toolLayer = makeAgentToolsLayer({ repositoryRoot: request.repositoryRoot });
					const runToolEffect = <A, E>(effect: Effect.Effect<A, E, CodeReviewAgentToolServices>) =>
						runEffect(effect.pipe(Effect.provide(toolLayer)));
					const readFileToolDefinition = makeReadFileToolDefinition({ runEffect: runToolEffect });
					const bashToolDefinition = makeBashToolDefinition({ runEffect: runToolEffect });

					const loggerMiddleware: ChatMiddleware = {
						name: "logger",
						onConfig: (ctx, config) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] onConfig`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										config: config,
									}),
								),
							);
						},
						onStart: (ctx) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Chat started`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
									}),
								),
							);
						},
						onChunk: (ctx, chunk) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Chat chunk`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										chunk: chunk,
									}),
								),
							);
						},
						onBeforeToolCall: (ctx, tool) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Tool called`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										tool: tool,
									}),
								),
							);
						},
						onAfterToolCall: (ctx, tool) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Tool returned`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										tool: tool,
									}),
								),
							);
						},
						onUsage: (ctx, usage) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Usage`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										usage: usage,
									}),
								),
							);
						},
						onFinish: (ctx) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Chat finished`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
									}),
								),
							);
						},
						onAbort: (ctx, info) => {
							runEffect(
								Effect.logWarning(`[${ctx.requestId}] Chat aborted`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										info: info,
									}),
								),
							);
						},
						onError: (ctx, error) => {
							runEffect(
								Effect.logError(`[${ctx.requestId}] Chat error`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										error: error,
									}),
								),
							);
						},
					};

					yield* Effect.logInfo("Running Review Profile").pipe(
						Effect.annotateLogs({
							"review_profile.id": activeReviewProfile.id,
							"review_profile.model": activeReviewProfile.model,
							"review_profile.depth": activeReviewProfile.depth,
						}),
					);

					const report = yield* Effect.tryPromise(() =>
						activeReviewProfile.run({
							middleware: [loggerMiddleware],
							request,
							tools: [readFileToolDefinition, bashToolDefinition],
						}),
					);

					yield* Console.log(report);
				})(),
		});
	}),
);

export type { CodeReviewEnvironment, CodeReviewFormat, CodeReviewRequest, CodeReviewTarget };
export { CodeReviewService, CodeReviewServiceLive };
