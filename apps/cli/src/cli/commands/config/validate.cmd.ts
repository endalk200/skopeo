import { type ConfigValidationReport, validateSkopeoConfig } from "@skopeo/config";
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

export const validateCommand = Command.make("validate").pipe(
	Command.withDescription("Validate Skopeo Configuration sources"),
	Command.withShortDescription("Validate config"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			const report = yield* validateSkopeoConfig;
			const hasFailures = configValidationHasFailures(report);

			const validationLogAttributes = {
				"skopeo.config.path": report.path.path,
				"skopeo.config.path_source": report.path.source,
				"skopeo.config.valid": !hasFailures,
				"skopeo.config.file_validation_status": report.file._tag,
				"skopeo.config.env_validation_status": report.env._tag,
				"skopeo.config.effective_validation_status": report.effective._tag,
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
			Effect.withSpan("skopeo.cli.config.validate", {
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
