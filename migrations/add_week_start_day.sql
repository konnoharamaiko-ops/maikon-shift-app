-- Add week_start_day column to Store table
-- This allows each store to configure whether the week starts on Sunday (0) or Monday (1)

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS week_start_day INTEGER DEFAULT 1;

COMMENT ON COLUMN "Store".week_start_day IS '週の開始曜日 (0: 日曜日, 1: 月曜日)';

-- Update existing stores to default to Monday (1)
UPDATE "Store" SET week_start_day = 1 WHERE week_start_day IS NULL;
