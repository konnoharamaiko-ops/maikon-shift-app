/**
 * 店舗・ユーザー情報の変更時にアプリ全体のキャッシュを一括無効化するヘルパー関数
 */

/**
 * 店舗情報が変更された時に関連する全てのクエリキャッシュを無効化
 * @param {QueryClient} queryClient - React QueryのQueryClientインスタンス
 */
export function invalidateStoreQueries(queryClient) {
  // 店舗一覧（各ページで使用）
  queryClient.invalidateQueries({ queryKey: ['stores'] });
  // ユーザーの所属先（ConfirmedShiftViewer等）
  queryClient.invalidateQueries({ queryKey: ['userStores'] });
  // 店舗別ユーザー（ShiftCreation, ShiftTableViewer等）
  queryClient.invalidateQueries({ queryKey: ['storeUsers'] });
  // 店舗別確認メンバー（ConfirmedShiftViewer）
  queryClient.invalidateQueries({ queryKey: ['storeMembersForConfirm'] });
  // 店舗売上（StoreSettings）
  queryClient.invalidateQueries({ queryKey: ['storeSales'] });
  // シフト期限（StoreSettings, ShiftDeadlineManagement）
  queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
  // 確定シフトスナップショット（店舗変更で影響）
  queryClient.invalidateQueries({ queryKey: ['confirmedShiftSnapshot'] });
  queryClient.invalidateQueries({ queryKey: ['allStoreCurrentSnapshots'] });
}

/**
 * ユーザー情報が変更された時に関連する全てのクエリキャッシュを無効化
 * @param {QueryClient} queryClient - React QueryのQueryClientインスタンス
 */
export function invalidateUserQueries(queryClient) {
  // 全ユーザー一覧（各ページで使用）
  queryClient.invalidateQueries({ queryKey: ['allUsers'] });
  // 特定ユーザー（UserEdit）
  queryClient.invalidateQueries({ queryKey: ['targetUser'] });
  // 店舗別ユーザー（ShiftCreation等）
  queryClient.invalidateQueries({ queryKey: ['storeUsers'] });
  // 店舗別確認メンバー（ConfirmedShiftViewer）
  queryClient.invalidateQueries({ queryKey: ['storeMembersForConfirm'] });
  // ユーザーの所属先（ConfirmedShiftViewer）
  queryClient.invalidateQueries({ queryKey: ['userStores'] });
  // Analytics用ユーザー
  queryClient.invalidateQueries({ queryKey: ['allUsersAnalytics'] });
  // 確認状況（ユーザー名変更で影響）
  queryClient.invalidateQueries({ queryKey: ['shiftConfirmations'] });
  queryClient.invalidateQueries({ queryKey: ['allStoreConfirmations'] });
  // 現在のユーザー情報
  queryClient.invalidateQueries({ queryKey: ['currentUser'] });
}

/**
 * 店舗とユーザーの両方のキャッシュを一括無効化
 * @param {QueryClient} queryClient - React QueryのQueryClientインスタンス
 */
export function invalidateAllStoreAndUserQueries(queryClient) {
  invalidateStoreQueries(queryClient);
  invalidateUserQueries(queryClient);
}
