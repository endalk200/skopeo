import { resolveConfigPath } from "@skopeo/config";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

export const pathCommand = Command.make("path").pipe(
	Command.withDescription("Print the effective Skopeo Configuration path"),
	Command.withShortDescription("Print config path"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			Effect.annotateCurrentSpan({
				attributes: {
					"cli.command": "config path",
					"skopeo.command": "config path",
				},
			});

			const path = yield* resolveConfigPath();

			yield* Console.log(path.path);
		}).pipe(
			Effect.annotateLogs({
				"skopeo.command": "config path",
			}),
		),
	),
);
