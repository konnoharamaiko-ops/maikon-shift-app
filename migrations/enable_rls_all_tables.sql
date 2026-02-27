-- =====================================================
-- 全テーブルのRLS（Row Level Security）有効化
-- 認証済みユーザーに対してフルアクセスを許可するポリシーを設定
-- =====================================================

-- 1. User テーブル
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "User";
CREATE POLICY "authenticated_access" ON "User"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 2. Store テーブル
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "Store";
CREATE POLICY "authenticated_access" ON "Store"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 3. Permission テーブル
ALTER TABLE "Permission" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "Permission";
CREATE POLICY "authenticated_access" ON "Permission"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 4. PermissionHistory テーブル
ALTER TABLE "PermissionHistory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "PermissionHistory";
CREATE POLICY "authenticated_access" ON "PermissionHistory"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 5. ShiftRequest テーブル
ALTER TABLE "ShiftRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "ShiftRequest";
CREATE POLICY "authenticated_access" ON "ShiftRequest"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 6. WorkShift テーブル
ALTER TABLE "WorkShift" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "WorkShift";
CREATE POLICY "authenticated_access" ON "WorkShift"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 7. ShiftTemplate テーブル
ALTER TABLE "ShiftTemplate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "ShiftTemplate";
CREATE POLICY "authenticated_access" ON "ShiftTemplate"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 8. ShiftDeadline テーブル
ALTER TABLE "ShiftDeadline" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "ShiftDeadline";
CREATE POLICY "authenticated_access" ON "ShiftDeadline"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 9. ShiftConfirmation テーブル
ALTER TABLE "ShiftConfirmation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "ShiftConfirmation";
CREATE POLICY "authenticated_access" ON "ShiftConfirmation"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 10. ConfirmedShiftSnapshot テーブル
ALTER TABLE "ConfirmedShiftSnapshot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "ConfirmedShiftSnapshot";
CREATE POLICY "authenticated_access" ON "ConfirmedShiftSnapshot"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 11. ConfirmedShiftReads テーブル
ALTER TABLE "ConfirmedShiftReads" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "ConfirmedShiftReads";
CREATE POLICY "authenticated_access" ON "ConfirmedShiftReads"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 12. AppSettings テーブル
ALTER TABLE "AppSettings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "AppSettings";
CREATE POLICY "authenticated_access" ON "AppSettings"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 13. Events テーブル
ALTER TABLE "Events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "Events";
CREATE POLICY "authenticated_access" ON "Events"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 14. PaidLeaveRequest テーブル
ALTER TABLE "PaidLeaveRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "PaidLeaveRequest";
CREATE POLICY "authenticated_access" ON "PaidLeaveRequest"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 15. PaidLeaveBalance テーブル
ALTER TABLE "PaidLeaveBalance" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "PaidLeaveBalance";
CREATE POLICY "authenticated_access" ON "PaidLeaveBalance"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 16. Notification テーブル
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "Notification";
CREATE POLICY "authenticated_access" ON "Notification"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 17. PendingInvitation テーブル
ALTER TABLE "PendingInvitation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "PendingInvitation";
CREATE POLICY "authenticated_access" ON "PendingInvitation"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 18. StoreSales テーブル
ALTER TABLE "StoreSales" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "StoreSales";
CREATE POLICY "authenticated_access" ON "StoreSales"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 19. WorkActual テーブル
ALTER TABLE "WorkActual" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON "WorkActual";
CREATE POLICY "authenticated_access" ON "WorkActual"
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
