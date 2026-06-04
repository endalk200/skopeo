import { Context, Effect, Layer } from "effect";
import { CodeReviewAgentRuntimeError } from "./errors.js";
import { makeReviewTools, ReviewModelExecutor } from "./executor.js";
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
			return {
				reviewLocalWorktree: () =>
					Effect.gen(function* () {
						const target = yield* collectReviewTarget();
						if (target.changedFileCount === 0) {
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
						);
					}),
			};
		}),
	);
}

export const CodeReviewAgentLayer = CodeReviewAgent.Live.pipe(Layer.provide(ReviewModelExecutor.Live));
