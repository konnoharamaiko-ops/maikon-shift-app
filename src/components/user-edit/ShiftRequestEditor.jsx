import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, Save, Trash2, MessageSquare } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import { fetchFiltered, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { cn } from '@/lib/utils';

// ============================
// Inline Shift Form (no framer-motion dependency)
// ============================
function InlineShiftForm({ date, shift, onSubmit, onDelete, onCancel, isSubmitting, isDeleting }) {
  const [shiftType, setShiftType] = useState(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [isPaidLeave, setIsPaidLeave] = useState(false);
  const [isFullDayAvailable, setIsFullDayAvailable] = useState(false);
  const [isNegotiableIfNeeded, setIsNegotiableIfNeeded] = useState(false);
  const [notes, setNotes] = useState('');

  const actualDate = date ? (typeof date === 'string' ? parseISO(date) : date) : null;

  useEffect(() => {
    if (shift) {
      setShiftType(shift.is_day_off ? 'dayoff' : 'work');
      setStartTime(shift.start_time || '09:00');
      setEndTime(shift.end_time || '18:00');
      setIsPaidLeave(shift.is_paid_leave || false);
      setIsFullDayAvailable(shift.is_full_day_available || false);
      setIsNegotiableIfNeeded(shift.is_negotiable_if_needed || false);
      setNotes(shift.notes || '');
    } else {
      setShiftType(null);
      setStartTime('09:00');
      setEndTime('18:00');
      setIsPaidLeave(false);
      setIsFullDayAvailable(false);
      setIsNegotiableIfNeeded(false);
      setNotes('');
    }
  }, [shift, date]);

  const handleSubmit = () => {
    const isDayOff = shiftType === 'dayoff';
    const data = {
      date: typeof date === 'string' ? date : format(date, 'yyyy-MM-dd'),
      is_day_off: isDayOff,
      is_paid_leave: isDayOff && isPaidLeave,
      is_full_day_available: !isDayOff && isFullDayAvailable,
      is_negotiable_if_needed: isDayOff && isNegotiableIfNeeded,
      notes: notes.trim() || undefined
    };
    
    if (!isDayOff && !isFullDayAvailable) {
      data.start_time = startTime;
      data.end_time = endTime;
    }
    
    onSubmit(data);
  };

  if (!actualDate) return null;

  const dayOfWeek = actualDate.getDay();
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const dayColor = isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-slate-500';

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Date Header */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-3">
          <Calendar className="w-7 h-7 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 mb-1">
          {format(actualDate, 'M月d日', { locale: ja })}
        </h3>
        <p className={cn("text-base font-medium", dayColor)}>
          {format(actualDate, '(EEEE)', { locale: ja })}
        </p>
        {shift && (
          <div className="flex gap-2 mt-3 justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-indigo-600 text-sm font-semibold rounded-full ring-1 ring-indigo-200">
              <CheckCircle2 className="w-4 h-4" />
              登録済み
            </span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-6" />

      {/* Shift Type Selection - Plain buttons, no framer-motion */}
      <div className="mb-6">
        <Label className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-4 block text-center">
          シフト希望を選択
        </Label>
        <div className="grid grid-cols-2 gap-3">
          {/* 出勤ボタン */}
          <button
            type="button"
            onClick={() => {
              setShiftType('work');
              setIsPaidLeave(false);
              setIsNegotiableIfNeeded(false);
            }}
            className={cn(
              "p-4 sm:p-6 rounded-2xl transition-all text-center relative overflow-hidden cursor-pointer",
              "hover:scale-[1.02] active:scale-[0.98]",
              shiftType === 'work'
                ? "ring-2 ring-emerald-400 bg-emerald-50"
                : "ring-1 ring-slate-200 hover:ring-emerald-300"
            )}
          >
            <div className="relative z-10">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2 sm:mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className={cn(
                "font-bold text-sm sm:text-lg mb-1 transition-colors",
                shiftType === 'work' ? "text-emerald-700" : "text-slate-700"
              )}>出勤できます</div>
              <div className="text-xs sm:text-sm text-slate-400">この日は出勤可能です</div>
            </div>
            {shiftType === 'work' && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center animate-in zoom-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
            )}
          </button>
          
          {/* 休みボタン */}
          <button
            type="button"
            onClick={() => {
              setShiftType('dayoff');
              setIsFullDayAvailable(false);
            }}
            className={cn(
              "p-4 sm:p-6 rounded-2xl transition-all text-center relative overflow-hidden cursor-pointer",
              "hover:scale-[1.02] active:scale-[0.98]",
              shiftType === 'dayoff'
                ? "ring-2 ring-slate-400 bg-slate-50"
                : "ring-1 ring-slate-200 hover:ring-slate-300"
            )}
          >
            <div className="relative z-10">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2 sm:mb-4 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center">
                <XCircle className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className={cn(
                "font-bold text-sm sm:text-lg mb-1 transition-colors",
                shiftType === 'dayoff' ? "text-slate-700" : "text-slate-700"
              )}>休み希望</div>
              <div className="text-xs sm:text-sm text-slate-400">この日は出勤できません</div>
            </div>
            {shiftType === 'dayoff' && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-500 flex items-center justify-center animate-in zoom-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Work Options */}
      {shiftType === 'work' && (
        <div className="mb-6 space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent mb-4" />
          
          {/* 終日出勤可能 */}
          <div className="flex items-center justify-between py-3 px-2 gap-3 rounded-xl hover:ring-1 hover:ring-purple-100 transition-all">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-base">⏰</span>
              </div>
              <div className="min-w-0">
                <Label className="text-sm font-bold text-slate-700 block truncate">終日出勤可能</Label>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">営業時間すべて対応可能</p>
              </div>
            </div>
            <Switch
              checked={isFullDayAvailable}
              onCheckedChange={setIsFullDayAvailable}
              className="data-[state=checked]:bg-purple-600 flex-shrink-0"
            />
          </div>

          {!isFullDayAvailable && (
            <div className="pt-3 pb-4 px-2 animate-in fade-in duration-200">
              <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent mb-4" />
              <Label className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                出勤可能な時間帯
              </Label>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <Label htmlFor="inline-start-time" className="text-xs text-indigo-500 mb-2 block font-semibold tracking-wide">開始</Label>
                  <Input
                    id="inline-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-11 text-base font-semibold bg-transparent border-0 border-b-2 border-indigo-200 focus:border-indigo-500 rounded-none w-full transition-colors text-slate-700"
                  />
                </div>
                <div>
                  <Label htmlFor="inline-end-time" className="text-xs text-indigo-500 mb-2 block font-semibold tracking-wide">終了</Label>
                  <Input
                    id="inline-end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-11 text-base font-semibold bg-transparent border-0 border-b-2 border-indigo-200 focus:border-indigo-500 rounded-none w-full transition-colors text-slate-700"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Day Off Options */}
      {shiftType === 'dayoff' && (
        <div className="mb-6 space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent mb-4" />
          
          {/* 有給申請 */}
          <div className="flex items-center justify-between py-3 px-2 gap-3 rounded-xl hover:ring-1 hover:ring-blue-100 transition-all">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-base">💼</span>
              </div>
              <div className="min-w-0">
                <Label className="text-sm font-bold text-slate-700 block truncate">有給申請予定</Label>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">有給休暇として申請します</p>
              </div>
            </div>
            <Switch
              checked={isPaidLeave}
              onCheckedChange={setIsPaidLeave}
              className="data-[state=checked]:bg-blue-600 flex-shrink-0"
            />
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent mx-3" />

          {/* 要相談 */}
          <div className="flex items-center justify-between py-3 px-2 gap-3 rounded-xl hover:ring-1 hover:ring-amber-100 transition-all">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0">
                <span className="text-base">🤝</span>
              </div>
              <div className="min-w-0">
                <Label className="text-sm font-bold text-slate-700 block truncate">人員不足なら要相談</Label>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">必要に応じて調整可能</p>
              </div>
            </div>
            <Switch
              checked={isNegotiableIfNeeded}
              onCheckedChange={setIsNegotiableIfNeeded}
              className="data-[state=checked]:bg-amber-600 flex-shrink-0"
            />
          </div>
        </div>
      )}

      {/* Notes */}
      {shiftType && (
        <div className="mb-6">
          <div className="h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent mb-5" />
          <Label htmlFor="inline-notes" className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            備考・連絡事項
            <span className="text-xs font-normal text-slate-400 ml-1">（任意）</span>
          </Label>
          <Textarea
            id="inline-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="連絡事項や希望があれば入力してください..."
            className="resize-none h-20 text-sm border-0 border-b-2 border-indigo-200 focus:border-indigo-500 rounded-none bg-transparent transition-colors text-slate-700 placeholder:text-slate-300"
          />
        </div>
      )}

      {/* Divider before actions */}
      {shiftType && (
        <div className="h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent mb-6" />
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !shiftType}
          className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl h-12 text-sm font-bold transition-all gap-2"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? '保存中...' : shift ? '更新する' : '登録する'}
        </Button>
        {shift && onDelete && (
          <Button
            onClick={onDelete}
            disabled={isSubmitting || isDeleting}
            variant="outline"
            className="rounded-xl h-12 text-red-500 hover:text-red-600 border-0 ring-1 ring-red-200 hover:ring-red-300 font-bold transition-all"
          >
            <Trash2 className="w-5 h-5 sm:mr-2" />
            <span className="hidden sm:inline">削除</span>
          </Button>
        )}
        {onCancel && (
          <Button
            onClick={onCancel}
            disabled={isSubmitting || isDeleting}
            variant="ghost"
            className="rounded-xl h-12 font-bold text-slate-400 hover:text-slate-600 transition-all"
          >
            キャンセル
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================
// Main ShiftRequestEditor
// ============================
export default function ShiftRequestEditor({ targetUser, stores, isAdmin }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const queryClient = useQueryClient();

  const userStoreIds = targetUser?.store_ids || [];
  const userStores = stores.filter(s => userStoreIds.includes(s.id));

  React.useEffect(() => {
    if (userStores.length > 0 && !selectedStore) {
      setSelectedStore(userStores[0].id);
    }
  }, [userStores, selectedStore]);

  // 有給申請データを取得
  const { data: paidLeaveRequests = [] } = useQuery({
    queryKey: ['paidLeaveRequests', targetUser.email],
    queryFn: async () => {
      if (!targetUser?.email) return [];
      const data = await fetchFiltered('PaidLeaveRequest', { user_email: targetUser.email });
      return (data || []).filter(r => r.status === 'approved' || r.status === 'pending');
    },
    enabled: !!targetUser?.email,
  });

  const getPaidLeaveForDate = (dateStr) => {
    return paidLeaveRequests.find(r => r.date === dateStr);
  };

  const queryKey = ['shiftRequests', selectedStore, targetUser.email, format(selectedMonth, 'yyyy-MM')];

  const { data: shiftRequests = [], refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!selectedStore) return [];
      const dbRequests = await fetchFiltered('ShiftRequest', { 
        store_id: selectedStore,
        created_by: targetUser.email 
      }, '-date');
      
      // Generate default shifts from user's default_shift_settings
      const defaultSettings = targetUser.default_shift_settings;
      if (!defaultSettings) return dbRequests;
      
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const dayMap = {
        0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
      };
      
      const defaultShifts = [];
      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        
        const hasExistingShift = dbRequests.some(r => r.date === dateStr);
        if (hasExistingShift) return;
        
        const dayKey = dayMap[getDay(day)];
        const setting = defaultSettings[dayKey];
        
        if (setting && setting.enabled) {
          const firstDayOfMonth = startOfMonth(day);
          const firstDayOfWeek = getDay(firstDayOfMonth);
          const adjustedDate = day.getDate() + firstDayOfWeek;
          const weekOfMonth = Math.ceil(adjustedDate / 7);
          
          if (setting.week_settings) {
            const weekSetting = setting.week_settings[weekOfMonth];
            if (weekSetting) {
              defaultShifts.push({
                id: 'default-' + dateStr,
                date: dateStr,
                start_time: weekSetting.is_day_off ? null : weekSetting.start_time,
                end_time: weekSetting.is_day_off ? null : weekSetting.end_time,
                is_day_off: weekSetting.is_day_off,
                is_negotiable_if_needed: weekSetting.is_negotiable_if_needed || false,
                is_paid_leave: false,
                is_full_day_available: false,
                notes: weekSetting.notes || '',
                store_id: selectedStore,
                created_by: targetUser.email,
                is_default: true
              });
            }
          } else {
            const allowedWeeks = setting.weeks || [1, 2, 3, 4, 5];
            if (allowedWeeks.includes(weekOfMonth)) {
              defaultShifts.push({
                id: 'default-' + dateStr,
                date: dateStr,
                start_time: setting.is_day_off ? null : setting.start_time,
                end_time: setting.is_day_off ? null : setting.end_time,
                is_day_off: setting.is_day_off,
                is_negotiable_if_needed: setting.is_negotiable_if_needed || false,
                is_paid_leave: false,
                is_full_day_available: setting.is_full_day_available || false,
                notes: setting.notes || '',
                store_id: selectedStore,
                created_by: targetUser.email,
                is_default: true
              });
            }
          }
        }
      });
      
      return [...dbRequests, ...defaultShifts];
    },
    enabled: !!selectedStore && !!targetUser,
  });

  // 有給申請レコードの自動作成/削除ヘルパー
  const handlePaidLeaveRecord = async (data) => {
    if (data.is_paid_leave && data.is_day_off) {
      try {
        const existingLeave = await fetchFiltered('PaidLeaveRequest', {
          user_email: targetUser.email,
          date: data.date,
        });
        if (!existingLeave || existingLeave.length === 0) {
          await insertRecord('PaidLeaveRequest', {
            user_email: targetUser.email,
            date: data.date,
            status: 'pending',
            notes: data.notes || 'シフト希望より有給申請',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.warn('有給申請の自動作成に失敗:', e);
      }
    } else if (!data.is_paid_leave && data.is_day_off) {
      try {
        const existingLeave = await fetchFiltered('PaidLeaveRequest', {
          user_email: targetUser.email,
          date: data.date,
        });
        if (existingLeave && existingLeave.length > 0) {
          const pendingLeave = existingLeave.find(l => l.status === 'pending');
          if (pendingLeave) {
            await deleteRecord('PaidLeaveRequest', pendingLeave.id);
          }
        }
      } catch (e) {
        console.warn('有給申請の自動削除に失敗:', e);
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const cleanData = {
        date: data.date,
        is_day_off: data.is_day_off || false,
        is_paid_leave: data.is_paid_leave || false,
        is_full_day_available: data.is_full_day_available || false,
        is_negotiable_if_needed: data.is_negotiable_if_needed || false,
        notes: data.notes || '',
        store_id: selectedStore,
        created_by: targetUser.email,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      };
      if (!cleanData.is_day_off && !cleanData.is_full_day_available) {
        cleanData.start_time = data.start_time;
        cleanData.end_time = data.end_time;
      }
      
      await handlePaidLeaveRecord(cleanData);
      return await insertRecord('ShiftRequest', cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('シフト希望を登録しました');
      setSelectedDate(null);
    },
    onError: () => toast.error('登録に失敗しました'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const cleanData = {
        is_day_off: data.is_day_off || false,
        is_paid_leave: data.is_paid_leave || false,
        is_full_day_available: data.is_full_day_available || false,
        is_negotiable_if_needed: data.is_negotiable_if_needed || false,
        notes: data.notes || '',
        updated_date: new Date().toISOString(),
      };
      if (!cleanData.is_day_off && !cleanData.is_full_day_available) {
        cleanData.start_time = data.start_time;
        cleanData.end_time = data.end_time;
      } else {
        cleanData.start_time = null;
        cleanData.end_time = null;
      }
      
      await handlePaidLeaveRecord({ ...data, date: shiftRequests.find(r => r.id === id)?.date });
      return await updateRecord('ShiftRequest', id, cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('シフト希望を更新しました');
      setSelectedDate(null);
    },
    onError: () => toast.error('更新に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const shift = shiftRequests.find(r => r.id === id);
      if (shift?.is_paid_leave) {
        const existingLeave = await fetchFiltered('PaidLeaveRequest', {
          user_email: targetUser.email,
          date: shift.date,
        });
        if (existingLeave && existingLeave.length > 0) {
          const pendingLeave = existingLeave.find(l => l.status === 'pending');
          if (pendingLeave) {
            await deleteRecord('PaidLeaveRequest', pendingLeave.id);
          }
        }
      }
      return await deleteRecord('ShiftRequest', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('シフト希望を削除しました');
      setSelectedDate(null);
    },
    onError: () => toast.error('削除に失敗しました'),
  });

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getShiftForDate = (dateStr) => {
    return shiftRequests.find(r => r.date === dateStr);
  };

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-white flex items-center gap-3 text-xl sm:text-2xl">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <Calendar className="w-6 h-6" />
              </div>
              シフト希望提出
            </CardTitle>
            <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-2xl backdrop-blur-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                className="text-white hover:bg-white/20 rounded-xl h-10 w-10"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="text-white font-bold px-4 text-lg">
                {format(selectedMonth, 'yyyy年 M月')}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                className="text-white hover:bg-white/20 rounded-xl h-10 w-10"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-8">
          {userStores.length > 1 && (
            <div className="mb-8 max-w-xs">
              <Label className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2 block">店舗を選択</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-indigo-500 transition-all">
                  <SelectValue placeholder="店舗を選択" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200 shadow-xl">
                  {userStores.map(s => (
                    <SelectItem key={s.id} value={s.id} className="rounded-xl focus:bg-indigo-50">
                      {s.name || s.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-7 gap-2 sm:gap-4 mb-4">
            {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
              <div key={day} className={cn(
                "text-center text-[10px] sm:text-xs font-bold uppercase tracking-tighter sm:tracking-widest py-2",
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
              )}>
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2 sm:gap-4">
            {Array.from({ length: getDay(monthStart) }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const shift = getShiftForDate(dateStr);
              const paidLeave = getPaidLeaveForDate(dateStr);
              const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateStr;
              const dayOfWeek = getDay(day);
              const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "aspect-square rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center relative transition-all group",
                    "hover:scale-105 active:scale-95",
                    isSelected 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-4 ring-indigo-100" 
                      : isToday
                        ? "bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200"
                        : "bg-slate-50/50 text-slate-600 hover:bg-white hover:shadow-md border border-transparent hover:border-slate-100",
                    shift?.is_day_off && !isSelected && "bg-slate-100/80",
                    shift && !shift.is_day_off && !isSelected && "bg-emerald-50/80"
                  )}
                >
                  <span className={cn(
                    "text-sm sm:text-lg font-bold mb-0.5",
                    !isSelected && dayOfWeek === 0 && "text-red-400",
                    !isSelected && dayOfWeek === 6 && "text-blue-400"
                  )}>
                    {format(day, 'd')}
                  </span>
                  
                  {shift && (
                    <div className="flex flex-col items-center gap-0.5">
                      {shift.is_day_off ? (
                        <div className="flex flex-col items-center">
                          <XCircle className={cn("w-3 h-3 sm:w-4 sm:h-4", isSelected ? "text-white/80" : "text-slate-400")} />
                          {shift.is_negotiable_if_needed && (
                            <span className={cn("text-[8px] font-bold", isSelected ? "text-white/80" : "text-amber-500")}>要相談</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <CheckCircle2 className={cn("w-3 h-3 sm:w-4 sm:h-4", isSelected ? "text-white/80" : "text-emerald-500")} />
                          {!shift.is_full_day_available && shift.start_time && (
                            <span className={cn("text-[8px] font-bold", isSelected ? "text-white/80" : "text-emerald-600")}>
                              {shift.start_time.split(':')[0]}時-
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {paidLeave && !isSelected && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                      <span className="text-[8px] text-white font-bold">有</span>
                    </div>
                  )}

                  {shift?.notes && !isSelected && (
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                      <MessageSquare className="w-2 h-2 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedDate && (
        <Card className="border-none shadow-2xl bg-white rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-300">
          <CardContent className="p-6 sm:p-10">
            <InlineShiftForm
              date={selectedDate}
              shift={getShiftForDate(format(selectedDate, 'yyyy-MM-dd'))}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
              isDeleting={deleteMutation.isPending}
              onSubmit={(data) => {
                const existing = getShiftForDate(data.date);
                if (existing && !existing.is_default) {
                  updateMutation.mutate({ id: existing.id, data });
                } else {
                  createMutation.mutate(data);
                }
              }}
              onDelete={() => {
                const existing = getShiftForDate(format(selectedDate, 'yyyy-MM-dd'));
                if (existing && !existing.is_default) {
                  deleteMutation.mutate(existing.id);
                } else {
                  setSelectedDate(null);
                }
              }}
              onCancel={() => setSelectedDate(null)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
