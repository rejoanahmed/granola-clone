CREATE TABLE `note_attendees` (
	`created_at` integer NOT NULL,
	`email` text,
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`note_id` text NOT NULL,
	`position` integer NOT NULL,
	`user_id` text,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "note_attendees_identified" CHECK("note_attendees"."name" is not null or "note_attendees"."email" is not null or "note_attendees"."user_id" is not null)
);
--> statement-breakpoint
CREATE INDEX `note_attendees_note_idx` ON `note_attendees` (`note_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`body_markdown` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source` text NOT NULL,
	`started_at` integer NOT NULL,
	`title` text NOT NULL,
	`trashed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_owner_live_idx` ON `notes` (`owner_id`,"started_at" desc,"id" desc) WHERE "notes"."trashed_at" is null;