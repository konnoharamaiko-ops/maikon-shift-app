# UI改善計画

## 1. 有給残高設定フォーム (Analytics.jsx)
- 残高設定ダイアログをより大きく・分かりやすく
- 各入力フィールドにアイコン付きの大きなラベル
- ステップ表示をより視覚的に（プログレスバー風）
- 入力フィールドの説明テキストをより目立つように
- 数値入力にはスライダーやプリセットボタンを追加

## 2. シフト表 - 月ごと/週ごと表形式 (ShiftTableView.jsx)
- getShiftColor: 色をより濃く・コントラスト高く
  - 早番: bg-cyan-50 → bg-cyan-100, text-cyan-800 → text-cyan-900
  - 中番: bg-lime-50 → bg-lime-100, text-lime-800 → text-lime-900  
  - 遅番: bg-orange-50 → bg-orange-100, text-orange-800 → text-orange-900
- セル内の時間表示: text-[9px] → text-[10px], sm:text-[10px] → sm:text-xs
- セル内のfont-semibold → font-bold
- ヘッダーの名前: text-xs → text-sm, sm:text-sm → sm:text-base
- 日付セルの文字: もう少し大きく

## 3. シフト表 - 日ごとタイムライン (WeekTimelineView)
- 名前欄: text-[10px] → text-xs, sm:text-sm → sm:text-base, font-bold
- シフトバー: h-6 → h-7, text-[9px] → text-[10px], sm:text-[11px] → sm:text-xs
- 時間ヘッダー: text-[8px] → text-[9px], sm:text-[10px] → sm:text-xs

## 4. カレンダー (ShiftCalendarEditor.jsx)
- セル内の名前: font-semibold → font-bold, text-[9px] → text-[10px]
- 時間表示: font-bold, text-[9px] → text-[10px]
