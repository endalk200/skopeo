import { Config, Context, Effect, Layer, type Redacted, Schema } from "effect";

export type AppConfigShape = {
	readonly databaseUrl: Redacted.Redacted<string>;
	readonly host: string;
	readonly port: number;
};

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()("skopeo/api/AppConfig") {}

const descriptor = Config.all({
	databaseUrl: Config.schema(Schema.Redacted(Schema.String), "DATABASE_URL"),
	host: Config.schema(Schema.String, "HOST").pipe(Config.withDefault("0.0.0.0")),
	port: Config.schema(Schema.Int, "PORT").pipe(Config.withDefault(3000)),
});

export const AppConfigLive = Layer.effect(
	AppConfig,
	Effect.map(descriptor, (config) => AppConfig.of(config)),
);
