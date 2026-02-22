import React from 'react';
import { format, getDay, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { formatTimeJa } from './ShiftTableView';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';

// 読み取り専用の月ごと/週ごとテーブルビュー（ShiftTableViewの月ごと/週ごと表示と完全一致）
export default function ReadOnlyTableView({ displayDays, users, workShifts, store, shiftRequests = [], visibleAdminIds = [] }) {
  const orderedUsers = users
    .filter(u => {
      const role = u.user_role || u.role;
      if (role === 'user') return true;
      return visibleAdminIds.includes(u.id);
    })
    .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999));

  const getShiftForUserAndDate = (userEmail, dateStr) => {
    return workShifts.filter(s => s.user_email === userEmail && s.date === dateStr);
  };

  const getShiftColor = (startTime) => {
    const hour = parseInt(startTime.split(':')[0]);
    if (hour < 12) return 'bg-cyan-50 text-cyan-800 border-cyan-200';
    if (hour < 17) return 'bg-lime-50 text-lime-800 border-lime-200';
    return 'bg-orange-50 text-orange-800 border-orange-200';
  };

  const calculateDailyTotals = (dateStr) => {
    const dayShifts = workShifts.filter(s => s.date === dateStr);
    let totalHours = 0;
    let staffCount = new Set();
    dayShifts.forEach(shift => {
      staffCount.add(shift.user_email);
      const start = new Date(`2000-01-01T${shift.start_time}`);
      const end = new Date(`2000-01-01T${shift.end_time}`);
      const hours = (end - start) / (1000 * 60 * 60);
      if (hours > 0) totalHours += hours;
      if (shift.additional_times && shift.additional_times.length > 0) {
        shift.additional_times.forEach(at => {
          if (at.start_time && at.end_time) {
            const s = new Date(`2000-01-01T${at.start_time}`);
            const e = new Date(`2000-01-01T${at.end_time}`);
            const h = (e - s) / (1000 * 60 * 60);
            if (h > 0) totalHours += h;
          }
        });
      }
    });
    return { hours: totalHours.toFixed(1), staff: staffCount.size };
  };

  const calculateUserTotalHours = (userEmail) => {
    let totalHours = 0;
    workShifts.forEach(shift => {
      if (shift.user_email === userEmail) {
        const start = new Date(`2000-01-01T${shift.start_time}`);
        const end = new Date(`2000-01-01T${shift.end_time}`);
        const hours = (end - start) / (1000 * 60 * 60);
        if (hours > 0) totalHours += hours;
        if (shift.additional_times && shift.additional_times.length > 0) {
          shift.additional_times.forEach(at => {
            if (at.start_time && at.end_time) {
              const s = new Date(`2000-01-01T${at.start_time}`);
              const e = new Date(`2000-01-01T${at.end_time}`);
              const h = (e - s) / (1000 * 60 * 60);
              if (h > 0) totalHours += h;
            }
          });
        }
      }
    });
    return totalHours.toFixed(1);
  };

  const calculateUserWorkDays = (userEmail) => {
    const workDates = new Set();
    workShifts.forEach(shift => {
      if (shift.user_email === userEmail) {
        workDates.add(shift.date);
      }
    });
    return workDates.size;
  };

  const today = new Date();

  return (
    <table className="w-full border-collapse text-xs sm:text-sm min-w-[600px]">
      <thead>
        <tr>
          <th className="border border-slate-200 px-2 py-1.5 sm:py-2 font-bold text-slate-600 sticky top-0 bg-gradient-to-b from-slate-50 to-slate-100 z-10 text-[11px] sm:text-xs min-w-[80px]">
            日付
          </th>
          {orderedUsers.map(user => (
            <th key={user.id} className="border border-slate-200 px-1 py-1.5 sm:py-2 font-bold text-slate-600 sticky top-0 bg-gradient-to-b from-slate-50 to-slate-100 z-10 text-[10px] sm:text-xs whitespace-nowrap min-w-[70px]">
              {user?.metadata?.display_name || user?.full_name || user?.email?.split('@')[0]}
            </th>
          ))}
          <th className="border border-slate-200 px-1 py-1.5 sm:py-2 font-bold text-amber-700 bg-gradient-to-b from-amber-50 to-amber-100/80 min-w-[60px] sm:min-w-[80px] text-[10px] sm:text-xs">
            合計
          </th>
        </tr>
      </thead>
      <tbody>
        {displayDays.map(date => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const dayOfWeek = getDay(date);
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const isSun = dayOfWeek === 0;
          const isSat = dayOfWeek === 6;
          const isToday = isSameDay(date, today);
          const { hours, staff } = calculateDailyTotals(dateStr);

          const storeSettings = store ? getStoreSettingsForDate(store, dateStr) : null;
          const isClosed = storeSettings?.isClosedDay;

          return (
            <tr key={date.toString()} className={`${isClosed ? 'opacity-50' : ''} ${isToday ? 'ring-1 ring-inset ring-cyan-300' : ''}`}>
              <td className={`border border-slate-200 px-2 py-1 font-medium sticky left-0 z-10 ${
                isClosed ? 'bg-slate-100' : isSun ? 'bg-red-50/60' : isSat ? 'bg-blue-50/60' : 'bg-white'
              }`}>
                <div className="flex items-baseline gap-1">
                  <span className={`text-[11px] sm:text-sm font-bold ${
                    isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-700'
                  } ${isToday ? 'text-cyan-600' : ''}`}>
                    {format(date, 'M/d')}
                  </span>
                  <span className={`text-[9px] sm:text-xs ${
                    isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'
                  }`}>
                    {format(date, 'E', { locale: ja })}
                  </span>
                  {isClosed && (
                    <span className="text-[8px] sm:text-[10px] text-red-400 font-bold">休</span>
                  )}
                  {isToday && (
                    <span className="text-[7px] sm:text-[9px] text-cyan-500 font-bold">今日</span>
                  )}
                </div>
                {storeSettings?.businessHours && !isClosed && (
                  <div className="text-[8px] sm:text-[9px] text-slate-400 leading-tight">
                    {storeSettings.businessHours.open}-{storeSettings.businessHours.close}
                  </div>
                )}
              </td>
              {orderedUsers.map(user => {
                const shifts = getShiftForUserAndDate(user?.email, dateStr);
                return (
                  <td
                    key={user?.email}
                    className={`border border-slate-200 p-0.5 align-middle ${
                      isSun ? 'bg-red-50/30' : isSat ? 'bg-blue-50/30' : 'bg-white'
                    }`}
                  >
                    {shifts.length > 0 ? (
                      <div className="space-y-0.5">
                        {shifts.map(shift => (
                          <div key={shift.id}>
                            <div
                              className={`${getShiftColor(shift.start_time)} border rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-semibold text-center leading-tight`}
                            >
                              {formatTimeJa(shift.start_time)}-{formatTimeJa(shift.end_time)}
                            </div>
                            {shift.additional_times && shift.additional_times.length > 0 && shift.additional_times.map((at, idx) => (
                              <div key={idx} className={`${getShiftColor(at.start_time)} border border-dashed rounded px-1 py-0.5 text-[8px] sm:text-[9px] font-semibold text-center leading-tight mt-0.5`}>
                                {formatTimeJa(at.start_time)}-{formatTimeJa(at.end_time)}
                              </div>
                            ))}
                            {shift.work_details && shift.work_details.length > 0 && (
                              <div className="mt-0.5 space-y-px">
                                {shift.work_details.map((d, i) => (
                                  <div key={i} className="text-[7px] sm:text-[8px] text-amber-600 text-center leading-tight font-medium truncate">
                                    {formatTimeJa(d.start_time)}-{formatTimeJa(d.end_time)} {d.label || d.activity}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </td>
                );
              })}
              <td className={`border border-slate-200 px-1 py-1 text-center font-bold align-middle ${
                isSun ? 'bg-red-50/50' : isSat ? 'bg-blue-50/50' : 'bg-amber-50/60'
              }`}>
                <div className="text-[10px] sm:text-xs text-slate-700">{staff}人</div>
                <div className="text-[9px] sm:text-[10px] text-slate-500">{hours}h</div>
              </td>
            </tr>
          );
        })}
        <tr className="font-bold">
          <td className="border border-slate-200 px-2 py-1.5 text-[11px] sm:text-xs text-slate-600 sticky left-0 bg-gradient-to-b from-slate-50 to-slate-100 z-10">
            合計
          </td>
          {orderedUsers.map(user => {
            const totalHours = calculateUserTotalHours(user?.email);
            const workDays = calculateUserWorkDays(user?.email);
            return (
              <td
                key={user?.email}
                className="border border-slate-200 px-1 py-1 text-center bg-gradient-to-b from-amber-50 to-amber-100/60"
              >
                <div className="text-[10px] sm:text-xs text-slate-700">{workDays}日</div>
                <div className="text-[9px] sm:text-[10px] text-slate-500">{totalHours}h</div>
              </td>
            );
          })}
          <td className="border border-slate-200 px-1 py-1 bg-gradient-to-b from-amber-50 to-amber-100/60"></td>
        </tr>
      </tbody>
    </table>
  );
}
