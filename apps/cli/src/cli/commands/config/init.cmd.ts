import { initSkopeoConfig } from "@skopeo/config";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

export const initCommand = Command.make("init").pipe(
	Command.withDescription("Create a starter Skopeo Configuration file"),
	Command.withShortDescription("Create config file"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			Effect.annotateCurrentSpan({
				attributes: {
					"cli.command": "config init",
					"skopeo.command": "config init",
				},
			});

			const path = yield* initSkopeoConfig;

			yield* Console.log(`Created Skopeo Configuration at ${path.path}.`);
		}).pipe(
			Effect.annotateLogs({
				"skopeo.command": "config init",
			}),
		),
	),
);
