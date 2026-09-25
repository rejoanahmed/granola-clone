CREATE TABLE `user_settings` (
	`chat_dictation_auto_send` integer NOT NULL,
	`notify_upcoming_meetings` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`use_data_for_training` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
