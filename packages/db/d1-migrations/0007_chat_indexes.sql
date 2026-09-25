DROP INDEX `chat_messages_streaming_idx`;--> statement-breakpoint
DROP INDEX `chat_threads_owner_order_idx`;--> statement-breakpoint
CREATE INDEX `chat_threads_owner_rank_idx` ON `chat_threads` (`owner_id`,("pinned_at" is not null) desc,"updated_at" desc,"id" desc);