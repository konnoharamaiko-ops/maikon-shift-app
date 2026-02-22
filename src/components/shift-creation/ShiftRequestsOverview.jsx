import React, { useState } from 'react';
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth, getDay, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Edit2, X, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';
import { cn } from '@/lib/utils';

// 色分け: 休みと出勤のみ。有給は休みとして表示
function getRequestColor(request) {
  if (request.is_day_off) {
    // 有給も休みもすべてグレー系（休み扱い）
    return 'bg-slate-200 text-slate-800';
  }
  if (request.is_full_day_available) {
    return 'bg-green-200 text-green-900';
  }
  if (request.is_negotiable_if_needed) {
    return 'bg-orange-200 text-orange-900';
  }
  // 出勤（時間指定）
  return 'bg-indigo-100 text-indigo-800';
}

function getRequestLabel(request) {
  if (request.is_day_off) {
    return '休み';
  }
  if (request.is_full_day_available) {
    return '終日可';
  }
  if (request.is_negotiable_if_needed) {
    return '要相談';
  }
  let label = `${request.start_time?.slice(0,5)}-${request.end_time?.slice(0,5)}`;
  if (request.additional_times && request.additional_times.length > 0) {
    label += ` +${request.additional_times.length}`;
  }
  return label;
}

export default function ShiftRequestsOverview({ selectedMonth, users, shiftRequests, onRequestClick, store, readOnly = false }) {
  const [expandedDate, setExpandedDate] = useState(null);
  
  const monthDays = eachDayOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth)
  });

  const getRequestsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shiftRequests.filter(r => r.date === dateStr);
  };

  const isToday = (date) => isSameDay(date, new Date());

  // 日付クリックで詳細展開/閉じる
  const handleDateClick = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setExpandedDate(prev => prev === dateStr ? null : dateStr);
  };

  // 展開中の日付の詳細情報
  const renderExpandedDetail = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    if (expandedDate !== dateStr) return null;
    
    const requests = getRequestsForDate(date);
    const workingCount = requests.filter(r => !r.is_day_off).length;
    const dayOffCount = requests.filter(r => r.is_day_off && !r.is_paid_leave).length;
    const paidLeaveCount = requests.filter(r => r.is_paid_leave).length;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setExpandedDate(null)}>
        <div 
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">
                  {format(date, 'M月d日 (EEEE)', { locale: ja })}
                </h3>
                <div className="flex gap-3 mt-1 text-sm opacity-90">
                  <span>出勤: {workingCount}人</span>
                  <span>休み: {dayOffCount}人</span>
                  {paidLeaveCount > 0 && <span>有給: {paidLeaveCount}人</span>}
                </div>
              </div>
              <button 
                onClick={() => setExpandedDate(null)}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
            {requests.length === 0 ? (
              <p className="text-center text-slate-400 py-8">この日のシフト希望はありません</p>
            ) : (
              requests.map(request => {
                const reqUser = users.find(u => u.email === request.created_by);
                const displayName = reqUser?.metadata?.display_name || reqUser?.full_name || request.created_by.split('@')[0];
                
                return (
                  <div 
                    key={request.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                      !readOnly && "cursor-pointer hover:bg-slate-50",
                      request.is_day_off ? "border-slate-200" : "border-indigo-200"
                    )}
                    onClick={() => !readOnly && onRequestClick?.(request, date)}
                  >
                    {/* Status indicator */}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                      request.is_day_off 
                        ? "bg-slate-100 text-slate-600"
                        : "bg-indigo-100 text-indigo-700"
                    )}>
                      {request.is_day_off ? '休' : (
                        request.is_full_day_available ? '全' : (
                          <Clock className="w-4 h-4" />
                        )
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800 truncate">{displayName}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {request.is_day_off 
                          ? (request.is_paid_leave ? '休み（有給申請予定）' : '休み希望')
                          : request.is_full_day_available 
                            ? '終日出勤可能'
                            : `${request.start_time?.slice(0,5)} - ${request.end_time?.slice(0,5)}`
                        }
                        {request.is_negotiable_if_needed && ' (要相談)'}
                      </div>
                      {!request.is_day_off && request.additional_times && request.additional_times.length > 0 && (
                        <div className="text-xs text-purple-500 mt-0.5">
                          {request.additional_times.map((at, i) => (
                            <span key={i}>{i > 0 && ', '}{at.start_time?.slice(0,5)}-{at.end_time?.slice(0,5)}</span>
                          ))}
                        </div>
                      )}
                      {request.notes && (
                        <div className="text-xs text-slate-400 mt-1 truncate">備考: {request.notes}</div>
                      )}
                    </div>
                    
                    {/* Badge */}
                    <div className={cn(
                      "px-2 py-1 rounded-full text-xs font-semibold flex-shrink-0",
                      getRequestColor(request)
                    )}>
                      {getRequestLabel(request)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[320px] sm:min-w-[640px]">
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
            <div key={i} className={cn(
              "text-center font-semibold py-1.5 sm:py-2 text-[10px] sm:text-xs",
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-600'
            )}>
              {day}
            </div>
          ))}
          {monthDays.map(date => {
            const dayOfWeek = getDay(date);
            const requests = getRequestsForDate(date);
            const dateStr = format(date, 'yyyy-MM-dd');
            const storeSettings = store ? getStoreSettingsForDate(store, dateStr) : null;
            const isClosed = storeSettings?.isClosedDay;
            const workingCount = requests.filter(r => !r.is_day_off).length;
            const dayOffCount = requests.filter(r => r.is_day_off).length;
            const today = isToday(date);

            return (
              <div
                key={date.toString()}
                className={cn(
                  "border rounded-lg p-1 sm:p-1.5 min-h-[70px] sm:min-h-[110px] cursor-pointer transition-all hover:shadow-md hover:border-indigo-300 active:scale-[0.98]",
                  isClosed ? 'bg-slate-100 opacity-60' : dayOfWeek === 0 ? 'bg-red-50/50' : dayOfWeek === 6 ? 'bg-blue-50/50' : 'bg-white',
                  today && 'ring-2 ring-blue-400 bg-blue-50/30',
                  expandedDate === dateStr && 'ring-2 ring-indigo-500'
                )}
                onClick={() => handleDateClick(date)}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={cn(
                    "text-[10px] sm:text-sm font-bold",
                    dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-slate-800',
                    today && 'text-blue-700'
                  )}>
                    {format(date, 'd')}
                    {today && <span className="text-[7px] sm:text-[9px] text-blue-500 ml-0.5">今日</span>}
                  </span>
                  {requests.length > 0 && (
                    <span className="text-[8px] sm:text-[10px] text-slate-400 font-medium">
                      {workingCount}/{requests.length}
                    </span>
                  )}
                </div>

                {isClosed && (
                  <div className="text-[9px] sm:text-xs text-red-500 font-semibold text-center">休業日</div>
                )}

                {/* シフト希望表示 - 色分けは休みと出勤のみ */}
                <div className="space-y-0.5">
                  {requests.slice(0, 3).map(request => {
                    const reqUser = users.find(u => u.email === request.created_by);
                    return (
                      <div
                        key={request.id}
                        className={cn(
                          "text-[8px] sm:text-[10px] px-1 py-0.5 rounded truncate font-medium",
                          getRequestColor(request)
                        )}
                      >
                        <span className="truncate">
                          {reqUser?.metadata?.display_name || reqUser?.full_name?.split(' ')[0] || request.created_by.split('@')[0]}
                          {' '}
                          {getRequestLabel(request)}
                        </span>
                      </div>
                    );
                  })}
                  {requests.length > 3 && (
                    <div className="text-[8px] sm:text-[10px] text-slate-400 text-center font-medium">
                      +{requests.length - 3}人
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend - 休みと出勤のみ */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 text-[10px] sm:text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-indigo-100 border border-indigo-200"></span> 出勤</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-green-200 border border-green-300"></span> 終日可</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-orange-200 border border-orange-300"></span> 要相談</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-slate-200 border border-slate-300"></span> 休み</span>
          <span className="text-[9px] sm:text-[10px] text-slate-400 ml-1">※日付をタップで詳細表示</span>
        </div>
      </div>

      {/* 詳細展開モーダル */}
      {expandedDate && (() => {
        const date = monthDays.find(d => format(d, 'yyyy-MM-dd') === expandedDate);
        return date ? renderExpandedDetail(date) : null;
      })()}
    </div>
  );
}
