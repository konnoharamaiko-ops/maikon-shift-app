# スマホUI改善計画

## 対象ファイルと改善内容

### 1. ShiftTableView.jsx（シフト作成 - 月ごと/週ごと表形式 + タイムライン）
**メインテーブル（月ごと/週ごと）:**
- セル内時間: `text-[10px] sm:text-xs` → `text-[11px] sm:text-sm`
- 追加時間: `text-[9px] sm:text-[10px]` → `text-[10px] sm:text-xs`
- 勤務詳細: `text-[8px] sm:text-[9px]` → `text-[9px] sm:text-[10px]`
- メモ: `text-[8px] sm:text-[9px]` → `text-[9px] sm:text-[10px]`
- ヘルプ名: `text-[9px] sm:text-[10px]` → `text-[10px] sm:text-xs`
- ヘルプ追加ボタン: `text-[9px] sm:text-[10px]` → `text-[10px] sm:text-xs`
- 日付ヘッダー名前: `text-xs sm:text-base` → OK
- 合計行: `text-[10px] sm:text-xs` → `text-[11px] sm:text-sm`

**WeekTimelineView（日ごと）:**
- バーテキスト: `text-[10px] sm:text-xs` → `text-[11px] sm:text-sm`
- 名前: `text-[11px] sm:text-base` → OK
- 追加時間バー: `text-[9px]` → `text-[10px]`
- メモ: `text-[8px] sm:text-[9px]` → `text-[9px] sm:text-[10px]`
- ヘルプバー: `text-[10px] sm:text-xs` → `text-[11px] sm:text-sm`
- 休希望: `text-[10px] sm:text-xs` → `text-[11px] sm:text-sm`

### 2. ShiftCalendarEditor.jsx（シフト作成 - カレンダー）
- セル内名前時間: `text-[10px] sm:text-xs` → `text-[11px] sm:text-sm`
- ヘルプ枠: 同様に拡大

### 3. ShiftOverview.jsx（シフト一覧表）
**カレンダービュー:**
- セル内: `text-[8px] sm:text-[10px]` → `text-[9px] sm:text-xs`
- 日付: `text-[10px] sm:text-sm` → `text-xs sm:text-base`
- 提出数: `text-[8px] sm:text-[10px]` → `text-[9px] sm:text-xs`

**表形式ビュー:**
- セル内時間: `text-[10px]` → `text-[11px]`
- 追加時間: `text-[9px]` → `text-[10px]`
- 要相談: `text-[8px]` → `text-[9px]`

**タイムラインビュー:**
- バーテキスト: `text-xs` → `text-sm`
- 名前: `text-sm sm:text-base` → OK
- 追加時間バー: `text-[10px]` → `text-[11px]`

### 4. ShiftRequestsOverview.jsx（シフト提出状況）
- カレンダー日付: `text-[10px] sm:text-sm` → `text-xs sm:text-base`
- セル内: `text-[8px] sm:text-[10px]` → `text-[9px] sm:text-xs`
- 提出数: `text-[8px] sm:text-[10px]` → `text-[9px] sm:text-xs`

### 5. ReadOnlyTableView.jsx（確定シフト表プレビュー）
- セル内時間: `text-[9px] sm:text-[10px]` → `text-[10px] sm:text-xs`
- 追加時間: `text-[8px] sm:text-[9px]` → `text-[9px] sm:text-[10px]`
- 名前ヘッダー: `text-[10px] sm:text-xs` → `text-[11px] sm:text-sm`
- 日付: `text-[11px] sm:text-sm` → `text-xs sm:text-base`
