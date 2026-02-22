import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { insertRecord } from '@/api/supabaseHelpers';
import { useQueryClient } from '@tanstack/react-query';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';
import ShiftEditDialog from './ShiftEditDialog';

// 早番/中番/遅番の色分け
function getShiftStyle(startTime) {
  if (!startTime) return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  const hour = parseInt(startTime.split(':')[0]);
  if (hour < 12) return { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200' };
  if (hour < 17) return { bg: 'bg-lime-50', text: 'text-lime-800', border: 'border-lime-200' };
  return { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' };
}

export default function ShiftCalendarEditor({ selectedMonth, users, workShifts, storeId, store, shiftRequests = [] }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [editDateLabel, setEditDateLabel] = useState('');

  const monthDays = eachDayOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth)
  });

  // 月の最初の日の曜日分の空セルを計算
  const firstDayOfWeek = getDay(monthDays[0]);
  const emptyDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const handleAddShift = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dateLabel = format(date, 'M月d日(E)', { locale: ja });
    
    const request = shiftRequests.find(
      r => r.created_by === '' && r.date === dateStr && !r.is_day_off
    );
    
    setSelectedDate(date);
    setEditingShift({
      user_email: '',
      date: dateStr,
      start_time: request?.start_time || '09:00',
      end_time: request?.end_time || '17:00',
      notes: '',
      is_confirmed: true,
      additional_times: request?.additional_times || [],
      work_details: []
    });
    setEditDateLabel(dateLabel);
    setShowDialog(true);
  };

  const handleEditShift = (e, shift) => {
    e.stopPropagation();
    const date = parseISO(shift.date);
    const dateLabel = format(date, 'M月d日(E)', { locale: ja });
    setSelectedDate(date);
    setEditingShift({
      ...shift,
      additional_times: shift.additional_times || [],
      work_details: shift.work_details || []
    });
    setEditDateLabel(dateLabel);
    setShowDialog(true);
  };

  const handleSaveShift = async (data) => {
    try {
      const saveData = { ...data, store_id: storeId };
      if (editingShift?.id) {
        await supabase.from('WorkShift').update(saveData).eq('id', editingShift.id);
        toast.success('シフトを更新しました');
      } else {
        await insertRecord('WorkShift', saveData);
        toast.success('シフトを作成しました');
      }
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      setShowDialog(false);
      setEditingShift(null);
    } catch (error) {
      toast.error('保存に失敗しました');
    }
  };

  const handleDeleteShift = async (id) => {
    try {
      await supabase.from('WorkShift').delete().eq('id', id);
      toast.success('シフトを削除しました');
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      setShowDialog(false);
      setEditingShift(null);
    } catch (error) {
      toast.error('削除に失敗しました');
    }
  };

  const getShiftsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return workShifts.filter(s => s.date === dateStr);
  };

  const getDayOffForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shiftRequests.filter(r => r.date === dateStr && r.is_day_off);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 mb-1">
            {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
              <div key={i} className={`text-center font-bold py-2 text-xs sm:text-sm rounded-t-lg ${
                i === 0 ? 'text-red-500 bg-red-50/50' : i === 6 ? 'text-blue-500 bg-blue-50/50' : 'text-slate-600 bg-slate-50'
              }`}>
                {day}
              </div>
            ))}
          </div>

          {/* カレンダーグリッド */}
          <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            {/* 空セル */}
            {emptyDays.map(i => (
              <div key={`empty-${i}`} className="bg-slate-50 min-h-[90px] sm:min-h-[120px]" />
            ))}

            {monthDays.map(date => {
              const dayOfWeek = getDay(date);
              const shifts = getShiftsForDate(date);
              const dayOffs = getDayOffForDate(date);
              const dateStr = format(date, 'yyyy-MM-dd');
              const storeSettings = store ? getStoreSettingsForDate(store, dateStr) : null;
              const isClosed = storeSettings?.isClosedDay;

              return (
                <div
                  key={date.toString()}
                  className={`p-1 sm:p-1.5 min-h-[90px] sm:min-h-[120px] ${
                    isClosed ? 'bg-slate-100/80' : dayOfWeek === 0 ? 'bg-red-50/30' : dayOfWeek === 6 ? 'bg-blue-50/30' : 'bg-white'
                  } hover:bg-blue-50/40 transition-colors cursor-pointer relative group`}
                  onClick={() => !isClosed && handleAddShift(date)}
                >
                  {/* 日付ヘッダー */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs sm:text-sm font-bold leading-none ${
                      dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700'
                    }`}>
                      {format(date, 'd')}
                    </span>
                    {isClosed ? (
                      <span className="text-[8px] sm:text-[9px] text-red-400 font-semibold bg-red-50 px-1 rounded">休業</span>
                    ) : storeSettings?.businessHours && (
                      <span className="text-[7px] sm:text-[8px] text-slate-400 font-medium">
                        {storeSettings.businessHours.open}-{storeSettings.businessHours.close}
                      </span>
                    )}
                  </div>

                  {/* シフト表示 */}
                  <div className="space-y-0.5">
                    {shifts.slice(0, 4).map(shift => {
                      const user = users.find(u => u.email === shift.user_email);
                      const style = getShiftStyle(shift.start_time);
                      return (
                        <button
                          key={shift.id}
                          onClick={(e) => handleEditShift(e, shift)}
                          className={`w-full text-left ${style.bg} ${style.text} border ${style.border} p-0.5 sm:p-1 rounded-md hover:shadow-sm transition-all text-[9px] sm:text-[10px] leading-tight`}
                        >
                          <div className="font-semibold truncate">
                            {user?.metadata?.display_name || user?.full_name?.split(' ')[0] || shift.user_email.split('@')[0]}
                          </div>
                          <div className="font-bold">
                            {shift.start_time?.slice(0,5)}-{shift.end_time?.slice(0,5)}
                          </div>
                          {shift.additional_times && shift.additional_times.length > 0 && shift.additional_times.map((at, idx) => (
                            <div key={idx} className="text-[8px] text-purple-600 font-semibold">
                              +{at.start_time?.slice(0,5)}-{at.end_time?.slice(0,5)}
                            </div>
                          ))}
                          {shift.work_details && shift.work_details.length > 0 && (
                            <div className="text-[6px] sm:text-[7px] text-amber-600 truncate font-medium">
                              {shift.work_details.map(d => d.label || d.activity).join(' / ')}
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {shifts.length > 4 && (
                      <div className="text-[9px] text-slate-400 text-center font-medium">
                        +{shifts.length - 4}件
                      </div>
                    )}
                    {shifts.length === 0 && dayOffs.length > 0 && (
                      <div className="text-[9px] text-rose-400 font-semibold text-center py-1">
                        休希望 {dayOffs.length}名
                      </div>
                    )}
                  </div>

                  {/* ホバー時の追加アイコン */}
                  {!isClosed && shifts.length === 0 && dayOffs.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-blue-300 text-xl">+</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] sm:text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-cyan-50 border border-cyan-200 rounded-sm"></div>
          <span>早番 (~12時)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-lime-50 border border-lime-200 rounded-sm"></div>
          <span>中番 (12-17時)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-50 border border-orange-200 rounded-sm"></div>
          <span>遅番 (17時~)</span>
        </div>
      </div>

      <ShiftEditDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        shift={editingShift}
        users={users}
        onSave={handleSaveShift}
        onDelete={handleDeleteShift}
        dateLabel={editDateLabel}
      />
    </div>
  );
}
