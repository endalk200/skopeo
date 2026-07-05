import { type ConfigValidationReport, validateSkopeoConfig } from "@skopeo/config";
import { analyzeModelAccess, type ModelAccessIssue } from "@skopeo/providers";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { ConfigValidationFailed } from "../../../runtime/failures.js";

export const formatConfigValidationReport = (report: ConfigValidationReport): ReadonlyArray<string> => [
	report.file.message,
	report.env.message,
	report.effective.message,
];

export const formatModelAccessIssues = (issues: ReadonlyArray<ModelAccessIssue>): ReadonlyArray<string> =>
	issues.map((issue) => `${issue.severity === "error" ? "Error" : "Warning"}: ${issue.message}`);

export const configValidationHasFailures = (report: ConfigValidationReport): boolean =>
	[report.file, report.env, report.effective].some((status) => status._tag === "invalid");

export const modelAccessHasFailures = (issues: ReadonlyArray<ModelAccessIssue>): boolean =>
	issues.some((issue) => issue.severity === "error");

export const validateCommand = Command.make("validate").pipe(
	Command.withDescription("Validate Skopeo Configuration sources"),
	Command.withShortDescription("Validate config"),
	Command.withHandler(() =>
		Effect.gen(function* () {
			yield* Effect.annotateCurrentSpan({
				"cli.command": "config validate",
				"skopeo.command": "config validate",
			});

			const report = yield* validateSkopeoConfig;
			// Semantic Model Provider checks (registry-dependent routing and
			// credential facts) only apply when an effective config exists.
			const accessIssues = report.config === undefined ? [] : analyzeModelAccess(report.config, process.env);
			const hasFailures = configValidationHasFailures(report) || modelAccessHasFailures(accessIssues);

			// The effective line is the verdict: never print "Valid Skopeo
			// Configuration." when the semantic Model Provider checks are
			// about to fail the command.
			const printedReport: ConfigValidationReport =
				report.effective._tag === "valid" && modelAccessHasFailures(accessIssues)
					? {
							...report,
							effective: {
								_tag: "invalid",
								message: "Invalid Skopeo Configuration: Model Provider checks failed.",
							},
						}
					: report;

			const validationLogAttributes = {
				"skopeo.config.path": report.path.path,
				"skopeo.config.path_source": report.path.source,
				"skopeo.config.valid": !hasFailures,
				"skopeo.config.file_validation_status": report.file._tag,
				"skopeo.config.env_validation_status": report.env._tag,
				// The printed report carries the verdict: `effective` is
				// downgraded to "invalid" when Model Provider checks fail, and
				// the span attribute must agree with the output and exit code.
				"skopeo.config.effective_validation_status": printedReport.effective._tag,
				"skopeo.config.model_access_error_count": accessIssues.filter((issue) => issue.severity === "error")
					.length,
				"skopeo.config.model_access_warning_count": accessIssues.filter((issue) => issue.severity === "warning")
					.length,
			};

			if (hasFailures) {
				yield* Effect.logWarning("Skopeo Configuration validation failed", validationLogAttributes);
			} else {
				yield* Effect.logInfo("Validated Skopeo Configuration", validationLogAttributes);
			}

			for (const line of formatConfigValidationReport(printedReport)) {
				yield* Console.log(line);
			}
			for (const line of formatModelAccessIssues(accessIssues)) {
				yield* Console.log(line);
			}

			if (hasFailures) {
				return yield* Effect.fail(new ConfigValidationFailed());
			}
		}).pipe(
			Effect.annotateLogs({
				"skopeo.command": "config validate",
			}),
		),
	),
);
