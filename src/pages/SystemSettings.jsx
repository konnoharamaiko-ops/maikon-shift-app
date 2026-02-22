import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Settings, Save, Store as StoreIcon, Users, Calendar, Bell, Lock, MessageSquare, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import RolePermissionsTab from '@/components/system-settings/RolePermissionsTab';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { fetchAll, insertRecord, updateRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';

export default function SystemSettings() {
  const queryClient = useQueryClient();

  const { user } = useAuth();

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => fetchAll('AppSettings'),
  });

  const [systemName, setSystemName] = useState('');
  const [maxShiftHours, setMaxShiftHours] = useState('');
  const [enableNotifications, setEnableNotifications] = useState(true);

  // LINE連携設定のstate
  const [lineChannelId, setLineChannelId] = useState('');
  const [lineChannelSecret, setLineChannelSecret] = useState('');
  const [lineAccessToken, setLineAccessToken] = useState('');
  const [lineEnabled, setLineEnabled] = useState(false);
  const [lineTestStatus, setLineTestStatus] = useState(null);

  // 通知設定のstate
  const [notifShiftConfirm, setNotifShiftConfirm] = useState(true);
  const [notifDeadlineReminder, setNotifDeadlineReminder] = useState(true);
  const [notifShiftChange, setNotifShiftChange] = useState(false);
  const [notifPaidLeave, setNotifPaidLeave] = useState(true);
  const [notifStaffShortage, setNotifStaffShortage] = useState(true);
  const [notifInApp, setNotifInApp] = useState(true);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifLine, setNotifLine] = useState(false);

  // 労務管理設定のstate
  const [dailyLegalHours, setDailyLegalHours] = useState('8');
  const [weeklyLegalHours, setWeeklyLegalHours] = useState('40');
  const [monthlyLegalDays, setMonthlyLegalDays] = useState('22');
  const [wall103, setWall103] = useState('1030000');
  const [wall106, setWall106] = useState('1060000');
  const [wall130, setWall130] = useState('1300000');
  const [customWall, setCustomWall] = useState('');
  const [weeklyInsuranceHours, setWeeklyInsuranceHours] = useState('20');
  const [monthlyInsuranceDays, setMonthlyInsuranceDays] = useState('15');
  const [overtimeAutoCalc, setOvertimeAutoCalc] = useState(true);
  const [nightPremium, setNightPremium] = useState(true);
  const [dependentAlert, setDependentAlert] = useState(true);

  // 詳細設定のstate
  const [dataRetentionMonths, setDataRetentionMonths] = useState('12');
  const [autoBackup, setAutoBackup] = useState(true);
  const [logRetentionDays, setLogRetentionDays] = useState('90');
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [ipRestriction, setIpRestriction] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('30');

  React.useEffect(() => {
    const loadVal = (key, setter) => {
      const s = appSettings.find(s => s.setting_key === key);
      if (s) setter(s.setting_value);
    };
    const loadBool = (key, setter) => {
      const s = appSettings.find(s => s.setting_key === key);
      if (s) setter(s.setting_value === 'true');
    };

    // 基本設定
    loadVal('system_name', setSystemName);
    loadVal('max_shift_hours', setMaxShiftHours);
    loadBool('enable_notifications', setEnableNotifications);

    // 通知設定
    loadBool('notif_shift_confirm', setNotifShiftConfirm);
    loadBool('notif_deadline_reminder', setNotifDeadlineReminder);
    loadBool('notif_shift_change', setNotifShiftChange);
    loadBool('notif_paid_leave', setNotifPaidLeave);
    loadBool('notif_staff_shortage', setNotifStaffShortage);
    loadBool('notif_in_app', setNotifInApp);
    loadBool('notif_email', setNotifEmail);
    loadBool('notif_line', setNotifLine);

    // LINE連携設定
    loadVal('line_channel_id', setLineChannelId);
    loadVal('line_channel_secret', setLineChannelSecret);
    loadVal('line_access_token', setLineAccessToken);
    loadBool('line_enabled', setLineEnabled);

    // 労務管理設定
    loadVal('daily_legal_hours', setDailyLegalHours);
    loadVal('weekly_legal_hours', setWeeklyLegalHours);
    loadVal('monthly_legal_days', setMonthlyLegalDays);
    loadVal('wall_103', setWall103);
    loadVal('wall_106', setWall106);
    loadVal('wall_130', setWall130);
    loadVal('custom_wall', setCustomWall);
    loadVal('weekly_insurance_hours', setWeeklyInsuranceHours);
    loadVal('monthly_insurance_days', setMonthlyInsuranceDays);
    loadBool('overtime_auto_calc', setOvertimeAutoCalc);
    loadBool('night_premium', setNightPremium);
    loadBool('dependent_alert', setDependentAlert);

    // 詳細設定
    loadVal('data_retention_months', setDataRetentionMonths);
    loadBool('auto_backup', setAutoBackup);
    loadVal('log_retention_days', setLogRetentionDays);
    loadBool('two_factor_auth', setTwoFactorAuth);
    loadBool('ip_restriction', setIpRestriction);
    loadVal('session_timeout', setSessionTimeout);
  }, [appSettings]);

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, description }) => {
      const existing = appSettings.find(s => s.setting_key === key && !s.store_id);
      if (existing) {
        await updateRecord('AppSettings', existing.id, { setting_value: value });
      } else {
        await insertRecord('AppSettings', {
          setting_key: key,
          setting_value: value,
          description: description
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
    },
  });

  const saveBatch = (settings) => {
    settings.forEach(s => {
      updateSettingMutation.mutate({
        key: s.key,
        value: typeof s.value === 'boolean' ? (s.value ? 'true' : 'false') : String(s.value),
        description: s.desc
      });
    });
  };

  const handleSaveSystemSettings = () => {
    saveBatch([
      { key: 'system_name', value: systemName, desc: 'システム名' },
      { key: 'max_shift_hours', value: maxShiftHours, desc: '最大シフト時間' },
      { key: 'enable_notifications', value: enableNotifications, desc: '通知機能の有効化' },
    ]);
    toast.success('基本設定を保存しました');
  };

  const handleSaveLaborSettings = () => {
    saveBatch([
      { key: 'daily_legal_hours', value: dailyLegalHours, desc: '1日の法定労働時間' },
      { key: 'weekly_legal_hours', value: weeklyLegalHours, desc: '週の法定労働時間' },
      { key: 'monthly_legal_days', value: monthlyLegalDays, desc: '月の法定労働日数' },
      { key: 'wall_103', value: wall103, desc: '103万円の壁' },
      { key: 'wall_106', value: wall106, desc: '106万円の壁' },
      { key: 'wall_130', value: wall130, desc: '130万円の壁' },
      { key: 'custom_wall', value: customWall, desc: 'カスタム上限' },
      { key: 'weekly_insurance_hours', value: weeklyInsuranceHours, desc: '週の労働時間上限（社会保険）' },
      { key: 'monthly_insurance_days', value: monthlyInsuranceDays, desc: '月の労働日数上限（社会保険）' },
      { key: 'overtime_auto_calc', value: overtimeAutoCalc, desc: '残業代自動計算' },
      { key: 'night_premium', value: nightPremium, desc: '深夜割増' },
      { key: 'dependent_alert', value: dependentAlert, desc: '扶養上限アラート' },
    ]);
    toast.success('労務管理設定を保存しました');
  };

  const handleSaveNotificationSettings = () => {
    saveBatch([
      { key: 'notif_shift_confirm', value: notifShiftConfirm, desc: 'シフト確定通知' },
      { key: 'notif_deadline_reminder', value: notifDeadlineReminder, desc: '期限リマインダー' },
      { key: 'notif_shift_change', value: notifShiftChange, desc: 'シフト変更通知' },
      { key: 'notif_paid_leave', value: notifPaidLeave, desc: '有給申請通知' },
      { key: 'notif_staff_shortage', value: notifStaffShortage, desc: '人員不足アラート' },
      { key: 'notif_in_app', value: notifInApp, desc: 'アプリ内通知' },
      { key: 'notif_email', value: notifEmail, desc: 'メール通知' },
      { key: 'notif_line', value: notifLine, desc: 'LINE通知' },
    ]);
    toast.success('通知設定を保存しました');
  };

  const handleSaveAdvancedSettings = () => {
    saveBatch([
      { key: 'data_retention_months', value: dataRetentionMonths, desc: 'データ保持期間（月）' },
      { key: 'auto_backup', value: autoBackup, desc: '自動バックアップ' },
      { key: 'log_retention_days', value: logRetentionDays, desc: 'ログ保存期間（日）' },
      { key: 'two_factor_auth', value: twoFactorAuth, desc: '2段階認証' },
      { key: 'ip_restriction', value: ipRestriction, desc: 'IPアドレス制限' },
      { key: 'session_timeout', value: sessionTimeout, desc: 'セッションタイムアウト（分）' },
    ]);
    toast.success('詳細設定を保存しました');
  };

  if (user && user?.user_role !== 'admin' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">管理者専用</h2>
          <p className="text-slate-500">このページは管理者のみアクセスできます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-gray-700 flex items-center justify-center shadow-lg shadow-slate-200">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">システム設定</h1>
              <p className="text-sm text-slate-500">アプリ全体の基本設定・通知・セキュリティ</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1">
            <TabsTrigger value="general" className="text-xs sm:text-sm">基本設定</TabsTrigger>
            <TabsTrigger value="labor" className="text-xs sm:text-sm">労務管理</TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs sm:text-sm">通知</TabsTrigger>
            <TabsTrigger value="line" className="text-xs sm:text-sm">LINE連携</TabsTrigger>
            <TabsTrigger value="roles" className="text-xs sm:text-sm">ロール権限</TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs sm:text-sm">詳細設定</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>基本設定</CardTitle>
                <CardDescription>システム全体の基本的な設定を管理します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="system-name" className="text-sm font-medium mb-2 block">システム名</Label>
                  <Input
                    id="system-name"
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    placeholder="シフト管理システム"
                    className="max-w-md"
                  />
                </div>

                <div>
                  <Label htmlFor="max-hours" className="text-sm font-medium mb-2 block">1日の最大シフト時間</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max-hours"
                      type="number"
                      value={maxShiftHours}
                      onChange={(e) => setMaxShiftHours(e.target.value)}
                      placeholder="12"
                      className="w-24"
                    />
                    <span className="text-sm text-slate-600">時間</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <Label className="text-sm font-semibold">通知機能</Label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      システム全体の通知を有効/無効にします
                    </p>
                  </div>
                  <Switch
                    checked={enableNotifications}
                    onCheckedChange={setEnableNotifications}
                  />
                </div>

                <Button onClick={handleSaveSystemSettings} disabled={updateSettingMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                  <Save className="w-4 h-4 mr-2" />
                  基本設定を保存
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="labor">
            <Card>
              <CardHeader>
                <CardTitle>労務管理設定</CardTitle>
                <CardDescription>労働時間・扶養・給与に関する設定</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">1日の法定労働時間</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={dailyLegalHours} onChange={(e) => setDailyLegalHours(e.target.value)} className="w-24" />
                      <span className="text-sm text-slate-600">時間</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">超過分は残業として扱われます</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-2 block">週の法定労働時間</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={weeklyLegalHours} onChange={(e) => setWeeklyLegalHours(e.target.value)} className="w-24" />
                      <span className="text-sm text-slate-600">時間</span>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-2 block">月の法定労働日数</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={monthlyLegalDays} onChange={(e) => setMonthlyLegalDays(e.target.value)} className="w-24" />
                      <span className="text-sm text-slate-600">日</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold text-sm mb-4">扶養控除の壁設定</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">103万円の壁（年収）</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={wall103} onChange={(e) => setWall103(e.target.value)} />
                        <span className="text-sm text-slate-600">円</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">所得税が発生する年収</p>
                    </div>

                    <div>
                      <Label className="text-sm font-medium mb-2 block">106万円の壁（年収）</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={wall106} onChange={(e) => setWall106(e.target.value)} />
                        <span className="text-sm text-slate-600">円</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">社会保険加入が必要な年収（大企業）</p>
                    </div>

                    <div>
                      <Label className="text-sm font-medium mb-2 block">130万円の壁（年収）</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={wall130} onChange={(e) => setWall130(e.target.value)} />
                        <span className="text-sm text-slate-600">円</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">社会保険加入が必要な年収（全企業）</p>
                    </div>

                    <div>
                      <Label className="text-sm font-medium mb-2 block">カスタム上限（任意）</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={customWall} onChange={(e) => setCustomWall(e.target.value)} placeholder="例: 1500000" />
                        <span className="text-sm text-slate-600">円</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">会社独自の収入上限を設定可能</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">週の労働時間上限（社会保険）</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={weeklyInsuranceHours} onChange={(e) => setWeeklyInsuranceHours(e.target.value)} className="w-24" />
                        <span className="text-sm text-slate-600">時間</span>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium mb-2 block">月の労働日数上限（社会保険）</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={monthlyInsuranceDays} onChange={(e) => setMonthlyInsuranceDays(e.target.value)} className="w-24" />
                        <span className="text-sm text-slate-600">日</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold text-sm mb-4">給与計算設定</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-sm font-semibold">残業代自動計算</Label>
                        <p className="text-xs text-slate-500 mt-0.5">法定労働時間超過分を1.25倍で計算</p>
                      </div>
                      <Switch checked={overtimeAutoCalc} onCheckedChange={setOvertimeAutoCalc} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-sm font-semibold">深夜割増</Label>
                        <p className="text-xs text-slate-500 mt-0.5">22時〜5時は0.25倍の割増</p>
                      </div>
                      <Switch checked={nightPremium} onCheckedChange={setNightPremium} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-sm font-semibold">扶養上限アラート</Label>
                        <p className="text-xs text-slate-500 mt-0.5">上限接近時に通知を送信</p>
                      </div>
                      <Switch checked={dependentAlert} onCheckedChange={setDependentAlert} />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveLaborSettings} disabled={updateSettingMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                  <Save className="w-4 h-4 mr-2" />
                  労務管理設定を保存
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-600" />
                  通知設定
                </CardTitle>
                <CardDescription>システム全体の通知機能を管理します。設定はアプリ内通知・メール通知に反映されます。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold text-sm mb-4 text-slate-700">通知種別</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div>
                        <Label className="text-sm font-semibold">シフト確定通知</Label>
                        <p className="text-xs text-slate-500 mt-0.5">シフトが確定したときにスタッフに通知</p>
                      </div>
                      <Switch checked={notifShiftConfirm} onCheckedChange={setNotifShiftConfirm} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div>
                        <Label className="text-sm font-semibold">期限リマインダー</Label>
                        <p className="text-xs text-slate-500 mt-0.5">提出期限の前日にリマインダーを送信</p>
                      </div>
                      <Switch checked={notifDeadlineReminder} onCheckedChange={setNotifDeadlineReminder} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div>
                        <Label className="text-sm font-semibold">シフト変更通知</Label>
                        <p className="text-xs text-slate-500 mt-0.5">シフトが変更されたときに通知</p>
                      </div>
                      <Switch checked={notifShiftChange} onCheckedChange={setNotifShiftChange} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div>
                        <Label className="text-sm font-semibold">有給申請通知</Label>
                        <p className="text-xs text-slate-500 mt-0.5">有給申請・承認・却下時に関係者に通知</p>
                      </div>
                      <Switch checked={notifPaidLeave} onCheckedChange={setNotifPaidLeave} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div>
                        <Label className="text-sm font-semibold">人員不足アラート</Label>
                        <p className="text-xs text-slate-500 mt-0.5">人員不足が発生した場合に管理者に通知</p>
                      </div>
                      <Switch checked={notifStaffShortage} onCheckedChange={setNotifStaffShortage} />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold text-sm mb-4 text-slate-700">通知方法</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Bell className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">アプリ内通知</Label>
                          <p className="text-xs text-slate-500 mt-0.5">アプリ内の通知パネルに表示</p>
                        </div>
                      </div>
                      <Switch checked={notifInApp} onCheckedChange={setNotifInApp} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                          <span className="text-sm">📧</span>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">メール通知</Label>
                          <p className="text-xs text-slate-500 mt-0.5">登録メールアドレスに通知を送信</p>
                        </div>
                      </div>
                      <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <span className="text-sm">💬</span>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">LINE通知</Label>
                          <p className="text-xs text-slate-500 mt-0.5">LINE連携済みユーザーに通知を送信</p>
                        </div>
                      </div>
                      <Switch checked={notifLine} onCheckedChange={setNotifLine} />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold text-sm mb-4 text-slate-700">現在の通知設定サマリー</h3>
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${notifShiftConfirm ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={notifShiftConfirm ? 'text-slate-700' : 'text-slate-400'}>シフト確定通知</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${notifDeadlineReminder ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={notifDeadlineReminder ? 'text-slate-700' : 'text-slate-400'}>期限リマインダー</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${notifShiftChange ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={notifShiftChange ? 'text-slate-700' : 'text-slate-400'}>シフト変更通知</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${notifPaidLeave ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={notifPaidLeave ? 'text-slate-700' : 'text-slate-400'}>有給申請通知</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${notifStaffShortage ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={notifStaffShortage ? 'text-slate-700' : 'text-slate-400'}>人員不足アラート</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200 flex gap-4 text-sm">
                      <span className="font-medium text-slate-600">通知方法:</span>
                      {notifInApp && <span className="text-blue-600">アプリ内</span>}
                      {notifEmail && <span className="text-green-600">メール</span>}
                      {notifLine && <span className="text-emerald-600">LINE</span>}
                      {!notifInApp && !notifEmail && !notifLine && <span className="text-red-500">全て無効</span>}
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveNotificationSettings} disabled={updateSettingMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                  <Save className="w-4 h-4 mr-2" />
                  通知設定を保存
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="line">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  LINE連携設定
                </CardTitle>
                <CardDescription>
                  LINE Messaging APIと連携して、シフト確定通知やリマインダーをLINEで送信できます。
                  <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 ml-1">
                    LINE Developers Console <ExternalLink className="w-3 h-3" />
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border border-green-200 bg-green-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold">LINE連携を有効にする</Label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {lineEnabled ? '有効 - LINE通知が送信されます' : '無効 - LINE通知は送信されません'}
                      </p>
                    </div>
                  </div>
                  <Switch checked={lineEnabled} onCheckedChange={setLineEnabled} />
                </div>

                <div className={lineEnabled ? '' : 'opacity-50 pointer-events-none'}>
                  <h3 className="font-semibold text-sm mb-4 text-slate-700">LINE Messaging API設定</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="line-channel-id" className="text-sm font-medium mb-2 block">Channel ID</Label>
                      <Input id="line-channel-id" value={lineChannelId} onChange={(e) => setLineChannelId(e.target.value)} placeholder="例: 1234567890" className="max-w-md font-mono" />
                      <p className="text-xs text-slate-500 mt-1">LINE Developers Consoleで取得したChannel ID</p>
                    </div>
                    <div>
                      <Label htmlFor="line-channel-secret" className="text-sm font-medium mb-2 block">Channel Secret</Label>
                      <Input id="line-channel-secret" type="password" value={lineChannelSecret} onChange={(e) => setLineChannelSecret(e.target.value)} placeholder="Channel Secretを入力" className="max-w-md font-mono" />
                      <p className="text-xs text-slate-500 mt-1">LINE Developers Consoleで取得したChannel Secret</p>
                    </div>
                    <div>
                      <Label htmlFor="line-access-token" className="text-sm font-medium mb-2 block">Channel Access Token（長期）</Label>
                      <Input id="line-access-token" type="password" value={lineAccessToken} onChange={(e) => setLineAccessToken(e.target.value)} placeholder="Channel Access Tokenを入力" className="max-w-md font-mono" />
                      <p className="text-xs text-slate-500 mt-1">LINE Developers Consoleで発行した長期トークン</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold text-sm mb-4 text-slate-700">セットアップガイド</h3>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">1</span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">LINE Developers Consoleでプロバイダーを作成</p>
                        <p className="text-xs text-slate-500">Messaging APIチャネルを新規作成してください</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">2</span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">Channel ID・Secret・Access Tokenを取得</p>
                        <p className="text-xs text-slate-500">チャネル基本設定とMessaging API設定から取得できます</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">3</span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">上記フォームに入力して保存</p>
                        <p className="text-xs text-slate-500">設定保存後、各ユーザーがLINE友だち追加で連携完了</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">4</span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">ユーザーが基本設定からLINE連携</p>
                        <p className="text-xs text-slate-500">各ユーザーが自分のアカウントでLINE連携を行います</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold text-sm mb-4 text-slate-700">連携ステータス</h3>
                  <div className="flex items-center gap-3 p-4 rounded-lg border">
                    {lineEnabled && lineAccessToken ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="text-sm font-medium text-green-700">LINE連携が設定されています</p>
                          <p className="text-xs text-slate-500">通知タブでLINE通知を有効にすると、LINE経由で通知が送信されます</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <div>
                          <p className="text-sm font-medium text-amber-700">LINE連携が未設定です</p>
                          <p className="text-xs text-slate-500">上記のAPI設定を入力して保存してください</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <Button
                  onClick={() => {
                    saveBatch([
                      { key: 'line_channel_id', value: lineChannelId, desc: 'LINE Channel ID' },
                      { key: 'line_channel_secret', value: lineChannelSecret, desc: 'LINE Channel Secret' },
                      { key: 'line_access_token', value: lineAccessToken, desc: 'LINE Access Token' },
                      { key: 'line_enabled', value: lineEnabled, desc: 'LINE連携有効化' },
                    ]);
                    toast.success('LINE連携設定を保存しました');
                  }}
                  disabled={updateSettingMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  LINE設定を保存
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-purple-600" />
                  ロール権限設定
                </CardTitle>
                <CardDescription>管理者・マネージャー・ユーザーの役割ごとのデフォルト権限を設定</CardDescription>
              </CardHeader>
              <CardContent>
                <RolePermissionsTab />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>システム管理</CardTitle>
                  <CardDescription>データ管理とバックアップ設定</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                      <h3 className="font-semibold text-sm mb-2">データ保持期間</h3>
                      <p className="text-xs text-slate-600 mb-3">過去のシフトデータを保持する期間を設定します</p>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={dataRetentionMonths} onChange={(e) => setDataRetentionMonths(e.target.value)} className="w-24" />
                        <span className="text-sm text-slate-600">ヶ月</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-sm mb-1">自動バックアップ</h3>
                          <p className="text-xs text-slate-600">毎日午前3時に自動バックアップを実行</p>
                        </div>
                        <Switch checked={autoBackup} onCheckedChange={setAutoBackup} />
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                      <h3 className="font-semibold text-sm mb-2">ログ保存期間</h3>
                      <p className="text-xs text-slate-600 mb-3">システムログとアクセスログの保存期間</p>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={logRetentionDays} onChange={(e) => setLogRetentionDays(e.target.value)} className="w-24" />
                        <span className="text-sm text-slate-600">日</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>セキュリティ設定</CardTitle>
                  <CardDescription>アクセス制御とセキュリティ機能</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-sm font-semibold">2段階認証</Label>
                        <p className="text-xs text-slate-500 mt-0.5">管理者アカウントに2段階認証を要求</p>
                      </div>
                      <Switch checked={twoFactorAuth} onCheckedChange={setTwoFactorAuth} />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-sm font-semibold">IPアドレス制限</Label>
                        <p className="text-xs text-slate-500 mt-0.5">特定のIPアドレスからのみアクセス許可</p>
                      </div>
                      <Switch checked={ipRestriction} onCheckedChange={setIpRestriction} />
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                      <h3 className="font-semibold text-sm mb-2">セッションタイムアウト</h3>
                      <p className="text-xs text-slate-600 mb-3">無操作時に自動ログアウトする時間</p>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} className="w-24" />
                        <span className="text-sm text-slate-600">分</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button onClick={handleSaveAdvancedSettings} disabled={updateSettingMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                <Save className="w-4 h-4 mr-2" />
                詳細設定を保存
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
