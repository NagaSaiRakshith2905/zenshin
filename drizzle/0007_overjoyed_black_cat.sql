ALTER TABLE "github_installations" ADD COLUMN "request_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "github_installations" ADD COLUMN "request_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_installations" ADD COLUMN "next_request_at" timestamp with time zone DEFAULT now() NOT NULL;