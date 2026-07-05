import { assert, describe, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import * as PlatformError from "effect/PlatformError";

import {
	CONFIG_PATH_ENV,
	DEFAULT_OTLP_HTTP_ENDPOINT,
	DEVTOOLS_ENV,
	initSkopeoConfigFromEnvironment,
	loadSkopeoConfigFromEnvironment,
	OTLP_ENDPOINT_ENV,
	parseDevToolsEnabledEnv,
	parseProviderTables,
	parseReviewDepthEnv,
	parseReviewModelEnv,
	parseTelemetryEnabledEnv,
	parseTelemetryEndpointEnv,
	REVIEW_DEPTH_ENV,
	REVIEW_MODEL_ENV,
	resolveConfigPath,
	SkopeoConfig,
	TELEMETRY_ENV,
	validateSkopeoConfigFromEnvironment,
} from "./index.js";

const fileSystemLayer = (files: Record<string, string>) =>
	FileSystem.layerNoop({
		exists: (path) => Effect.succeed(Object.hasOwn(files, String(path))),
		readFileString: (path) => Effect.succeed(files[String(path)] ?? ""),
		makeDirectory: () => Effect.void,
		writeFileString: (path, data) =>
			Effect.sync(() => {
				files[String(path)] = data;
			}),
	});

describe("@skopeo/config", () => {
	it.effect("loads built-in defaults when the default config file is missing", () =>
		Effect.gen(function* () {
			const config = yield* loadSkopeoConfigFromEnvironment({});

			assert.deepStrictEqual(config, {
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
			});
		}).pipe(Effect.provide(fileSystemLayer({}))),
	);

	it.effect("uses env overrides before TOML file values", () =>
		Effect.gen(function* () {
			const config = yield* loadSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-config-test.toml",
				[OTLP_ENDPOINT_ENV]: "http://127.0.0.1:4318/",
			});

			assert.deepStrictEqual(config.telemetry, {
				enabled: true,
				otlpEndpoint: "http://127.0.0.1:4318",
			});
			assert.deepStrictEqual(config.devtools, {
				enabled: false,
			});
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-config-test.toml": `[telemetry]
enabled = true
otlp_endpoint = "http://localhost:9999"
`,
				}),
			),
		),
	);

	it.effect("loads DevTools configuration independently from telemetry", () =>
		Effect.gen(function* () {
			const fileOnly = yield* loadSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-devtools-config-test.toml",
			});
			assert.strictEqual(fileOnly.devtools.enabled, true);
			assert.strictEqual(fileOnly.telemetry.enabled, false);

			const envOverride = yield* loadSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-devtools-config-test.toml",
				[DEVTOOLS_ENV]: "false",
				[TELEMETRY_ENV]: "true",
			});
			assert.strictEqual(envOverride.devtools.enabled, false);
			assert.strictEqual(envOverride.telemetry.enabled, true);
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-devtools-config-test.toml": `[telemetry]
enabled = false

[devtools]
enabled = true
`,
				}),
			),
		),
	);

	it.effect("keeps SKOPEO_TELEMETRY strict", () =>
		Effect.gen(function* () {
			assert.strictEqual(yield* parseTelemetryEnabledEnv("true"), true);
			assert.strictEqual(yield* parseTelemetryEnabledEnv("false"), false);

			const invalid = yield* Effect.flip(parseTelemetryEnabledEnv("1"));

			assert.strictEqual(invalid._tag, "InvalidTelemetryEnvironment");
		}),
	);

	it.effect("keeps SKOPEO_DEVTOOLS strict", () =>
		Effect.gen(function* () {
			assert.strictEqual(yield* parseDevToolsEnabledEnv("true"), true);
			assert.strictEqual(yield* parseDevToolsEnabledEnv("false"), false);

			const invalid = yield* Effect.flip(parseDevToolsEnabledEnv("1"));

			assert.strictEqual(invalid._tag, "InvalidDevToolsEnvironment");
		}),
	);

	it.effect("parses SKOPEO_OTLP_ENDPOINT as an absolute URL override", () =>
		Effect.gen(function* () {
			assert.strictEqual(yield* parseTelemetryEndpointEnv(undefined), undefined);
			assert.strictEqual(yield* parseTelemetryEndpointEnv("http://127.0.0.1:4318/"), "http://127.0.0.1:4318");

			const invalid = yield* Effect.flip(parseTelemetryEndpointEnv("not-a-url"));

			assert.strictEqual(invalid._tag, "InvalidTelemetryEndpoint");
		}),
	);

	it.effect("rejects whitespace-only config paths", () =>
		Effect.gen(function* () {
			const invalid = yield* Effect.flip(resolveConfigPath({ [CONFIG_PATH_ENV]: "   " }));

			assert.strictEqual(invalid._tag, "InvalidConfigPath");
			assert.strictEqual(invalid.value, "   ");
		}),
	);

	it.effect("reports invalid file and env sources separately", () =>
		Effect.gen(function* () {
			const report = yield* validateSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-invalid-config-test.toml",
				[TELEMETRY_ENV]: "1",
				[DEVTOOLS_ENV]: "yes",
			});

			assert.strictEqual(report.file._tag, "invalid");
			assert.strictEqual(report.env._tag, "invalid");
			assert.strictEqual(report.effective._tag, "invalid");
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-invalid-config-test.toml": `[telemetry]
enabled = true
otlp_endpoint = "not-a-url"
`,
				}),
			),
		),
	);

	it.effect("does not hide an invalid file source behind valid env overrides during validation", () =>
		Effect.gen(function* () {
			const report = yield* validateSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-invalid-lower-precedence.toml",
				[OTLP_ENDPOINT_ENV]: "http://127.0.0.1:4318",
			});

			assert.strictEqual(report.file._tag, "invalid");
			assert.strictEqual(report.env._tag, "valid");
			assert.strictEqual(report.effective._tag, "valid");
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-invalid-lower-precedence.toml": `[telemetry]
enabled = true
otlp_endpoint = "not-a-url"
`,
				}),
			),
		),
	);

	it.effect("provides the resolved service through an Effect layer", () =>
		Effect.gen(function* () {
			const config = yield* SkopeoConfig;

			assert.strictEqual(config.telemetry.enabled, false);
		}).pipe(Effect.provide(SkopeoConfig.layerFromEnvironment({})), Effect.provide(fileSystemLayer({}))),
	);

	it.effect("loads the Default Review Profile selection from the config file", () =>
		Effect.gen(function* () {
			const config = yield* loadSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-review-config-test.toml",
			});

			assert.deepStrictEqual(config.review, {
				model: "claude-opus-4-8",
				depth: "thorough",
			});
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-review-config-test.toml": `[review]
model = "claude-opus-4-8"
depth = "thorough"
`,
				}),
			),
		),
	);

	it.effect("prefers SKOPEO_REVIEW_MODEL and SKOPEO_REVIEW_DEPTH over the config file", () =>
		Effect.gen(function* () {
			const config = yield* loadSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-review-env-test.toml",
				[REVIEW_MODEL_ENV]: "gpt-5.4",
				[REVIEW_DEPTH_ENV]: "quick",
			});

			assert.deepStrictEqual(config.review, {
				model: "gpt-5.4",
				depth: "quick",
			});
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-review-env-test.toml": `[review]
model = "claude-opus-4-8"
depth = "thorough"
`,
				}),
			),
		),
	);

	it.effect("keeps SKOPEO_REVIEW_DEPTH and SKOPEO_REVIEW_MODEL strict", () =>
		Effect.gen(function* () {
			assert.strictEqual(yield* parseReviewDepthEnv("thorough"), "thorough");
			assert.strictEqual(yield* parseReviewDepthEnv(undefined), undefined);
			assert.strictEqual(yield* parseReviewModelEnv("gpt-5.5"), "gpt-5.5");
			assert.strictEqual(yield* parseReviewModelEnv(undefined), undefined);

			const invalidDepth = yield* Effect.flip(parseReviewDepthEnv("deep"));
			assert.strictEqual(invalidDepth._tag, "InvalidReviewDepthEnvironment");

			const invalidModel = yield* Effect.flip(parseReviewModelEnv("   "));
			assert.strictEqual(invalidModel._tag, "InvalidReviewModelEnvironment");
		}),
	);

	it.effect("keeps a file-loaded config available when env overrides are invalid", () =>
		Effect.gen(function* () {
			const report = yield* validateSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-file-valid-env-invalid.toml",
				[REVIEW_DEPTH_ENV]: "deep",
			});

			assert.strictEqual(report.file._tag, "valid");
			assert.strictEqual(report.env._tag, "invalid");
			assert.strictEqual(report.effective._tag, "invalid");
			assert.strictEqual(report.config, undefined);
			assert.strictEqual(report.modelAccessConfig?.review.model, "gpt-5.5");
			assert.deepStrictEqual(report.modelAccessConfig?.models, [
				{
					model: "claude-opus-4-8",
					provider: "my-gateway",
					modelId: undefined,
				},
			]);
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-file-valid-env-invalid.toml": `[providers.my-gateway]
base_url = "https://llm.corp.example/v1"
protocol = "openai"

[models."claude-opus-4-8"]
provider = "my-gateway"
`,
				}),
			),
		),
	);

	it.effect("rejects an unknown Review Depth in the config file", () =>
		Effect.gen(function* () {
			const report = yield* validateSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-bad-depth.toml",
			});

			assert.strictEqual(report.file._tag, "invalid");
			assert.strictEqual(report.effective._tag, "invalid");
			assert.include(report.file.message, "Invalid review depth");
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-bad-depth.toml": `[review]
depth = "deep"
`,
				}),
			),
		),
	);

	it.effect("parses well-known, custom, and routed Model Provider tables", () =>
		Effect.gen(function* () {
			const config = yield* loadSkopeoConfigFromEnvironment({
				[CONFIG_PATH_ENV]: "/tmp/skopeo-providers.toml",
			});

			assert.deepStrictEqual(config.providers, [
				{
					_tag: "wellKnown",
					name: "openai",
					baseUrl: "https://azure-openai.example/v1",
					apiKeyEnv: "MY_OPENAI_KEY",
				},
				{
					_tag: "custom",
					name: "my-gateway",
					baseUrl: "https://llm.corp.example/v1",
					protocol: "anthropic",
					apiKeyEnv: undefined,
				},
			]);
			assert.deepStrictEqual(config.models, [
				{
					model: "claude-opus-4-8",
					provider: "my-gateway",
					modelId: "corp-opus-prod",
				},
			]);
		}).pipe(
			Effect.provide(
				fileSystemLayer({
					"/tmp/skopeo-providers.toml": `[providers.openai]
base_url = "https://azure-openai.example/v1"
api_key_env = "MY_OPENAI_KEY"

[providers.my-gateway]
base_url = "https://llm.corp.example/v1"
protocol = "anthropic"

[models."claude-opus-4-8"]
provider = "my-gateway"
model_id = "corp-opus-prod"
`,
				}),
			),
		),
	);

	it.effect("rejects plaintext api_key in provider tables", () =>
		Effect.gen(function* () {
			const failure = yield* Effect.flip(
				parseProviderTables({
					providers: { openai: { api_key: "sk-secret" } },
				}),
			);

			assert.strictEqual(failure._tag, "InvalidProviderConfiguration");
			assert.strictEqual(failure.section, "providers.openai");
			assert.include(failure.message, "api_key_env");
		}),
	);

	it.effect("rejects structural provider table problems", () =>
		Effect.gen(function* () {
			const protocolOverride = yield* Effect.flip(
				parseProviderTables({ providers: { anthropic: { protocol: "openai" } } }),
			);
			assert.include(protocolOverride.message, "cannot be overridden");

			const missingBaseUrl = yield* Effect.flip(parseProviderTables({ providers: { "my-gateway": {} } }));
			assert.include(missingBaseUrl.message, 'requires "base_url"');

			const badProtocol = yield* Effect.flip(
				parseProviderTables({
					providers: { "my-gateway": { base_url: "https://x.example", protocol: "grpc" } },
				}),
			);
			assert.include(badProtocol.message, '"protocol" must be one of');

			const badUrl = yield* Effect.flip(
				parseProviderTables({ providers: { "my-gateway": { base_url: "not-a-url" } } }),
			);
			assert.include(badUrl.message, "absolute URL");

			const badScheme = yield* Effect.flip(
				parseProviderTables({ providers: { "my-gateway": { base_url: "file:///etc/passwd" } } }),
			);
			assert.include(badScheme.message, "must use http or https");

			const mailto = yield* Effect.flip(
				parseProviderTables({ providers: { "my-gateway": { base_url: "mailto:ops@example.com" } } }),
			);
			assert.include(mailto.message, "must use http or https");

			const credentialed = yield* Effect.flip(
				parseProviderTables({
					providers: { "my-gateway": { base_url: "https://user:secret@llm.corp.example/v1" } },
				}),
			);
			assert.include(credentialed.message, "must not embed credentials");
			assert.notInclude(credentialed.message, "secret");

			const unknownField = yield* Effect.flip(
				parseProviderTables({
					providers: { openai: { api_key_evn: "OOPS" } },
				}),
			);
			assert.include(unknownField.message, 'Unknown field "api_key_evn"');
		}),
	);

	it.effect("rejects model routes that reference undeclared providers", () =>
		Effect.gen(function* () {
			const failure = yield* Effect.flip(
				parseProviderTables({
					models: { "gpt-5.5": { provider: "my-gateway" } },
				}),
			);

			assert.strictEqual(failure.section, "models.gpt-5.5");
			assert.include(failure.message, "not declared under [providers]");

			const missingProvider = yield* Effect.flip(
				parseProviderTables({
					models: { "gpt-5.5": {} },
				}),
			);
			assert.include(missingProvider.message, '"provider" is required');
		}),
	);

	it.effect("allows model routes to well-known providers without declarations", () =>
		Effect.gen(function* () {
			const tables = yield* parseProviderTables({
				models: { "gpt-5.5": { provider: "openrouter" } },
			});

			assert.deepStrictEqual(tables.models, [{ model: "gpt-5.5", provider: "openrouter", modelId: undefined }]);
		}),
	);

	it.effect("initializes a starter config file without overwriting", () =>
		Effect.gen(function* () {
			const files: Record<string, string> = {};
			const env = { [CONFIG_PATH_ENV]: "/tmp/skopeo-init-config-test.toml" };
			const path = yield* initSkopeoConfigFromEnvironment(env).pipe(Effect.provide(fileSystemLayer(files)));

			assert.strictEqual(path.path, "/tmp/skopeo-init-config-test.toml");
			assert.include(files["/tmp/skopeo-init-config-test.toml"] ?? "", "[telemetry]");
			assert.include(files["/tmp/skopeo-init-config-test.toml"] ?? "", "[devtools]");

			const alreadyExists = yield* Effect.flip(
				initSkopeoConfigFromEnvironment(env).pipe(Effect.provide(fileSystemLayer(files))),
			);

			assert.strictEqual(alreadyExists._tag, "ConfigFileAlreadyExists");
		}),
	);

	it.effect("maps config init filesystem failures to config write errors", () =>
		Effect.gen(function* () {
			const path = "/tmp/skopeo-init-write-failure.toml";
			const cause = PlatformError.systemError({
				_tag: "PermissionDenied",
				module: "FileSystem",
				method: "makeDirectory",
				pathOrDescriptor: "/tmp",
			});

			const failure = yield* Effect.flip(
				initSkopeoConfigFromEnvironment({ [CONFIG_PATH_ENV]: path }).pipe(
					Effect.provide(
						FileSystem.layerNoop({
							exists: () => Effect.succeed(false),
							makeDirectory: () => Effect.fail(cause),
						}),
					),
				),
			);

			assert.strictEqual(failure._tag, "ConfigFileWriteError");
			if (failure._tag !== "ConfigFileWriteError") {
				return;
			}
			assert.strictEqual(failure.path, path);
			assert.include(failure.message, "PermissionDenied");
		}),
	);
});
