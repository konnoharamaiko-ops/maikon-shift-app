import React, { useState } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Clock, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';

export default function UserShiftTable({ userEmail, userName, shifts, selectedMonth, viewType = 'month', rangeStart, rangeEnd, store }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const monthStart = viewType === 'month' ? startOfMonth(selectedMonth) : rangeStart;
  const monthEnd = viewType === 'month' ? endOfMonth(selectedMonth) : rangeEnd;
  
  // For day view, rangeStart and rangeEnd are the same date
  const daysInRange = (monthStart && monthEnd) ? eachDayOfInterval({ start: monthStart, end: monthEnd }) : [];

  const getShiftForDate = (date) => {
    return shifts.find(s => isSameDay(parseISO(s.date), date));
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const submittedDays = shifts.length;
  const workDays = shifts.filter(s => !s.is_day_off).length;
  const offDays = shifts.filter(s => s.is_day_off).length;

  // Day view: render a detailed card for a single day
  const renderDayView = () => {
    const day = daysInRange[0];
    if (!day) return <p className="text-sm text-slate-400 p-4">日付が選択されていません</p>;
    
    const shift = getShiftForDate(day);
    const dayOfWeek = day.getDay();
    const isTodayDate = isToday(day);

    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            "text-lg font-bold",
            dayOfWeek === 0 && "text-red-500",
            dayOfWeek === 6 && "text-blue-500",
            dayOfWeek !== 0 && dayOfWeek !== 6 && "text-slate-700",
            isTodayDate && "text-blue-700"
          )}>
            {format(day, 'M月d日(E)', { locale: ja })}
            {isTodayDate && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">今日</span>}
          </div>
        </div>

        {shift ? (
          <div className="space-y-3">
            {shift.is_day_off ? (
              <div className={`p-4 rounded-xl border-2 ${
                shift.is_paid_leave
                  ? 'bg-green-50 border-green-300'
                  : 'bg-slate-50 border-slate-300'
              }`}>
                <div className="flex items-center gap-2">
                  <X className="w-5 h-5 text-slate-500" />
                  <span className={`font-bold text-base ${
                    shift.is_paid_leave ? 'text-green-800' : 'text-slate-700'
                  }`}>
                    {shift.is_paid_leave ? '有給休暇' : '休み希望'}
                  </span>
                </div>
              </div>
            ) : shift.is_full_day_available ? (
              <div className="p-4 bg-indigo-50 rounded-xl border-2 border-indigo-300">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  <span className="text-indigo-800 font-bold text-base">終日勤務可能</span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-indigo-50 rounded-xl border-2 border-indigo-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  <span className="text-indigo-800 font-bold text-base">
                    {shift.start_time?.slice(0, 5)} 〜 {shift.end_time?.slice(0, 5)}
                  </span>
                </div>
              </div>
            )}
            {shift.is_negotiable_if_needed && !shift.is_day_off && (
              <div className="px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-amber-800 font-semibold text-sm">要相談可</span>
              </div>
            )}
            {shift.notes && (
              <div className="px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-xs font-medium text-amber-700">備考:</span>
                <span className="text-sm text-slate-700 ml-1">{shift.notes}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
            <p className="text-slate-400 text-sm">この日のシフト希望はありません</p>
          </div>
        )}
      </div>
    );
  };

  // Calendar grid view (for month and week)
  const renderCalendarView = () => (
    <div className="p-4">
      {viewType === 'month' && (
        <div className="grid grid-cols-7 gap-1">
          {/* Week day headers */}
          {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
            <div
              key={day}
              className={cn(
                "text-center text-xs font-medium py-2",
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
              )}
            >
              {day}
            </div>
          ))}

          {/* Days */}
          {daysInRange.map((day) => {
            const shift = getShiftForDate(day);
            const dayOfWeek = day.getDay();
            const isTodayDate = isToday(day);
            const dateStr = format(day, 'yyyy-MM-dd');
            const storeSettings = store ? getStoreSettingsForDate(store, dateStr) : null;
            const isClosed = storeSettings?.isClosedDay;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "aspect-square p-1 rounded-lg border transition-all",
                  isClosed && "border-slate-200 bg-slate-100 opacity-60",
                  !isClosed && shift && shift.is_day_off && shift.is_paid_leave && "border-green-300 bg-green-50",
                  !isClosed && shift && shift.is_day_off && !shift.is_paid_leave && "border-slate-300 bg-slate-50",
                  !isClosed && shift && !shift.is_day_off && "border-indigo-200 bg-indigo-50",
                  !isClosed && !shift && "border-slate-100 bg-white",
                  isTodayDate && "ring-2 ring-inset ring-blue-400 bg-blue-100"
                )}
              >
                <div
                  className={cn(
                    "text-xs font-medium mb-1",
                    dayOfWeek === 0 && "text-red-500",
                    dayOfWeek === 6 && "text-blue-500",
                    dayOfWeek !== 0 && dayOfWeek !== 6 && "text-slate-600",
                    isTodayDate && "text-blue-700"
                  )}
                >
                  {format(day, 'd')}
                  {isClosed && <span className="ml-0.5 text-[8px] text-red-500 font-semibold">休</span>}
                  {isTodayDate && <span className="ml-0.5 text-[8px] text-blue-600">今日</span>}
                </div>
                {shift && (
                  <div className="space-y-0.5">
                    {shift.is_day_off ? (
                      <div className={`px-2 py-1 rounded-md border ${
                        shift.is_paid_leave
                          ? 'bg-green-200 border-green-300'
                          : 'bg-slate-200 border-slate-300'
                      }`}>
                        <span className={`font-bold text-[10px] ${
                          shift.is_paid_leave ? 'text-green-800' : 'text-slate-700'
                        }`}>
                          {shift.is_paid_leave ? '有給' : '休み'}
                        </span>
                      </div>
                    ) : shift.is_full_day_available ? (
                      <div className="px-2 py-1 bg-indigo-200 rounded-md border border-indigo-300">
                        <span className="text-indigo-800 font-bold text-[10px]">終日</span>
                      </div>
                    ) : (
                      <div className="px-1.5 py-1 bg-indigo-100 rounded-md border border-indigo-200 text-[10px] text-indigo-800 font-semibold leading-tight">
                        <div>{shift.start_time?.slice(0, 5)}</div>
                        <div className="text-center text-indigo-600">〜</div>
                        <div>{shift.end_time?.slice(0, 5)}</div>
                      </div>
                    )}
                    {shift.is_negotiable_if_needed && !shift.is_day_off && (
                      <div className="px-1.5 py-0.5 bg-amber-200 rounded border border-amber-300">
                        <span className="text-amber-800 font-bold text-[9px]">相談可</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewType === 'week' && (
        <div className="space-y-2">
          {daysInRange.map((day) => {
            const shift = getShiftForDate(day);
            const dayOfWeek = day.getDay();
            const isTodayDate = isToday(day);
            const dateStr = format(day, 'yyyy-MM-dd');
            const storeSettings = store ? getStoreSettingsForDate(store, dateStr) : null;
            const isClosed = storeSettings?.isClosedDay;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all",
                  isClosed && "border-slate-200 bg-slate-100 opacity-60",
                  !isClosed && shift && shift.is_day_off && shift.is_paid_leave && "border-green-300 bg-green-50",
                  !isClosed && shift && shift.is_day_off && !shift.is_paid_leave && "border-slate-300 bg-slate-50",
                  !isClosed && shift && !shift.is_day_off && "border-indigo-200 bg-indigo-50",
                  !isClosed && !shift && "border-slate-100 bg-white",
                  isTodayDate && "ring-2 ring-inset ring-blue-400"
                )}
              >
                <div className={cn(
                  "text-sm font-semibold min-w-[80px]",
                  dayOfWeek === 0 && "text-red-500",
                  dayOfWeek === 6 && "text-blue-500",
                  dayOfWeek !== 0 && dayOfWeek !== 6 && "text-slate-700"
                )}>
                  {format(day, 'M/d(E)', { locale: ja })}
                  {isClosed && <span className="ml-1 text-[10px] text-red-500 font-semibold">休</span>}
                </div>
                <div className="flex-1">
                  {shift ? (
                    shift.is_day_off ? (
                      <span className={`font-semibold text-sm ${shift.is_paid_leave ? 'text-green-700' : 'text-slate-600'}`}>
                        {shift.is_paid_leave ? '有給休暇' : '休み希望'}
                      </span>
                    ) : shift.is_full_day_available ? (
                      <span className="text-indigo-700 font-semibold text-sm">終日勤務可能</span>
                    ) : (
                      <span className="text-indigo-700 font-semibold text-sm">
                        {shift.start_time?.slice(0, 5)} 〜 {shift.end_time?.slice(0, 5)}
                      </span>
                    )
                  ) : (
                    <span className="text-slate-400 text-sm">未提出</span>
                  )}
                  {shift?.is_negotiable_if_needed && !shift?.is_day_off && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">相談可</span>
                  )}
                </div>
                {shift?.notes && (
                  <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                    {shift.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notes section */}
      {viewType === 'month' && shifts.some(s => s.notes) && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-medium text-slate-600 mb-2">備考・メモ</h4>
          <div className="space-y-1">
            {shifts
              .filter(s => s.notes)
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map((shift) => (
                <div key={shift.id} className="text-xs text-slate-600 bg-amber-50 rounded px-2 py-1">
                  <span className="font-medium text-amber-700">
                    {format(parseISO(shift.date), 'M/d')}:
                  </span>{' '}
                  {shift.notes}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-slate-800">{userName}</h3>
            <p className="text-xs text-slate-400">{userEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-sm">
            <div className="text-center px-3 py-1 bg-indigo-50 rounded-lg">
              <p className="text-xs text-indigo-600">出勤可能</p>
              <p className="font-semibold text-indigo-700">{workDays}日</p>
            </div>
            <div className="text-center px-3 py-1 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600">休み希望</p>
              <p className="font-semibold text-slate-700">{offDays}日</p>
            </div>
            <div className="text-center px-3 py-1 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-600">提出済み</p>
              <p className="font-semibold text-purple-700">{submittedDays}日</p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-slate-100">
          {viewType === 'day' ? renderDayView() : renderCalendarView()}
        </div>
      )}
    </div>
  );
}
