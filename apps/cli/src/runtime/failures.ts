import { formatConfigError } from "@skopeo/config";
import { Console, Data, Effect } from "effect";
import type { InvalidReviewFlags } from "../cli/commands/review.cmd.js";

export class ConfigValidationFailed extends Data.TaggedError("ConfigValidationFailed") {}

const printAndFail = <E>(error: E, message: string) => Console.error(message).pipe(Effect.andThen(Effect.fail(error)));

const configFailure = (error: Parameters<typeof formatConfigError>[0]) => printAndFail(error, formatConfigError(error));

export const handleCliFailure = {
	ConfigError: configFailure,
	ConfigFileAlreadyExists: configFailure,
	ConfigFileParseError: configFailure,
	ConfigFileWriteError: configFailure,
	ConfigValidationFailed: (error: ConfigValidationFailed) => Effect.fail(error),
	ExplicitConfigFileNotFound: configFailure,
	InvalidConfigPath: configFailure,
	InvalidDevToolsEnvironment: configFailure,
	InvalidReviewFlags: (error: InvalidReviewFlags) => printAndFail(error, error.message),
	InvalidTelemetryEndpoint: configFailure,
	InvalidTelemetryEnvironment: configFailure,
} as const;
