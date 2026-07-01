CREATE TABLE `activations` (
	`id` text PRIMARY KEY NOT NULL,
	`license_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`type` text DEFAULT 'none' NOT NULL,
	`label` text,
	`ip` text,
	`pubkey` text,
	`status` text DEFAULT 'active' NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`metadata` text,
	FOREIGN KEY (`license_key`) REFERENCES `licenses`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_activation` ON `activations` (`license_key`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_activations_key` ON `activations` (`license_key`);--> statement-breakpoint
CREATE TABLE `blacklist` (
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`reason` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`kind`, `value`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`name` text,
	`external_ref` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customers_email` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `idx_customers_external` ON `customers` (`external_ref`);--> statement-breakpoint
CREATE TABLE `licenses` (
	`key` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`customer_id` text,
	`plan` text DEFAULT 'standard' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`max_activations` integer DEFAULT 1 NOT NULL,
	`watermark` text,
	`note` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`issued_by` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_licenses_product` ON `licenses` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_licenses_customer` ON `licenses` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_licenses_status` ON `licenses` (`status`);--> statement-breakpoint
CREATE TABLE `product_builds` (
	`product_id` text NOT NULL,
	`hash` text NOT NULL,
	`version` text,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`product_id`, `hash`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'generic' NOT NULL,
	`binding_type` text DEFAULT 'none' NOT NULL,
	`key_prefix` text DEFAULT 'LIC' NOT NULL,
	`default_max_activations` integer DEFAULT 1 NOT NULL,
	`default_duration_days` integer DEFAULT 0 NOT NULL,
	`request_secret` text NOT NULL,
	`core_key` text,
	`strict_pop` integer DEFAULT false NOT NULL,
	`enforce_attestation` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `validations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`license_key` text,
	`product_id` text,
	`fingerprint` text,
	`ip` text,
	`version` text,
	`result` text NOT NULL,
	`source` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_validations_at` ON `validations` (`at`);--> statement-breakpoint
CREATE INDEX `idx_validations_key` ON `validations` (`license_key`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`payload` text,
	`processed_at` integer NOT NULL
);
