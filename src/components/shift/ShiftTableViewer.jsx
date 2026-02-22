import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Download, Bell, BellOff } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

export default function ShiftTableViewer({ storeId }) {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hasUnreadUpdate, setHasUnreadUpdate] = useState(false);

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  // シフト表データを取得
  const { data: shifts = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['confirmedShifts', storeId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('WorkShift')
        .select('*')
        .eq('store_id', storeId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .eq('is_confirmed', true)
        .order('date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000, // 30秒ごとに自動更新
    refetchOnWindowFocus: true,
    onSuccess: () => {
      // 新しいデータが取得されたら通知バッジを表示
      setHasUnreadUpdate(true);
    },
  });

  // ユーザー情報を取得
  const { data: users = [] } = useQuery({
    queryKey: ['storeUsers', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('User')
        .select('*')
        .contains('store_ids', [storeId]);
      
      if (error) throw error;
      return data || [];
    },
  });

  // イベント情報を取得
  const { data: events = [] } = useQuery({
    queryKey: ['events', monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('Events')
        .select('*')
        .gte('event_date', monthStart)
        .lte('event_date', monthEnd)
        .eq('display_on_shift_table', true);
      
      if (error) throw error;
      return data || [];
    },
  });

  const handleRefresh = async () => {
    setHasUnreadUpdate(false);
    await refetch();
    toast.success('シフト表を更新しました');
  };

  const handleMarkAsRead = () => {
    setHasUnreadUpdate(false);
  };

  // カレンダーの日付を生成
  const calendarStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  // 日付ごとのシフトを取得
  const getShiftsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.filter(s => s.date === dateStr);
  };

  // 日付ごとのイベントを取得
  const getEventsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => {
      const start = e.event_date;
      const end = e.event_end_date || e.event_date;
      return dateStr >= start && dateStr <= end;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-500">シフト表を読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-blue-600" />
              <CardTitle className="text-2xl">確定シフト表</CardTitle>
              {hasUnreadUpdate && (
                <div className="relative">
                  <Bell className="w-5 h-5 text-orange-500 animate-pulse" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-lg font-bold text-slate-800 min-w-[120px] text-center">
                {format(currentMonth, 'yyyy年 M月', { locale: ja })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="ml-2"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                更新
              </Button>
              {hasUnreadUpdate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAsRead}
                >
                  <BellOff className="w-4 h-4 mr-1" />
                  既読
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* カレンダー形式のシフト表 */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-7 gap-0 border border-slate-200 rounded-lg overflow-hidden">
            {/* 曜日ヘッダー */}
            {weekDays.map((day, i) => (
              <div
                key={day}
                className={`text-center text-sm font-bold py-3 border-b border-slate-200 ${
                  i === 0 ? 'bg-red-50 text-red-600' : i === 6 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'
                }`}
              >
                {day}
              </div>
            ))}

            {/* 日付とシフト */}
            {days.map((day, index) => {
              const dayShifts = getShiftsForDate(day);
              const dayEvents = getEventsForDate(day);
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
              const dayOfWeek = day.getDay();

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[120px] p-2 border-b border-r border-slate-200 ${
                    !isCurrentMonth ? 'bg-slate-50 opacity-50' : 'bg-white'
                  } ${isToday ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-sm font-bold ${
                        dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayShifts.length > 0 && (
                      <span className="text-xs text-slate-400">{dayShifts.length}名</span>
                    )}
                  </div>

                  {/* イベント表示 */}
                  {dayEvents.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {dayEvents.slice(0, 1).map(event => (
                        <div
                          key={event.id}
                          className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded truncate"
                        >
                          {event.title}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* シフト表示 */}
                  <div className="space-y-1">
                    {dayShifts.slice(0, 5).map(shift => {
                      const shiftUser = users.find(u => u.email === shift.user_email);
                      return (
                        <div
                          key={shift.id}
                          className="text-[11px] px-1.5 py-1 bg-blue-50 text-blue-700 rounded"
                        >
                          <div className="font-medium truncate">{shiftUser?.user_name || shift.user_email}</div>
                          {shift.start_time && shift.end_time && (
                            <div className="text-[10px] text-blue-600">
                              {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dayShifts.length > 5 && (
                      <div className="text-[10px] text-slate-400 text-center">+{dayShifts.length - 5}名</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 統計情報 */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-slate-500">確定シフト数</p>
              <p className="text-2xl font-bold text-blue-600">{shifts.length}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">勤務者数</p>
              <p className="text-2xl font-bold text-green-600">
                {new Set(shifts.map(s => s.user_email)).size}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">イベント数</p>
              <p className="text-2xl font-bold text-orange-600">{events.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 最終更新時刻 */}
      <div className="text-center text-xs text-slate-400">
        最終更新: {format(dataUpdatedAt, 'HH:mm:ss')}
      </div>
    </div>
  );
}
