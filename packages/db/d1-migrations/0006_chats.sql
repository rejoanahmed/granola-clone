CREATE TABLE `chat_messages` (
	`activity` text DEFAULT '[]' NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`failure` text,
	`feedback` text,
	`id` text PRIMARY KEY NOT NULL,
	`model` text,
	`owner_id` text NOT NULL,
	`position` integer NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`thread_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_thread_position_idx` ON `chat_messages` (`thread_id`,`position`);--> statement-breakpoint
CREATE INDEX `chat_messages_streaming_idx` ON `chat_messages` (`thread_id`) WHERE "chat_messages"."status" = 'streaming';--> statement-breakpoint
CREATE TABLE `chat_preferences` (
	`model` text NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`pinned_at` integer,
	`scope_kind` text NOT NULL,
	`scope_note_id` text,
	`scope_person_key` text,
	`scope_person_name` text,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scope_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_threads_scope" CHECK(("chat_threads"."scope_kind" = 'global' and "chat_threads"."scope_note_id" is null and "chat_threads"."scope_person_key" is null and "chat_threads"."scope_person_name" is null)
        or ("chat_threads"."scope_kind" = 'note' and "chat_threads"."scope_note_id" is not null and "chat_threads"."scope_person_key" is null and "chat_threads"."scope_person_name" is null)
        or ("chat_threads"."scope_kind" = 'person' and "chat_threads"."scope_note_id" is null and "chat_threads"."scope_person_key" is not null and "chat_threads"."scope_person_name" is not null))
);
--> statement-breakpoint
CREATE INDEX `chat_threads_owner_order_idx` ON `chat_threads` (`owner_id`,`pinned_at`,"updated_at" desc,"id" desc);