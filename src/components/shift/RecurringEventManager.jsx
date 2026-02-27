import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { format, parseISO, addMonths, addWeeks, addDays, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { RefreshCw, Plus, Edit, Trash2, X, Save, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';

// イベントカラー選択肢
const EVENT_COLORS = [
  { value: '#ef4444', label: '赤' },
  { value: '#f97316', label: 'オレンジ' },
  { value: '#f59e0b', label: '黄' },
  { value: '#22c55e', label: '緑' },
  { value: '#3b82f6', label: '青' },
  { value: '#8b5cf6', label: '紫' },
  { value: '#ec4899', label: 'ピンク' },
  { value: '#6b7280', label: 'グレー' },
];

const RECURRENCE_PATTERNS = [
  { value: 'weekly', label: '毎週' },
  { value: 'biweekly', label: '隔週' },
  { value: 'monthly_date', label: '毎月（同じ日付）' },
  { value: 'monthly_week', label: '毎月（第N曜日）' },
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

const WEEK_OF_MONTH_OPTIONS = [
  { value: 1, label: '第1' },
  { value: 2, label: '第2' },
  { value: 3, label: '第3' },
  { value: 4, label: '第4' },
  { value: 5, label: '第5' },
];

function getPatternDescription(event) {
  const pattern = event.recurrence_pattern;
  const dayName = DAY_OF_WEEK_OPTIONS.find(d => d.value === event.recurrence_day_of_week)?.label || '';
  
  if (pattern === 'weekly') return `毎週${dayName}`;
  if (pattern === 'biweekly') return `隔週${dayName}`;
  if (pattern === 'monthly_date') {
    const date = parseISO(event.event_date);
    return `毎月${date.getDate()}日`;
  }
  if (pattern === 'monthly_week') {
    const weekNum = event.recurrence_week_of_month || Math.ceil(parseISO(event.event_date).getDate() / 7);
    return `毎月第${weekNum}${dayName}`;
  }
  return '定期';
}

export default function RecurringEventManager({ storeId, onEventsChanged }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    title: '',
    color: '#3b82f6',
    recurrence_pattern: 'monthly_week',
    recurrence_day_of_week: 5, // 金曜日
    recurrence_week_of_month: 3, // 第3
    event_date: format(new Date(), 'yyyy-MM-dd'),
    recurrence_end_date: '',
    description: '',
    display_on_shift_table: true,
    display_on_shift_request: true,
    all_stores: true,
    store_id: '',
  });

  // 定期イベント一覧を取得
  const { data: recurringEvents = [], isLoading } = useQuery({
    queryKey: ['recurringEvents', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('Events')
        .select('*')
        .eq('is_recurring', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).filter(e => e.all_stores || !e.store_id || (storeId && e.store_id === storeId));
    },
    enabled: !!storeId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => insertRecord('Events', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringEvents'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('定期イベントを作成しました');
      resetForm();
      if (onEventsChanged) onEventsChanged();
    },
    onError: (error) => toast.error('作成に失敗しました: ' + error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('Events', id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringEvents'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('定期イベントを更新しました');
      resetForm();
      if (onEventsChanged) onEventsChanged();
    },
    onError: (error) => toast.error('更新に失敗しました: ' + error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRecord('Events', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringEvents'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('定期イベントを削除しました');
      resetForm();
      if (onEventsChanged) onEventsChanged();
    },
    onError: (error) => toast.error('削除に失敗しました: ' + error.message),
  });

  const resetForm = () => {
    setFormData({
      title: '',
      color: '#3b82f6',
      recurrence_pattern: 'monthly_week',
      recurrence_day_of_week: 5,
      recurrence_week_of_month: 3,
      event_date: format(new Date(), 'yyyy-MM-dd'),
      recurrence_end_date: '',
      description: '',
      display_on_shift_table: true,
      display_on_shift_request: true,
      all_stores: true,
      store_id: '',
    });
    setEditingEvent(null);
    setShowForm(false);
  };

  const handleEdit = (event) => {
    setFormData({
      title: event.title || '',
      color: event.color || '#3b82f6',
      recurrence_pattern: event.recurrence_pattern || 'monthly_week',
      recurrence_day_of_week: event.recurrence_day_of_week != null ? event.recurrence_day_of_week : 5,
      recurrence_week_of_month: event.recurrence_week_of_month || Math.ceil(parseISO(event.event_date).getDate() / 7),
      event_date: event.event_date || format(new Date(), 'yyyy-MM-dd'),
      recurrence_end_date: event.recurrence_end_date || '',
      description: event.description || '',
      display_on_shift_table: event.display_on_shift_table !== false,
      display_on_shift_request: event.display_on_shift_request !== false,
      all_stores: event.all_stores !== false,
      store_id: event.store_id || '',
    });
    setEditingEvent(event);
    setShowForm(true);
  };

  const handleDelete = (event) => {
    if (confirm(`定期イベント「${event.title}」を削除しますか？\nこのイベントの全ての繰り返しが削除されます。`)) {
      deleteMutation.mutate(event.id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title) {
      toast.error('イベント名は必須です');
      return;
    }

    const dataToSubmit = {
      title: formData.title,
      event_date: formData.event_date,
      event_end_date: null,
      start_time: null,
      end_time: null,
      color: formData.color,
      is_recurring: true,
      recurrence_pattern: formData.recurrence_pattern,
      recurrence_day_of_week: formData.recurrence_day_of_week != null ? parseInt(formData.recurrence_day_of_week) : null,
      recurrence_week_of_month: formData.recurrence_pattern === 'monthly_week' ? parseInt(formData.recurrence_week_of_month) : null,
      recurrence_end_date: formData.recurrence_end_date || null,
      display_on_shift_table: formData.display_on_shift_table,
      display_on_shift_request: formData.display_on_shift_request,
      all_stores: formData.all_stores,
      store_id: formData.all_stores ? null : (formData.store_id || storeId),
      description: formData.description || null,
    };

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: dataToSubmit });
    } else {
      createMutation.mutate({ ...dataToSubmit, created_by: user?.email || '' });
    }
  };

  // プレビュー: 次回の発生日を計算
  const nextOccurrence = useMemo(() => {
    const today = new Date();
    const pattern = formData.recurrence_pattern;
    const dayOfWeek = parseInt(formData.recurrence_day_of_week);
    
    if (pattern === 'monthly_week') {
      const weekOfMonth = parseInt(formData.recurrence_week_of_month);
      // 今月と来月で探す
      for (let i = 0; i < 2; i++) {
        const checkMonth = addMonths(today, i);
        const firstOfMonth = new Date(checkMonth.getFullYear(), checkMonth.getMonth(), 1);
        const diff = dayOfWeek - getDay(firstOfMonth);
        const firstDayOfWeek = diff >= 0 ? addDays(firstOfMonth, diff) : addDays(firstOfMonth, diff + 7);
        const targetDate = addWeeks(firstDayOfWeek, weekOfMonth - 1);
        if (targetDate >= today && targetDate.getMonth() === checkMonth.getMonth()) {
          return format(targetDate, 'yyyy年M月d日(E)', { locale: ja });
        }
      }
    } else if (pattern === 'weekly' || pattern === 'biweekly') {
      let current = today;
      const diff = dayOfWeek - getDay(current);
      if (diff > 0) current = addDays(current, diff);
      else if (diff < 0) current = addDays(current, diff + 7);
      else if (diff === 0) current = today;
      return format(current, 'yyyy年M月d日(E)', { locale: ja });
    } else if (pattern === 'monthly_date') {
      const startDate = formData.event_date ? parseISO(formData.event_date) : today;
      const dayOfMonth = startDate.getDate();
      let current = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
      if (current < today) current = addMonths(current, 1);
      return format(current, 'yyyy年M月d日(E)', { locale: ja });
    }
    return null;
  }, [formData.recurrence_pattern, formData.recurrence_day_of_week, formData.recurrence_week_of_month, formData.event_date]);

  return (
    <div className="relative">
      {/* 定期イベントアイコンボタン */}
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4 text-purple-600" />
        <span className="hidden sm:inline">定期イベント</span>
        {recurringEvents.length > 0 && (
          <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {recurringEvents.length}
          </span>
        )}
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </Button>

      {/* 展開パネル */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 sm:left-auto sm:right-auto mt-2 w-[calc(100vw-2rem)] sm:w-[420px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-[70vh] overflow-y-auto">
          <div className="p-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-slate-800">定期イベント設定</h3>
              </div>
              <div className="flex gap-1">
                {!showForm && (
                  <Button
                    size="sm"
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white h-7 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" /> 追加
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setIsOpen(false); resetForm(); }} className="h-7 w-7 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* フォーム */}
            {showForm && (
              <form onSubmit={handleSubmit} className="space-y-3 mb-4 p-3 bg-purple-50/50 rounded-lg border border-purple-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-purple-700">
                    {editingEvent ? '定期イベントを編集' : '新規定期イベント'}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="h-6 w-6 p-0">
                    <X className="w-3 h-3" />
                  </Button>
                </div>

                {/* イベント名 */}
                <div>
                  <Label className="text-xs font-semibold text-slate-600">イベント名 *</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="例: ポイント5倍デー"
                    className="mt-1 h-8 text-sm"
                    required
                  />
                </div>

                {/* カラー */}
                <div>
                  <Label className="text-xs font-semibold text-slate-600">カラー</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {EVENT_COLORS.map(color => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, color: color.value })}
                        className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center
                          ${formData.color === color.value ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-105'}
                        `}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      >
                        {formData.color === color.value && <span className="text-white text-[8px] font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 繰り返しパターン */}
                <div>
                  <Label className="text-xs font-semibold text-slate-600">繰り返しパターン</Label>
                  <Select
                    value={formData.recurrence_pattern}
                    onValueChange={(v) => setFormData({ ...formData, recurrence_pattern: v })}
                  >
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_PATTERNS.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 第N曜日設定（monthly_weekの場合） */}
                {formData.recurrence_pattern === 'monthly_week' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">第何週</Label>
                      <Select
                        value={String(formData.recurrence_week_of_month)}
                        onValueChange={(v) => setFormData({ ...formData, recurrence_week_of_month: parseInt(v) })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEK_OF_MONTH_OPTIONS.map(w => (
                            <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">曜日</Label>
                      <Select
                        value={String(formData.recurrence_day_of_week)}
                        onValueChange={(v) => setFormData({ ...formData, recurrence_day_of_week: parseInt(v) })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_OF_WEEK_OPTIONS.map(d => (
                            <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* 曜日選択（weekly/biweeklyの場合） */}
                {(formData.recurrence_pattern === 'weekly' || formData.recurrence_pattern === 'biweekly') && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-600">曜日</Label>
                    <Select
                      value={String(formData.recurrence_day_of_week)}
                      onValueChange={(v) => setFormData({ ...formData, recurrence_day_of_week: parseInt(v) })}
                    >
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OF_WEEK_OPTIONS.map(d => (
                          <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 開始日（monthly_dateの場合は日付が重要） */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-semibold text-slate-600">開始日</Label>
                    <Input
                      type="date"
                      value={formData.event_date}
                      onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-slate-600">終了日（任意）</Label>
                    <Input
                      type="date"
                      value={formData.recurrence_end_date}
                      onChange={(e) => setFormData({ ...formData, recurrence_end_date: e.target.value })}
                      className="mt-1 h-8 text-sm"
                      placeholder="無期限"
                    />
                  </div>
                </div>

                {/* 説明 */}
                <div>
                  <Label className="text-xs font-semibold text-slate-600">説明</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="例: 全品ポイント5倍"
                    className="mt-1 h-8 text-sm"
                  />
                </div>

                {/* 表示設定 */}
                <div className="space-y-1.5 pt-2 border-t border-purple-200">
                  <Label className="text-xs font-semibold text-slate-600">表示設定</Label>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">シフト表に表示</span>
                    <Switch
                      checked={formData.display_on_shift_table}
                      onCheckedChange={(v) => setFormData({ ...formData, display_on_shift_table: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">シフト希望一覧に表示</span>
                    <Switch
                      checked={formData.display_on_shift_request}
                      onCheckedChange={(v) => setFormData({ ...formData, display_on_shift_request: v })}
                    />
                  </div>
                </div>

                {/* 対象店舗 */}
                <div className="pt-2 border-t border-purple-200">
                  <Label className="text-xs font-semibold text-slate-600">対象店舗</Label>
                  <div className="flex gap-3 mt-1">
                    <label className="flex items-center gap-1 text-xs">
                      <input type="radio" checked={formData.all_stores} onChange={() => setFormData({ ...formData, all_stores: true })} />
                      全店舗
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="radio" checked={!formData.all_stores} onChange={() => setFormData({ ...formData, all_stores: false })} />
                      特定店舗
                    </label>
                  </div>
                </div>

                {/* 次回発生日プレビュー */}
                {nextOccurrence && (
                  <div className="bg-white rounded-lg p-2 border border-purple-200">
                    <div className="text-[10px] text-slate-500 font-semibold">次回発生日</div>
                    <div className="text-sm font-bold text-purple-700">{nextOccurrence}</div>
                  </div>
                )}

                {/* ボタン */}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white h-8 text-xs">
                    <Save className="w-3 h-3 mr-1" />
                    {editingEvent ? '更新' : '作成'}
                  </Button>
                  {editingEvent && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50 h-8 text-xs"
                      onClick={() => handleDelete(editingEvent)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={resetForm} className="h-8 text-xs">
                    キャンセル
                  </Button>
                </div>
              </form>
            )}

            {/* 定期イベント一覧 */}
            {!showForm && (
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-center py-4 text-slate-400 text-sm">読み込み中...</div>
                ) : recurringEvents.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">定期イベントはありません</p>
                    <p className="text-xs mt-1">「追加」ボタンで作成できます</p>
                  </div>
                ) : (
                  recurringEvents.map(event => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border border-slate-200 hover:border-purple-300 hover:shadow-sm transition-all bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: event.color || '#3b82f6' }} />
                            <span className="font-bold text-sm text-slate-800 truncate">{event.title}</span>
                          </div>
                          <div className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" />
                            {getPatternDescription(event)}
                          </div>
                          {event.description && (
                            <div className="text-xs text-slate-500 mt-0.5 truncate">{event.description}</div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            開始: {event.event_date ? format(parseISO(event.event_date), 'yyyy/M/d', { locale: ja }) : '-'}
                            {event.recurrence_end_date && ` 〜 ${format(parseISO(event.recurrence_end_date), 'yyyy/M/d', { locale: ja })}`}
                            {!event.recurrence_end_date && ' 〜 無期限'}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-purple-600"
                            onClick={() => handleEdit(event)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                            onClick={() => handleDelete(event)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
