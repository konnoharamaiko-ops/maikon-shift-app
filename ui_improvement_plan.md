# UI改善計画

## 1. 有給残高設定フォーム（Analytics.jsx PaidLeaveManagement）
### 現状の問題
- 残高設定ダイアログが情報量多く見にくい
- 用語が専門的（残高基準日、前回付与日等）

### 改善内容
- ダイアログをカード形式のステップUIに変更（ステップ1: 基本、ステップ2: 詳細）
- 各入力フィールドにアイコン付きラベルと具体例を表示
- 入力フィールドのサイズを大きく（h-12）
- 説明テキストを大きく（text-xs → text-sm）
- 「残高基準日」→「有給の基準日」、「前回付与日」→「前回もらった日」等、平易な表現に
- 必須/任意の区別をより明確に（バッジ表示）

## 2. シフト表（月ごと/週ごと表形式 - ShiftTableView.jsx）
### 現状
- getShiftColor: bg-cyan-50, bg-lime-50, bg-orange-50 → 薄い
- セル内テキスト: text-[9px] sm:text-[10px] font-semibold → 小さい
- ヘッダー名前: text-xs sm:text-sm font-bold → OK

### 改善内容
- 色を濃くする: bg-cyan-100, bg-lime-100, bg-orange-100
- セル内テキスト: text-[10px] sm:text-[11px] font-bold → 大きく太く
- work_details: text-[7px] → text-[8px]
- 名前ヘッダー: text-xs sm:text-sm → text-sm sm:text-base

## 3. タイムラインビュー（WeekTimelineView）
### 現状
- バー高さ: h-6 → 小さい
- バーテキスト: text-[9px] sm:text-[11px] → 小さい
- 名前: text-[10px] sm:text-sm → 小さい

### 改善内容
- バー高さ: h-6 → h-7
- バーテキスト: text-[10px] sm:text-[12px] font-bold
- 名前: text-[11px] sm:text-base font-bold
- 行高さ: h-8 → h-9

## 4. カレンダービュー（ShiftCalendarEditor.jsx）
### 現状
- セル内テキスト: text-[9px] sm:text-[10px] → 小さい
- 色: bg-cyan-50, bg-lime-50, bg-orange-50 → 薄い

### 改善内容
- 色を濃くする: bg-cyan-100, bg-lime-100, bg-orange-100
- セル内テキスト: text-[10px] sm:text-[11px] font-bold
- 名前: font-semibold → font-bold
