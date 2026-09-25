CREATE TABLE `folder_notes` (
	`added_at` integer NOT NULL,
	`folder_id` text NOT NULL,
	`note_id` text NOT NULL,
	PRIMARY KEY(`folder_id`, `note_id`),
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folder_notes_note_idx` ON `folder_notes` (`note_id`);--> statement-breakpoint
CREATE TABLE `folders` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_owner_name_key_uq` ON `folders` (`owner_id`,`name_key`);