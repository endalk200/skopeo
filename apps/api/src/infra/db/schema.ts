import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const sourceControlProvider = pgEnum("source_control_provider", ["github", "gitlab"] as const);

export const projects = pgTable(
	"projects",
	{
		id: uuid("id").defaultRandom().primaryKey().notNull(),
		name: text("name").notNull(),
		sourceControlProvider: sourceControlProvider("source_control_provider").notNull(),
		sourceControlUrl: text("source_control_url").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("projects_active_source_control_url_unique")
			.on(table.sourceControlUrl)
			.where(sql`deleted_at IS NULL`),
		index("projects_deleted_at_idx").on(table.deletedAt),
	],
);
