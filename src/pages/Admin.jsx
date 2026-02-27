import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, parseISO, startOfWeek, endOfWeek, addDays, isSameDay, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Shield, Calendar, Users, ChevronLeft, ChevronRight, Clock, X, User, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Briefcase, Sun, Moon, Palmtree } from 'lucide-react';
import ExportButton from '@/components/export/ExportButton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ShiftSummaryCard from '@/components/admin/ShiftSummaryCard';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';
import AdminDropdown from '@/components/ui/AdminDropdown';
import { sortStoresByOrder } from '@/lib/storeOrder';

// ============ USER AVATAR COMPONENT ============
function UserAvatar({ user: u, isSelected, onClick, shiftSummary, isMe }) {
  const name = u?.metadata?.display_name || u?.full_name || u?.email?.split('@')[0] || '?';
  const initial = name.charAt(0);
  
  // Generate consistent color from name
  const colors = [
    'from-violet-400 to-purple-500',
    'from-blue-400 to-indigo-500',
    'from-cyan-400 to-blue-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-rose-400 to-pink-500',
    'from-fuchsia-400 to-purple-500',
    'from-lime-400 to-green-500',
  ];
  const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  const gradientColor = colors[colorIndex];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 min-w-[60px] sm:min-w-[72px] transition-all duration-200",
        isSelected ? "scale-105" : "opacity-70 hover:opacity-100"
      )}
    >
      <div className={cn(
        "relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-md transition-all",
        gradientColor,
        isSelected && "ring-3 ring-purple-400 ring-offset-2 shadow-lg"
      )}>
        {initial}
        {isMe && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[7px] sm:text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
            自分
          </span>
        )}
      </div>
      <span className={cn(
        "text-[10px] sm:text-xs font-medium truncate max-w-[60px] sm:max-w-[72px] leading-tight",
        isSelected ? "text-purple-700 font-bold" : "text-slate-600"
      )}>
        {name.length > 5 ? name.slice(0, 5) + '..' : name}
      </span>
      {shiftSummary && (
        <span className="text-[8px] sm:text-[9px] text-slate-400">
          {shiftSummary.workDays}日/{shiftSummary.totalDays}日
        </span>
      )}
    </button>
  );
}

// ============ USER CALENDAR VIEW COMPONENT ============
function UserCalendarView({ userEmail, userName, shifts, currentMonth, store, viewType, rangeStart, rangeEnd, userData }) {
  const monthStart = viewType === 'month' ? startOfMonth(currentMonth) : rangeStart;
  const monthEnd = viewType === 'month' ? endOfMonth(currentMonth) : rangeEnd;
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

  const workDays = shifts.filter(s => !s.is_day_off).length;
  const offDays = shifts.filter(s => s.is_day_off && !s.is_paid_leave).length;
  const paidLeaveDays = shifts.filter(s => s.is_paid_leave).length;
  const totalHours = shifts.filter(s => !s.is_day_off && s.start_time && s.end_time).reduce((sum, s) => {
    const start = parseInt(s.start_time.split(':')[0]) + parseInt(s.start_time.split(':')[1]) / 60;
    const end = parseInt(s.end_time.split(':')[0]) + parseInt(s.end_time.split(':')[1]) / 60;
    let h = end - start;
    if (s.additional_times && s.additional_times.length > 0) {
      s.additional_times.forEach(at => {
        if (at.start_time && at.end_time) {
          const as = parseInt(at.start_time.split(':')[0]) + parseInt(at.start_time.split(':')[1]) / 60;
          const ae = parseInt(at.end_time.split(':')[0]) + parseInt(at.end_time.split(':')[1]) / 60;
          h += (ae - as);
        }
      });
    }
    return sum + h;
  }, 0);

  const getShiftColor = (shift) => {
    if (!shift) return '';
    if (shift.is_day_off && shift.is_paid_leave) return 'bg-green-50 border-green-300';
    if (shift.is_day_off && shift.is_negotiable_if_needed) return 'bg-amber-50 border-amber-300';
    if (shift.is_day_off) return 'bg-slate-50 border-slate-300';
    if (shift.is_full_day_available) return 'bg-indigo-50 border-indigo-200';
    return 'bg-blue-50 border-blue-200';
  };

  // Day view
  if (viewType === 'day') {
    const day = daysInRange[0];
    if (!day) return <p className="text-sm text-slate-400 p-4">日付が選択されていません</p>;
    const shift = getShiftForDate(day);
    const dayOfWeek = day.getDay();

    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            "text-lg font-bold",
            dayOfWeek === 0 && "text-red-500",
            dayOfWeek === 6 && "text-blue-500",
            dayOfWeek !== 0 && dayOfWeek !== 6 && "text-slate-700"
          )}>
            {format(day, 'M月d日(E)', { locale: ja })}
            {isToday(day) && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">今日</span>}
          </div>
        </div>
        {shift ? (
          <div className="space-y-3">
            {shift.is_day_off ? (
              <div className={`p-4 rounded-xl border-2 ${shift.is_paid_leave ? 'bg-green-50 border-green-300' : shift.is_negotiable_if_needed ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-300'}`}>
                <div className="flex items-center gap-2">
                  {shift.is_paid_leave ? <Palmtree className="w-5 h-5 text-green-600" /> : <X className={`w-5 h-5 ${shift.is_negotiable_if_needed ? 'text-amber-500' : 'text-slate-500'}`} />}
                  <span className={`font-bold text-base ${shift.is_paid_leave ? 'text-green-800' : shift.is_negotiable_if_needed ? 'text-amber-800' : 'text-slate-700'}`}>
                    {shift.is_paid_leave ? '有給休暇' : shift.is_negotiable_if_needed ? '休み希望（要相談）' : '休み希望'}
                  </span>
                </div>
              </div>
            ) : shift.is_full_day_available ? (
              <div className="p-4 bg-indigo-50 rounded-xl border-2 border-indigo-300">
                <div className="flex items-center gap-2">
                  <Sun className="w-5 h-5 text-indigo-600" />
                  <span className="text-indigo-800 font-bold text-base">終日勤務可能</span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="text-blue-800 font-bold text-base">
                    {shift.start_time?.slice(0, 5)} 〜 {shift.end_time?.slice(0, 5)}
                  </span>
                </div>
                {shift.additional_times && shift.additional_times.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {shift.additional_times.map((at, atIdx) => (
                      <div key={atIdx} className="flex items-center gap-2 ml-7">
                        <span className="text-orange-700 font-semibold text-sm border-l-2 border-orange-400 pl-2">
                          + {at.start_time?.slice(0, 5)} 〜 {at.end_time?.slice(0, 5)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {shift.is_negotiable_if_needed && (
              <div className="px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-amber-800 font-semibold text-sm">{shift.is_day_off ? '休み希望ですが相談可能' : '要相談可'}</span>
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
  }

  // Week view
  if (viewType === 'week') {
    return (
      <div className="p-3 sm:p-4 space-y-2">
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
                !isClosed && shift && shift.is_day_off && !shift.is_paid_leave && shift.is_negotiable_if_needed && "border-amber-300 bg-amber-50",
                !isClosed && shift && shift.is_day_off && !shift.is_paid_leave && !shift.is_negotiable_if_needed && "border-slate-300 bg-slate-50",
                !isClosed && shift && !shift.is_day_off && "border-blue-200 bg-blue-50",
                !isClosed && !shift && "border-slate-100 bg-white",
                isTodayDate && "ring-2 ring-inset ring-purple-400"
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
                    <span className={`font-semibold text-sm ${shift.is_paid_leave ? 'text-green-700' : shift.is_negotiable_if_needed ? 'text-amber-700' : 'text-slate-600'}`}>
                      {shift.is_paid_leave ? '有給休暇' : shift.is_negotiable_if_needed ? '休み(要相談)' : '休み希望'}
                    </span>
                  ) : shift.is_full_day_available ? (
                    <span className="text-indigo-700 font-semibold text-sm">終日勤務可能</span>
                  ) : (
                    <span className="text-blue-700 font-semibold text-sm">
                      {shift.start_time?.slice(0, 5)} 〜 {shift.end_time?.slice(0, 5)}
                    </span>
                  )
                ) : (
                  <span className="text-slate-400 text-sm">未提出</span>
                )}
                {shift && shift.additional_times && shift.additional_times.length > 0 && (
                  <span className="ml-2 text-xs text-orange-700 font-semibold">
                    {shift.additional_times.map((at, i) => `+${at.start_time?.slice(0,5)}-${at.end_time?.slice(0,5)}`).join(' ')}
                  </span>
                )}
                {shift?.is_negotiable_if_needed && (
                  <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">相談可</span>
                )}
              </div>
              {shift?.notes && (
                <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded max-w-[120px] truncate">
                  {shift.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Month view (calendar grid)
  return (
    <div className="p-3 sm:p-4">
      {/* User shift settings icons */}
      {userData && (userData.weekly_days_normal || userData.weekly_days_slow || userData.daily_hours_min || userData.daily_hours_max || userData.admin_memo) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {userData.weekly_days_normal && (
            <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5" title={`通常期: 週${userData.weekly_days_normal}日`}>
              <Calendar className="w-3 h-3 text-blue-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-blue-700">通常{userData.weekly_days_normal}日</span>
            </div>
          )}
          {userData.weekly_days_slow && (
            <div className="inline-flex items-center gap-1 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5" title={`閑散期: 週${userData.weekly_days_slow}日`}>
              <Sun className="w-3 h-3 text-teal-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-teal-700">閑散{userData.weekly_days_slow}日</span>
            </div>
          )}
          {(userData.daily_hours_min || userData.daily_hours_max) && (
            <div className="inline-flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5" title={`1日: ${userData.daily_hours_min || '?'}〜${userData.daily_hours_max || '?'}時間`}>
              <Clock className="w-3 h-3 text-purple-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-purple-700">{userData.daily_hours_min || '?'}-{userData.daily_hours_max || '?'}h</span>
            </div>
          )}
          {userData.admin_memo && (
            <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5" title={userData.admin_memo}>
              <AlertCircle className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-amber-700 max-w-[120px] truncate">メモあり</span>
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <Briefcase className="w-4 h-4 text-blue-600" />
          <span className="text-sm sm:text-base font-bold text-blue-700">出勤 {workDays}日</span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <Moon className="w-4 h-4 text-slate-600" />
          <span className="text-sm sm:text-base font-bold text-slate-700">休み {offDays}日</span>
        </div>
        {paidLeaveDays > 0 && (
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <Palmtree className="w-4 h-4 text-green-600" />
            <span className="text-sm sm:text-base font-bold text-green-700">有給 {paidLeaveDays}日</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
          <Clock className="w-4 h-4 text-purple-600" />
          <span className="text-sm sm:text-base font-bold text-purple-700">合計 {totalHours.toFixed(1)}h</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
        {/* Week day headers */}
        {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
          <div
            key={day}
            className={cn(
              "text-center text-base sm:text-lg font-extrabold py-2 sm:py-3",
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"
            )}
          >
            {day}
          </div>
        ))}

        {/* Padding for first week */}
        {Array.from({ length: daysInRange[0]?.getDay() || 0 }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square" />
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
                "aspect-square p-1.5 sm:p-2 rounded-lg border-2 transition-all text-center flex flex-col",
                isClosed && "border-slate-200 bg-slate-100 opacity-60",
                !isClosed && shift && shift.is_day_off && shift.is_paid_leave && "border-green-300 bg-green-50",
                !isClosed && shift && shift.is_day_off && !shift.is_paid_leave && shift.is_negotiable_if_needed && "border-amber-300 bg-amber-50",
                !isClosed && shift && shift.is_day_off && !shift.is_paid_leave && !shift.is_negotiable_if_needed && "border-slate-300 bg-slate-50",
                !isClosed && shift && !shift.is_day_off && "border-blue-200 bg-blue-50",
                !isClosed && !shift && "border-slate-100 bg-white",
                isTodayDate && "ring-2 ring-inset ring-purple-400 bg-purple-50"
              )}
            >
              <div
                className={cn(
                  "text-base sm:text-lg font-extrabold",
                  dayOfWeek === 0 && "text-red-500",
                  dayOfWeek === 6 && "text-blue-500",
                  dayOfWeek !== 0 && dayOfWeek !== 6 && "text-slate-700",
                  isTodayDate && "text-purple-700"
                )}
              >
                {format(day, 'd')}
              </div>
              {shift && (
                <div className="mt-0.5 flex-1 flex flex-col justify-center">
                  {shift.is_day_off ? (
                    <div className={`px-0.5 py-0.5 rounded text-xs sm:text-sm font-bold ${
                      shift.is_paid_leave ? 'text-green-700 bg-green-200' : shift.is_negotiable_if_needed ? 'text-amber-700 bg-amber-200' : 'text-slate-600 bg-slate-200'
                    }`}>
                      {shift.is_paid_leave ? '有給' : shift.is_negotiable_if_needed ? '休(相談)' : '休み'}
                    </div>
                  ) : shift.is_full_day_available ? (
                    <div className="px-0.5 py-0.5 bg-indigo-200 rounded text-xs sm:text-sm text-indigo-800 font-bold">
                      終日
                    </div>
                  ) : (
                    <>
                      <div className="text-xs sm:text-sm text-blue-700 font-bold leading-tight">
                        <div>{shift.start_time?.slice(0, 5)}</div>
                        <div>{shift.end_time?.slice(0, 5)}</div>
                      </div>
                      {shift.additional_times && shift.additional_times.length > 0 && shift.additional_times.map((at, atIdx) => (
                        <div key={atIdx} className="text-[8px] sm:text-[10px] text-orange-700 font-bold leading-tight border-t border-dashed border-orange-300 mt-0.5 pt-0.5">
                          +{at.start_time?.slice(0, 5)}-{at.end_time?.slice(0, 5)}
                        </div>
                      ))}
                    </>
                  )}
                  {shift.is_negotiable_if_needed && (
                    <div className="text-[9px] sm:text-xs text-amber-700 font-bold bg-amber-100 rounded px-0.5 mt-0.5">相談可</div>
                  )}
                </div>
              )}
              {isClosed && <div className="text-xs sm:text-sm text-red-500 font-bold">休</div>}
            </div>
          );
        })}
      </div>

      {/* Notes section */}
      {shifts.some(s => s.notes) && (
        <div className="mt-3 sm:mt-4 pt-3 border-t border-slate-100">
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
}

// ============ MAIN ADMIN COMPONENT ============
export default function Admin() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedStoreId, setSelectedStoreId] = useState('all');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewType, setViewType] = useState('month');
  const [localWeekStart, setLocalWeekStart] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState(null);

  // 管理者表示/非表示設定
  const [visibleAdminIds, setVisibleAdminIds] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_visibleAdminIds');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('admin_visibleAdminIds', JSON.stringify(visibleAdminIds));
  }, [visibleAdminIds]);

  const { user } = useAuth();

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const { data } = await supabase.from('Store').select('*');
      return sortStoresByOrder(data || []);
    },
  });

  const { data: shiftRequests = [], isLoading } = useQuery({
    queryKey: ['allShiftRequests', format(selectedMonth, 'yyyy-MM'), localWeekStart],
    queryFn: async () => {
      const { data: dbRequests } = await supabase.from('ShiftRequest').select('*');
      const { data: allUsers } = await supabase.from('User').select('*');
      
      // 月の範囲に加え、週始まり設定に応じた拡張範囲でデフォルトシフトを生成
      const fetchStart = startOfWeek(startOfMonth(selectedMonth), { weekStartsOn: localWeekStart });
      const fetchEnd = endOfWeek(endOfMonth(selectedMonth), { weekStartsOn: localWeekStart });
      const days = eachDayOfInterval({ start: fetchStart, end: fetchEnd });
      const dayMap = {
        0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
      };
      
      const allDefaultShifts = [];
      
      (allUsers || []).forEach(user => {
        const defaultSettings = user.default_shift_settings;
        if (!defaultSettings) return;
        if (!user.store_ids || user.store_ids.length === 0) return;
        
        user.store_ids.forEach(storeId => {
          days.forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const hasExistingShift = (dbRequests || []).some(r => 
              r.created_by === user.email && r.date === dateStr && r.store_id === storeId
            );
            if (hasExistingShift) return;
            
            const dayKey = dayMap[day.getDay()];
            const setting = defaultSettings[dayKey];
            
            if (setting && setting.enabled) {
              const firstDayOfMonth = new Date(day.getFullYear(), day.getMonth(), 1);
              const firstDayOfWeek = firstDayOfMonth.getDay();
              const adjustedDate = day.getDate() + firstDayOfWeek;
              const weekOfMonth = Math.ceil(adjustedDate / 7);
              
              if (setting.week_settings) {
                const weekSetting = setting.week_settings[weekOfMonth];
                if (weekSetting) {
                  allDefaultShifts.push({
                    id: 'default-' + user.email + '-' + storeId + '-' + dateStr,
                    date: dateStr,
                    start_time: weekSetting.is_day_off ? null : weekSetting.start_time,
                    end_time: weekSetting.is_day_off ? null : weekSetting.end_time,
                    is_day_off: weekSetting.is_day_off,
                    is_paid_leave: false,
                    is_full_day_available: false,
                    notes: weekSetting.notes || '',
                    store_id: storeId,
                    created_by: user.email,
                    is_default: true
                  });
                }
              } else {
                const allowedWeeks = setting.weeks || [1, 2, 3, 4, 5];
                if (allowedWeeks.includes(weekOfMonth)) {
                  allDefaultShifts.push({
                    id: 'default-' + user.email + '-' + storeId + '-' + dateStr,
                    date: dateStr,
                    start_time: setting.is_day_off ? null : setting.start_time,
                    end_time: setting.is_day_off ? null : setting.end_time,
                    is_day_off: setting.is_day_off,
                    is_paid_leave: false,
                    is_full_day_available: setting.is_full_day_available || false,
                    notes: setting.notes || '',
                    store_id: storeId,
                    created_by: user.email,
                    is_default: true
                  });
                }
              }
            }
          });
        });
      });
      
      return [...(dbRequests || []), ...allDefaultShifts];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      const { data } = await supabase.from('User').select('*');
      return data || [];
    },
  });

  // Calculate date range based on view type
  let rangeStart, rangeEnd;
  if (viewType === 'month') {
    rangeStart = startOfMonth(selectedMonth);
    rangeEnd = endOfMonth(selectedMonth);
  } else if (viewType === 'week') {
    rangeStart = startOfWeek(selectedDate, { weekStartsOn: localWeekStart });
    rangeEnd = endOfWeek(selectedDate, { weekStartsOn: localWeekStart });
  } else {
    rangeStart = startOfDay(selectedDate);
    rangeEnd = endOfDay(selectedDate);
  }

  const filteredShifts = shiftRequests.filter(shift => {
    const shiftDate = parseISO(shift.date);
    const dateMatch = shiftDate >= rangeStart && shiftDate <= rangeEnd;
    const storeMatch = selectedStoreId === 'all' || shift.store_id === selectedStoreId;
    return dateMatch && storeMatch;
  });

  // 管理者・マネージャーのリスト
  const adminUsersList = users.filter(u => {
    const role = u.user_role || u.role;
    return role === 'admin' || role === 'manager';
  });

  const toggleAdminUser = (userId) => {
    setVisibleAdminIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // 管理者表示/非表示設定を反映: 非表示の管理者のシフトを除外
  const hiddenAdminEmails = new Set(
    adminUsersList
      .filter(u => !visibleAdminIds.includes(u.id))
      .map(u => u.email)
  );

  // Group shifts by user email (管理者フィルタリング適用)
  const shiftsByUser = filteredShifts.reduce((acc, shift) => {
    const userEmail = shift.created_by;
    if (!userEmail) return acc;
    if (hiddenAdminEmails.has(userEmail)) return acc;
    if (!acc[userEmail]) {
      acc[userEmail] = [];
    }
    acc[userEmail].push(shift);
    return acc;
  }, {});

  // フィルタリング済みユーザーリスト（ShiftSummaryCard用）
  const filteredUsers = users.filter(u => !hiddenAdminEmails.has(u.email));

  // Sort users - use sort_order from metadata (same as ShiftOverview)
  const sortedUserEntries = useMemo(() => {
    return Object.entries(shiftsByUser).sort(([emailA], [emailB]) => {
      const userA = users.find(u => u.email === emailA);
      const userB = users.find(u => u.email === emailB);
      const orderA = userA?.metadata?.sort_order ?? 999;
      const orderB = userB?.metadata?.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      // Fallback: put current user first, then alphabetically
      if (emailA === user?.email) return -1;
      if (emailB === user?.email) return 1;
      const nameA = userA?.metadata?.display_name || emailA;
      const nameB = userB?.metadata?.display_name || emailB;
      return nameA.localeCompare(nameB);
    });
  }, [shiftsByUser, user?.email, users]);

  const navigateDate = (direction) => {
    if (viewType === 'month') {
      setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + direction));
    } else if (viewType === 'week') {
      setSelectedDate(addDays(selectedDate, direction * 7));
    } else {
      setSelectedDate(addDays(selectedDate, direction));
    }
  };

  // Auto-select first user if none selected
  const selectedUserEmail = useMemo(() => {
    if (selectedUserId === 'all') return 'all';
    if (selectedUserId) {
      const u = users.find(u => u.id === selectedUserId);
      return u?.email;
    }
    // Auto-select first user
    if (sortedUserEntries.length > 0) {
      return sortedUserEntries[0][0];
    }
    return null;
  }, [selectedUserId, users, sortedUserEntries]);

  const selectedUserData = selectedUserEmail && selectedUserEmail !== 'all'
    ? users.find(u => u.email === selectedUserEmail)
    : null;

  const calculateUserSummary = (shifts) => {
    const workDays = shifts.filter(s => !s.is_day_off).length;
    const totalDays = shifts.length;
    return { workDays, totalDays };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-200">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-2xl font-bold text-slate-800">シフト提出状況</h1>
                <p className="text-[10px] sm:text-sm text-slate-500">各スタッフのシフト希望提出状況の確認</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {adminUsersList.length > 0 && (
                <AdminDropdown
                  adminUsers={adminUsersList}
                  visibleAdminIds={visibleAdminIds}
                  toggleAdminUser={toggleAdminUser}
                  setVisibleAdminIds={setVisibleAdminIds}
                  adminDropdownOpen={adminDropdownOpen}
                  setAdminDropdownOpen={setAdminDropdownOpen}
                />
              )}
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="font-medium">{Object.keys(shiftsByUser).length}名</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Summary Cards */}
        <ShiftSummaryCard 
          users={filteredUsers}
          shiftsByUser={shiftsByUser}
          stores={stores}
          selectedStoreId={selectedStoreId}
        />

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-5 mb-4 sm:mb-6">
          {/* Store Filter */}
          <div className="mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-slate-100">
            <Label className="text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block text-slate-600">店舗</Label>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <button
                onClick={() => setSelectedStoreId('all')}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  selectedStoreId === 'all'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                全店舗
              </button>
              {stores.map(store => (
                <button
                  key={store.id}
                  onClick={() => setSelectedStoreId(store.id)}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    selectedStoreId === store.id
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {store.store_name}
                </button>
              ))}
            </div>
          </div>

          {/* View Type and Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <Select value={viewType} onValueChange={setViewType}>
                <SelectTrigger className="w-28 sm:w-32 h-9 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">日ごと</SelectItem>
                  <SelectItem value="week">週ごと</SelectItem>
                  <SelectItem value="month">月ごと</SelectItem>
                </SelectContent>
              </Select>
              {(viewType === 'week' || viewType === 'day') && (
                <Select value={String(localWeekStart)} onValueChange={(v) => setLocalWeekStart(parseInt(v))}>
                  <SelectTrigger className="w-[110px] h-9 text-xs sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">月曜始まり</SelectItem>
                    <SelectItem value="0">日曜始まり</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateDate(-1)}
                className="rounded-full h-8 w-8 sm:h-9 sm:w-9"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              <span className="text-sm sm:text-lg font-bold text-slate-800 min-w-[160px] sm:min-w-[200px] text-center">
                {viewType === 'month' && format(selectedMonth, 'yyyy年 M月', { locale: ja })}
                {viewType === 'week' && `${format(rangeStart, 'M/d', { locale: ja })} - ${format(rangeEnd, 'M/d', { locale: ja })}`}
                {viewType === 'day' && format(selectedDate, 'yyyy年 M月d日 (E)', { locale: ja })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateDate(1)}
                className="rounded-full h-8 w-8 sm:h-9 sm:w-9"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* User avatars + calendar view */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-slate-400 mt-4 text-sm">読み込み中...</p>
          </div>
        ) : Object.keys(shiftsByUser).length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 sm:p-12 text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 mb-1 text-sm sm:text-base">この期間のシフト希望はまだありません</p>
            <p className="text-xs sm:text-sm text-slate-400">スタッフがシフト希望を提出すると表示されます</p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* User Avatar Scroll */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700">スタッフ選択</span>
                <span className="text-[10px] sm:text-xs text-slate-400 ml-auto">{sortedUserEntries.length}名</span>
              </div>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
                {/* All users button */}
                <button
                  onClick={() => setSelectedUserId('all')}
                  className={cn(
                    "flex flex-col items-center gap-1 min-w-[60px] sm:min-w-[72px] transition-all duration-200",
                    selectedUserId === 'all' || (!selectedUserId && sortedUserEntries.length === 0) ? "scale-105" : "opacity-70 hover:opacity-100"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white shadow-md transition-all",
                    (selectedUserId === 'all') && "ring-3 ring-purple-400 ring-offset-2 shadow-lg"
                  )}>
                    <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className={cn(
                    "text-[10px] sm:text-xs font-medium",
                    selectedUserId === 'all' ? "text-purple-700 font-bold" : "text-slate-600"
                  )}>全員</span>
                </button>

                {/* Individual user avatars */}
                {sortedUserEntries.map(([userEmail, shifts]) => {
                  const userData = users.find(u => u.email === userEmail);
                  if (!userData) return null;
                  const isSelected = selectedUserId === userData.id || (!selectedUserId && sortedUserEntries[0]?.[0] === userEmail && selectedUserId !== 'all');
                  return (
                    <UserAvatar
                      key={userEmail}
                      user={userData}
                      isSelected={isSelected}
                      onClick={() => setSelectedUserId(userData.id)}
                      shiftSummary={calculateUserSummary(shifts)}
                      isMe={userEmail === user?.email}
                    />
                  );
                })}
              </div>
            </div>

            {/* Selected user's calendar or all users list */}
            {selectedUserId === 'all' ? (
              // Show all users in expandable list
              <div className="space-y-3 sm:space-y-4">
                {sortedUserEntries.map(([userEmail, shifts]) => {
                  const userData = users.find(u => u.email === userEmail);
                  const userName = userData?.metadata?.display_name || userData?.full_name || userEmail;
                  const workDays = shifts.filter(s => !s.is_day_off).length;
                  const offDays = shifts.filter(s => s.is_day_off).length;
                  
                  return (
                    <ExpandableUserCard
                      key={userEmail}
                      userName={userName}
                      userEmail={userEmail}
                      isMe={userEmail === user?.email}
                      workDays={workDays}
                      offDays={offDays}
                      totalDays={shifts.length}
                    >
                      <UserCalendarView
                        userEmail={userEmail}
                        userName={userName}
                        shifts={shifts}
                        currentMonth={viewType === 'month' ? selectedMonth : selectedDate}
                        store={selectedStoreId !== 'all' ? stores.find(s => s.id === selectedStoreId) : stores[0]}
                        viewType={viewType}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        userData={userData}
                      />
                    </ExpandableUserCard>
                  );
                })}
              </div>
            ) : (
              // Show selected user's calendar
              (() => {
                const targetEmail = selectedUserEmail || sortedUserEntries[0]?.[0];
                const targetShifts = shiftsByUser[targetEmail] || [];
                const targetUser = users.find(u => u.email === targetEmail);
                const targetName = targetUser?.metadata?.display_name || targetUser?.full_name || targetEmail || '';
                
                return targetEmail ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 sm:px-5 sm:py-4 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                          {targetName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                            {targetName}
                            {targetEmail === user?.email && (
                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">自分</span>
                            )}
                          </h3>
                          <p className="text-[10px] sm:text-xs text-slate-400">{targetEmail}</p>
                        </div>
                      </div>
                    </div>
                    <UserCalendarView
                      userEmail={targetEmail}
                      userName={targetName}
                      shifts={targetShifts}
                      currentMonth={viewType === 'month' ? selectedMonth : selectedDate}
                      store={selectedStoreId !== 'all' ? stores.find(s => s.id === selectedStoreId) : stores[0]}
                      viewType={viewType}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      userData={targetUser}
                    />
                  </div>
                ) : null;
              })()
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ============ EXPANDABLE USER CARD COMPONENT ============
function ExpandableUserCard({ userName, userEmail, isMe, workDays, offDays, totalDays, children }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const name = userName || '?';
  const initial = name.charAt(0);
  const colors = [
    'from-violet-400 to-purple-500',
    'from-blue-400 to-indigo-500',
    'from-cyan-400 to-blue-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-rose-400 to-pink-500',
    'from-fuchsia-400 to-purple-500',
    'from-lime-400 to-green-500',
  ];
  const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  const gradientColor = colors[colorIndex];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className={cn(
            "w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm sm:text-base shadow-md",
            gradientColor
          )}>
            {initial}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm sm:text-base text-slate-800 flex items-center gap-1.5">
              {userName}
              {isMe && <span className="text-[9px] sm:text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">自分</span>}
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-400">{userEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex gap-2 text-sm">
            <div className="text-center px-2 sm:px-3 py-1 bg-blue-50 rounded-lg">
              <p className="text-[10px] text-blue-600">出勤</p>
              <p className="font-semibold text-blue-700 text-xs sm:text-sm">{workDays}日</p>
            </div>
            <div className="text-center px-2 sm:px-3 py-1 bg-slate-50 rounded-lg">
              <p className="text-[10px] text-slate-600">休み</p>
              <p className="font-semibold text-slate-700 text-xs sm:text-sm">{offDays}日</p>
            </div>
            <div className="text-center px-2 sm:px-3 py-1 bg-purple-50 rounded-lg">
              <p className="text-[10px] text-purple-600">提出</p>
              <p className="font-semibold text-purple-700 text-xs sm:text-sm">{totalDays}日</p>
            </div>
          </div>
          <div className="sm:hidden flex items-center gap-1 text-[10px] text-slate-500">
            <span className="text-blue-600 font-semibold">{workDays}</span>/<span>{totalDays}日</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}
