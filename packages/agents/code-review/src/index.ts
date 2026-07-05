import { SkopeoConfig } from "@skopeo/config";
import { ModelProviderService } from "@skopeo/providers";
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
import { resolveReviewProfile } from "./profiles/index.js";
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
 * The implementation resolves the Default Review Profile from Skopeo
 * Configuration, obtains the model's chat adapter from the
 * ModelProviderService, creates repository-scoped Agent Tools for each
 * request, runs the profile, and prints the resulting Review Report.
 */
const CodeReviewServiceLive = Layer.effect(
	CodeReviewService,
	Effect.gen(function* () {
		const config = yield* SkopeoConfig;
		const modelProviders = yield* ModelProviderService;

		return CodeReviewService.of({
			review: (request) =>
				Effect.fn("review")(function* () {
					const runEffect = Effect.runPromiseWith(yield* Effect.context<AgentToolRuntimeDependencies>());

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

					// Resolving model access first surfaces unknown configured models
					// as a typed UnknownReviewModel error with the known-model list.
					const access = yield* modelProviders.adapterFor(config.review.model);

					const profile = resolveReviewProfile({ depth: config.review.depth, model: access.model });
					if (profile === undefined) {
						// The providers registry accepted the model, so the profile
						// registry must know it too — a mismatch is a code bug.
						return yield* Effect.die(
							new Error(
								`Model "${access.model}" has provider access defaults but no Review Profile registered.`,
							),
						);
					}

					yield* Effect.logInfo("Running Review Profile").pipe(
						Effect.annotateLogs({
							"review_profile.id": profile.id,
							"review_profile.model": profile.model,
							"review_profile.depth": profile.depth,
							"review_profile.provider": access.provider,
							"review_profile.wire_model_id": access.wireModelId,
							"review_profile.wire_dialect": access.wireDialect,
						}),
					);

					const report = yield* Effect.tryPromise(() =>
						profile.run({
							adapter: access.adapter,
							middleware: [loggerMiddleware],
							request,
							tools: [readFileToolDefinition, bashToolDefinition],
							wireDialect: access.wireDialect,
						}),
					);

					yield* Console.log(report);
				})(),
		});
	}),
);

export type { CodeReviewEnvironment, CodeReviewFormat, CodeReviewRequest, CodeReviewTarget };
export { CodeReviewService, CodeReviewServiceLive };
