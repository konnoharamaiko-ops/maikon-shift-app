import React, { useState, useEffect } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ViewModeSelector from './ViewModeSelector';
import ShiftRequestsOverview from './ShiftRequestsOverview';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ShiftRequestsViewToggle({ selectedMonth, users, shiftRequests, onRequestClick, store }) {
  const [viewMode, setViewMode] = useState(() => {
    const saved = sessionStorage.getItem('shiftRequestsViewMode');
    return saved || 'calendar';
  });
  const [selectedWeek, setSelectedWeek] = useState(0);

  useEffect(() => {
    sessionStorage.setItem('shiftRequestsViewMode', viewMode);
  }, [viewMode]);

  const monthDays = eachDayOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth)
  });

  // Week start day setting: local override > store setting
  const storeWeekStart = store?.week_start_day ?? 0;
  const [localWeekStart, setLocalWeekStart] = useState(null);
  const effectiveWeekStart = localWeekStart !== null ? localWeekStart : storeWeekStart;

  const weeksInMonth = eachWeekOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth)
  }, { weekStartsOn: effectiveWeekStart });

  const getWeekDays = () => {
    if (selectedWeek >= weeksInMonth.length) return [];
    const weekStart = weeksInMonth[selectedWeek];
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: effectiveWeekStart });
    // 月を跨ぐ週も正しく表示するため、フィルタリングを削除
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  };

  const weekDays = getWeekDays();
  const dayViewDays = viewMode === 'day' ? getWeekDays() : [];
  const displayDays = viewMode === 'month' ? monthDays : viewMode === 'week' ? weekDays : viewMode === 'day' ? dayViewDays : monthDays;

  const getRequestsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shiftRequests.filter(r => r.date === dateStr);
  };

  const renderTableView = (days) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs sm:text-sm min-w-[800px]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 p-2 font-semibold sticky left-0 z-10 bg-slate-100">日付</th>
            {users.map(user => (
              <th key={user?.email} className="border border-slate-300 p-2 text-center min-w-[120px] bg-white font-semibold">
                <div className="text-xs truncate">{user?.metadata?.display_name || user?.full_name || user?.email.split('@')[0]}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayOfWeek = getDay(date);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            return (
              <tr key={dateStr} className="hover:bg-slate-50">
                <td className={`border border-slate-300 p-2 font-medium sticky left-0 z-10 ${isWeekend ? 'bg-red-50' : 'bg-white'}`}>
                  <div className="text-sm">
                    <span className={dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-slate-700'}>
                      {format(date, 'M/d')}
                    </span>
                    <span className="text-xs text-slate-500 ml-1">({format(date, 'E', { locale: ja })})</span>
                  </div>
                </td>
                {users.map(user => {
                  const requests = getRequestsForDate(date).filter(r => r.created_by === user?.email);
                  return (
                    <td key={user?.email} className={`border border-slate-300 p-1 text-center ${isWeekend ? 'bg-red-50/50' : 'bg-white'}`}>
                      {requests.length > 0 ? (
                        <div className="space-y-0.5">
                          {requests.map(request => (
                            <div
                              key={request.id}
                              className={`text-[10px] p-1 rounded ${
                                request.is_day_off
                                  ? request.is_paid_leave
                                    ? 'bg-blue-200 text-blue-900'
                                    : 'bg-slate-200 text-slate-900'
                                  : request.is_full_day_available
                                  ? 'bg-green-200 text-green-900'
                                  : request.is_negotiable_if_needed
                                  ? 'bg-orange-200 text-orange-900'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {request.is_day_off
                                ? request.is_paid_leave
                                  ? '有給'
                                  : '休み'
                                : request.is_full_day_available
                                ? '終日可'
                                : request.is_negotiable_if_needed
                                ? '要相談'
                                : `${request.start_time?.slice(0, 5)}-${request.end_time?.slice(0, 5)}`}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-slate-300 text-xs">-</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {viewMode !== 'calendar' && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-slate-800">シフト希望一覧</h3>
          <div className="flex items-center gap-2">
            <ViewModeSelector viewMode={viewMode} onViewModeChange={setViewMode} />
            {(viewMode === 'week' || viewMode === 'day') && (
              <>
                <Select value={String(effectiveWeekStart)} onValueChange={(v) => setLocalWeekStart(parseInt(v))}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">月曜始まり</SelectItem>
                    <SelectItem value="0">日曜始まり</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    disabled={selectedWeek === 0}
                    onClick={() => setSelectedWeek(Math.max(0, selectedWeek - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    第{selectedWeek + 1}週
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    disabled={selectedWeek >= weeksInMonth.length - 1}
                    onClick={() => setSelectedWeek(Math.min(weeksInMonth.length - 1, selectedWeek + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}


      {viewMode === 'calendar' ? (
        <ShiftRequestsOverview
          selectedMonth={selectedMonth}
          users={users}
          shiftRequests={shiftRequests}
          onRequestClick={onRequestClick}
          store={store}
          readOnly={true}
        />
      ) : (
        renderTableView(displayDays)
      )}
    </div>
  );
}
