import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bell, Save } from 'lucide-react';
import { toast } from 'sonner';
import { fetchFiltered, insertRecord, updateRecord } from '@/api/supabaseHelpers';

export default function NotificationPreferences({ user }) {
  const queryClient = useQueryClient();

  const [preferences, setPreferences] = useState({
    // 通知タイプ別の設定
    shift_change_notifications: true,
    shift_request_notifications: true,
    deadline_notifications: true,
    system_notifications: true,
    
    // メール通知の設定
    email_shift_changes: true,
    email_deadlines: true,
    email_system_alerts: true,
    
    // 勤務時間アラート設定
    enable_work_hours_alert: true,
    max_work_hours_per_week: 40,
    max_work_hours_per_month: 160,
    
    // 残業時間アラート設定
    enable_overtime_alert: true,
    max_overtime_hours_per_week: 8,
    max_overtime_hours_per_month: 30,
    
    // 締切リマインダー設定
    enable_deadline_reminder: true,
    deadline_reminder_days_before: 3
  });

  // ユーザーの通知設定を取得
  const { data: userSettings } = useQuery({
    queryKey: ['notificationPreferences', user?.email],
    queryFn: async () => {
      const settings = await fetchFiltered('AppSettings', {
        setting_key: 'notification_preferences',
        store_id: user?.email
      });
      return settings[0];
    },
  });

  useEffect(() => {
    if (userSettings?.setting_value) {
      try {
        const saved = JSON.parse(userSettings.setting_value);
        setPreferences(prev => ({ ...prev, ...saved }));
      } catch (e) {
        console.error('設定の読み込みに失敗しました');
      }
    }
  }, [userSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const settingData = {
        setting_key: 'notification_preferences',
        setting_value: JSON.stringify(preferences),
        description: '通知設定',
        store_id: user?.email
      };

      if (userSettings) {
        await updateRecord('AppSettings', userSettings.id, settingData);
      } else {
        await insertRecord('AppSettings', settingData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notificationPreferences']);
      toast.success('通知設定を保存しました');
    },
    onError: () => {
      toast.error('保存に失敗しました');
    }
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            通知の種類
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>シフト変更通知</Label>
              <p className="text-sm text-slate-500">シフトの確定・変更・削除時に通知</p>
            </div>
            <Switch
              checked={preferences.shift_change_notifications}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, shift_change_notifications: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>シフト希望受付通知</Label>
              <p className="text-sm text-slate-500">シフト希望が受理された際に通知</p>
            </div>
            <Switch
              checked={preferences.shift_request_notifications}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, shift_request_notifications: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>締切リマインダー</Label>
              <p className="text-sm text-slate-500">シフト希望提出期限のリマインダー</p>
            </div>
            <Switch
              checked={preferences.deadline_notifications}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, deadline_notifications: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>システム通知</Label>
              <p className="text-sm text-slate-500">重要なシステムメッセージ</p>
            </div>
            <Switch
              checked={preferences.system_notifications}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, system_notifications: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>メール通知設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>シフト変更時にメール送信</Label>
            <Switch
              checked={preferences.email_shift_changes}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, email_shift_changes: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>締切リマインダーをメール送信</Label>
            <Switch
              checked={preferences.email_deadlines}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, email_deadlines: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>システムアラートをメール送信</Label>
            <Switch
              checked={preferences.email_system_alerts}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, email_system_alerts: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>勤務時間アラート</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>勤務時間上限アラートを有効化</Label>
            <Switch
              checked={preferences.enable_work_hours_alert}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, enable_work_hours_alert: checked }))
              }
            />
          </div>

          {preferences.enable_work_hours_alert && (
            <>
              <div>
                <Label>週の勤務時間上限（時間）</Label>
                <Input
                  type="number"
                  value={preferences.max_work_hours_per_week}
                  onChange={(e) => 
                    setPreferences(prev => ({ ...prev, max_work_hours_per_week: parseInt(e.target.value) || 40 }))
                  }
                  min="0"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>月の勤務時間上限（時間）</Label>
                <Input
                  type="number"
                  value={preferences.max_work_hours_per_month}
                  onChange={(e) => 
                    setPreferences(prev => ({ ...prev, max_work_hours_per_month: parseInt(e.target.value) || 160 }))
                  }
                  min="0"
                  className="mt-2"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>残業時間アラート</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>残業時間アラートを有効化</Label>
            <Switch
              checked={preferences.enable_overtime_alert}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, enable_overtime_alert: checked }))
              }
            />
          </div>

          {preferences.enable_overtime_alert && (
            <>
              <div>
                <Label>週の残業時間上限（時間）</Label>
                <Input
                  type="number"
                  value={preferences.max_overtime_hours_per_week}
                  onChange={(e) => 
                    setPreferences(prev => ({ ...prev, max_overtime_hours_per_week: parseInt(e.target.value) || 8 }))
                  }
                  min="0"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>月の残業時間上限（時間）</Label>
                <Input
                  type="number"
                  value={preferences.max_overtime_hours_per_month}
                  onChange={(e) => 
                    setPreferences(prev => ({ ...prev, max_overtime_hours_per_month: parseInt(e.target.value) || 30 }))
                  }
                  min="0"
                  className="mt-2"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>締切リマインダー設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>締切リマインダーを有効化</Label>
            <Switch
              checked={preferences.enable_deadline_reminder}
              onCheckedChange={(checked) => 
                setPreferences(prev => ({ ...prev, enable_deadline_reminder: checked }))
              }
            />
          </div>

          {preferences.enable_deadline_reminder && (
            <div>
              <Label>締切の何日前に通知（日）</Label>
              <Input
                type="number"
                value={preferences.deadline_reminder_days_before}
                onChange={(e) => 
                  setPreferences(prev => ({ ...prev, deadline_reminder_days_before: parseInt(e.target.value) || 3 }))
                }
                min="1"
                max="30"
                className="mt-2"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          設定を保存
        </Button>
      </div>
    </div>
  );
}