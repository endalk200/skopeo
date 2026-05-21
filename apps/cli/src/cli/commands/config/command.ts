import { type ConfigValidationReport, initSkopeoConfig, resolveConfigPath, validateSkopeoConfig } from "@skopeo/config";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { ConfigValidationFailed } from "../../../runtime/failures.js";

export const formatConfigValidationReport = (report: ConfigValidationReport): ReadonlyArray<string> => [
	report.file.message,
	report.env.message,
	report.effective.message,
];

export const configValidationHasFailures = (report: ConfigValidationReport): boolean =>
	[report.file, report.env, report.effective].some((status) => status._tag === "invalid");

const pathCommand = Command.make("path").pipe(
	Command.withDescription("Print the effective Skopeo Configuration path"),
	Command.withShortDescription("Print config path"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			const path = yield* resolveConfigPath();

			yield* Effect.annotateCurrentSpan({
				"cli.command": "config path",
				"skopeo.config.path": path.path,
				"skopeo.config.path_source": path.source,
			});
			yield* Console.log(path.path);
		}).pipe(
			Effect.withSpan("skopeo.config.path", {
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

const initCommand = Command.make("init").pipe(
	Command.withDescription("Create a starter Skopeo Configuration file"),
	Command.withShortDescription("Create config file"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			const path = yield* initSkopeoConfig;

			yield* Effect.annotateCurrentSpan({
				"cli.command": "config init",
				"skopeo.config.path": path.path,
				"skopeo.config.path_source": path.source,
				"skopeo.config.created": true,
			});

			yield* Console.log(`Created Skopeo Configuration at ${path.path}.`);
		}).pipe(
			Effect.withSpan("skopeo.config.init", {
				attributes: {
					"cli.command": "config init",
					"skopeo.command": "config init",
				},
			}),
			Effect.annotateLogs({
				"skopeo.command": "config init",
			}),
		),
	),
);

const validateCommand = Command.make("validate").pipe(
	Command.withDescription("Validate Skopeo Configuration sources"),
	Command.withShortDescription("Validate config"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			const report = yield* validateSkopeoConfig;
			const hasFailures = configValidationHasFailures(report);
			yield* Effect.annotateCurrentSpan({
				"cli.command": "config validate",
				"skopeo.config.path": report.path.path,
				"skopeo.config.path_source": report.path.source,
				"skopeo.config.valid": !hasFailures,
				"skopeo.config.file_status": report.file._tag,
				"skopeo.config.env_status": report.env._tag,
				"skopeo.config.effective_status": report.effective._tag,
			});
			const validationLogAttributes = {
				path: report.path.path,
				valid: !hasFailures,
				fileStatus: report.file._tag,
				envStatus: report.env._tag,
				effectiveStatus: report.effective._tag,
			};
			if (hasFailures) {
				yield* Effect.logWarning("Skopeo Configuration validation failed", validationLogAttributes);
			} else {
				yield* Effect.logInfo("Validated Skopeo Configuration", validationLogAttributes);
			}
			for (const line of formatConfigValidationReport(report)) {
				yield* Console.log(line);
			}
			if (hasFailures) {
				return yield* Effect.fail(new ConfigValidationFailed());
			}
		}).pipe(
			Effect.withSpan("skopeo.config.validate", {
				attributes: {
					"cli.command": "config validate",
					"skopeo.command": "config validate",
				},
			}),
			Effect.annotateLogs({
				"skopeo.command": "config validate",
			}),
		),
	),
);

export const configCommand = Command.make("config").pipe(
	Command.withDescription("Manage Skopeo Configuration"),
	Command.withShortDescription("Manage config"),
	Command.withSubcommands([validateCommand, initCommand, pathCommand]),
);
