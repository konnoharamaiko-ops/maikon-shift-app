# UI改善計画 v2

## 1. 有給残高設定フォーム（Analytics.jsx PaidLeaveManagement）
### 問題点
- 残高設定ダイアログの項目が多く見にくい
- 「残高基準日」「前回付与日」などの用語が分かりにくい

### 改善方針
- ステップウィザード形式（Step1→Step2）に変更
- 各項目にイラスト的なアイコンと大きめの説明テキスト
- 入力フィールドを大きく（h-12）
- プログレスバー付き
- 用語をもっと平易に（「残高基準日」→「いつ時点の残高？」など）

## 2. シフト表（月ごと/週ごと表形式）ShiftTableView.jsx
### 問題点
- セルの色が薄い（bg-cyan-50, bg-lime-50, bg-orange-50）
- 時間のフォントが小さい（text-[9px] sm:text-[10px]）
- 名前のフォントが小さい（text-xs sm:text-sm）

### 改善方針
- getShiftColor: bg-cyan-50→bg-cyan-100, bg-lime-50→bg-lime-100, bg-orange-50→bg-orange-100
- 時間フォント: text-[10px] sm:text-xs に拡大、font-bold
- 名前フォント: text-sm sm:text-base に拡大、font-bold
- ヘッダーの名前: font-extrabold
- 合計行のフォントも大きく

## 3. タイムラインビュー（WeekTimelineView）
### 問題点  
- 名前欄が小さい（text-[10px] sm:text-sm）
- バーの高さが小さい（h-6）
- バー内テキストが小さい（text-[9px] sm:text-[11px]）

### 改善方針
- 名前フォント: text-xs sm:text-base に拡大
- バーの高さ: h-7に拡大
- バー内テキスト: text-[10px] sm:text-xs に拡大
- 時間ヘッダーのフォントも大きく

## 4. カレンダービュー（ShiftCalendarEditor.jsx）
### 問題点
- セル内の名前・時間が小さい（text-[9px] sm:text-[10px]）
- 色が薄い

### 改善方針
- 名前フォント: text-[10px] sm:text-xs に拡大
- 時間フォント: text-[10px] sm:text-xs に拡大
- 色を濃く（bg-cyan-50→bg-cyan-100等）
