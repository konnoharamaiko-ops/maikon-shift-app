import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { insertRecord } from '@/api/supabaseHelpers';
import { useQueryClient } from '@tanstack/react-query';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';
import ShiftEditDialog from './ShiftEditDialog';
import HelpSlotDialog from './HelpSlotDialog';
import { UserPlus } from 'lucide-react';

// 早番/中番/遅番の色分け
function getShiftStyle(startTime) {
  if (!startTime) return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  const hour = parseInt(startTime.split(':')[0]);
  if (hour < 12) return { bg: 'bg-cyan-100', text: 'text-cyan-900', border: 'border-cyan-300' };
  if (hour < 17) return { bg: 'bg-lime-100', text: 'text-lime-900', border: 'border-lime-300' };
  return { bg: 'bg-orange-100', text: 'text-orange-900', border: 'border-orange-300' };
}

export default function ShiftCalendarEditor({ selectedMonth, users, workShifts, storeId, store, shiftRequests = [] }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [editDateLabel, setEditDateLabel] = useState('');
  
  // ヘルプ枠の状態管理
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [editingHelpSlot, setEditingHelpSlot] = useState(null);
  const [helpDateLabel, setHelpDateLabel] = useState('');

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

  // ヘルプ枠の追加
  const handleAddHelpSlot = (e, date) => {
    e.stopPropagation();
    const dateStr = format(date, 'yyyy-MM-dd');
    const dateLabel = format(date, 'M月d日(E)', { locale: ja });
    setEditingHelpSlot({
      date: dateStr,
      help_name: '',
      start_time: '09:00',
      end_time: '17:00',
      notes: '',
    });
    setHelpDateLabel(dateLabel);
    setHelpDialogOpen(true);
  };

  // ヘルプ枠の編集
  const handleEditHelpSlot = (e, shift) => {
    e.stopPropagation();
    const date = parseISO(shift.date);
    const dateLabel = format(date, 'M月d日(E)', { locale: ja });
    setEditingHelpSlot(shift);
    setHelpDateLabel(dateLabel);
    setHelpDialogOpen(true);
  };

  // ヘルプ枠の保存
  const handleSaveHelpSlot = async (data) => {
    try {
      if (editingHelpSlot?.id) {
        await supabase.from('WorkShift').update(data).eq('id', editingHelpSlot.id);
        toast.success('ヘルプ枠を更新しました');
      } else {
        await insertRecord('WorkShift', { ...data, store_id: storeId });
        toast.success('ヘルプ枠を追加しました');
      }
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      setHelpDialogOpen(false);
      setEditingHelpSlot(null);
    } catch (error) {
      toast.error('ヘルプ枠の保存に失敗しました');
    }
  };

  // ヘルプ枠の削除
  const handleDeleteHelpSlot = async (id) => {
    try {
      await supabase.from('WorkShift').delete().eq('id', id);
      toast.success('ヘルプ枠を削除しました');
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      setHelpDialogOpen(false);
      setEditingHelpSlot(null);
    } catch (error) {
      toast.error('ヘルプ枠の削除に失敗しました');
    }
  };

  const getShiftsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return workShifts.filter(s => s.date === dateStr && !s.is_help_slot);
  };

  const getHelpSlotsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return workShifts.filter(s => s.date === dateStr && s.is_help_slot);
  };

  const getDayOffForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shiftRequests.filter(r => r.date === dateStr && r.is_day_off);
  };

  // 時間フォーマット
  const formatTimeShort = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const min = parseInt(m, 10);
    if (min === 0) return `${hour}時`;
    return `${hour}:${String(min).padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 mb-1">
            {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
              <div key={i} className={`text-center font-bold py-2 text-sm sm:text-base rounded-t-lg ${
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
              const helpSlots = getHelpSlotsForDate(date);
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
                    <span className={`text-sm sm:text-base font-bold leading-none ${
                      dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700'
                    }`}>
                      {format(date, 'd')}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {!isClosed && (
                        <button
                          onClick={(e) => handleAddHelpSlot(e, date)}
                          className="text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded p-0.5 transition-colors opacity-0 group-hover:opacity-100"
                          title="ヘルプ枠を追加"
                        >
                          <UserPlus className="w-3 h-3" />
                        </button>
                      )}
                      {isClosed ? (
                        <span className="text-[9px] sm:text-[10px] text-red-500 font-bold bg-red-50 px-1 rounded">休業</span>
                      ) : storeSettings?.businessHours && (
                        <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium">
                          {storeSettings.businessHours.open}-{storeSettings.businessHours.close}
                        </span>
                      )}
                    </div>
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
                          className={`w-full text-left ${style.bg} ${style.text} border ${style.border} p-0.5 sm:p-1 rounded-md hover:shadow-sm transition-all text-[11px] sm:text-xs leading-tight`}
                        >
                          <div className="font-bold truncate text-[11px] sm:text-xs">
                            {user?.metadata?.display_name || user?.full_name?.split(' ')[0] || shift.user_email.split('@')[0]}
                          </div>
                          <div className="font-bold text-[11px] sm:text-xs">
                            {shift.start_time?.slice(0,5)}-{shift.end_time?.slice(0,5)}
                          </div>
                          {shift.additional_times && shift.additional_times.length > 0 && shift.additional_times.map((at, idx) => (
                            <div key={idx} className="text-[10px] text-purple-700 font-bold">
                              +{at.start_time?.slice(0,5)}-{at.end_time?.slice(0,5)}
                            </div>
                          ))}
                          {shift.work_details && shift.work_details.length > 0 && (
                            <div className="text-[8px] sm:text-[9px] text-amber-700 truncate font-semibold">
                              {shift.work_details.map(d => d.label || d.activity).join(' / ')}
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {shifts.length > 4 && (
                      <div className="text-[10px] text-slate-500 text-center font-medium">
                        +{shifts.length - 4}件
                      </div>
                    )}

                    {/* ヘルプ枠表示 */}
                    {helpSlots.map(helpShift => (
                      <button
                        key={helpShift.id}
                        onClick={(e) => handleEditHelpSlot(e, helpShift)}
                        className="w-full text-left bg-orange-100 text-orange-900 border border-orange-300 p-0.5 sm:p-1 rounded-md hover:shadow-sm transition-all text-[11px] sm:text-xs leading-tight"
                      >
                        <div className="font-bold truncate flex items-center gap-0.5 text-[11px] sm:text-xs">
                          <UserPlus className="w-2.5 h-2.5 flex-shrink-0" />
                          {helpShift.help_name || 'ヘルプ'}
                        </div>
                        <div className="font-bold text-[11px] sm:text-xs">
                          {helpShift.start_time?.slice(0,5)}-{helpShift.end_time?.slice(0,5)}
                        </div>
                        {helpShift.additional_times && helpShift.additional_times.length > 0 && helpShift.additional_times.map((at, idx) => (
                          <div key={idx} className="text-[10px] text-orange-700 font-bold">
                            +{at.start_time?.slice(0,5)}-{at.end_time?.slice(0,5)}
                          </div>
                        ))}
                        {helpShift.work_details && helpShift.work_details.length > 0 && (
                          <div className="text-[8px] sm:text-[9px] text-amber-700 truncate font-semibold">
                            {helpShift.work_details.map(d => d.label || d.activity).join(' / ')}
                          </div>
                        )}
                      </button>
                    ))}

                    {shifts.length === 0 && helpSlots.length === 0 && dayOffs.length > 0 && (
                      <div className="text-[11px] text-rose-500 font-bold text-center py-1">
                        休希望 {dayOffs.length}名
                      </div>
                    )}
                  </div>

                  {/* ホバー時の追加アイコン */}
                  {!isClosed && shifts.length === 0 && helpSlots.length === 0 && dayOffs.length === 0 && (
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
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] sm:text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-cyan-100 border border-cyan-300 rounded-sm"></div>
          <span>早番 (~12時)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-lime-100 border border-lime-300 rounded-sm"></div>
          <span>中番 (12-17時)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded-sm"></div>
          <span>遅番 (17時~)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded-sm"></div>
          <span className="flex items-center gap-0.5"><UserPlus className="w-3 h-3 text-orange-500" />ヘルプ</span>
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

      <HelpSlotDialog
        open={helpDialogOpen}
        onOpenChange={setHelpDialogOpen}
        shift={editingHelpSlot}
        onSave={handleSaveHelpSlot}
        onDelete={handleDeleteHelpSlot}
        dateLabel={helpDateLabel}
      />
    </div>
  );
}
