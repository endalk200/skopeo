import { BashTool, makeBashTool, makeReadTool, ReadTool, type RepositoryToolContextType } from "@skopeo/tools";
import { stepCountIs, ToolLoopAgent, type ToolSet } from "ai";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import type { ReviewProfile } from "./profiles/types.js";
import type { ReviewTarget } from "./review-target/collector.js";

export type ReviewModelRequest = {
	readonly profile: ReviewProfile;
	readonly prompt: string;
	readonly target: ReviewTarget;
	readonly tools: ToolSet;
	readonly toolContext: RepositoryToolContextType;
};

export type ReviewModelExecutorShape = {
	readonly execute: (request: ReviewModelRequest) => Effect.Effect<string, unknown>;
};

export class ReviewModelExecutor extends Context.Service<ReviewModelExecutor, ReviewModelExecutorShape>()(
	"@skopeo/code-review-agent/ReviewModelExecutor",
) {
	static readonly Live = Layer.succeed(ReviewModelExecutor, {
		execute: (request) => executeWithAiSdk(request),
	});
}

export const ToolRuntimeLayer = Layer.mergeAll(ReadTool.Live, BashTool.Live);

export const makeReviewTools = () =>
	Effect.sync(() => {
		const runtime = ManagedRuntime.make(ToolRuntimeLayer);
		const runEffect = <A, E>(effect: Effect.Effect<A, E, ReadTool | BashTool>) => runtime.runPromise(effect);
		return {
			tools: {
				read: makeReadTool(runEffect),
				bash: makeBashTool(runEffect),
			} satisfies ToolSet,
			close: runtime.disposeEffect,
		};
	});

export const executeWithAiSdk = (request: ReviewModelRequest) =>
	Effect.tryPromise({
		try: async () => {
			const agent = new ToolLoopAgent({
				model: request.profile.makeModel(),
				instructions: request.profile.systemPrompt,
				temperature: request.profile.temperature,
				stopWhen: stepCountIs(request.profile.stepBudget),
				tools: request.tools,
				experimental_context: request.toolContext,
				providerOptions: {
					openai: {
						reasoningEffort: request.profile.reasoningEffort,
					},
				},
			});

			const result = await agent.generate({
				prompt: request.prompt,
			});
			return result.text;
		},
		catch: (cause) => cause,
	});
