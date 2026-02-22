import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { insertRecord } from '@/api/supabaseHelpers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Calendar, X, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { SafeMotionDiv as MotionDiv, SafeAnimatePresence as AnimatePresence } from '@/components/SafeMotion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';

const QUICK_TIMES = [
  { label: '早番', start: '09:00', end: '17:00' },
  { label: '中番', start: '12:00', end: '20:00' },
  { label: '遅番', start: '17:00', end: '22:00' },
];

export default function QuickShiftEntry({ date, storeId, existingShift, onSuccess, onCancel }) {
  const { user } = useAuth();
  const [initialState] = useState({
    shiftType: existingShift ? (existingShift.is_day_off ? 'dayoff' : 'work') : null,
    startTime: existingShift?.start_time || '09:00',
    endTime: existingShift?.end_time || '18:00',
    isFullDayAvailable: existingShift?.is_full_day_available || false,
    isPaidLeave: existingShift?.is_paid_leave || false,
    isNegotiableIfNeeded: existingShift?.is_negotiable_if_needed || false,
    notes: existingShift?.notes || ''
  });

  const [shiftType, setShiftType] = useState(initialState.shiftType);
  const [startTime, setStartTime] = useState(initialState.startTime);
  const [endTime, setEndTime] = useState(initialState.endTime);
  const [isFullDayAvailable, setIsFullDayAvailable] = useState(initialState.isFullDayAvailable);
  const [isPaidLeave, setIsPaidLeave] = useState(initialState.isPaidLeave);
  const [isNegotiableIfNeeded, setIsNegotiableIfNeeded] = useState(initialState.isNegotiableIfNeeded);
  const [notes, setNotes] = useState(initialState.notes);
  const queryClient = useQueryClient();

  const handleUndo = () => {
    setShiftType(initialState.shiftType);
    setStartTime(initialState.startTime);
    setEndTime(initialState.endTime);
    setIsFullDayAvailable(initialState.isFullDayAvailable);
    setIsPaidLeave(initialState.isPaidLeave);
    setIsNegotiableIfNeeded(initialState.isNegotiableIfNeeded);
    setNotes(initialState.notes);
    toast.info('変更を元に戻しました');
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existingShift) {
        const { data: result, error } = await supabase.from('ShiftRequest').update(data).eq('id', existingShift.id).select();
        if (error) throw error;
        return result;
      } else {
        return await insertRecord('ShiftRequest', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      toast.success(existingShift ? '✓ シフト希望を更新しました' : '✓ シフト希望を登録しました');
      onSuccess?.();
    },
    onError: (error) => {
      toast.error('❌ 保存に失敗しました: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (existingShift) {
        return await supabase.from('ShiftRequest').delete().eq('id', existingShift.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      toast.success('✓ シフト希望を削除しました');
      onSuccess?.();
    },
    onError: (error) => {
      toast.error('❌ 削除に失敗しました: ' + error.message);
    },
  });

  const handleSubmit = (timeSlot) => {
    const isDayOff = shiftType === 'dayoff';
    const data = {
      store_id: storeId,
      date: format(date, 'yyyy-MM-dd'),
      created_by: user?.email,
      is_day_off: isDayOff,
      is_paid_leave: isDayOff && isPaidLeave,
      is_full_day_available: !isDayOff && isFullDayAvailable,
      is_negotiable_if_needed: isDayOff && isNegotiableIfNeeded,
      notes: notes.trim() || undefined
    };
    
    if (!isDayOff && !isFullDayAvailable) {
      data.start_time = timeSlot ? timeSlot.start : startTime;
      data.end_time = timeSlot ? timeSlot.end : endTime;
    }
    
    saveMutation.mutate(data);
  };

  const handleDelete = () => {
    if (window.confirm('このシフト希望を削除しますか？')) {
      deleteMutation.mutate();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-800">
                {format(date, 'M月d日(E)', { locale: ja })}
              </h3>
              {existingShift && (
                <p className="text-xs text-indigo-600 font-medium">登録済み</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 w-8 p-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Shift Type Selection */}
          {!shiftType && (
            <div>
              <p className="text-sm text-slate-600 mb-3">シフト希望を選択</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShiftType('work')}
                  className="p-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 hover:border-emerald-500 transition-all active:scale-95"
                >
                  <div className="text-3xl mb-2">✓</div>
                  <div className="font-bold text-sm text-slate-800">出勤可</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setShiftType('dayoff')}
                  className="p-4 rounded-xl border-2 border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 hover:border-slate-500 transition-all active:scale-95"
                >
                  <div className="text-3xl mb-2">✕</div>
                  <div className="font-bold text-sm text-slate-800">休み希望</div>
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Work Options */}
            {shiftType === 'work' && (
              <MotionDiv
                key="work"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between p-3 rounded-xl border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-purple-100">
                  <Label className="text-sm font-bold text-purple-900">⏰ 終日出勤可能</Label>
                  <Switch
                    checked={isFullDayAvailable}
                    onCheckedChange={setIsFullDayAvailable}
                  />
                </div>

                {!isFullDayAvailable && (
                  <MotionDiv
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                  >
                    <p className="text-sm text-slate-600 mb-3">よく使う時間帯</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {QUICK_TIMES.map((time, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setStartTime(time.start);
                            setEndTime(time.end);
                          }}
                          className="p-2 rounded-lg border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all active:scale-95"
                        >
                          <p className="font-bold text-xs text-slate-800">{time.label}</p>
                          <p className="text-[10px] text-slate-600">{time.start}-{time.end}</p>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs mb-1 block">開始</Label>
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="h-10"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">終了</Label>
                        <Input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="h-10"
                        />
                      </div>
                    </div>
                  </MotionDiv>
                )}
              </MotionDiv>
            )}

            {/* Day Off Options */}
            {shiftType === 'dayoff' && (
              <MotionDiv
                key="dayoff"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between p-3 rounded-xl border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-blue-100">
                  <Label className="text-sm font-bold text-blue-900">💼 有給申請予定</Label>
                  <Switch
                    checked={isPaidLeave}
                    onCheckedChange={setIsPaidLeave}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-amber-100">
                  <Label className="text-sm font-bold text-amber-900">🤝 人員足りなければ要相談</Label>
                  <Switch
                    checked={isNegotiableIfNeeded}
                    onCheckedChange={setIsNegotiableIfNeeded}
                  />
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>

          {/* Notes */}
          {shiftType && (
            <div>
              <Label className="text-sm mb-2 block">備考（任意）</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="連絡事項があれば入力してください..."
                className="resize-none h-20"
              />
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              {shiftType && !existingShift && (
                <Button
                  onClick={() => setShiftType(null)}
                  variant="outline"
                  className="flex-1"
                >
                  戻る
                </Button>
              )}
              {existingShift && (
                <Button
                  onClick={handleUndo}
                  variant="outline"
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="text-sm">元に戻す</span>
                </Button>
              )}
              <Button
                onClick={() => handleSubmit()}
                disabled={saveMutation.isPending || !shiftType}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                {saveMutation.isPending ? '保存中...' : existingShift ? '更新する' : '登録する'}
              </Button>
              {!shiftType && (
                <Button
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1"
                >
                  キャンセル
                </Button>
              )}
            </div>
            {existingShift && (
              <Button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50"
              >
                {deleteMutation.isPending ? '削除中...' : 'シフト希望を削除'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}