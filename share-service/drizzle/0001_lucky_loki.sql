ALTER TABLE `puzzles` ADD `short_url` text;--> statement-breakpoint
ALTER TABLE `puzzles` ADD `request_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `puzzles_request_key_unique` ON `puzzles` (`request_key`);