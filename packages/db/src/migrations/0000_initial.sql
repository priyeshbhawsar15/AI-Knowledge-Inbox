CREATE TABLE IF NOT EXISTS `items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`submitted_text` text,
	`source_url` text,
	`canonical_url` text,
	`title` text,
	`raw_content` text,
	`content_hash` text,
	`status` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `type_check` CHECK(`type` IN ('text', 'url')),
	CONSTRAINT `status_check` CHECK(`status` IN ('queued', 'processing', 'ready', 'retry_wait', 'failed'))
);

CREATE INDEX IF NOT EXISTS `idx_items_created_id` ON `items` (`created_at` DESC, `id` DESC);
CREATE INDEX IF NOT EXISTS `idx_items_status` ON `items` (`status`);

CREATE TABLE IF NOT EXISTS `ingestion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL UNIQUE,
	`state` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`available_at` text NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`heartbeat_at` text,
	`last_error_code` text,
	`last_error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE,
	CONSTRAINT `state_check` CHECK(`state` IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS `idx_jobs_state_avail` ON `ingestion_jobs` (`state`, `available_at`);

CREATE TABLE IF NOT EXISTS `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`text` text NOT NULL,
	`token_count` integer NOT NULL,
	`embedding` blob NOT NULL,
	`embedding_model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_chunks_item_ordinal` ON `chunks` (`item_id`, `ordinal`);
CREATE INDEX IF NOT EXISTS `idx_chunks_item` ON `chunks` (`item_id`);

CREATE TABLE IF NOT EXISTS `events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`job_id` text,
	`request_id` text,
	`type` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL,
	FOREIGN KEY (`job_id`) REFERENCES `ingestion_jobs`(`id`) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS `idx_events_item` ON `events` (`item_id`);
CREATE INDEX IF NOT EXISTS `idx_events_job` ON `events` (`job_id`);
CREATE INDEX IF NOT EXISTS `idx_events_created` ON `events` (`created_at`);

CREATE TABLE IF NOT EXISTS `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`item_id` text NOT NULL,
	`job_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`job_id`) REFERENCES `ingestion_jobs`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_idempotency_expires` ON `idempotency_keys` (`expires_at`);

CREATE TABLE IF NOT EXISTS `system_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`index_version` integer DEFAULT 1 NOT NULL,
	`embedding_model` text NOT NULL,
	`embedding_dimensions` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `singleton_check` CHECK(`id` = 1)
);

CREATE TABLE IF NOT EXISTS `worker_state` (
	`worker_id` text PRIMARY KEY NOT NULL,
	`heartbeat_at` text NOT NULL,
	`started_at` text NOT NULL,
	`version` text NOT NULL
);
