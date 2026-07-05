import { formatConfigError } from "@skopeo/config";
import { formatModelProviderError, type ModelProviderError } from "@skopeo/providers";
import { Console, Data, Effect } from "effect";
import type { InvalidReviewFlags } from "../cli/commands/review.cmd.js";

export class ConfigValidationFailed extends Data.TaggedError("ConfigValidationFailed") {}

const printAndFail = <E>(error: E, message: string) => Console.error(message).pipe(Effect.andThen(Effect.fail(error)));

const configFailure = (error: Parameters<typeof formatConfigError>[0]) => printAndFail(error, formatConfigError(error));

const modelProviderFailure = (error: ModelProviderError) => printAndFail(error, formatModelProviderError(error));

export const handleCliFailure = {
	ConfigError: configFailure,
	ConfigFileAlreadyExists: configFailure,
	ConfigFileParseError: configFailure,
	ConfigFileWriteError: configFailure,
	ConfigValidationFailed: (error: ConfigValidationFailed) => Effect.fail(error),
	ExplicitConfigFileNotFound: configFailure,
	IncompatibleModelProviderProtocol: modelProviderFailure,
	InvalidConfigPath: configFailure,
	InvalidDevToolsEnvironment: configFailure,
	InvalidProviderConfiguration: configFailure,
	InvalidReviewDepth: configFailure,
	InvalidReviewDepthEnvironment: configFailure,
	InvalidReviewFlags: (error: InvalidReviewFlags) => printAndFail(error, error.message),
	InvalidReviewModel: configFailure,
	InvalidReviewModelEnvironment: configFailure,
	InvalidTelemetryEndpoint: configFailure,
	InvalidTelemetryEnvironment: configFailure,
	MissingModelProviderApiKey: modelProviderFailure,
	UnknownModelProviderRoute: modelProviderFailure,
	UnknownReviewModel: modelProviderFailure,
} as const;
