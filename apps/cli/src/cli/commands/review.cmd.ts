import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { VERSION } from "../../version.js";

export const reviewCommand = Command.make("review").pipe(
	Command.withDescription("Review local code changes"),
	Command.withShortDescription("Review local code changes"),

	Command.withHandler(() =>
		Effect.gen(function* () {
			Effect.annotateCurrentSpan({
				attributes: {
					"cli.command": "review",
					"skopeo.command": "review",
				},
			});

			yield* Console.log(`Skopeo CLI v${VERSION}`);
		}).pipe(
			Effect.annotateLogs({
				"skopeo.command": "review",
			}),
		),
	),
);
