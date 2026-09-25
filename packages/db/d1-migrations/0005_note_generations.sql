CREATE TABLE `note_generations` (
	`attempt` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer,
	`created_at` integer NOT NULL,
	`failure` text,
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`recording_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_generations_note_id_unique` ON `note_generations` (`note_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_generations_recording_id_unique` ON `note_generations` (`recording_id`);--> statement-breakpoint
CREATE INDEX `note_generations_pending_idx` ON `note_generations` (`status`,`updated_at`) WHERE "note_generations"."status" in ('queued', 'generating');