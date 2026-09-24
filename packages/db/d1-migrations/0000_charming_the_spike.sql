CREATE TABLE `account` (
	`access_token` text,
	`access_token_expires_at` integer,
	`account_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`id_token` text,
	`password` text,
	`provider_id` text NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`scope` text,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`ip_address` text,
	`token` text NOT NULL,
	`updated_at` integer NOT NULL,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`image` text,
	`name` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `user_name_idx` ON `user` (`name`);--> statement-breakpoint
CREATE TABLE `verification` (
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `events` (
	`city` text NOT NULL,
	`created_at` integer NOT NULL,
	`description` text,
	`ends_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`organiser_id` text NOT NULL,
	`published_at` integer,
	`slug` text NOT NULL,
	`starts_at` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	`venue` text NOT NULL,
	FOREIGN KEY (`organiser_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "events_window_ck" CHECK(ends_at > starts_at)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unq` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_feed_idx` ON `events` (`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `events_organiser_idx` ON `events` (`organiser_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ticket_types` (
	`created_at` integer NOT NULL,
	`event_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`max_per_registration` integer DEFAULT 10 NOT NULL,
	`name` text NOT NULL,
	`price_poisha` integer NOT NULL,
	`quantity_claimed` integer DEFAULT 0 NOT NULL,
	`quantity_total` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ticket_types_price_ck" CHECK(price_poisha > 0),
	CONSTRAINT "ticket_types_claimed_ck" CHECK(quantity_claimed >= 0 AND quantity_claimed <= quantity_total),
	CONSTRAINT "ticket_types_max_per_reg_ck" CHECK(max_per_registration BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_types_event_name_unq` ON `ticket_types` (`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `ticket_types_event_idx` ON `ticket_types` (`event_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`external_ref` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`payload` text NOT NULL,
	`payment_id` text NOT NULL,
	`received_at` integer NOT NULL,
	`signature_verified` integer,
	`source` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_dedupe_unq` ON `payment_events` (`payment_id`,`external_ref`);--> statement-breakpoint
CREATE INDEX `payment_events_payment_idx` ON `payment_events` (`payment_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`amount_poisha` integer NOT NULL,
	`bkash_payment_id` text,
	`bkash_trx_id` text,
	`bkash_url` text,
	`created_at` integer NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`id` text PRIMARY KEY NOT NULL,
	`merchant_invoice_number` text NOT NULL,
	`refunded_poisha` integer DEFAULT 0 NOT NULL,
	`registration_id` text NOT NULL,
	`settled_at` integer,
	`status` text DEFAULT 'initiated' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_amount_ck" CHECK(amount_poisha > 0),
	CONSTRAINT "payments_refund_ck" CHECK(refunded_poisha >= 0 AND refunded_poisha <= amount_poisha)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_invoice_unq` ON `payments` (`merchant_invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_bkash_id_unq` ON `payments` (`bkash_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_live_per_reg_unq` ON `payments` (`registration_id`) WHERE status in ('initiated','executing','succeeded');--> statement-breakpoint
CREATE INDEX `payments_stale_sweep_idx` ON `payments` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `payments_registration_idx` ON `payments` (`registration_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `registration_items` (
	`quantity` integer NOT NULL,
	`registration_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`unit_price_poisha` integer NOT NULL,
	PRIMARY KEY(`registration_id`, `ticket_type_id`),
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "registration_items_qty_ck" CHECK(quantity > 0),
	CONSTRAINT "registration_items_price_ck" CHECK(unit_price_poisha >= 0)
);
--> statement-breakpoint
CREATE INDEX `registration_items_ticket_type_idx` ON `registration_items` (`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `registrations` (
	`attendee_id` text NOT NULL,
	`attendee_name` text NOT NULL,
	`attendee_phone` text NOT NULL,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`event_id` text NOT NULL,
	`hold_expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`released_at` integer,
	`release_reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_poisha` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`attendee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "registrations_total_ck" CHECK(total_poisha >= 0)
);
--> statement-breakpoint
CREATE INDEX `registrations_attendee_idx` ON `registrations` (`attendee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `registrations_event_status_idx` ON `registrations` (`event_id`,`status`);--> statement-breakpoint
CREATE INDEX `registrations_hold_sweep_idx` ON `registrations` (`status`,`hold_expires_at`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`checked_in_at` integer,
	`checked_in_by` text,
	`code` text NOT NULL,
	`event_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`issued_at` integer NOT NULL,
	`registration_id` text NOT NULL,
	`seq` integer NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`ticket_type_id` text NOT NULL,
	`voided_at` integer,
	FOREIGN KEY (`checked_in_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tickets_seq_ck" CHECK(seq > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_code_unq` ON `tickets` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_registration_seq_unq` ON `tickets` (`registration_id`,`seq`);--> statement-breakpoint
CREATE INDEX `tickets_event_status_idx` ON `tickets` (`event_id`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_registration_idx` ON `tickets` (`registration_id`);