import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fetchFiltered, updateRecord, deleteRecord, subscribeToTable } from '@/api/supabaseHelpers';

export default function NotificationCenter({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: () => fetchFiltered('Notification', { user_id: user?.id }),
  });

  // リアルタイム通知監視
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToTable('Notification', (event) => {
      if (event.type === 'create' && event.data.user_id === user?.id) {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        
        if ('Notification' in window && window.Notification.permission === 'granted') {
          new window.Notification(event.data.title, {
            body: event.data.content,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
          });
        }
        
        toast.info(event.data.title, {
          description: event.data.content,
        });
      }
    });

    return unsubscribe;
  }, [user, queryClient]);

  const markAsReadMutation = useMutation({
    mutationFn: (id) => updateRecord('Notification', id, { is_read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id) => deleteRecord('Notification', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('通知を削除しました');
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.is_read);
      await Promise.all(unread.map(n => updateRecord('Notification', n.id, { is_read: true })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('全て既読にしました');
    },
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const getTypeIcon = (type) => {
    switch (type) {
      case 'shift_confirmed': return '📋';
      case 'shift_change': return '📅';
      case 'shift_request': return '✍️';
      case 'deadline': return '⏰';
      case 'paid_leave': return '🏖️';
      case 'message': return '💬';
      case 'system': return '⚙️';
      default: return '📌';
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast.success('通知が有効になりました');
      }
    }
  };

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800">通知</h3>
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">
                    {unreadCount}件未読
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllAsReadMutation.mutate()}
                    className="text-xs h-7"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    全て既読
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>通知はありません</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        'p-4 hover:bg-slate-50 transition-colors cursor-pointer',
                        !notification.is_read && 'bg-blue-50'
                      )}
                      onClick={() => {
                        markAsReadMutation.mutate(notification.id);
                        // shift_confirmed タイプの場合はURL遷移をスキップし、確定シフト表を開くイベントを発火
                        if (notification.type === 'shift_confirmed') {
                          window.dispatchEvent(new CustomEvent('openConfirmedShift'));
                          setIsOpen(false);
                          return;
                        }
                        if (notification.action_url) {
                          if (notification.action_url.startsWith('/')) {
                            window.location.href = notification.action_url;
                          } else {
                            window.location.href = notification.action_url;
                          }
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{getTypeIcon(notification.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-slate-800 text-sm">
                              {notification.title}
                            </h4>
                            {!notification.is_read && (
                              <span className="w-2 h-2 bg-blue-500 rounded-full mt-1 flex-shrink-0"></span>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            {notification.content}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-400">
                              {format(new Date(notification.created_date), 'M月d日 HH:mm', { locale: ja })}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotificationMutation.mutate(notification.id);
                              }}
                              className="h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}