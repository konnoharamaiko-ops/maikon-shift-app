import React, { useState, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Edit, Trash2, X, Save, ChevronLeft, ChevronRight, Repeat, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, isSameDay, isToday, addWeeks, addDays, getDay, setDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { fetchAll, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { sortStoresByOrder } from '@/lib/storeOrder';
import RecurringEventManager from '@/components/shift/RecurringEventManager';

// イベントカラー選択肢
const EVENT_COLORS = [
  { value: '#ef4444', label: '赤', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  { value: '#f97316', label: 'オレンジ', bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  { value: '#f59e0b', label: '黄', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  { value: '#22c55e', label: '緑', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  { value: '#3b82f6', label: '青', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  { value: '#8b5cf6', label: '紫', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  { value: '#ec4899', label: 'ピンク', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300' },
  { value: '#6b7280', label: 'グレー', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
];

// 定期パターン選択肢
const RECURRENCE_PATTERNS = [
  { value: 'weekly', label: '毎週' },
  { value: 'biweekly', label: '隔週' },
  { value: 'monthly_date', label: '毎月（同じ日付）' },
  { value: 'monthly_week', label: '毎月（同じ曜日）' },
];

const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: '日曜日' },
  { value: 1, label: '月曜日' },
  { value: 2, label: '火曜日' },
  { value: 3, label: '水曜日' },
  { value: 4, label: '木曜日' },
  { value: 5, label: '金曜日' },
  { value: 6, label: '土曜日' },
];

function getColorStyle(colorValue) {
  const found = EVENT_COLORS.find(c => c.value === colorValue);
  if (found) return found;
  const legacyMap = {
    red: EVENT_COLORS[0], orange: EVENT_COLORS[1], yellow: EVENT_COLORS[2],
    green: EVENT_COLORS[3], blue: EVENT_COLORS[4], purple: EVENT_COLORS[5],
    pink: EVENT_COLORS[6], gray: EVENT_COLORS[7],
  };
  return legacyMap[colorValue] || EVENT_COLORS[4];
}

// 定期イベントから指定月のイベントインスタンスを生成
function generateRecurringInstances(event, monthStart, monthEnd) {
  const instances = [];
  const startDate = parseISO(event.event_date);
  const endDate = event.recurrence_end_date ? parseISO(event.recurrence_end_date) : addMonths(monthEnd, 12);
  const pattern = event.recurrence_pattern;
  
  if (!pattern) return instances;
  
  const monthStartDate = typeof monthStart === 'string' ? parseISO(monthStart) : monthStart;
  const monthEndDate = typeof monthEnd === 'string' ? parseISO(monthEnd) : monthEnd;

  if (pattern === 'weekly' || pattern === 'biweekly') {
    const dayOfWeek = event.recurrence_day_of_week != null ? event.recurrence_day_of_week : getDay(startDate);
    const weekInterval = pattern === 'biweekly' ? 2 : 1;
    // Start from the event's start date, find the first occurrence
    let current = startDate;
    // Align to the correct day of week
    const diff = dayOfWeek - getDay(current);
    if (diff > 0) current = addDays(current, diff);
    else if (diff < 0) current = addDays(current, diff + 7);
    
    while (current <= endDate && current <= monthEndDate) {
      if (current >= monthStartDate && current <= monthEndDate) {
        instances.push({
          ...event,
          id: `${event.id}-recurring-${format(current, 'yyyy-MM-dd')}`,
          event_date: format(current, 'yyyy-MM-dd'),
          event_end_date: null,
          _isRecurringInstance: true,
          _parentId: event.id,
        });
      }
      current = addWeeks(current, weekInterval);
    }
  } else if (pattern === 'monthly_date') {
    // 毎月同じ日付
    const dayOfMonth = startDate.getDate();
    let current = new Date(monthStartDate.getFullYear(), monthStartDate.getMonth(), dayOfMonth);
    if (current < startDate) current = addMonths(current, 1);
    
    while (current <= endDate && current <= monthEndDate) {
      if (current >= monthStartDate && current.getDate() === dayOfMonth) {
        instances.push({
          ...event,
          id: `${event.id}-recurring-${format(current, 'yyyy-MM-dd')}`,
          event_date: format(current, 'yyyy-MM-dd'),
          event_end_date: null,
          _isRecurringInstance: true,
          _parentId: event.id,
        });
      }
      current = addMonths(current, 1);
      current = new Date(current.getFullYear(), current.getMonth(), Math.min(dayOfMonth, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
    }
  } else if (pattern === 'monthly_week') {
    // 毎月同じ週の同じ曜日（例: 第2火曜日）
    const dayOfWeek = event.recurrence_day_of_week != null ? event.recurrence_day_of_week : getDay(startDate);
    const weekOfMonth = event.recurrence_week_of_month || Math.ceil(startDate.getDate() / 7); // 第何週
    
    let checkMonth = new Date(monthStartDate.getFullYear(), monthStartDate.getMonth(), 1);
    while (checkMonth <= endDate && checkMonth <= monthEndDate) {
      // Find the nth dayOfWeek in this month
      let firstOfMonth = new Date(checkMonth.getFullYear(), checkMonth.getMonth(), 1);
      let firstDayOfWeek = firstOfMonth;
      const diff = dayOfWeek - getDay(firstOfMonth);
      if (diff >= 0) firstDayOfWeek = addDays(firstOfMonth, diff);
      else firstDayOfWeek = addDays(firstOfMonth, diff + 7);
      
      const targetDate = addWeeks(firstDayOfWeek, weekOfMonth - 1);
      
      if (targetDate.getMonth() === checkMonth.getMonth() && 
          targetDate >= startDate && targetDate >= monthStartDate && targetDate <= monthEndDate && targetDate <= endDate) {
        instances.push({
          ...event,
          id: `${event.id}-recurring-${format(targetDate, 'yyyy-MM-dd')}`,
          event_date: format(targetDate, 'yyyy-MM-dd'),
          event_end_date: null,
          _isRecurringInstance: true,
          _parentId: event.id,
        });
      }
      checkMonth = addMonths(checkMonth, 1);
    }
  }
  
  return instances;
}

export default function EventManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  // フォーム状態
  const [formData, setFormData] = useState({
    title: '',
    event_date: '',
    event_end_date: '',
    start_time: '',
    end_time: '',
    color: '#3b82f6',
    is_recurring: false,
    recurrence_pattern: 'weekly',
    recurrence_day_of_week: null,
    recurrence_week_of_month: null,
    recurrence_end_date: '',
    display_on_shift_table: true,
    display_on_shift_request: true,
    all_stores: true,
    store_id: '',
    description: '',
  });

  // Fetch stores
  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      return sortStoresByOrder(allStores);
    },
  });

  // Initialize selected store
  React.useEffect(() => {
    if (selectedStoreId) return;
    const userStoresSorted = stores.filter(s => user?.store_ids?.includes(s.id));
    if (userStoresSorted.length > 0) {
      setSelectedStoreId(userStoresSorted[0].id);
    } else if (stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [user, stores, selectedStoreId]);

  // Fetch events (including recurring events from past months)
  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: rawEvents = [], isLoading } = useQuery({
    queryKey: ['events', monthStart, monthEnd],
    queryFn: async () => {
      // 通常イベント: 当月のイベント
      const { data: normalEvents, error: err1 } = await supabase
        .from('Events')
        .select('*')
        .or(`is_recurring.is.null,is_recurring.eq.false`)
        .gte('event_date', monthStart)
        .lte('event_date', monthEnd)
        .order('event_date', { ascending: true });
      
      if (err1) throw err1;

      // 定期イベント: 開始日が当月以前のもの全て
      const { data: recurringEvents, error: err2 } = await supabase
        .from('Events')
        .select('*')
        .eq('is_recurring', true)
        .lte('event_date', monthEnd)
        .order('event_date', { ascending: true });
      
      if (err2) throw err2;

      return { normalEvents: normalEvents || [], recurringEvents: recurringEvents || [] };
    },
  });

  // 定期イベントのインスタンスを生成して通常イベントとマージ
  const events = useMemo(() => {
    const { normalEvents = [], recurringEvents = [] } = rawEvents;
    const monthStartDate = startOfMonth(currentMonth);
    const monthEndDate = endOfMonth(currentMonth);
    
    let allEvents = [...normalEvents];
    
    recurringEvents.forEach(event => {
      const instances = generateRecurringInstances(event, monthStartDate, monthEndDate);
      allEvents = allEvents.concat(instances);
    });
    
    // 日付順にソート
    allEvents.sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
    
    return allEvents;
  }, [rawEvents, currentMonth]);

  // Create event mutation
  const createMutation = useMutation({
    mutationFn: (data) => insertRecord('Events', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('イベントを作成しました');
      resetForm();
    },
    onError: (error) => {
      toast.error('作成に失敗しました: ' + error.message);
    },
  });

  // Update event mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('Events', id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('イベントを更新しました');
      resetForm();
    },
    onError: (error) => {
      toast.error('更新に失敗しました: ' + error.message);
    },
  });

  // Delete event mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRecord('Events', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('イベントを削除しました');
      resetForm();
    },
    onError: (error) => {
      toast.error('削除に失敗しました: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      event_date: '',
      event_end_date: '',
      start_time: '',
      end_time: '',
      color: '#3b82f6',
      is_recurring: false,
      recurrence_pattern: 'weekly',
      recurrence_day_of_week: null,
      recurrence_week_of_month: null,
      recurrence_end_date: '',
      display_on_shift_table: true,
      display_on_shift_request: true,
      all_stores: true,
      store_id: '',
      description: '',
    });
    setEditingEvent(null);
    setShowForm(false);
    setSelectedDate(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.title || !formData.event_date) {
      toast.error('イベント名と開始日は必須です');
      return;
    }

    const dataToSubmit = {
      title: formData.title,
      event_date: formData.event_date,
      event_end_date: formData.is_recurring ? null : (formData.event_end_date || null),
      start_time: formData.start_time || null,
      end_time: formData.end_time || null,
      color: formData.color,
      is_recurring: formData.is_recurring,
      recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : null,
      recurrence_day_of_week: formData.is_recurring ? (formData.recurrence_day_of_week != null ? parseInt(formData.recurrence_day_of_week) : null) : null,
      recurrence_week_of_month: (formData.is_recurring && formData.recurrence_pattern === 'monthly_week') ? (formData.recurrence_week_of_month != null ? parseInt(formData.recurrence_week_of_month) : null) : null,
      recurrence_end_date: formData.is_recurring ? (formData.recurrence_end_date || null) : null,
      display_on_shift_table: formData.display_on_shift_table,
      display_on_shift_request: formData.display_on_shift_request,
      all_stores: formData.all_stores,
      store_id: formData.all_stores ? null : (formData.store_id || selectedStoreId),
      description: formData.description || null,
    };

    if (editingEvent) {
      const eventId = editingEvent._parentId || editingEvent.id;
      updateMutation.mutate({ id: eventId, data: dataToSubmit });
    } else {
      createMutation.mutate({ ...dataToSubmit, created_by: user?.email || '' });
    }
  };

  // カレンダーの日付をクリック
  const handleDateClick = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayEvents = getEventsForDate(date);
    
    if (dayEvents.length >= 1) {
      // 1件以上のイベントがある場合 → 日付を選択して一覧表示（追加ボタンも表示）
      setSelectedDate(date);
      setShowForm(false);
      setEditingEvent(null);
    } else {
      // イベントがない場合 → 新規作成
      setFormData({
        ...formData,
        title: '',
        event_date: dateStr,
        event_end_date: '',
        start_time: '',
        end_time: '',
        color: '#3b82f6',
        is_recurring: false,
        recurrence_pattern: 'weekly',
        recurrence_day_of_week: null,
        recurrence_week_of_month: null,
        recurrence_end_date: '',
        description: '',
      });
      setEditingEvent(null);
      setSelectedDate(date);
      setShowForm(true);
    }
  };

  const handleEditEvent = (event) => {
    setFormData({
      title: event.title,
      event_date: event._isRecurringInstance ? (event._parentId ? events.find(e => e.id === event._parentId)?.event_date || event.event_date : event.event_date) : event.event_date,
      event_end_date: event.event_end_date || '',
      start_time: event.start_time || '',
      end_time: event.end_time || '',
      color: event.color || '#3b82f6',
      is_recurring: event.is_recurring || false,
      recurrence_pattern: event.recurrence_pattern || 'weekly',
      recurrence_day_of_week: event.recurrence_day_of_week != null ? event.recurrence_day_of_week : null,
      recurrence_week_of_month: event.recurrence_week_of_month || null,
      recurrence_end_date: event.recurrence_end_date || '',
      display_on_shift_table: event.display_on_shift_table !== false,
      display_on_shift_request: event.display_on_shift_request !== false,
      all_stores: event.all_stores !== false,
      store_id: event.store_id || '',
      description: event.description || '',
    });
    setEditingEvent(event);
    setSelectedDate(parseISO(event.event_date));
    setShowForm(true);
  };

  const handleNewEvent = () => {
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    setFormData({
      ...formData,
      title: '',
      event_date: dateStr,
      event_end_date: '',
      start_time: '',
      end_time: '',
      color: '#3b82f6',
      is_recurring: false,
      recurrence_pattern: 'weekly',
      recurrence_day_of_week: null,
      recurrence_week_of_month: null,
      recurrence_end_date: '',
      description: '',
    });
    setEditingEvent(null);
    setShowForm(true);
  };

  const handleDeleteEvent = (event) => {
    const eventId = event._parentId || event.id;
    if (event._isRecurringInstance) {
      if (confirm('この定期イベントの全ての繰り返しを削除しますか？')) {
        deleteMutation.mutate(eventId);
      }
    } else {
      deleteMutation.mutate(eventId);
    }
  };

  // カレンダー表示用の日付配列
  const calendarStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 p-2 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-200 flex-shrink-0">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-2xl font-bold text-slate-800">イベント管理</h1>
              <p className="text-[10px] sm:text-sm text-slate-500">店舗イベント・催事の管理</p>
            </div>
          </div>
          <RecurringEventManager
            storeId={selectedStoreId}
            onEventsChanged={() => queryClient.invalidateQueries({ queryKey: ['events'] })}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* カレンダー（左側） */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <CardTitle className="text-xl">{format(currentMonth, 'yyyy年 M月', { locale: ja })}</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-2 md:p-4">
                <div className="grid grid-cols-7 gap-1">
                  {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
                    <div key={day} className={`text-center text-xs md:text-sm font-bold py-1 md:py-2 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-600'}`}>
                      {day}
                    </div>
                  ))}
                  {days.map((day) => {
                    const dayEvents = getEventsForDate(day);
                    const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                    const dayOfWeek = day.getDay();
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);

                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => isCurrentMonth && handleDateClick(day)}
                        className={`min-h-[60px] md:min-h-[90px] p-1 md:p-2 border rounded-lg cursor-pointer transition-all
                          ${!isCurrentMonth ? 'bg-slate-50 opacity-40 cursor-default' : 'hover:bg-blue-50 hover:border-blue-300'}
                          ${isSelected ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'}
                          ${isTodayDate && !isSelected ? 'bg-amber-50 border-amber-300' : ''}
                        `}
                      >
                        <div className={`text-xs md:text-sm font-bold mb-0.5 
                          ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700'}
                          ${isTodayDate ? 'underline' : ''}
                        `}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(event => {
                            const colorStyle = getColorStyle(event.color);
                            return (
                              <div
                                key={event.id}
                                className={`text-[9px] md:text-[11px] px-1 py-0.5 rounded truncate font-medium ${colorStyle.bg} ${colorStyle.text} ${event._isRecurringInstance ? 'border-l-2 border-l-current' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditEvent(event);
                                }}
                              >
                                {event._isRecurringInstance && <Repeat className="w-2 h-2 inline mr-0.5" />}
                                {event.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 3 && (
                            <div className="text-[9px] text-slate-400 text-center">+{dayEvents.length - 3}件</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右側パネル（フォーム or イベント一覧） */}
          <div className="lg:col-span-1">
            {showForm ? (
              /* イベント作成/編集フォーム */
              <Card className="sticky top-4">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {editingEvent ? (editingEvent._isRecurringInstance ? '定期イベントを編集' : 'イベントを編集') : '新規イベント'}
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={resetForm}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    {/* イベント名 */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">イベント名 *</Label>
                      <Input
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="例: 新春セール"
                        className="mt-1"
                        required
                      />
                    </div>

                    {/* カラー選択 */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">カラー</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {EVENT_COLORS.map(color => (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, color: color.value })}
                            className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center
                              ${formData.color === color.value ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-105'}
                            `}
                            style={{ backgroundColor: color.value }}
                            title={color.label}
                          >
                            {formData.color === color.value && (
                              <span className="text-white text-xs font-bold">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 日付 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">開始日 *</Label>
                        <Input
                          type="date"
                          value={formData.event_date}
                          onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                          className="mt-1"
                          required
                        />
                      </div>
                      {!formData.is_recurring && (
                        <div>
                          <Label className="text-xs font-semibold text-slate-600">終了日</Label>
                          <Input
                            type="date"
                            value={formData.event_end_date}
                            onChange={(e) => setFormData({ ...formData, event_end_date: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      )}
                    </div>

                    {/* 時刻 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">開始時刻</Label>
                        <Input
                          type="time"
                          value={formData.start_time}
                          onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">終了時刻</Label>
                        <Input
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    {/* 定期設定 */}
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-sm font-semibold text-slate-600">定期イベント</span>
                        </div>
                        <Switch
                          checked={formData.is_recurring}
                          onCheckedChange={(v) => setFormData({ ...formData, is_recurring: v })}
                        />
                      </div>
                      
                      {formData.is_recurring && (
                        <div className="space-y-2 pl-2 border-l-2 border-purple-200 ml-1">
                          {/* 繰り返しパターン */}
                          <div>
                            <Label className="text-xs font-semibold text-slate-500">繰り返しパターン</Label>
                            <Select 
                              value={formData.recurrence_pattern} 
                              onValueChange={(v) => setFormData({ ...formData, recurrence_pattern: v })}
                            >
                              <SelectTrigger className="mt-1 h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RECURRENCE_PATTERNS.map(p => (
                                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* 第N週選択（毎月同じ曜日の場合） */}
                          {formData.recurrence_pattern === 'monthly_week' && (
                            <div>
                              <Label className="text-xs font-semibold text-slate-500">第何週</Label>
                              <Select 
                                value={formData.recurrence_week_of_month != null ? String(formData.recurrence_week_of_month) : ''} 
                                onValueChange={(v) => setFormData({ ...formData, recurrence_week_of_month: parseInt(v) })}
                              >
                                <SelectTrigger className="mt-1 h-9">
                                  <SelectValue placeholder="開始日から自動計算" />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1,2,3,4,5].map(w => (
                                    <SelectItem key={w} value={String(w)}>第{w}週</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          
                          {/* 曜日選択（毎週・隔週・毎月同じ曜日の場合） */}
                          {(formData.recurrence_pattern === 'weekly' || formData.recurrence_pattern === 'biweekly' || formData.recurrence_pattern === 'monthly_week') && (
                            <div>
                              <Label className="text-xs font-semibold text-slate-500">曜日</Label>
                              <Select 
                                value={formData.recurrence_day_of_week != null ? String(formData.recurrence_day_of_week) : ''} 
                                onValueChange={(v) => setFormData({ ...formData, recurrence_day_of_week: parseInt(v) })}
                              >
                                <SelectTrigger className="mt-1 h-9">
                                  <SelectValue placeholder="開始日の曜日を使用" />
                                </SelectTrigger>
                                <SelectContent>
                                  {DAY_OF_WEEK_OPTIONS.map(d => (
                                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          
                          {/* 終了日 */}
                          <div>
                            <Label className="text-xs font-semibold text-slate-500">繰り返し終了日（任意）</Label>
                            <Input
                              type="date"
                              value={formData.recurrence_end_date}
                              onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                              className="mt-1 h-9"
                              placeholder="未設定の場合は無期限"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 表示設定 */}
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-xs font-semibold text-slate-600">表示設定</Label>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">シフト表に表示</span>
                        <Switch
                          checked={formData.display_on_shift_table}
                          onCheckedChange={(v) => setFormData({ ...formData, display_on_shift_table: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">シフト希望一覧に表示</span>
                        <Switch
                          checked={formData.display_on_shift_request}
                          onCheckedChange={(v) => setFormData({ ...formData, display_on_shift_request: v })}
                        />
                      </div>
                    </div>

                    {/* 対象店舗 */}
                    <div className="pt-2 border-t">
                      <Label className="text-xs font-semibold text-slate-600">対象店舗</Label>
                      <div className="flex gap-3 mt-1">
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="radio"
                            checked={formData.all_stores}
                            onChange={() => setFormData({ ...formData, all_stores: true })}
                          />
                          全店舗
                        </label>
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="radio"
                            checked={!formData.all_stores}
                            onChange={() => setFormData({ ...formData, all_stores: false })}
                          />
                          特定店舗
                        </label>
                      </div>
                      {!formData.all_stores && (
                        <Select value={formData.store_id} onValueChange={(v) => setFormData({ ...formData, store_id: v })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="店舗を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {stores.map(store => (
                              <SelectItem key={store.id} value={store.id}>
                                {store.store_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* 説明 */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">説明</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="イベントの詳細..."
                        className="mt-1"
                        rows={2}
                      />
                    </div>

                    {/* ボタン */}
                    <div className="flex gap-2 pt-2">
                      <Button type="submit" className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700">
                        <Save className="w-4 h-4 mr-1" />
                        {editingEvent ? '更新' : '作成'}
                      </Button>
                      {editingEvent && (
                        <Button
                          type="button"
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => handleDeleteEvent(editingEvent)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : selectedDate ? (
              /* 選択日のイベント一覧 */
              <Card className="sticky top-4">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {format(selectedDate, 'M月d日(E)', { locale: ja })}
                    </CardTitle>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={handleNewEvent} className="bg-gradient-to-r from-purple-500 to-indigo-600">
                        <Plus className="w-4 h-4 mr-1" /> 追加
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {getEventsForDate(selectedDate).length > 0 ? (
                    <div className="space-y-2">
                      {getEventsForDate(selectedDate).map(event => {
                        const colorStyle = getColorStyle(event.color);
                        const store = stores.find(s => s.id === event.store_id);
                        return (
                          <div
                            key={event.id}
                            className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all ${colorStyle.bg} ${colorStyle.border}`}
                            onClick={() => handleEditEvent(event)}
                          >
                            <div className="flex items-center gap-1.5">
                              {event._isRecurringInstance && <Repeat className="w-3 h-3 flex-shrink-0" />}
                              <span className={`font-bold ${colorStyle.text}`}>{event.title}</span>
                            </div>
                            {(event.start_time || event.end_time) && (
                              <div className="text-xs text-slate-600 mt-1">
                                {event.start_time?.substring(0, 5)}{event.end_time ? ` 〜 ${event.end_time.substring(0, 5)}` : ''}
                              </div>
                            )}
                            {event.is_recurring && (
                              <div className="text-xs text-purple-600 mt-0.5 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" />
                                {RECURRENCE_PATTERNS.find(p => p.value === event.recurrence_pattern)?.label || '定期'}
                              </div>
                            )}
                            {store && <div className="text-xs text-slate-500 mt-0.5">{store.store_name}</div>}
                            {event.description && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{event.description}</div>}
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleEditEvent(event); }}>
                                <Edit className="w-3 h-3 mr-1" /> 編集
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event); }}>
                                <Trash2 className="w-3 h-3 mr-1" /> 削除
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">この日にイベントはありません</p>
                      <Button size="sm" className="mt-3" onClick={handleNewEvent}>
                        <Plus className="w-4 h-4 mr-1" /> イベントを追加
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* 今後のイベント一覧（デフォルト表示） */
              <Card className="sticky top-4">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">今後のイベント</CardTitle>
                    <Button size="sm" onClick={handleNewEvent} className="bg-gradient-to-r from-purple-500 to-indigo-600">
                      <Plus className="w-4 h-4 mr-1" /> 新規
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {events.length > 0 ? (
                    <div className="space-y-2">
                      {events.map(event => {
                        const colorStyle = getColorStyle(event.color);
                        const store = stores.find(s => s.id === event.store_id);
                        return (
                          <div
                            key={event.id}
                            className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all ${colorStyle.bg} ${colorStyle.border}`}
                            onClick={() => handleEditEvent(event)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                {event._isRecurringInstance && <Repeat className="w-3 h-3 flex-shrink-0" />}
                                <span className={`font-bold text-sm ${colorStyle.text}`}>{event.title}</span>
                              </div>
                              <div className="text-xs text-slate-500">
                                {format(parseISO(event.event_date), 'M/d(E)', { locale: ja })}
                              </div>
                            </div>
                            {(event.start_time || event.end_time) && (
                              <div className="text-xs text-slate-600 mt-0.5">
                                {event.start_time?.substring(0, 5)}{event.end_time ? ` 〜 ${event.end_time.substring(0, 5)}` : ''}
                              </div>
                            )}
                            {event.is_recurring && (
                              <div className="text-xs text-purple-600 mt-0.5 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" />
                                {RECURRENCE_PATTERNS.find(p => p.value === event.recurrence_pattern)?.label || '定期'}
                              </div>
                            )}
                            {store && <div className="text-xs text-slate-500 mt-0.5">{store.store_name}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">今月のイベントはありません</p>
                      <p className="text-xs mt-1">カレンダーの日付をクリックして追加</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
