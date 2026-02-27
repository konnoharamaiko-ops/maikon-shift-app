# 調査結果

## 問題点

### 1. プレビュー・確定シフト表にシフト作成の全内容が反映されていない
- **ConfirmShiftPreview**: visibleAdminIdsが渡されていない → 管理者が表示されない
- **WeekTimelineView**: visibleAdminIdsが渡されていない → 管理者が表示されない
- **ReadOnlyTableView**: visibleAdminIdsが渡されていない → 管理者が表示されない
- **ヘルプ枠**: ReadOnlyTableViewにヘルプ枠の表示がない
- **勤務詳細**: ReadOnlyTableViewにwork_detailsの表示はあるが、ConfirmShiftPreviewにもある
- **snapshotShiftData**: work_details, additional_times, is_help_slot, help_name, notesが保存されていない

### 2. プレビューが画面幅に収まらない
- printRefのmin-w-[600px]が固定されている
- ZoomableWrapperが使われていない

### 3. 通知の月またぎ
- periodStr計算: `format(displayDays[0], 'M月d日')` で月名が同じ月のみ
- 例: 2/23〜3/1 の場合、「2月23日〜3月1日」と正しく表示される（formatは自動で月を含む）
- 実際にはtitleが `${storeName} ${monthStr}（${periodStr}）シフト確定` なので月またぎは反映されるはず
- ただし確認が必要

### 4. 通知にリンクがない
- actionUrl: '/' になっている → 確定シフト表ページへのリンクにすべき

## 修正箇所

### ShiftConfirmDialog.jsx
1. renderPreviewContent: visibleAdminIds相当のpropsを追加
2. snapshotShiftData: 全フィールドを保存
3. snapshotUsersData: visibleAdminIdsを保存
4. プレビュー: ZoomableWrapperで囲む
5. 通知: actionUrlを確定シフト表へのリンクに変更
6. 通知メッセージにリンク情報を追加

### ReadOnlyTableView.jsx
1. ヘルプ枠の表示を追加

### ConfirmShiftPreview
1. ヘルプ枠の表示を追加

### ConfirmedShiftViewer.jsx
1. visibleAdminIdsの処理を追加
