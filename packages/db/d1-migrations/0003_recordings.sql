CREATE TABLE `e2e_switches` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recordings` (
	`audio_key` text,
	`created_at` integer NOT NULL,
	`duration_ms` integer,
	`ended_at` integer,
	`failure` text,
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`private_notes` text DEFAULT '' NOT NULL,
	`provider_job_id` text,
	`started_at` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recordings_note_id_unique` ON `recordings` (`note_id`);--> statement-breakpoint
CREATE INDEX `recordings_transcribing_idx` ON `recordings` (`status`,`updated_at`) WHERE "recordings"."status" = 'transcribing';--> statement-breakpoint
CREATE TABLE `transcript_segments` (
	`end_ms` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`recording_id` text NOT NULL,
	`speaker` text NOT NULL,
	`start_ms` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transcript_segments_position_uq` ON `transcript_segments` (`recording_id`,`position`);