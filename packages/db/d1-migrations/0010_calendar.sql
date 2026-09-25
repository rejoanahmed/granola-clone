CREATE TABLE `fake_calendar_events` (
	`attendees` text NOT NULL,
	`color` text,
	`created_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`id` text NOT NULL,
	`start_at` integer NOT NULL,
	`title` text,
	`user_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fake_calendar_events_user_start_idx` ON `fake_calendar_events` (`user_id`,`start_at`);--> statement-breakpoint
ALTER TABLE `notes` ADD `calendar_event_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `notes_owner_event_live_idx` ON `notes` (`owner_id`,`calendar_event_id`) WHERE "notes"."calendar_event_id" is not null and "notes"."trashed_at" is null;