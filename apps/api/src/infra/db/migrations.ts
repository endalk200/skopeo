import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Effect } from "effect";
import { Database } from "./database.js";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/** Applies pending immutable Drizzle migrations and completes when the database is current. */
export const runDatabaseMigrations = Effect.flatMap(Database, (database) => migrate(database, { migrationsFolder }));
