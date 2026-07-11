import { Config, Context, Effect, Layer, type Option, type Redacted } from "effect";

export type AppConfigShape = {
	readonly databaseUrl: Redacted.Redacted<string>;
	readonly host: string;
	readonly otlpBaseUrl: Option.Option<string>;
	readonly port: number;
};

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()("skopeo/api/AppConfig") {}

const descriptor = Config.all({
	databaseUrl: Config.redacted("DATABASE_URL"),
	host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
	otlpBaseUrl: Config.url("OTLP_BASE_URL").pipe(
		// Otlp appends /v1/{logs,metrics,traces}; strip URL's trailing slash.
		Config.map((url) => url.toString().replace(/\/$/, "")),
		Config.option,
	),
	port: Config.port("PORT").pipe(Config.withDefault(4000)),
});

export const AppConfigLive = Layer.effect(
	AppConfig,
	Effect.map(descriptor, (config) => AppConfig.of(config)),
);
