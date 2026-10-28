ALTER TABLE "agent_credentials" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD COLUMN "last_used_at" timestamp with time zone;
