import { BashTool, makeBashTool, makeReadTool, ReadTool, type RepositoryToolContextType } from "@skopeo/tools";
import {
	type LanguageModel,
	stepCountIs,
	type TelemetrySettings,
	ToolLoopAgent,
	type ToolSet,
	wrapLanguageModel,
} from "ai";
import { Context, Effect, Layer, ManagedRuntime, Option } from "effect";
import type { ReviewProfile } from "./profiles/types.js";
import type { ReviewTarget } from "./review-target/collector.js";

export type ReviewModelRequest = {
	readonly profile: ReviewProfile;
	readonly prompt: string;
	readonly target: ReviewTarget;
	readonly tools: ToolSet;
	readonly toolContext: RepositoryToolContextType;
	readonly telemetryEnabled: boolean;
	readonly devToolsEnabled: boolean;
	readonly nodeEnv: string | undefined;
};

export type ReviewModelExecutorShape = {
	readonly execute: (request: ReviewModelRequest) => Effect.Effect<string, unknown>;
};

export type DevToolsMiddlewareLoaderShape = {
	readonly wrapModel: (model: LanguageModel) => Effect.Effect<LanguageModel, unknown>;
};

export class DevToolsMiddlewareLoader extends Context.Service<
	DevToolsMiddlewareLoader,
	DevToolsMiddlewareLoaderShape
>()("@skopeo/code-review-agent/DevToolsMiddlewareLoader") {
	static readonly Live = Layer.succeed(DevToolsMiddlewareLoader, {
		wrapModel: (model) =>
			Effect.tryPromise({
				try: async () => {
					const { devToolsMiddleware } = await import("@ai-sdk/devtools");
					return wrapLanguageModel({
						model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
						middleware: devToolsMiddleware(),
					});
				},
				catch: (cause) => cause,
			}),
	});
}

export class ReviewModelExecutor extends Context.Service<ReviewModelExecutor, ReviewModelExecutorShape>()(
	"@skopeo/code-review-agent/ReviewModelExecutor",
) {
	static readonly Live = Layer.effect(
		ReviewModelExecutor,
		Effect.gen(function* () {
			const devTools = yield* DevToolsMiddlewareLoader;
			return {
				execute: (request) => executeWithAiSdk(request, devTools),
			};
		}),
	);
}

export const ToolRuntimeLayer = Layer.mergeAll(ReadTool.Live, BashTool.Live);

export const makeReviewTools = () =>
	Effect.gen(function* () {
		const parentSpan = yield* Effect.currentParentSpan.pipe(Effect.option);
		const runtime = ManagedRuntime.make(ToolRuntimeLayer);
		const runEffect = <A, E>(
			effect: Effect.Effect<A, E, ReadTool | BashTool>,
			options?: { readonly signal?: AbortSignal | undefined },
		) =>
			runtime.runPromise(
				Option.match(parentSpan, {
					onNone: () => effect,
					onSome: (span) => effect.pipe(Effect.withParentSpan(span)),
				}),
				options,
			);
		return {
			tools: {
				read: makeReadTool(runEffect),
				bash: makeBashTool(runEffect),
			} satisfies ToolSet,
			close: runtime.disposeEffect,
		};
	});

const makeAiSdkTelemetry = (request: ReviewModelRequest): TelemetrySettings | undefined =>
	request.telemetryEnabled
		? {
				isEnabled: true,
				recordInputs: false,
				recordOutputs: false,
				functionId: "skopeo.review",
				metadata: {
					"skopeo.review.profile_id": request.profile.id,
					"skopeo.review.model_id": request.profile.modelId,
					"skopeo.review.step_budget": request.profile.stepBudget,
					"skopeo.review.changed_file_count": request.target.changedFileCount,
				},
			}
		: undefined;

const prepareReviewModel = (request: ReviewModelRequest, devTools: DevToolsMiddlewareLoaderShape) =>
	Effect.gen(function* () {
		const model = request.profile.makeModel();
		if (!request.devToolsEnabled) {
			return model;
		}
		if (request.nodeEnv === "production") {
			yield* Effect.logWarning("AI SDK DevTools disabled in production", {
				"skopeo.devtools.enabled": true,
				"skopeo.devtools.disabled_reason": "production",
			});
			return model;
		}
		return yield* devTools.wrapModel(model).pipe(
			Effect.tapError((cause) =>
				Effect.logWarning("AI SDK DevTools setup failed; continuing without DevTools", {
					"skopeo.devtools.enabled": true,
					"skopeo.devtools.disabled_reason": "setup_failed",
					"skopeo.devtools.error": cause instanceof Error ? cause.message : String(cause),
				}),
			),
			Effect.catch(() => Effect.succeed(model)),
		);
	});

export const executeWithAiSdk = (request: ReviewModelRequest, devTools: DevToolsMiddlewareLoaderShape) =>
	Effect.gen(function* () {
		const model = yield* prepareReviewModel(request, devTools);
		const result = yield* Effect.tryPromise({
			try: async () => {
				let stepCount = 0;
				let toolCallCount = 0;
				let finishReason: string | undefined;
				let totalInputTokens: number | undefined;
				let totalOutputTokens: number | undefined;
				let totalTokens: number | undefined;

				const agent = new ToolLoopAgent({
					model,
					instructions: request.profile.systemPrompt,
					...(request.profile.temperature === undefined ? {} : { temperature: request.profile.temperature }),
					stopWhen: stepCountIs(request.profile.stepBudget),
					experimental_telemetry: makeAiSdkTelemetry(request),
					tools: request.tools,
					experimental_context: request.toolContext,
					providerOptions: {
						openai: {
							reasoningEffort: request.profile.reasoningEffort,
						},
					},
					onStepFinish: (event) => {
						stepCount += 1;
						toolCallCount += event.toolCalls.length;
					},
					onFinish: (event) => {
						finishReason = event.finishReason;
						totalInputTokens = event.totalUsage.inputTokens;
						totalOutputTokens = event.totalUsage.outputTokens;
						totalTokens = event.totalUsage.totalTokens;
					},
				});

				const result = await agent.generate({
					prompt: request.prompt,
				});
				return {
					text: result.text,
					stepCount,
					toolCallCount,
					finishReason,
					totalInputTokens,
					totalOutputTokens,
					totalTokens,
				};
			},
			catch: (cause) => cause,
		});
		yield* Effect.annotateCurrentSpan({
			"skopeo.review.ai_sdk.step_count": result.stepCount,
			"skopeo.review.ai_sdk.tool_call_count": result.toolCallCount,
			...(result.finishReason === undefined ? {} : { "skopeo.review.ai_sdk.finish_reason": result.finishReason }),
			...(result.totalInputTokens === undefined
				? {}
				: { "skopeo.review.ai_sdk.input_tokens": result.totalInputTokens }),
			...(result.totalOutputTokens === undefined
				? {}
				: { "skopeo.review.ai_sdk.output_tokens": result.totalOutputTokens }),
			...(result.totalTokens === undefined ? {} : { "skopeo.review.ai_sdk.total_tokens": result.totalTokens }),
		});
		yield* Effect.logInfo("Completed Review model execution", {
			"skopeo.review.ai_sdk.step_count": result.stepCount,
			"skopeo.review.ai_sdk.tool_call_count": result.toolCallCount,
			...(result.finishReason === undefined ? {} : { "skopeo.review.ai_sdk.finish_reason": result.finishReason }),
		});
		return result.text;
	});
