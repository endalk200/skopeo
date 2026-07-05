import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { Config, ConfigProvider, Context, Data, Effect, FileSystem, Layer, Result } from "effect";
import * as Toml from "toml";

export const DEFAULT_OTLP_HTTP_ENDPOINT = "http://localhost:4318";
export const DEFAULT_CONFIG_PATH = "~/.skopeo/config.toml";
export const CONFIG_PATH_ENV = "SKOPEO_CONFIG_PATH";
export const TELEMETRY_ENV = "SKOPEO_TELEMETRY";
export const OTLP_ENDPOINT_ENV = "SKOPEO_OTLP_ENDPOINT";
export const DEVTOOLS_ENV = "SKOPEO_DEVTOOLS";
export const REVIEW_MODEL_ENV = "SKOPEO_REVIEW_MODEL";
export const REVIEW_DEPTH_ENV = "SKOPEO_REVIEW_DEPTH";

export type TelemetryConfig = {
	readonly enabled: boolean;
	readonly otlpEndpoint: string;
};

export type DevToolsConfig = {
	readonly enabled: boolean;
};

/**
 * Review Depth values a Skopeo User may select for the Default Review Profile.
 */
export const REVIEW_DEPTH_SETTINGS = ["quick", "standard", "thorough"] as const;
export type ReviewDepthSetting = (typeof REVIEW_DEPTH_SETTINGS)[number];

/**
 * Default Review Profile selection: which code-defined Review Profile the
 * Code Review Agent uses when the Skopeo User has not picked one per run.
 *
 * `model` is kept as a plain string here; whether it names a code-defined
 * Review Profile model is a semantic question answered by `@skopeo/providers`.
 */
export type ReviewSelectionConfig = {
	readonly model: string;
	readonly depth: ReviewDepthSetting;
};

/**
 * Model Provider names with baked-in defaults (dedicated adapter, official
 * endpoint, well-known API key environment variable). These names are
 * reserved: declaring them under `[providers]` refines the built-in entry
 * (e.g. `base_url` for Azure OpenAI) instead of creating a custom provider.
 */
export const WELL_KNOWN_MODEL_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;
export type WellKnownModelProviderName = (typeof WELL_KNOWN_MODEL_PROVIDERS)[number];

/**
 * Wire protocols a custom Model Provider can speak. Well-known providers have
 * a fixed protocol implied by their dedicated adapter and cannot override it.
 */
export const MODEL_PROVIDER_PROTOCOLS = ["openai", "anthropic"] as const;
export type ModelProviderProtocol = (typeof MODEL_PROVIDER_PROTOCOLS)[number];

export type WellKnownModelProviderConfig = {
	readonly _tag: "wellKnown";
	readonly name: WellKnownModelProviderName;
	readonly baseUrl: string | undefined;
	readonly apiKeyEnv: string | undefined;
};

export type CustomModelProviderConfig = {
	readonly _tag: "custom";
	readonly name: string;
	readonly baseUrl: string;
	readonly protocol: ModelProviderProtocol;
	readonly apiKeyEnv: string | undefined;
};

/**
 * One declared Model Provider: an access channel through which the Code
 * Review Agent reaches a model. Credentials never live in the file — only
 * the name of the environment variable that holds them (`api_key_env`).
 */
export type ModelProviderConfig = WellKnownModelProviderConfig | CustomModelProviderConfig;

/**
 * One model routing rule: which Model Provider serves a model, and what the
 * model is called on that provider's wire (`model_id`) when it differs.
 */
export type ModelRouteConfig = {
	readonly model: string;
	readonly provider: string;
	readonly modelId: string | undefined;
};

export type SkopeoConfiguration = {
	readonly telemetry: TelemetryConfig;
	readonly devtools: DevToolsConfig;
	readonly review: ReviewSelectionConfig;
	readonly providers: ReadonlyArray<ModelProviderConfig>;
	readonly models: ReadonlyArray<ModelRouteConfig>;
};

export const defaultSkopeoConfiguration: SkopeoConfiguration = {
	telemetry: {
		enabled: false,
		otlpEndpoint: DEFAULT_OTLP_HTTP_ENDPOINT,
	},
	devtools: {
		enabled: false,
	},
	review: {
		model: "gpt-5.5",
		depth: "standard",
	},
	providers: [],
	models: [],
};

export class InvalidTelemetryEnvironment extends Data.TaggedError("InvalidTelemetryEnvironment")<{
	readonly value: string;
}> {}

export class InvalidDevToolsEnvironment extends Data.TaggedError("InvalidDevToolsEnvironment")<{
	readonly value: string;
}> {}

export class InvalidTelemetryEndpoint extends Data.TaggedError("InvalidTelemetryEndpoint")<{
	readonly value: string;
}> {}

export class InvalidConfigPath extends Data.TaggedError("InvalidConfigPath")<{
	readonly value: string;
}> {}

export class ConfigFileParseError extends Data.TaggedError("ConfigFileParseError")<{
	readonly path: string;
	readonly message: string;
	readonly cause: unknown;
}> {}

export class ConfigFileWriteError extends Data.TaggedError("ConfigFileWriteError")<{
	readonly path: string;
	readonly message: string;
	readonly cause: unknown;
}> {}

export class ExplicitConfigFileNotFound extends Data.TaggedError("ExplicitConfigFileNotFound")<{
	readonly path: string;
}> {}

export class ConfigFileAlreadyExists extends Data.TaggedError("ConfigFileAlreadyExists")<{
	readonly path: string;
}> {}

export class InvalidReviewDepth extends Data.TaggedError("InvalidReviewDepth")<{
	readonly value: string;
}> {}

export class InvalidReviewModel extends Data.TaggedError("InvalidReviewModel")<{
	readonly value: string;
}> {}

export class InvalidReviewDepthEnvironment extends Data.TaggedError("InvalidReviewDepthEnvironment")<{
	readonly value: string;
}> {}

export class InvalidReviewModelEnvironment extends Data.TaggedError("InvalidReviewModelEnvironment")<{
	readonly value: string;
}> {}

/**
 * Structural problem in the `[providers]` or `[models]` tables — a fact about
 * the file itself (plaintext api_key, missing base_url, unknown field, route
 * to an undeclared provider), always a hard error.
 */
export class InvalidProviderConfiguration extends Data.TaggedError("InvalidProviderConfiguration")<{
	readonly section: string;
	readonly message: string;
}> {}

export type ConfigError =
	| Config.ConfigError
	| ConfigFileParseError
	| ConfigFileWriteError
	| ExplicitConfigFileNotFound
	| InvalidDevToolsEnvironment
	| InvalidConfigPath
	| InvalidProviderConfiguration
	| InvalidReviewDepth
	| InvalidReviewDepthEnvironment
	| InvalidReviewModel
	| InvalidReviewModelEnvironment
	| InvalidTelemetryEndpoint
	| InvalidTelemetryEnvironment;

export type ConfigPathResolution = {
	readonly path: string;
	readonly source: "default" | "env";
};

export type ConfigSourceStatus =
	| {
			readonly _tag: "valid";
			readonly message: string;
	  }
	| {
			readonly _tag: "warning";
			readonly message: string;
	  }
	| {
			readonly _tag: "invalid";
			readonly message: string;
	  };

export type ConfigValidationReport = {
	readonly path: ConfigPathResolution;
	readonly file: ConfigSourceStatus;
	readonly env: ConfigSourceStatus;
	readonly effective: ConfigSourceStatus;
	readonly config: SkopeoConfiguration | undefined;
};

type ConfigSourceProvider = {
	readonly provider: ConfigProvider.ConfigProvider;
};

type ConfigFileSource = ConfigSourceProvider & {
	readonly _tag: "present" | "missingDefault";
	readonly raw: unknown;
};

type EnvOverrideError =
	| InvalidDevToolsEnvironment
	| InvalidReviewDepthEnvironment
	| InvalidReviewModelEnvironment
	| InvalidTelemetryEndpoint
	| InvalidTelemetryEnvironment;

type ResolvedConfigSources = {
	readonly path: ConfigPathResolution;
	readonly file: Result.Result<ConfigFileSource, ConfigFileParseError | ExplicitConfigFileNotFound>;
	readonly env: Result.Result<ConfigSourceProvider, EnvOverrideError>;
};

const normalizeUrl = (url: URL): string => url.toString().replace(/\/$/, "");

export const telemetryConfigDescriptor = Config.all({
	enabled: Config.boolean("enabled").pipe(Config.withDefault(defaultSkopeoConfiguration.telemetry.enabled)),
	otlpEndpoint: Config.url("otlp_endpoint").pipe(
		Config.withDefault(new URL(defaultSkopeoConfiguration.telemetry.otlpEndpoint)),
		Config.map(normalizeUrl),
	),
}).pipe(
	Config.map(({ enabled, otlpEndpoint }) => ({
		enabled,
		otlpEndpoint,
	})),
	Config.nested("telemetry"),
);

export const devToolsConfigDescriptor = Config.all({
	enabled: Config.boolean("enabled").pipe(Config.withDefault(defaultSkopeoConfiguration.devtools.enabled)),
}).pipe(Config.nested("devtools"));

/**
 * `[review]` descriptor. Both values parse as plain strings; depth is
 * validated against {@link REVIEW_DEPTH_SETTINGS} by
 * {@link validateReviewSelection} after parsing so file and environment
 * sources share one semantic check.
 */
export const reviewConfigDescriptor = Config.all({
	model: Config.string("model").pipe(Config.withDefault(defaultSkopeoConfiguration.review.model)),
	depth: Config.string("depth").pipe(Config.withDefault<string>(defaultSkopeoConfiguration.review.depth)),
}).pipe(Config.nested("review"));

export const skopeoConfigDescriptor = Config.all({
	telemetry: telemetryConfigDescriptor,
	devtools: devToolsConfigDescriptor,
	review: reviewConfigDescriptor,
});

export const starterConfigToml = `# Skopeo Configuration
#
# Telemetry is disabled by default. Set enabled to true to export traces and logs
# to a local OTLP HTTP collector.

[telemetry]
enabled = false
otlp_endpoint = "${DEFAULT_OTLP_HTTP_ENDPOINT}"

# AI SDK DevTools is disabled by default. Enable it only for local debugging;
# it records full AI SDK interactions into local .devtools data.

[devtools]
enabled = false

# Default Review Profile selection. Skopeo ships tuned Review Profiles per
# model and Review Depth; config only picks one — it never defines profiles.
#
# [review]
# model = "gpt-5.5"        # gpt-5.5 | gpt-5.4 | gpt-5.2 | claude-opus-4-8
# depth = "standard"       # quick | standard | thorough

# Model Providers: access channels through which Skopeo reaches models.
# "openai", "anthropic", and "openrouter" are well-known names with baked-in
# defaults; any other name declares a custom provider (AI gateway, local
# endpoint) and requires base_url. API keys never live in this file — set
# api_key_env to name the environment variable that holds the key.
#
# base_url overrides change the endpoint, not the wire dialect: the
# well-known "openai" provider always speaks the Responses API
# (/v1/responses), so its override target must serve it (official mirrors,
# Azure's v1 API surface). Endpoints that only implement Chat Completions
# (LiteLLM, ollama, vLLM) belong under a custom provider instead.
#
# [providers.openai]
# base_url = "https://my-azure-openai.example/openai/v1"  # must serve /responses
# api_key_env = "MY_OPENAI_KEY"                           # defaults to OPENAI_API_KEY
#
# [providers.my-gateway]
# base_url = "https://llm.corp.example/v1"          # required for custom providers
# protocol = "openai"                               # openai (default) | anthropic
# api_key_env = "CORP_GATEWAY_TOKEN"                # optional; local endpoints need none

# Model routing: which Model Provider serves each model. Unrouted models use
# their vendor (gpt-* -> openai, claude-* -> anthropic). model_id overrides
# what the wire request calls the model when the provider renames it.
# Model names contain dots, so quote them in the table header.
#
# [models."gpt-5.5"]
# provider = "my-gateway"
# model_id = "azure-gpt-55-prod"
`;

const normalizeUrlString = (value: string) =>
	Effect.try({
		try: () => normalizeUrl(new URL(value)),
		catch: () => new InvalidTelemetryEndpoint({ value }),
	});

export const parseTelemetryEnabledEnv = (
	value: string | undefined,
): Effect.Effect<boolean | undefined, InvalidTelemetryEnvironment> => {
	if (value === undefined) {
		return Effect.succeed(undefined);
	}
	if (value === "true") {
		return Effect.succeed(true);
	}
	if (value === "false") {
		return Effect.succeed(false);
	}
	return Effect.fail(new InvalidTelemetryEnvironment({ value }));
};

export const parseDevToolsEnabledEnv = (
	value: string | undefined,
): Effect.Effect<boolean | undefined, InvalidDevToolsEnvironment> => {
	if (value === undefined) {
		return Effect.succeed(undefined);
	}
	if (value === "true") {
		return Effect.succeed(true);
	}
	if (value === "false") {
		return Effect.succeed(false);
	}
	return Effect.fail(new InvalidDevToolsEnvironment({ value }));
};

export const parseTelemetryEndpointEnv = (
	value: string | undefined,
): Effect.Effect<string | undefined, InvalidTelemetryEndpoint> => {
	if (value === undefined) {
		return Effect.succeed(undefined);
	}
	return normalizeUrlString(value);
};

export const parseReviewModelEnv = (
	value: string | undefined,
): Effect.Effect<string | undefined, InvalidReviewModelEnvironment> => {
	if (value === undefined) {
		return Effect.succeed(undefined);
	}
	// Stray whitespace (quoting mistakes in shell exports) would otherwise
	// survive into the effective model and fail later with a confusing
	// unknown-model error, so the trimmed value is what gets stored.
	const trimmed = value.trim();
	if (trimmed === "") {
		return Effect.fail(new InvalidReviewModelEnvironment({ value }));
	}
	return Effect.succeed(trimmed);
};

const isReviewDepthSetting = (value: string): value is ReviewDepthSetting =>
	(REVIEW_DEPTH_SETTINGS as ReadonlyArray<string>).includes(value);

export const parseReviewDepthEnv = (
	value: string | undefined,
): Effect.Effect<ReviewDepthSetting | undefined, InvalidReviewDepthEnvironment> => {
	if (value === undefined) {
		return Effect.succeed(undefined);
	}
	if (isReviewDepthSetting(value)) {
		return Effect.succeed(value);
	}
	return Effect.fail(new InvalidReviewDepthEnvironment({ value }));
};

/**
 * Semantic check shared by every source: the effective `[review]` values must
 * name a non-empty model and a known Review Depth.
 */
export const validateReviewSelection = (raw: {
	readonly model: string;
	readonly depth: string;
}): Effect.Effect<ReviewSelectionConfig, InvalidReviewDepth | InvalidReviewModel> => {
	// Trimmed for the same reason as parseReviewModelEnv: whitespace typos in
	// the TOML file must not survive into the effective model.
	const model = raw.model.trim();
	if (model === "") {
		return Effect.fail(new InvalidReviewModel({ value: raw.model }));
	}
	if (!isReviewDepthSetting(raw.depth)) {
		return Effect.fail(new InvalidReviewDepth({ value: raw.depth }));
	}
	return Effect.succeed({ model, depth: raw.depth });
};

const isWellKnownModelProvider = (name: string): name is WellKnownModelProviderName =>
	(WELL_KNOWN_MODEL_PROVIDERS as ReadonlyArray<string>).includes(name);

const isModelProviderProtocol = (value: string): value is ModelProviderProtocol =>
	(MODEL_PROVIDER_PROTOCOLS as ReadonlyArray<string>).includes(value);

const isTable = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const invalidProviderConfiguration = (section: string, message: string) =>
	Effect.fail(new InvalidProviderConfiguration({ section, message }));

const parseOptionalStringField = (
	section: string,
	table: Record<string, unknown>,
	field: string,
): Effect.Effect<string | undefined, InvalidProviderConfiguration> => {
	const value = table[field];
	if (value === undefined) {
		return Effect.succeed(undefined);
	}
	if (typeof value !== "string" || value.trim() === "") {
		return invalidProviderConfiguration(section, `"${field}" must be a non-empty string.`);
	}
	return Effect.succeed(value);
};

const parseProviderBaseUrl = (
	section: string,
	table: Record<string, unknown>,
): Effect.Effect<string | undefined, InvalidProviderConfiguration> =>
	Effect.gen(function* () {
		const value = yield* parseOptionalStringField(section, table, "base_url");
		if (value === undefined) {
			return undefined;
		}
		const url = yield* Effect.try({
			try: () => new URL(value),
			catch: () =>
				new InvalidProviderConfiguration({
					section,
					message: `"base_url" must be an absolute URL, got "${value}".`,
				}),
		});
		// Provider endpoints are HTTP APIs; other schemes (file:, data:,
		// ftp:, ...) are configuration mistakes, not endpoints.
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return yield* invalidProviderConfiguration(section, `"base_url" must use http or https, got "${value}".`);
		}
		// The config file stays secrets-free (like the plaintext api_key
		// rejection); credentials belong in the api_key_env variable.
		if (url.username !== "" || url.password !== "") {
			return yield* invalidProviderConfiguration(
				section,
				'"base_url" must not embed credentials; use "api_key_env" to name the environment variable that holds the key.',
			);
		}
		return normalizeUrl(url);
	});

const PROVIDER_FIELDS = ["base_url", "protocol", "api_key_env"] as const;
const MODEL_ROUTE_FIELDS = ["provider", "model_id"] as const;

const rejectUnknownFields = (
	section: string,
	table: Record<string, unknown>,
	knownFields: ReadonlyArray<string>,
): Effect.Effect<void, InvalidProviderConfiguration> => {
	// All unknown fields are reported at once so multiple typos surface in a
	// single validation run instead of one per run.
	const unknownFields = Object.keys(table).filter((field) => !knownFields.includes(field));
	if (unknownFields.length === 0) {
		return Effect.void;
	}
	return invalidProviderConfiguration(
		section,
		`Unknown field${unknownFields.length > 1 ? "s" : ""} ${unknownFields
			.map((field) => `"${field}"`)
			.join(", ")}. Expected one of: ${knownFields.join(", ")}.`,
	);
};

const parseModelProviderEntry = (
	name: string,
	value: unknown,
): Effect.Effect<ModelProviderConfig, InvalidProviderConfiguration> =>
	Effect.gen(function* () {
		const section = `providers.${name}`;
		if (!isTable(value)) {
			return yield* invalidProviderConfiguration(section, "Expected a table of provider settings.");
		}
		if (value.api_key !== undefined) {
			return yield* invalidProviderConfiguration(
				section,
				'Plaintext "api_key" is not allowed; the config file stays secrets-free. Use "api_key_env" to name the environment variable that holds the key.',
			);
		}
		yield* rejectUnknownFields(section, value, PROVIDER_FIELDS);

		const baseUrl = yield* parseProviderBaseUrl(section, value);
		const apiKeyEnv = yield* parseOptionalStringField(section, value, "api_key_env");
		const protocol = yield* parseOptionalStringField(section, value, "protocol");

		if (isWellKnownModelProvider(name)) {
			if (protocol !== undefined) {
				return yield* invalidProviderConfiguration(
					section,
					`"protocol" cannot be overridden on the well-known provider "${name}"; its adapter fixes the protocol.`,
				);
			}
			return {
				_tag: "wellKnown",
				name,
				baseUrl,
				apiKeyEnv,
			} satisfies WellKnownModelProviderConfig;
		}

		if (baseUrl === undefined) {
			return yield* invalidProviderConfiguration(section, `Custom provider "${name}" requires "base_url".`);
		}
		if (protocol !== undefined && !isModelProviderProtocol(protocol)) {
			return yield* invalidProviderConfiguration(
				section,
				`"protocol" must be one of: ${MODEL_PROVIDER_PROTOCOLS.join(", ")}; got "${protocol}".`,
			);
		}
		return {
			_tag: "custom",
			name,
			baseUrl,
			protocol: protocol ?? "openai",
			apiKeyEnv,
		} satisfies CustomModelProviderConfig;
	});

const parseModelRouteEntry = (
	model: string,
	value: unknown,
	providers: ReadonlyArray<ModelProviderConfig>,
): Effect.Effect<ModelRouteConfig, InvalidProviderConfiguration> =>
	Effect.gen(function* () {
		const section = `models.${model}`;
		if (!isTable(value)) {
			return yield* invalidProviderConfiguration(section, "Expected a table of routing settings.");
		}
		yield* rejectUnknownFields(section, value, MODEL_ROUTE_FIELDS);

		const provider = yield* parseOptionalStringField(section, value, "provider");
		if (provider === undefined) {
			return yield* invalidProviderConfiguration(section, '"provider" is required.');
		}
		const modelId = yield* parseOptionalStringField(section, value, "model_id");

		const declared = isWellKnownModelProvider(provider) || providers.some((entry) => entry.name === provider);
		if (!declared) {
			return yield* invalidProviderConfiguration(
				section,
				`Provider "${provider}" is not well-known and is not declared under [providers].`,
			);
		}

		return { model, provider, modelId } satisfies ModelRouteConfig;
	});

/**
 * Structurally parses the `[providers]` and `[models]` tables from raw TOML
 * data. These tables have dynamic, user-chosen keys, so they bypass the
 * Effect `Config` descriptors (which address fixed keys) and are parsed
 * straight from the file source. Environment variables never contribute here:
 * provider topology is per-machine-stable file content by design.
 */
export const parseProviderTables = (
	raw: unknown,
): Effect.Effect<
	{
		readonly providers: ReadonlyArray<ModelProviderConfig>;
		readonly models: ReadonlyArray<ModelRouteConfig>;
	},
	InvalidProviderConfiguration
> =>
	Effect.gen(function* () {
		const root = isTable(raw) ? raw : {};

		const providersTable = root.providers;
		if (providersTable !== undefined && !isTable(providersTable)) {
			return yield* invalidProviderConfiguration("providers", "Expected [providers] to be a table.");
		}
		const providers: Array<ModelProviderConfig> = [];
		for (const [name, value] of Object.entries(providersTable ?? {})) {
			providers.push(yield* parseModelProviderEntry(name, value));
		}

		const modelsTable = root.models;
		if (modelsTable !== undefined && !isTable(modelsTable)) {
			return yield* invalidProviderConfiguration("models", "Expected [models] to be a table.");
		}
		const models: Array<ModelRouteConfig> = [];
		for (const [model, value] of Object.entries(modelsTable ?? {})) {
			models.push(yield* parseModelRouteEntry(model, value, providers));
		}

		return { providers, models };
	});

export const resolveConfigPath = (
	env: Record<string, string | undefined> = process.env,
): Effect.Effect<ConfigPathResolution, InvalidConfigPath> =>
	Effect.suspend(() => {
		const configuredPath = env[CONFIG_PATH_ENV];
		if (configuredPath !== undefined && configuredPath.trim() === "") {
			return Effect.fail(new InvalidConfigPath({ value: configuredPath }));
		}

		const path = configuredPath ?? DEFAULT_CONFIG_PATH;
		const source: ConfigPathResolution["source"] = configuredPath === undefined ? "default" : "env";
		return Effect.succeed({
			path: expandHome(path),
			source,
		});
	}).pipe(
		Effect.tap((path) =>
			Effect.annotateCurrentSpan({
				"skopeo.config.path": path.path,
				"skopeo.config.path_source": path.source,
			}),
		),
		Effect.tap((path) =>
			Effect.logDebug("Resolved config path", {
				path: path.path,
				source: path.source,
				pathEnvPresent: env[CONFIG_PATH_ENV] !== undefined,
			}),
		),
	);

export const loadSkopeoConfigFromEnvironment = (env: Record<string, string | undefined>) =>
	Effect.gen(function* () {
		const sources = yield* resolveConfigSources(env);
		return yield* parseEffectiveConfig(sources);
	});

export const loadSkopeoConfig = Effect.gen(function* () {
	const sources = yield* resolveConfigSources(process.env);
	return yield* parseEffectiveConfig(sources);
});

export const validateSkopeoConfigFromEnvironment = (env: Record<string, string | undefined>) =>
	Effect.gen(function* () {
		const sources = yield* resolveConfigSources(env);

		return yield* validateResolvedConfigSources(sources);
	}).pipe(Effect.withSpan("skopeo.config.validate.from_env"));

export const validateSkopeoConfig = Effect.gen(function* () {
	const sources = yield* resolveConfigSources(process.env);

	return yield* validateResolvedConfigSources(sources);
}).pipe(Effect.withSpan("skopeo.config.validate"));

const validateResolvedConfigSources = (sources: ResolvedConfigSources) =>
	Effect.gen(function* () {
		const fileStatus = yield* Result.match(sources.file, {
			onFailure: (error) => Effect.succeed(invalidStatus(formatConfigError(error))),
			onSuccess: (source) =>
				source._tag === "missingDefault"
					? Effect.succeed(warningStatus(`No config file found at ${sources.path.path}; using defaults.`))
					: Effect.gen(function* () {
							const parsed = yield* skopeoConfigDescriptor.parse(source.provider);
							yield* validateReviewSelection(parsed.review);
							yield* parseProviderTables(source.raw);
							return validStatus(`Config file is valid at ${sources.path.path}.`);
						}).pipe(Effect.catch((error) => Effect.succeed(invalidStatus(formatConfigError(error))))),
		});

		const envStatus = Result.match(sources.env, {
			onFailure: (error) => invalidStatus(formatConfigError(error)),
			onSuccess: () => validStatus("Environment overrides are valid."),
		});

		const effectiveResult = yield* Effect.result(parseEffectiveConfig(sources));

		const report = {
			path: sources.path,
			file: fileStatus,
			env: envStatus,
			effective: Result.isSuccess(effectiveResult)
				? validStatus("Valid Skopeo Configuration.")
				: invalidStatus(formatConfigError(effectiveResult.failure)),
			config: Result.isSuccess(effectiveResult) ? effectiveResult.success : undefined,
		};

		yield* Effect.annotateCurrentSpan({
			"skopeo.config.valid":
				report.file._tag !== "invalid" && report.env._tag !== "invalid" && report.effective._tag !== "invalid",
			"skopeo.config.file_validation_status": report.file._tag,
			"skopeo.config.env_validation_status": report.env._tag,
			"skopeo.config.effective_validation_status": report.effective._tag,
		});

		return report;
	});

export const initSkopeoConfigFromEnvironment = (env: Record<string, string | undefined>) =>
	Effect.gen(function* () {
		const path = yield* resolveConfigPath(env);
		return yield* initSkopeoConfigAtPath(path);
	});

export const initSkopeoConfig = Effect.gen(function* () {
	const path = yield* resolveConfigPath(process.env);

	return yield* initSkopeoConfigAtPath(path);
});

const initSkopeoConfigAtPath = (path: ConfigPathResolution) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs
			.exists(path.path)
			.pipe(Effect.mapError((cause) => makeConfigFileWriteError(path.path, cause)));

		yield* Effect.annotateCurrentSpan({
			"skopeo.config.exists": exists,
		});

		if (exists) {
			return yield* Effect.fail(new ConfigFileAlreadyExists({ path: path.path }));
		}

		yield* fs
			.makeDirectory(dirname(path.path), { recursive: true })
			.pipe(Effect.mapError((cause) => makeConfigFileWriteError(path.path, cause)));
		yield* fs
			.writeFileString(path.path, starterConfigToml)
			.pipe(Effect.mapError((cause) => makeConfigFileWriteError(path.path, cause)));

		yield* Effect.logInfo("Created Skopeo Configuration file", {
			path: path.path,
			source: path.source,
		});

		yield* Effect.annotateCurrentSpan({
			"skopeo.config.created": true,
		});

		return path;
	}).pipe(
		Effect.withSpan("skopeo.config.write_file", {
			attributes: {
				"skopeo.config.parent_directory": dirname(path.path),
				"file.operation": "write",
			},
		}),
	);

export class SkopeoConfig extends Context.Service<SkopeoConfig, SkopeoConfiguration>()("SkopeoConfig") {
	static readonly layer = Layer.effect(SkopeoConfig)(loadSkopeoConfig);
	static readonly layerFromEnvironment = (env: Record<string, string | undefined>) =>
		Layer.effect(SkopeoConfig)(loadSkopeoConfigFromEnvironment(env));
}

export const formatConfigError = (error: ConfigError | ConfigFileAlreadyExists): string => {
	switch (error._tag) {
		case "ConfigFileAlreadyExists":
			return `Config file already exists at ${error.path}.`;
		case "ConfigFileParseError":
			return `Could not parse config file at ${error.path}: ${error.message}`;
		case "ConfigFileWriteError":
			return `Could not write config file at ${error.path}: ${error.message}`;
		case "ExplicitConfigFileNotFound":
			return `Config file from ${CONFIG_PATH_ENV} does not exist at ${error.path}.`;
		case "InvalidConfigPath":
			return `Invalid ${CONFIG_PATH_ENV} value "${error.value}". Expected a non-empty path.`;
		case "InvalidDevToolsEnvironment":
			return `Invalid ${DEVTOOLS_ENV} value "${error.value}". Expected "true" or "false".`;
		case "InvalidProviderConfiguration":
			return `Invalid [${error.section}] configuration: ${error.message}`;
		case "InvalidReviewDepth":
			return `Invalid review depth "${error.value}". Expected one of: ${REVIEW_DEPTH_SETTINGS.join(", ")}.`;
		case "InvalidReviewDepthEnvironment":
			return `Invalid ${REVIEW_DEPTH_ENV} value "${error.value}". Expected one of: ${REVIEW_DEPTH_SETTINGS.join(", ")}.`;
		case "InvalidReviewModel":
			return `Invalid review model "${error.value}". Expected a non-empty model name.`;
		case "InvalidReviewModelEnvironment":
			return `Invalid ${REVIEW_MODEL_ENV} value "${error.value}". Expected a non-empty model name.`;
		case "InvalidTelemetryEndpoint":
			return `Invalid ${OTLP_ENDPOINT_ENV} value "${error.value}". Expected an absolute URL.`;
		case "InvalidTelemetryEnvironment":
			return `Invalid ${TELEMETRY_ENV} value "${error.value}". Expected "true" or "false".`;
		case "ConfigError":
			return error.message;
	}
};

const makeConfigFileWriteError = (path: string, cause: unknown) =>
	new ConfigFileWriteError({
		path,
		message: cause instanceof Error ? cause.message : String(cause),
		cause,
	});

const loadFileProvider = (
	path: ConfigPathResolution,
): Effect.Effect<ConfigFileSource, ConfigFileParseError | ExplicitConfigFileNotFound, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path.path).pipe(
			Effect.mapError(
				(cause) =>
					new ConfigFileParseError({
						path: path.path,
						message: cause.message,
						cause,
					}),
			),
		);

		yield* Effect.annotateCurrentSpan({
			"skopeo.config.file_present": exists,
		});

		if (!exists) {
			if (path.source === "env") {
				return yield* Effect.fail(new ExplicitConfigFileNotFound({ path: path.path }));
			}
			yield* Effect.annotateCurrentSpan({
				"skopeo.config.file_presence": "missing_default",
			});
			return {
				_tag: "missingDefault",
				provider: ConfigProvider.fromUnknown({}),
				raw: {},
			} satisfies ConfigFileSource;
		}

		const contents = yield* fs.readFileString(path.path).pipe(
			Effect.mapError(
				(cause) =>
					new ConfigFileParseError({
						path: path.path,
						message: cause.message,
						cause,
					}),
			),
		);
		const parsed = yield* Effect.try({
			try: () => Toml.parse(contents) as unknown,
			catch: (cause) =>
				new ConfigFileParseError({
					path: path.path,
					message: cause instanceof Error ? cause.message : String(cause),
					cause,
				}),
		});

		yield* Effect.annotateCurrentSpan({
			"skopeo.config.file_presence": "present",
		});

		return {
			_tag: "present",
			provider: ConfigProvider.fromUnknown(parsed),
			raw: parsed,
		} satisfies ConfigFileSource;
	}).pipe(
		Effect.withSpan("skopeo.config.load_file", {
			attributes: {
				"skopeo.config.path": path.path,
				"skopeo.config.path_source": path.source,
			},
		}),
	);

const loadEnvOverrideProvider = (
	env: Record<string, string | undefined> = process.env,
): Effect.Effect<ConfigSourceProvider, EnvOverrideError> =>
	Effect.gen(function* () {
		const enabled = yield* parseTelemetryEnabledEnv(env[TELEMETRY_ENV]);
		const otlpEndpoint = yield* parseTelemetryEndpointEnv(env[OTLP_ENDPOINT_ENV]);
		const devToolsEnabled = yield* parseDevToolsEnabledEnv(env[DEVTOOLS_ENV]);
		const reviewModel = yield* parseReviewModelEnv(env[REVIEW_MODEL_ENV]);
		const reviewDepth = yield* parseReviewDepthEnv(env[REVIEW_DEPTH_ENV]);

		yield* Effect.annotateCurrentSpan({
			"skopeo.telemetry.env_present": env[TELEMETRY_ENV] !== undefined,
			"skopeo.telemetry.endpoint_env_present": env[OTLP_ENDPOINT_ENV] !== undefined,
			"skopeo.devtools.env_present": env[DEVTOOLS_ENV] !== undefined,
			"skopeo.review.model_env_present": env[REVIEW_MODEL_ENV] !== undefined,
			"skopeo.review.depth_env_present": env[REVIEW_DEPTH_ENV] !== undefined,
		});

		return {
			provider: ConfigProvider.fromUnknown({
				telemetry: {
					...(enabled === undefined ? {} : { enabled }),
					...(otlpEndpoint === undefined ? {} : { otlp_endpoint: otlpEndpoint }),
				},
				devtools: {
					...(devToolsEnabled === undefined ? {} : { enabled: devToolsEnabled }),
				},
				review: {
					...(reviewModel === undefined ? {} : { model: reviewModel }),
					...(reviewDepth === undefined ? {} : { depth: reviewDepth }),
				},
			}),
		};
	}).pipe(Effect.withSpan("skopeo.config.load_env"));

const resolveConfigSources = (
	env: Record<string, string | undefined> = process.env,
): Effect.Effect<ResolvedConfigSources, InvalidConfigPath, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const path = yield* resolveConfigPath(env);
		const file = yield* Effect.result(loadFileProvider(path));
		const envOverrides = yield* Effect.result(loadEnvOverrideProvider(env));

		return {
			path,
			file,
			env: envOverrides,
		};
	});

const parseEffectiveConfig = (sources: ResolvedConfigSources): Effect.Effect<SkopeoConfiguration, ConfigError> =>
	Effect.gen(function* () {
		const file = yield* Result.match(sources.file, {
			onFailure: Effect.fail,
			onSuccess: Effect.succeed,
		});
		const env = yield* Result.match(sources.env, {
			onFailure: Effect.fail,
			onSuccess: Effect.succeed,
		});
		const provider = ConfigProvider.orElse(
			env.provider,
			ConfigProvider.orElse(file.provider, ConfigProvider.fromUnknown(defaultSkopeoConfiguration)),
		);

		const parsed = yield* skopeoConfigDescriptor.parse(provider);
		const review = yield* validateReviewSelection(parsed.review);
		const tables = yield* parseProviderTables(file.raw);

		const config: SkopeoConfiguration = {
			telemetry: parsed.telemetry,
			devtools: parsed.devtools,
			review,
			providers: tables.providers,
			models: tables.models,
		};

		yield* Effect.annotateCurrentSpan({
			"skopeo.config.effective_status": "valid",
			"skopeo.telemetry.enabled": config.telemetry.enabled,
			"skopeo.devtools.enabled": config.devtools.enabled,
			"skopeo.review.model": config.review.model,
			"skopeo.review.depth": config.review.depth,
			"skopeo.providers.declared_count": config.providers.length,
			"skopeo.models.routed_count": config.models.length,
		});

		return config;
	}).pipe(Effect.withSpan("skopeo.config.parse_effective"));

const validStatus = (message: string): ConfigSourceStatus => ({
	_tag: "valid",
	message,
});

const invalidStatus = (message: string): ConfigSourceStatus => ({
	_tag: "invalid",
	message,
});

const warningStatus = (message: string): ConfigSourceStatus => ({
	_tag: "warning",
	message,
});

const expandHome = (path: string): string => {
	if (path === "~") {
		return homedir();
	}
	if (path.startsWith("~/")) {
		return resolve(homedir(), path.slice(2));
	}
	return resolve(path);
};
