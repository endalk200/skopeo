import { CodeReviewAgent } from "@skopeo/code-review-agent";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

export const reviewCommand = Command.make("review", {}, () =>
	Effect.gen(function* () {
		const agent = yield* CodeReviewAgent;
		const report = yield* agent.reviewLocalWorktree();
		yield* Console.log(report);
	}),
).pipe(Command.withDescription("Review local code changes."));
