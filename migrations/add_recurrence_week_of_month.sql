-- 定期イベントの第何週設定カラムを追加
-- recurrence_pattern が 'monthly_week' の場合に使用

ALTER TABLE "Events"
ADD COLUMN IF NOT EXISTS recurrence_week_of_month INTEGER;

COMMENT ON COLUMN "Events".recurrence_week_of_month IS '毎月第N曜日の「N」(1-5)。recurrence_pattern=monthly_weekの場合に使用';
