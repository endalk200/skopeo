import { createRequire } from "node:module";
import { assert, describe, it } from "@effect/vitest";
import { CodeReviewAgent, CodeReviewAgentRuntimeError } from "@skopeo/code-review-agent";
import {
	CONFIG_PATH_ENV,
	type ConfigValidationReport,
	DEVTOOLS_ENV,
	InvalidConfigPath,
	OTLP_ENDPOINT_ENV,
	parseDevToolsEnabledEnv,
	parseTelemetryEnabledEnv,
	parseTelemetryEndpointEnv,
	TELEMETRY_ENV,
} from "@skopeo/config";
import { Effect, FileSystem, Layer, Logger, Path, Stdio, Terminal } from "effect";
import { TestConsole } from "effect/testing";
import { CliOutput } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { configValidationHasFailures, formatConfigValidationReport } from "./cli/commands/config/validate.cmd.js";
import { runCliWithArgs } from "./cli/run.js";
import { handleCliFailure } from "./runtime/failures.js";
import {
	DEFAULT_OTLP_HTTP_ENDPOINT,
	telemetryLayerFromConfiguration,
	withoutConsoleLogger,
} from "./runtime/telemetry.js";

const require = createRequire(import.meta.url);
const cliPackage = require("../package.json") as { readonly version: string };

const TerminalLayer = Layer.succeed(
	Terminal.Terminal,
	Terminal.make({
		columns: Effect.succeed(80),
		rows: Effect.succeed(24),
		display: () => Effect.void,
		readInput: Effect.die("readInput is not implemented in CLI tests"),
		readLine: Effect.succeed(""),
	}),
);

const SpawnerLayer = Layer.succeed(
	ChildProcessSpawner.ChildProcessSpawner,
	ChildProcessSpawner.make(() => Effect.die("Child process spawning is not implemented in CLI tests")),
);

const defaultReviewEffect: Effect.Effect<string, CodeReviewAgentRuntimeError> = Effect.succeed(
	"Skopeo reviewed 0 changed files. No review findings.",
);

const codeReviewAgentTestLayer = (
	reviewEffect: Effect.Effect<string, CodeReviewAgentRuntimeError> = defaultReviewEffect,
) =>
	Layer.succeed(CodeReviewAgent, {
		reviewLocalWorktree: () => reviewEffect,
	});

const cliTestLayer = (
	files: Record<string, string> = {},
	reviewEffect: Effect.Effect<string, CodeReviewAgentRuntimeError> = defaultReviewEffect,
) =>
	Layer.mergeAll(
		TestConsole.layer,
		FileSystem.layerNoop({
			exists: (path) => Effect.succeed(Object.hasOwn(files, String(path))),
			readFileString: (path) => Effect.succeed(files[String(path)] ?? ""),
			makeDirectory: () => Effect.void,
			writeFileString: (path, data) =>
				Effect.sync(() => {
					files[String(path)] = data;
				}),
		}),
		Path.layer,
		TerminalLayer,
		CliOutput.layer(CliOutput.defaultFormatter({ colors: false })),
		SpawnerLayer,
		codeReviewAgentTestLayer(reviewEffect),
		Stdio.layerTest({}),
		withoutConsoleLogger,
	);

const skopeoEnvKeys = [CONFIG_PATH_ENV, TELEMETRY_ENV, OTLP_ENDPOINT_ENV, DEVTOOLS_ENV] as const;

const withIsolatedSkopeoEnvironment = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	Effect.suspend(() => {
		const previous = Object.fromEntries(skopeoEnvKeys.map((key) => [key, process.env[key]]));

		for (const key of skopeoEnvKeys) {
			delete process.env[key];
		}

		return effect.pipe(
			Effect.ensuring(
				Effect.sync(() => {
					for (const key of skopeoEnvKeys) {
						const value = previous[key];
						if (value === undefined) {
							delete process.env[key];
						} else {
							process.env[key] = value;
						}
					}
				}),
			),
		);
	});

const runSkopeoCommand = (
	args: ReadonlyArray<string>,
	files: Record<string, string> = {},
	reviewEffect: Effect.Effect<string, CodeReviewAgentRuntimeError> = defaultReviewEffect,
) =>
	Effect.gen(function* () {
		yield* runCliWithArgs(args);

		return {
			stdout: yield* TestConsole.logLines,
			stderr: yield* TestConsole.errorLines,
		};
	}).pipe(withIsolatedSkopeoEnvironment, Effect.provide(cliTestLayer(files, reviewEffect)));

describe("skopeo CLI", () => {
	it.effect("prints root help and succeeds when invoked without arguments", () =>
		Effect.gen(function* () {
			const { stdout } = yield* runSkopeoCommand([]);
			const stdoutText = stdout.join("\n");

			assert.include(stdoutText, "skopeo <subcommand> [flags]");
			assert.include(stdoutText, "Analyze code changes");
			assert.include(stdoutText, "config");
			assert.include(stdoutText, "review");
			assert.include(stdoutText, "version");
		}),
	);

	it.effect("prints the package version with the version command", () =>
		Effect.gen(function* () {
			const { stdout } = yield* runSkopeoCommand(["version"]);

			assert.deepStrictEqual(stdout, [cliPackage.version]);
		}),
	);

	it.effect("prints the effective config path", () =>
		Effect.gen(function* () {
			const { stdout } = yield* runSkopeoCommand(["config", "path"]);
			const normalizedPath = String(stdout[0] ?? "").replaceAll("\\", "/");

			assert.strictEqual(normalizedPath.endsWith("/.skopeo/config.toml"), true);
		}),
	);

	it.effect("validates the missing default config with defaults", () =>
		Effect.gen(function* () {
			const { stdout } = yield* runSkopeoCommand(["config", "validate"]);
			const stdoutText = stdout.join("\n");

			assert.include(stdoutText, "No config file found");
			assert.include(stdoutText, "Environment overrides are valid");
			assert.include(stdoutText, "Valid Skopeo Configuration.");
		}),
	);

	it.effect("formats config validation output and failure policy in one place", () =>
		Effect.sync(() => {
			const report: ConfigValidationReport = {
				path: { path: "/tmp/skopeo.toml", source: "env" },
				file: { _tag: "valid", message: "file ok" },
				env: { _tag: "valid", message: "env ok" },
				effective: { _tag: "invalid", message: "effective invalid" },
				config: undefined,
			};

			assert.deepStrictEqual(formatConfigValidationReport(report), ["file ok", "env ok", "effective invalid"]);
			assert.strictEqual(configValidationHasFailures(report), true);
		}),
	);

	it.effect("keeps telemetry env parsing in Skopeo Configuration", () =>
		Effect.gen(function* () {
			assert.strictEqual(yield* parseTelemetryEnabledEnv(undefined), undefined);
			assert.strictEqual(yield* parseTelemetryEnabledEnv("false"), false);
			assert.strictEqual(yield* parseTelemetryEnabledEnv("true"), true);
			assert.strictEqual(yield* parseTelemetryEndpointEnv(undefined), undefined);
			assert.strictEqual(yield* parseTelemetryEndpointEnv("http://127.0.0.1:27686/"), "http://127.0.0.1:27686");

			const invalid = yield* Effect.flip(parseTelemetryEnabledEnv("1"));

			assert.strictEqual(invalid._tag, "InvalidTelemetryEnvironment");
			assert.strictEqual(invalid.value, "1");
		}),
	);

	it.effect("keeps DevTools env parsing in Skopeo Configuration", () =>
		Effect.gen(function* () {
			assert.strictEqual(yield* parseDevToolsEnabledEnv(undefined), undefined);
			assert.strictEqual(yield* parseDevToolsEnabledEnv("false"), false);
			assert.strictEqual(yield* parseDevToolsEnabledEnv("true"), true);

			const invalid = yield* Effect.flip(parseDevToolsEnabledEnv("1"));

			assert.strictEqual(invalid._tag, "InvalidDevToolsEnvironment");
			assert.strictEqual(invalid.value, "1");
		}),
	);

	it.effect("builds disabled telemetry from resolved Skopeo Configuration", () =>
		Effect.gen(function* () {
			const loggers = yield* Logger.CurrentLoggers;

			assert.strictEqual(loggers.size, 0);
		}).pipe(
			Effect.provide(
				telemetryLayerFromConfiguration({
					telemetry: {
						enabled: false,
						otlpEndpoint: DEFAULT_OTLP_HTTP_ENDPOINT,
					},
					devtools: {
						enabled: true,
					},
				}),
			),
		),
	);

	it.effect("disables telemetry with a warning when the configured collector is unavailable", () =>
		Effect.gen(function* () {
			const previousFetch = globalThis.fetch;
			globalThis.fetch = (() => Promise.reject(new Error("collector unavailable"))) as typeof fetch;

			yield* Effect.gen(function* () {
				const loggers = yield* Logger.CurrentLoggers;
				const stderr = yield* TestConsole.errorLines;

				assert.strictEqual(loggers.size, 0);
				assert.deepStrictEqual(stderr, [
					"Warning: OTLP collector unreachable at http://127.0.0.1:65535; telemetry disabled.",
				]);
			}).pipe(
				Effect.provide(
					telemetryLayerFromConfiguration({
						telemetry: {
							enabled: true,
							otlpEndpoint: "http://127.0.0.1:65535",
						},
						devtools: {
							enabled: false,
						},
					}),
				),
				Effect.ensuring(
					Effect.sync(() => {
						globalThis.fetch = previousFetch;
					}),
				),
			);
		}).pipe(Effect.provide(TestConsole.layer)),
	);

	it.effect("keeps telemetry enabled when collector rejects OPTIONS with 404", () =>
		Effect.gen(function* () {
			const previousFetch = globalThis.fetch;
			globalThis.fetch = (() => Promise.resolve(new Response(null, { status: 404 }))) as typeof fetch;

			yield* Effect.gen(function* () {
				const loggers = yield* Logger.CurrentLoggers;
				const stderr = yield* TestConsole.errorLines;

				assert.strictEqual(loggers.size, 1);
				assert.deepStrictEqual(stderr, []);
			}).pipe(
				Effect.provide(
					telemetryLayerFromConfiguration({
						telemetry: {
							enabled: true,
							otlpEndpoint: "http://127.0.0.1:27686",
						},
						devtools: {
							enabled: false,
						},
					}),
				),
				Effect.ensuring(
					Effect.sync(() => {
						globalThis.fetch = previousFetch;
					}),
				),
			);
		}).pipe(Effect.provide(TestConsole.layer)),
	);

	it.effect("removes the default console loggers when telemetry is disabled", () =>
		Effect.gen(function* () {
			const loggers = yield* Logger.CurrentLoggers;

			assert.strictEqual(loggers.size, 0);
		}).pipe(Effect.provide(withoutConsoleLogger)),
	);

	it.effect("prints CLI failures to stderr through the failure reporting module", () =>
		Effect.gen(function* () {
			const error = new InvalidConfigPath({ value: "" });
			yield* Effect.flip(handleCliFailure.InvalidConfigPath(error));

			const stderr = yield* TestConsole.errorLines;

			assert.deepStrictEqual(stderr, ['Invalid SKOPEO_CONFIG_PATH value "". Expected a non-empty path.']);
		}).pipe(Effect.provide(TestConsole.layer)),
	);

	it.effect("prints review command help without exposing internal controls", () =>
		Effect.gen(function* () {
			const { stdout } = yield* runSkopeoCommand(["review", "--help"]);
			const stdoutText = stdout.join("\n");

			assert.include(stdoutText, "Review local code changes.");
			assert.notInclude(stdoutText, "profile");
			assert.notInclude(stdoutText, "model");
			assert.notInclude(stdoutText, "json");
			assert.notInclude(stdoutText, "verbose");
			assert.notInclude(stdoutText, "devtools");
		}),
	);

	it.effect("prints only the Code Review Agent report on successful review", () =>
		Effect.gen(function* () {
			const { stdout, stderr } = yield* runSkopeoCommand(
				["review"],
				{},
				Effect.succeed("Skopeo reviewed 1 changed files. Found 1 review findings."),
			);

			assert.deepStrictEqual(stdout, ["Skopeo reviewed 1 changed files. Found 1 review findings."]);
			assert.deepStrictEqual(stderr, []);
		}),
	);

	it.effect("prints exact empty Review Target report", () =>
		Effect.gen(function* () {
			const { stdout } = yield* runSkopeoCommand(
				["review"],
				{},
				Effect.succeed("Skopeo reviewed 0 changed files. No review findings."),
			);

			assert.deepStrictEqual(stdout, ["Skopeo reviewed 0 changed files. No review findings."]);
		}),
	);

	it.effect("reports review runtime failures to stderr without partial stdout", () =>
		Effect.gen(function* () {
			const failure = yield* Effect.flip(
				runSkopeoCommand(
					["review"],
					{},
					Effect.fail(
						new CodeReviewAgentRuntimeError({
							message: "Code Review Agent failed to complete the review.",
						}),
					),
				).pipe(Effect.catchTag("CodeReviewAgentRuntimeError", handleCliFailure.CodeReviewAgentRuntimeError)),
			);
			const stderr = yield* TestConsole.errorLines;
			const stdout = yield* TestConsole.logLines;

			assert.strictEqual(failure._tag, "CodeReviewAgentRuntimeError");
			assert.deepStrictEqual(stdout, []);
			assert.deepStrictEqual(stderr, ["Code Review Agent failed to complete the review."]);
		}),
	);
});
