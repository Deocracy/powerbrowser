-- worker/schema.sql: the D1 DDL the owner applies once with
--   wrangler d1 execute powerbrowser-events --remote --file worker/schema.sql
-- (TEL-10, TEL-11). The Worker's column names are EVENT_COLUMNS and DOWNLOAD_COLUMNS in
-- events-worker.mjs; scripts/verify-events-worker.mjs requires every one of them to appear here.
-- Retention is enforced by the scheduled job (RETENTION_DAYS), not by the schema.

-- events: one row per admitted event. received_at is server time in milliseconds.
-- synthetic is 1 for the sweep's probe rows, which the maintainer query excludes.
CREATE TABLE events (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "received_at" INTEGER NOT NULL,
  "type" TEXT,
  "basename" TEXT,
  "line" INTEGER,
  "column" INTEGER,
  "version" TEXT,
  "buildid" TEXT,
  "os" TEXT,
  "synthetic" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX events_received_at ON events ("received_at");
CREATE INDEX events_maintainer ON events ("synthetic", "id");

-- download_counts: one row per asset and UTC day. The Worker upserts with
--   INSERT INTO download_counts (...) VALUES (...)
--   ON CONFLICT("asset", "day") DO UPDATE SET "tag" = excluded."tag",
--     "download_count" = excluded."download_count", "received_at" = excluded."received_at"
-- so a retried POST for the same asset and day replaces the count and never double-counts.
CREATE TABLE download_counts (
  "asset" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "download_count" INTEGER NOT NULL,
  "received_at" INTEGER NOT NULL,
  PRIMARY KEY ("asset", "day")
);
CREATE INDEX download_counts_received_at ON download_counts ("received_at");
