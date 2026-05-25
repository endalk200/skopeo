import { resolveConfigPath } from "@skopeo/config";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

export const pathCommand = Command.make("path").pipe(
	Command.withDescription("Print the effective Skopeo Configuration path"),
	Command.withShortDescription("Print config path"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			const path = yield* resolveConfigPath();

			yield* Console.log(path.path);
		}).pipe(
			Effect.withSpan("skopeo.cli.config.path", {
				attributes: {
					"cli.command": "config path",
					"skopeo.command": "config path",
				},
			}),
			Effect.annotateLogs({
				"skopeo.command": "config path",
			}),
		),
	),
);
