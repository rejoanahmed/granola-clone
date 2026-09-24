CREATE TABLE `email_outbox` (
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_outbox_recipient_created_idx` ON `email_outbox` (`recipient`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`company_description` text,
	`company_name` text,
	`created_at` integer NOT NULL,
	`job_title` text,
	`linkedin_username` text,
	`onboarded_at` integer,
	`updated_at` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	`user_type` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
