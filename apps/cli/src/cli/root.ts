import { Command } from "effect/unstable/cli";
import { configCommand } from "./commands/config/index.js";
import { reviewCommand } from "./commands/review.cmd.js";
import { versionCommand } from "./commands/version.cmd.js";

export const commandCatalog = [versionCommand, configCommand, reviewCommand] as const;

export const makeRootCommand = (commands: typeof commandCatalog = commandCatalog) =>
	Command.make("skopeo").pipe(
		Command.withDescription(
			"Analyze code changes and report review findings through local and hosted developer workflows.",
		),
		Command.withSubcommands(commands),
	);

export const rootCommand = makeRootCommand();
