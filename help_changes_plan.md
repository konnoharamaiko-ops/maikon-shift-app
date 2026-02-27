# ヘルプ枠追加計画

## 1. WeekTimelineView（日ごとタイムライン）
- propsに `onAddHelpSlot`, `onEditHelpSlot` を追加
- スタッフ行の後にヘルプ枠行を追加（オレンジ色のバー）
- ヘルプ枠追加ボタンを日付ヘッダーに追加

## 2. ShiftCalendarEditor（カレンダー形式）
- HelpSlotDialogをimport
- ヘルプ枠の状態管理を追加
- 各日付セルにヘルプ枠を表示（オレンジ色）
- ヘルプ枠の追加・編集・削除機能を追加
- 凡例にヘルプの説明を追加

## 3. ShiftTableView内のWeekTimelineView呼び出し
- onAddHelpSlot={handleAddHelpSlot}
- onEditHelpSlot={handleEditHelpSlot}
を追加
