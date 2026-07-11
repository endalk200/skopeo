import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { AppConfigLive } from "./config/app-config.js";
import { DatabaseLive } from "./infra/db/database.js";
import { runDatabaseMigrations } from "./infra/db/migrations.js";

const program = runDatabaseMigrations.pipe(Effect.provide(DatabaseLive), Effect.provide(AppConfigLive));

NodeRuntime.runMain(program);
