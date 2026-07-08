CREATE TYPE "source_control_provider" AS ENUM('github', 'gitlab');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"source_control_provider" "source_control_provider" NOT NULL,
	"source_control_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_active_source_control_url_unique" ON "projects" ("source_control_url") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "projects_deleted_at_idx" ON "projects" ("deleted_at");