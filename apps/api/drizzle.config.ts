import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	out: "./drizzle",
	schema: "./src/infra/db/schema.ts",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/skopeo",
	},
});
