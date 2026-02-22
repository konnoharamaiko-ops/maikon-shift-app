-- イベント管理の詳細設定強化のためのマイグレーション

-- Eventsテーブルに新しいカラムを追加
ALTER TABLE "Events"
ADD COLUMN IF NOT EXISTS start_time TIME,
ADD COLUMN IF NOT EXISTS end_time TIME,
ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'other',
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurrence_pattern JSONB,
ADD COLUMN IF NOT EXISTS display_on_shift_table BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS display_on_shift_request BOOLEAN DEFAULT TRUE;

-- event_typeの説明:
-- 'point_5x': ポイント5倍デー
-- 'point_3x': ポイント3倍デー
-- 'sale': セール
-- 'tasting': 試食会
-- 'campaign': キャンペーン
-- 'holiday': 休日
-- 'other': その他

-- recurrence_patternの例:
-- { "type": "monthly", "week": 3, "day": 5 } -> 毎月第3金曜日
-- { "type": "weekly", "day": 1 } -> 毎週月曜日
-- { "type": "daily" } -> 毎日
-- { "type": "yearly", "month": 1, "date": 1 } -> 毎年1月1日

COMMENT ON COLUMN "Events".start_time IS 'イベント開始時刻';
COMMENT ON COLUMN "Events".end_time IS 'イベント終了時刻';
COMMENT ON COLUMN "Events".event_type IS 'イベントタイプ (point_5x, point_3x, sale, tasting, campaign, holiday, other)';
COMMENT ON COLUMN "Events".is_recurring IS '定期イベントかどうか';
COMMENT ON COLUMN "Events".recurrence_pattern IS '定期イベントのパターン (JSON)';
COMMENT ON COLUMN "Events".display_on_shift_table IS 'シフト表に表示するか';
COMMENT ON COLUMN "Events".display_on_shift_request IS 'シフト希望一覧に表示するか';
