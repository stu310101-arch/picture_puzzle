import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const puzzles = sqliteTable("puzzles", {
 id: text("id").primaryKey(), metadata: text("metadata").notNull(),
 imageKey: text("image_key"), target: text("target").notNull(), expiresAt: integer("expires_at").notNull(),
 shortUrl: text("short_url"), requestKey: text("request_key").unique(),
}, table => [index("puzzles_expiry").on(table.expiresAt)]);
export const limits = sqliteTable("limits", { key: text("key").primaryKey(), n: integer("n").notNull(), expiresAt: integer("expires_at").notNull() });
