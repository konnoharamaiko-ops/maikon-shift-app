import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Zap, X, Clock, Calendar as CalendarIcon, Palmtree, Sun, Moon, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import QuickShiftEntry from './QuickShiftEntry';

export default function ShiftCalendar({ selectedDate, onSelectDate, shiftRequests, onMonthChange, storeId, enableQuickEntry = false, paidLeaveRequests = [], events = [] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [quickEntryDate, setQuickEntryDate] = useState(null);
  const [detailDate, setDetailDate] = useState(null);

  const handleMonthChange = (newMonth) => {
    setCurrentMonth(newMonth);
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  const getShiftForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shiftRequests.find(s => s.date === dateStr);
  };

  const getPaidLeaveForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return paidLeaveRequests.find(r => r.date === dateStr);
  };

  const getEventsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(event => {
      const start = event.event_date;
      const end = event.event_end_date || event.event_date;
      return dateStr >= start && dateStr <= end;
    });
  };

  // HEXカラーコード対応 + レガシー色名対応
  const eventColorMap = {
    // HEXカラーコード（EventManagement.jsxのEVENT_COLORSに対応）
    '#ef4444': 'bg-red-100 text-red-700 border-red-200',
    '#f97316': 'bg-orange-100 text-orange-700 border-orange-200',
    '#f59e0b': 'bg-amber-100 text-amber-700 border-amber-200',
    '#22c55e': 'bg-green-100 text-green-700 border-green-200',
    '#3b82f6': 'bg-blue-100 text-blue-700 border-blue-200',
    '#8b5cf6': 'bg-purple-100 text-purple-700 border-purple-200',
    '#ec4899': 'bg-pink-100 text-pink-700 border-pink-200',
    '#6b7280': 'bg-gray-100 text-gray-700 border-gray-200',
    // レガシー色名（後方互換性）
    red: 'bg-red-100 text-red-700 border-red-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    pink: 'bg-pink-100 text-pink-700 border-pink-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  };

  const eventBorderColorMap = {
    '#ef4444': 'border-b-red-400',
    '#f97316': 'border-b-orange-400',
    '#f59e0b': 'border-b-amber-400',
    '#22c55e': 'border-b-green-400',
    '#3b82f6': 'border-b-blue-400',
    '#8b5cf6': 'border-b-purple-400',
    '#ec4899': 'border-b-pink-400',
    '#6b7280': 'border-b-gray-400',
    red: 'border-b-red-400',
    blue: 'border-b-blue-400',
    green: 'border-b-green-400',
    orange: 'border-b-orange-400',
    purple: 'border-b-purple-400',
    pink: 'border-b-pink-400',
    yellow: 'border-b-yellow-400',
  };

  const eventDotColorMap = {
    '#ef4444': 'bg-red-400',
    '#f97316': 'bg-orange-400',
    '#f59e0b': 'bg-amber-400',
    '#22c55e': 'bg-green-400',
    '#3b82f6': 'bg-blue-400',
    '#8b5cf6': 'bg-purple-400',
    '#ec4899': 'bg-pink-400',
    '#6b7280': 'bg-gray-400',
    red: 'bg-red-400',
    blue: 'bg-blue-400',
    green: 'bg-green-400',
    orange: 'bg-orange-400',
    purple: 'bg-purple-400',
    pink: 'bg-pink-400',
    yellow: 'bg-yellow-400',
  };

  const getEventBorderClass = (dayEvents) => {
    if (!dayEvents || dayEvents.length === 0) return '';
    const firstEvent = dayEvents[0];
    return eventBorderColorMap[firstEvent.color] || 'border-b-rose-300';
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isPastDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < today;
  };

  // Calculate summary stats
  const totalDays = shiftRequests.filter(s => isSameMonth(new Date(s.date), currentMonth)).length;
  const workDays = shiftRequests.filter(s => 
    isSameMonth(new Date(s.date), currentMonth) && !s.is_day_off
  ).length;
  const dayOffRequests = shiftRequests.filter(s => 
    isSameMonth(new Date(s.date), currentMonth) && s.is_day_off
  ).length;
  const paidLeaveDays = paidLeaveRequests.filter(r => 
    isSameMonth(new Date(r.date), currentMonth) && (r.status === 'approved' || r.status === 'pending')
  ).length;

  const handleDayClick = (day) => {
    const shift = getShiftForDate(day);
    const isCurrentMonth = isSameMonth(day, currentMonth);
    
    if (!isCurrentMonth) return;
    
    setDetailDate(day);
    onSelectDate(day);
  };

  const PaidLeaveIcon = ({ status, size = 'sm' }) => {
    const isApproved = status === 'approved';
    const isPending = status === 'pending';
    
    if (size === 'sm') {
      return (
        <div className={cn(
          "absolute -top-0.5 -right-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center text-[7px] sm:text-[8px] font-bold z-10 shadow-sm border",
          isApproved 
            ? "bg-emerald-500 text-white border-emerald-600" 
            : "bg-amber-400 text-amber-900 border-amber-500"
        )} title={isApproved ? '有給承認済み' : '有給申請中'}>
          有
        </div>
      );
    }
    
    return (
      <span className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
        isApproved 
          ? "bg-emerald-100 text-emerald-700 border border-emerald-300" 
          : "bg-amber-100 text-amber-700 border border-amber-300"
      )}>
        <Palmtree className="w-3 h-3" />
        {isApproved ? '有給確定' : '有給申請中'}
      </span>
    );
  };

  const renderDetailPopup = () => {
    if (!detailDate) return null;
    
    const shift = getShiftForDate(detailDate);
    const paidLeave = getPaidLeaveForDate(detailDate);
    const dayEvents = getEventsForDate(detailDate);
    const dayOfWeek = detailDate.getDay();
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDetailDate(null)}>
        <div 
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={cn(
            "p-4 text-white relative overflow-hidden",
            shift?.is_day_off ? "bg-gradient-to-br from-slate-500 to-slate-700" :
            shift ? "bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700" :
            "bg-gradient-to-br from-slate-400 to-slate-600"
          )}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
            <div className="flex items-center justify-between relative z-10">
              <div>
                <h3 className="text-xl font-bold tracking-tight">
                  {format(detailDate, 'M月d日', { locale: ja })}
                </h3>
                <p className="text-sm font-medium opacity-80 mt-0.5">
                  {format(detailDate, 'EEEE', { locale: ja })}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-medium">
                  {shift ? (
                    shift.is_day_off ? (
                      <><Moon className="w-3 h-3" /> 休み希望</>
                    ) : (
                      <><Sun className="w-3 h-3" /> 出勤希望</>
                    )
                  ) : '未提出'}
                </div>
              </div>
              <button 
                onClick={() => setDetailDate(null)}
                className="p-2 rounded-xl hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-4 space-y-3">
            {/* 有給申請ステータス表示 */}
            {paidLeave && (
              <div className={cn(
                "p-3 rounded-xl flex items-center gap-3",
                paidLeave.status === 'approved' ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
              )}>
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                  paidLeave.status === 'approved' ? "bg-emerald-100" : "bg-amber-100"
                )}>
                  <Palmtree className={cn("w-5 h-5", paidLeave.status === 'approved' ? "text-emerald-600" : "text-amber-600")} />
                </div>
                <div>
                  <div className={cn("text-sm font-bold", paidLeave.status === 'approved' ? "text-emerald-700" : "text-amber-700")}>
                    {paidLeave.status === 'approved' ? '有給休暇（承認済み）' : '有給休暇（申請中）'}
                  </div>
                  {paidLeave.notes && (
                    <div className="text-xs text-slate-500 mt-0.5">{paidLeave.notes}</div>
                  )}
                </div>
              </div>
            )}

            {shift ? (
              <>
                <div className={cn(
                  "p-4 rounded-xl",
                  shift.is_day_off ? "bg-slate-50 border border-slate-200" : "bg-indigo-50 border border-indigo-100"
                )}>
                  <div className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">シフト内容</div>
                  <div className={cn(
                    "text-lg font-bold",
                    shift.is_day_off ? "text-slate-700" : "text-indigo-700"
                  )}>
                    {shift.is_day_off 
                      ? (shift.is_paid_leave ? '休み（有給申請予定）' : '休み希望')
                      : shift.is_full_day_available 
                        ? '終日出勤可能'
                        : `${shift.start_time?.slice(0,5)} - ${shift.end_time?.slice(0,5)}`
                    }
                  </div>
                </div>
                
                {shift.is_negotiable_if_needed && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div className="text-sm font-semibold text-amber-700">人員不足なら要相談</div>
                  </div>
                )}
                
                {shift.notes && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">備考</div>
                    <div className="text-sm text-slate-700">{shift.notes}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-6 text-slate-400">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <CalendarIcon className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-sm font-medium">シフト希望は未提出です</p>
                <p className="text-xs text-slate-400 mt-1">タップして登録できます</p>
              </div>
            )}

            {/* イベント表示 */}
            {dayEvents.length > 0 && (
              <div className="p-3 rounded-xl bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-100">
                <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">イベント</div>
                <div className="space-y-1.5">
                  {dayEvents.map(event => {
                    const colorClasses = eventColorMap[event.color] || eventColorMap.red;
                    return (
                      <div key={event.id} className={`text-xs px-2.5 py-1.5 rounded-lg border ${colorClasses} font-medium`}>
                        <span className="font-bold">{event.title}</span>
                        {event.description && (
                          <span className="opacity-70 ml-1.5">- {event.description}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 pt-0 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl h-10"
              onClick={() => setDetailDate(null)}
            >
              閉じる
            </Button>
            {!isPastDate(detailDate) && (
              <Button
                size="sm"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 shadow-sm"
                onClick={() => {
                  setDetailDate(null);
                  onSelectDate(detailDate);
                }}
              >
                {shift ? '編集する' : '登録する'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMonthChange(subMonths(currentMonth, 1))}
            className="hover:bg-white/15 rounded-xl w-9 h-9 sm:w-10 sm:h-10 text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="text-center">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {format(currentMonth, 'yyyy年 M月', { locale: ja })}
            </h2>
            <p className="text-[10px] sm:text-xs text-indigo-200 font-medium mt-0.5">シフト希望カレンダー</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMonthChange(addMonths(currentMonth, 1))}
            className="hover:bg-white/15 rounded-xl w-9 h-9 sm:w-10 sm:h-10 text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="p-2 sm:p-5">
        {/* Summary Stats - improved with icons */}
        {totalDays > 0 && (
          <div className={cn(
            "grid gap-1.5 sm:gap-2 mb-3 sm:mb-4",
            paidLeaveDays > 0 ? "grid-cols-4" : "grid-cols-3"
          )}>
            <div className="text-center p-1.5 sm:p-3 bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-xl border border-indigo-100">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1 mb-0.5">
                <CheckCircle2 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-indigo-500" />
                <p className="text-[8px] sm:text-[10px] text-indigo-500 font-semibold">提出</p>
              </div>
              <p className="text-base sm:text-2xl font-bold text-indigo-600">{totalDays}</p>
              <p className="text-[8px] sm:text-[10px] text-indigo-400">日</p>
            </div>
            <div className="text-center p-1.5 sm:p-3 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl border border-emerald-100">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1 mb-0.5">
                <Sun className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-emerald-500" />
                <p className="text-[8px] sm:text-[10px] text-emerald-500 font-semibold">出勤可</p>
              </div>
              <p className="text-base sm:text-2xl font-bold text-emerald-600">{workDays}</p>
              <p className="text-[8px] sm:text-[10px] text-emerald-400">日</p>
            </div>
            <div className="text-center p-1.5 sm:p-3 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-center gap-0.5 sm:gap-1 mb-0.5">
                <Moon className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-slate-500" />
                <p className="text-[8px] sm:text-[10px] text-slate-500 font-semibold">休み</p>
              </div>
              <p className="text-base sm:text-2xl font-bold text-slate-600">{dayOffRequests}</p>
              <p className="text-[8px] sm:text-[10px] text-slate-400">日</p>
            </div>
            {paidLeaveDays > 0 && (
              <div className="text-center p-1.5 sm:p-3 bg-gradient-to-br from-emerald-50 to-teal-100/50 rounded-xl border border-emerald-100">
                <div className="flex items-center justify-center gap-0.5 sm:gap-1 mb-0.5">
                  <Palmtree className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-emerald-500" />
                  <p className="text-[8px] sm:text-[10px] text-emerald-500 font-semibold">有給</p>
                </div>
                <p className="text-base sm:text-2xl font-bold text-emerald-600">{paidLeaveDays}</p>
                <p className="text-[8px] sm:text-[10px] text-emerald-400">日</p>
              </div>
            )}
          </div>
        )}

        {/* Week days header */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
          {weekDays.map((day, i) => (
            <div
              key={day}
              className={cn(
                "text-center text-[10px] sm:text-xs font-bold py-1.5 sm:py-2 rounded-lg",
                i === 0 ? "text-red-500 bg-red-50/70" : i === 6 ? "text-blue-500 bg-blue-50/70" : "text-slate-500 bg-slate-50/70"
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {days.map((day, i) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const shift = getShiftForDate(day);
            const paidLeave = getPaidLeaveForDate(day);
            const dayEvents = getEventsForDate(day);
            const dayOfWeek = day.getDay();
            const hasEvent = dayEvents.length > 0;

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                className={cn(
                  "relative flex flex-col items-center justify-start rounded-lg sm:rounded-xl transition-all duration-200 p-0.5 sm:p-1.5 touch-manipulation pt-1 sm:pt-2 min-h-[56px] sm:min-h-[80px]",
                  isCurrentMonth ? "hover:shadow-md active:scale-[0.97]" : "opacity-20",
                  isSelected && "ring-2 ring-indigo-500 bg-indigo-50 shadow-md",
                  !isSelected && shift && !isPastDate(day) && !shift.is_day_off && "bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200/60",
                  !isSelected && shift && !isPastDate(day) && shift.is_day_off && "bg-slate-50 border border-slate-200",
                  !isSelected && isCurrentMonth && !shift && !isToday(day) && !isPastDate(day) && "hover:bg-slate-50 border border-transparent hover:border-slate-200",
                  isToday(day) && isCurrentMonth && !isSelected && "ring-2 ring-blue-400 bg-blue-50/80 shadow-sm",
                  isPastDate(day) && isCurrentMonth && "opacity-35 bg-slate-50/50",
                  // ドットのみでイベント表示（アンダーバーなし）
                )}
              >
                {/* Date number */}
                <div className="relative w-full text-center">
                  <span
                    className={cn(
                      "text-xs sm:text-sm font-bold leading-none",
                      !isCurrentMonth && "text-slate-300",
                      isPastDate(day) && isCurrentMonth && "text-slate-400",
                      !isPastDate(day) && isCurrentMonth && shift && "text-indigo-800",
                      !isPastDate(day) && isCurrentMonth && !shift && dayOfWeek === 0 && "text-red-500",
                      !isPastDate(day) && isCurrentMonth && !shift && dayOfWeek === 6 && "text-blue-500",
                      !isPastDate(day) && isCurrentMonth && !shift && dayOfWeek !== 0 && dayOfWeek !== 6 && "text-slate-600",
                      isToday(day) && isCurrentMonth && "text-blue-700"
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {/* Today indicator dot */}
                  {isToday(day) && isCurrentMonth && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
                  )}
                </div>

                {/* Shift info + Paid leave icon */}
                {(shift || (isCurrentMonth && paidLeave && (paidLeave.status === 'approved' || paidLeave.status === 'pending'))) && (
                  <div className="mt-0.5 sm:mt-1 w-full space-y-0.5">
                    {/* 有給承認アイコン */}
                    {isCurrentMonth && paidLeave && paidLeave.status === 'approved' && (
                      <div className="text-[8px] sm:text-[10px] font-bold text-center rounded px-0.5 py-0.5 text-white bg-emerald-500 shadow-sm leading-tight">
                        有給
                      </div>
                    )}
                    {/* 有給申請中アイコン */}
                    {isCurrentMonth && paidLeave && paidLeave.status === 'pending' && (
                      <div className="text-[8px] sm:text-[10px] font-bold text-center rounded px-0.5 py-0.5 text-amber-900 bg-amber-300 shadow-sm leading-tight">
                        申請中
                      </div>
                    )}
                    {/* 通常のシフト表示 */}
                    {shift && !paidLeave && (
                      <>
                        {shift.is_day_off ? (
                          <div className="text-[8px] sm:text-[10px] font-bold text-center rounded px-0.5 py-0.5 text-slate-600 bg-slate-200/80 leading-tight">
                            休み
                          </div>
                        ) : shift.is_full_day_available ? (
                          <div className="text-[8px] sm:text-[10px] font-bold text-indigo-700 text-center bg-indigo-200/80 rounded px-0.5 py-0.5 leading-tight">
                            終日
                          </div>
                        ) : (
                          <div className="text-[8px] sm:text-[10px] font-bold text-indigo-700 text-center bg-indigo-100/80 rounded px-0.5 py-0.5 leading-tight truncate">
                            {shift.start_time?.substring(0, 5)}
                          </div>
                        )}
                      </>
                    )}
                    {/* 有給がある場合でもシフト情報を小さく表示 */}
                    {shift && paidLeave && !shift.is_day_off && (
                      <>
                        {shift.is_full_day_available ? (
                          <div className="text-[6px] sm:text-[8px] font-bold text-indigo-700 text-center bg-indigo-100/70 rounded px-0.5 leading-tight">
                            終日
                          </div>
                        ) : shift.start_time && (
                          <div className="text-[6px] sm:text-[8px] font-bold text-indigo-700 text-center bg-indigo-100/70 rounded px-0.5 leading-tight">
                            {shift.start_time?.substring(0, 5)}
                          </div>
                        )}
                      </>
                    )}
                    {shift?.is_negotiable_if_needed && (
                      <div className="text-[6px] sm:text-[8px] font-bold text-amber-800 text-center bg-amber-200/80 rounded px-0.5 py-px leading-tight">
                        相談
                      </div>
                    )}
                  </div>
                )}

                {/* Event dots at bottom */}
                {hasEvent && isCurrentMonth && !isPastDate(day) && (
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {dayEvents.slice(0, 3).map((event, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full",
                          eventDotColorMap[event.color] || 'bg-rose-400'
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Events for current month */}
        {events.length > 0 && (() => {
          const monthEvents = events.filter(e => {
            const start = e.event_date;
            const end = e.event_end_date || e.event_date;
            const monthStartStr = format(monthStart, 'yyyy-MM-dd');
            const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
            return end >= monthStartStr && start <= monthEndStr;
          });
          if (monthEvents.length === 0) return null;
          return (
            <div className="mt-3 sm:mt-4 p-2.5 sm:p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border border-slate-200">
              <h4 className="text-[10px] sm:text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                <CalendarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
                今月のイベント
              </h4>
              <div className="space-y-1">
                {monthEvents.map(event => {
                  const colorClasses = eventColorMap[event.color] || eventColorMap.red;
                  return (
                    <div key={event.id} className={`text-[9px] sm:text-xs px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border ${colorClasses} font-medium flex items-center justify-between`}>
                      <span className="font-bold truncate mr-2">{event.title}</span>
                      <span className="opacity-60 text-[8px] sm:text-[10px] flex-shrink-0">
                        {event.event_date?.substring(5).replace('-', '/')}
                        {event.event_end_date && event.event_end_date !== event.event_date && (
                          <>~{event.event_end_date?.substring(5).replace('-', '/')}</>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Legend */}
        <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-slate-100">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-0.5 sm:gap-1.5">
            <div className="flex items-center gap-1 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-lg bg-indigo-50/50">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm bg-indigo-200 border border-indigo-300 flex-shrink-0" />
              <span className="text-[7px] sm:text-[10px] text-indigo-700 font-semibold truncate">終日可</span>
            </div>
            <div className="flex items-center gap-1 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-lg bg-indigo-50/50">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm bg-indigo-100 border border-indigo-200 flex-shrink-0" />
              <span className="text-[7px] sm:text-[10px] text-indigo-700 font-semibold truncate">時間指定</span>
            </div>
            <div className="flex items-center gap-1 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-lg bg-amber-50/50">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm bg-amber-200 border border-amber-300 flex-shrink-0" />
              <span className="text-[7px] sm:text-[10px] text-amber-700 font-semibold truncate">相談可</span>
            </div>
            <div className="flex items-center gap-1 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-lg bg-slate-50">
              <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm bg-slate-200 border border-slate-300 flex-shrink-0" />
              <span className="text-[7px] sm:text-[10px] text-slate-600 font-semibold truncate">休み</span>
            </div>
            <div className="flex items-center gap-1 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-lg bg-emerald-50/50">
              <div className="w-3 h-2 sm:w-4 sm:h-2.5 rounded-sm bg-emerald-500 flex-shrink-0" />
              <span className="text-[7px] sm:text-[10px] text-emerald-700 font-semibold truncate">有給</span>
            </div>
            <div className="flex items-center gap-1 px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-lg bg-amber-50/50">
              <div className="w-3 h-2 sm:w-4 sm:h-2.5 rounded-sm bg-amber-300 flex-shrink-0" />
              <span className="text-[7px] sm:text-[10px] text-amber-700 font-semibold truncate">申請中</span>
            </div>
          </div>
          <p className="text-[7px] sm:text-[10px] text-slate-400 text-center mt-1.5 sm:mt-2 font-medium">日付をタップで詳細表示</p>
        </div>
      </div>

      {showQuickEntry && quickEntryDate && (
        <QuickShiftEntry
          date={quickEntryDate}
          storeId={storeId}
          existingShift={getShiftForDate(quickEntryDate)}
          onSuccess={() => {
            setShowQuickEntry(false);
            setQuickEntryDate(null);
          }}
          onCancel={() => {
            setShowQuickEntry(false);
            setQuickEntryDate(null);
          }}
        />
      )}

      {/* Detail popup */}
      {renderDetailPopup()}
    </div>
  );
}
