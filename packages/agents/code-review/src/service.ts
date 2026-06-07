import { SkopeoConfig } from "@skopeo/config";
import { Context, Effect, Layer } from "effect";
import { CodeReviewAgentRuntimeError } from "./errors.js";
import { DevToolsMiddlewareLoader, makeReviewTools, ReviewModelExecutor } from "./executor.js";
import { defaultReviewProfile } from "./profiles/index.js";
import { collectReviewTarget, noFindingsReport } from "./review-target/collector.js";

export type CodeReviewAgentShape = {
	readonly reviewLocalWorktree: () => Effect.Effect<
		string,
		CodeReviewAgentRuntimeError | import("./errors.js").ReviewTargetCollectionError
	>;
};

export class CodeReviewAgent extends Context.Service<CodeReviewAgent, CodeReviewAgentShape>()(
	"@skopeo/code-review-agent/CodeReviewAgent",
) {
	static readonly Live = Layer.effect(
		CodeReviewAgent,
		Effect.gen(function* () {
			const executor = yield* ReviewModelExecutor;
			const config = yield* SkopeoConfig;
			return {
				reviewLocalWorktree: () =>
					Effect.gen(function* () {
						const target = yield* collectReviewTarget().pipe(
							Effect.withSpan("skopeo.review.target.collect"),
							Effect.tap((target) =>
								Effect.annotateCurrentSpan({
									"skopeo.review.changed_file_count": target.changedFileCount,
								}),
							),
							Effect.tap((target) =>
								Effect.logInfo("Collected Review Target", {
									"skopeo.review.changed_file_count": target.changedFileCount,
								}),
							),
						);
						yield* Effect.annotateCurrentSpan({
							"skopeo.review.changed_file_count": target.changedFileCount,
							"skopeo.review.profile_id": defaultReviewProfile.id,
							"skopeo.review.model_id": defaultReviewProfile.modelId,
						});
						if (target.changedFileCount === 0) {
							yield* Effect.logInfo("Review Target is empty", {
								"skopeo.review.changed_file_count": target.changedFileCount,
							});
							return noFindingsReport(0);
						}

						const prompt = defaultReviewProfile.buildUserPrompt(target.changedFileSummary);
						return yield* Effect.scoped(
							Effect.gen(function* () {
								const toolRuntime = yield* Effect.acquireRelease(
									makeReviewTools(),
									(runtime) => runtime.close,
								);
								return yield* executor
									.execute({
										profile: defaultReviewProfile,
										prompt,
										target,
										tools: toolRuntime.tools,
										toolContext: { repositoryRoot: target.repositoryRoot },
										telemetryEnabled: config.telemetry.enabled,
										devToolsEnabled: config.devtools.enabled,
										nodeEnv: process.env.NODE_ENV,
									})
									.pipe(
										Effect.mapError(
											(cause) =>
												new CodeReviewAgentRuntimeError({
													message: "Code Review Agent failed to complete the review.",
													cause,
												}),
										),
									);
							}),
						).pipe(
							Effect.withSpan("skopeo.review.model.execute", {
								attributes: {
									"skopeo.review.profile_id": defaultReviewProfile.id,
									"skopeo.review.model_id": defaultReviewProfile.modelId,
									"skopeo.review.step_budget": defaultReviewProfile.stepBudget,
									"skopeo.review.changed_file_count": target.changedFileCount,
									"skopeo.telemetry.enabled": config.telemetry.enabled,
									"skopeo.devtools.enabled": config.devtools.enabled,
								},
							}),
						);
					}).pipe(
						Effect.withSpan("skopeo.review", {
							attributes: {
								"skopeo.review.profile_id": defaultReviewProfile.id,
								"skopeo.review.model_id": defaultReviewProfile.modelId,
								"skopeo.telemetry.enabled": config.telemetry.enabled,
								"skopeo.devtools.enabled": config.devtools.enabled,
							},
						}),
					),
			};
		}),
	);
}

export const CodeReviewAgentLayer = CodeReviewAgent.Live.pipe(
	Layer.provide(ReviewModelExecutor.Live),
	Layer.provide(DevToolsMiddlewareLoader.Live),
);
