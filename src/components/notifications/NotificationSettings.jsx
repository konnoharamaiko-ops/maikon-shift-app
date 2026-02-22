import React from 'react';
import { supabase } from '@/api/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, CheckCircle2, AlertTriangle, Calendar, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { updateRecord } from '@/api/supabaseHelpers';

export default function NotificationSettings({ user }) {
  const queryClient = useQueryClient();
  
  const preferences = user?.metadata?.notification_preferences || user?.notification_preferences || {
    shift_confirmed: true,
    shift_changed: true,
    deadline_reminder: true,
    new_message: true
  };

  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences) => {
      if (user?.id) {
        const currentMetadata = user?.metadata || {};
        await updateRecord('User', user?.id, { 
          metadata: { ...currentMetadata, notification_preferences: newPreferences } 
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success('通知設定を更新しました');
    }
  });

  const handleToggle = (key, value) => {
    const newPreferences = {
      ...preferences,
      [key]: value
    };
    updatePreferencesMutation.mutate(newPreferences);
  };

  const notificationTypes = [
    {
      key: 'shift_confirmed',
      label: 'シフト確定通知',
      description: 'シフトが確定されたときに通知',
      icon: CheckCircle2,
      color: 'text-green-600'
    },
    {
      key: 'shift_changed',
      label: 'シフト変更通知',
      description: 'シフトが変更されたときに通知',
      icon: AlertTriangle,
      color: 'text-amber-600'
    },
    {
      key: 'deadline_reminder',
      label: '提出期限リマインダー',
      description: 'シフト希望の提出期限が近づいたときに通知',
      icon: Calendar,
      color: 'text-indigo-600'
    },
    {
      key: 'new_message',
      label: '新着メッセージ通知',
      description: '管理者からのメッセージを受信したときに通知',
      icon: MessageSquare,
      color: 'text-blue-600'
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          通知設定
        </CardTitle>
        <CardDescription>
          受け取りたい通知を選択してください
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notificationTypes.map(({ key, label, description, icon: Icon, color }) => (
          <div key={key} className="flex items-start justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 mt-0.5 ${color}`} />
              <div>
                <Label className="font-medium">{label}</Label>
                <p className="text-xs text-slate-500 mt-1">{description}</p>
              </div>
            </div>
            <Switch
              checked={preferences[key]}
              onCheckedChange={(checked) => handleToggle(key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}