import React, { useState, useCallback, useRef } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval, isWithinInterval, isSameMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, GripVertical, Printer, Download, Shield, ChevronDown, Check, UserPlus, MessageSquare } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import ShiftEditDialog from './ShiftEditDialog';
import HelpSlotDialog from './HelpSlotDialog';
import { insertRecord, updateRecord, fetchAll } from '@/api/supabaseHelpers';
import UserStatisticsPanel from './UserStatisticsPanel';
import StaffRequirementDisplay from './StaffRequirementDisplay';
import { supabase } from '@/api/supabaseClient';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { invalidateUserQueries, invalidateStoreQueries } from '@/lib/invalidateHelpers';
import ReadOnlyTableView from './ReadOnlyTableView';
import ZoomableWrapper from '@/components/ui/ZoomableWrapper';
import AdminDropdown from '@/components/ui/AdminDropdown';

// Helper: convert "09:00" to "9時" format for month/week views
export function formatTimeJa(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  if (min === 0) return `${hour}時`;
  return `${hour}時${min}分`;
}

// Confirm shift preview component (user rows x date columns)
export function ConfirmShiftPreview({ selectedMonth, users, workShifts, store, monthDays, shiftRequests, onEditShift, onCellClick, visibleAdminIds = [], showNotes = false }) {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const usersWithShifts = users
    .filter(u => {
      const role = u.user_role || u.role;
      if (role === 'user') return true;
      return visibleAdminIds.includes(u.id);
    })
    .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999));

  const fmtTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    return parseInt(m) === 0 ? `${parseInt(h)}` : `${parseInt(h)}:${m}`;
  };

  const getShiftBg = (startTime) => {
    const hour = parseInt(startTime.split(':')[0]);
    if (hour < 12) return 'bg-cyan-50/80';
    if (hour < 17) return 'bg-lime-50/80';
    return 'bg-orange-50/80';
  };

  const getShiftTextColor = (startTime) => {
    const hour = parseInt(startTime.split(':')[0]);
    if (hour < 12) return 'text-cyan-800';
    if (hour < 17) return 'text-lime-800';
    return 'text-orange-800';
  };

  // 合計計算
  const calcUserTotal = (email) => {
    let hours = 0, days = 0;
    const dates = new Set();
    workShifts.filter(s => s.user_email === email).forEach(s => {
      const st = new Date(`2000-01-01T${s.start_time}`);
      const en = new Date(`2000-01-01T${s.end_time}`);
      const h = (en - st) / 3600000;
      if (h > 0) { hours += h; dates.add(s.date); }
      if (s.additional_times) s.additional_times.forEach(at => {
        const st2 = new Date(`2000-01-01T${at.start_time}`);
        const en2 = new Date(`2000-01-01T${at.end_time}`);
        const h2 = (en2 - st2) / 3600000;
        if (h2 > 0) hours += h2;
      });
    });
    return { hours: hours.toFixed(1), days: dates.size };
  };

  return (
    <div className="min-w-[800px]">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-slate-200 px-1.5 py-1 font-bold text-slate-600 text-xs sm:text-sm sticky left-0 bg-gradient-to-b from-slate-50 to-slate-100 z-10 min-w-[70px]">氏名</th>
            {monthDays.map(day => {
              const dow = getDay(day);
              const isSun = dow === 0;
              const isSat = dow === 6;
              return (
                <th key={day.toISOString()} className={`border border-slate-200 px-0.5 py-1 text-center min-w-[28px] ${
                  isSun ? 'text-red-500 bg-red-50/50' : isSat ? 'text-blue-500 bg-blue-50/50' : 'text-slate-600 bg-slate-50'
                }`}>
                  <div className="text-[10px] font-bold leading-none">{format(day, 'd')}</div>
                  <div className="text-[7px] font-medium leading-none mt-0.5">{dayNames[dow]}</div>
                </th>
              );
            })}
            <th className="border border-slate-200 px-1 py-1 text-center text-[9px] sm:text-[10px] font-bold text-amber-700 bg-gradient-to-b from-amber-50 to-amber-100/80 min-w-[40px] sticky right-0 z-10">合計</th>
          </tr>
        </thead>
        <tbody>
          {usersWithShifts.map((user, idx) => {
            const total = calcUserTotal(user.email);
            return (
              <tr key={user.id} className={idx % 2 === 0 ? '' : 'bg-slate-50/30'}>
                <td className="border border-slate-200 px-1.5 py-0.5 font-bold text-slate-600 sticky left-0 z-10 whitespace-nowrap text-[10px] sm:text-xs bg-white">
                  {user.metadata?.display_name || user.full_name || user.email.split('@')[0]}
                </td>
                {monthDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const shift = workShifts.find(s => s.user_email === user.email && s.date === dateStr);
                  const dow = getDay(day);
                  const isWeekend = dow === 0 || dow === 6;
                  const dayOffRequest = shiftRequests?.find(
                    r => r.created_by === user.email && r.date === dateStr && r.is_day_off
                  );
                  const isEditable = !!onCellClick || !!onEditShift;
                  return (
                    <td
                      key={dateStr}
                      className={`border border-slate-200 p-0 text-center align-middle ${
                        isWeekend && !shift ? (dow === 0 ? 'bg-red-50/20' : 'bg-blue-50/20') : ''
                      } ${shift ? getShiftBg(shift.start_time) : ''} ${
                        !shift && dayOffRequest ? 'bg-rose-50/60' : ''
                      } ${isEditable ? 'cursor-pointer hover:bg-blue-100/40 transition-colors' : ''}`}
                      onClick={(e) => {
                        if (!isEditable) return;
                        if (shift && onEditShift) {
                          const dateLabel = format(day, 'M月d日(E)', { locale: ja });
                          onEditShift(shift, dateLabel);
                        } else if (!shift && onCellClick) {
                          onCellClick(user.email, dateStr, e);
                        }
                      }}
                    >
                      {shift ? (
                        <div className="py-0.5">
                          <div className={`text-[8px] leading-tight font-semibold ${getShiftTextColor(shift.start_time)}`}>
                            {fmtTime(shift.start_time)}-{fmtTime(shift.end_time)}
                          </div>
                          {shift.additional_times && shift.additional_times.length > 0 && shift.additional_times.map((at, idx) => (
                            <div key={idx} className="text-[7px] leading-tight font-semibold text-purple-600">
                              +{fmtTime(at.start_time)}-{fmtTime(at.end_time)}
                            </div>
                          ))}
                          {shift.work_details && shift.work_details.length > 0 && (
                            <div className="text-[6px] leading-tight text-amber-600 font-medium">
                              {shift.work_details.map((d, i) => (
                                <div key={i} className="truncate">
                                  {fmtTime(d.start_time)}-{fmtTime(d.end_time)} {d.label || d.activity}
                                </div>
                              ))}
                            </div>
                          )}
                          {showNotes && shift.notes && (
                            <div className="text-[6px] leading-tight text-indigo-500 bg-indigo-50/80 rounded px-0.5 truncate" title={shift.notes}>
                              📝{shift.notes}
                            </div>
                          )}
                        </div>
                      ) : dayOffRequest ? (
                        <div className={`text-[9px] font-bold ${dayOffRequest.is_negotiable ? 'text-amber-500' : 'text-rose-400'}`}>
                          {dayOffRequest.is_negotiable ? '△' : '休'}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
                <td className="border border-slate-200 px-0.5 py-0.5 text-center bg-gradient-to-b from-amber-50 to-amber-100/50 sticky right-0 z-10">
                  <div className="text-[8px] sm:text-[9px] font-bold text-slate-700">{total.days}日</div>
                  <div className="text-[7px] sm:text-[8px] font-medium text-slate-500">{total.hours}h</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-[9px] sm:text-[11px] text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 bg-cyan-50 border border-cyan-200 rounded-sm"></div>
          <span>早番 (~12時)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 bg-lime-50 border border-lime-200 rounded-sm"></div>
          <span>中番 (12-17時)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 bg-orange-50 border border-orange-200 rounded-sm"></div>
          <span>遅番 (17時~)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 bg-rose-50 border border-rose-200 rounded-sm"></div>
          <span>休み希望</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-amber-500 font-bold">△</span>
          <span>相談可</span>
        </div>
      </div>
    </div>
  );
}

// Week timeline view component  
export function WeekTimelineView({ weekDays, users, workShifts, onEditShift, onCellClick, shiftRequests, store, visibleAdminIds = [], showNotes = false }) {
  // Determine time range from store business hours, with fallback to 6:00-23:00
  const getTimeRange = () => {
    if (!store?.business_hours) return { startHour: 6, endHour: 23 };
    const bh = store.business_hours;
    let minOpen = 24, maxClose = 0;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
      const dayConfig = bh[day];
      if (dayConfig && !dayConfig.closed) {
        const openH = parseInt(dayConfig.open?.split(':')[0] || '9');
        const closeH = parseInt(dayConfig.close?.split(':')[0] || '18');
        if (openH < minOpen) minOpen = openH;
        if (closeH > maxClose) maxClose = closeH;
      }
    });
    if (minOpen >= maxClose) return { startHour: 6, endHour: 23, startMinute: 0, endMinute: 0 };
    // ±30分マージンを追加
    let mStart = minOpen;
    let mStartMin = 0;
    let mEnd = maxClose;
    let mEndMin = 30;
    // 開始側: -30分
    if (minOpen > 0) { mStart = minOpen - 1; mStartMin = 30; } else { mStart = 0; mStartMin = 0; }
    // 終了側: +30分
    if (maxClose < 24) { mEnd = maxClose; mEndMin = 30; } else { mEnd = 24; mEndMin = 0; }
    return { startHour: mStart, endHour: mEnd, startMinute: mStartMin, endMinute: mEndMin };
  };
  const { startHour: rawStart, endHour: rawEnd, startMinute: startMin30 = 0, endMinute: endMin30 = 0 } = getTimeRange();
  // タイムライン全体の時間幅（時間単位）
  const timelineStartFrac = rawStart + startMin30 / 60;
  const timelineEndFrac = rawEnd + endMin30 / 60;
  const timelineStart = rawStart;
  const timelineEnd = rawEnd + (endMin30 > 0 ? 1 : 0);
  const totalHours = timelineEndFrac - timelineStartFrac;
  const hourCount = timelineEnd - timelineStart;
  const hours = Array.from({ length: hourCount }, (_, i) => i + timelineStart);
  
  // パーセンテージベースの位置計算（画面幅いっぱいに使う）
  const getShiftPosition = (shift) => {
    const [startHour, startMin] = shift.start_time.split(':').map(Number);
    const [endHour, endMin] = shift.end_time.split(':').map(Number);
    const startFrac = ((startHour - timelineStart) + startMin / 60) / hourCount;
    const durationFrac = ((endHour - startHour) + (endMin - startMin) / 60) / hourCount;
    return { leftPct: Math.max(0, startFrac * 100), widthPct: durationFrac * 100 };
  };
  
  const getShiftColor = (shift) => {
    const hour = parseInt(shift.start_time.split(':')[0]);
    if (hour < 12) return { bg: 'bg-cyan-100', text: 'text-cyan-800' };
    if (hour < 17) return { bg: 'bg-lime-100', text: 'text-lime-800' };
    return { bg: 'bg-orange-100', text: 'text-orange-800' };
  };
  
  // タイムライン部分の最小幅を計算（時間数 × 1時間あたりのピクセル幅 + 名前欄幅）
  const timelineMinWidth = Math.max(700, hourCount * 50 + 128);

  return (
    <div className="space-y-4">
      {weekDays.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayShifts = workShifts.filter(s => s.date === dateStr);
        const dayOfWeek = getDay(day);
        const isSun = dayOfWeek === 0;
        const isSat = dayOfWeek === 6;
        
        return (
          <div key={dateStr} className={`border rounded-lg overflow-hidden shadow-sm ${
            isSun ? 'border-red-200/80' : isSat ? 'border-blue-200/80' : 'border-slate-200/80'
          }`}>
            {/* 日付ヘッダー */}
            <div className={`px-3 py-1.5 flex items-center justify-between ${
              isSun ? 'bg-gradient-to-r from-red-50 to-red-50/50' : isSat ? 'bg-gradient-to-r from-blue-50 to-blue-50/50' : 'bg-gradient-to-r from-slate-50 to-slate-50/50'
            }`}>
              <h3 className={`text-xs sm:text-sm font-bold ${
                isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-700'
              }`}>
                {format(day, 'M月d日(E)', { locale: ja })}
              </h3>
              <span className="text-[9px] sm:text-[11px] text-slate-400 font-medium">
                {dayShifts.length}名出勤
              </span>
            </div>
            
            {/* Timeline header + Staff rows */}
            <div className="px-2 py-1.5 sm:px-3 sm:py-2">
            <div style={{ minWidth: `${timelineMinWidth}px` }}>
            <div className="flex border-b border-slate-200 mb-1">
              <div className="w-20 sm:w-32 flex-shrink-0 sticky left-0 bg-white z-10"></div>
              <div className="flex-1 relative h-5">
                {hours.map(hour => (
                  <div
                    key={hour}
                    className="absolute text-[8px] sm:text-[10px] text-slate-400 font-medium"
                    style={{ left: `${((hour - timelineStart) / hourCount) * 100}%` }}
                  >
                    {hour}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Staff rows */}
            <div className="space-y-0.5">
              {users
                .filter(u => {
                  const role = u.user_role || u.role;
                  if (role === 'user') return true;
                  return visibleAdminIds.includes(u.id);
                })
                .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999))
                .map(user => {
                const userShifts = dayShifts.filter(s => s.user_email === user?.email);
                const dateStr2 = format(day, 'yyyy-MM-dd');
                const dayOffRequest = shiftRequests?.find(
                  r => r.created_by === user?.email && r.date === dateStr2 && r.is_day_off
                );
                
                return (
                  <div key={user?.email} className="flex items-center border-b border-slate-100/80 py-0.5">
                    <div className="w-20 sm:w-32 flex-shrink-0 pr-1 sm:pr-2 text-[10px] sm:text-sm font-bold text-slate-600 truncate sticky left-0 bg-white z-10">
                      {user?.metadata?.display_name || user?.full_name || user?.email.split('@')[0]}
                    </div>
                    <div className="flex-1 relative h-8" onClick={(e) => {
                      if (userShifts.length === 0 && !dayOffRequest) {
                        onCellClick?.(user?.email, dateStr2, e);
                      }
                    }}>
                      {/* Time grid */}
                      {hours.map(hour => (
                        <div
                          key={hour}
                          className="absolute h-full border-l border-slate-100/60"
                          style={{ left: `${((hour - timelineStart) / hourCount) * 100}%` }}
                        />
                      ))}
                      
                      {/* Shift bars */}
                      {userShifts.map(shift => {
                        const { leftPct, widthPct } = getShiftPosition(shift);
                        const colors = getShiftColor(shift);
                        const workDetailStr = shift.work_details && shift.work_details.length > 0
                          ? '\n' + shift.work_details.map(d => `${d.start_time?.slice(0,5)}-${d.end_time?.slice(0,5)} ${d.label || d.activity}`).join('\n')
                          : '';
                        const hasWorkDetails = shift.work_details && shift.work_details.length > 0;
                        
                        return (
                          <React.Fragment key={shift.id}>
                            {/* メインシフトバー（work_detailsがない場合） */}
                            {!hasWorkDetails && (
                              <div
                                className={`absolute h-6 ${colors.bg} ${colors.text} rounded px-1 flex items-center text-[9px] sm:text-[11px] font-bold shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all`}
                                style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: '4px' }}
                                title={`${shift.start_time?.slice(0, 5)} - ${shift.end_time?.slice(0, 5)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditShift(shift, format(day, 'M月d日(E)', { locale: ja }));
                                }}
                              >
                                <span className="truncate">
                                  {shift.start_time?.slice(0, 5)}-{shift.end_time?.slice(0, 5)}
                                </span>
                              </div>
                            )}
                            {/* work_detailsがある場合：各時間帯を個別バーで表示 */}
                            {hasWorkDetails && (
                              <>
                                {/* 背景バー（全体の勤務時間） */}
                                <div
                                  className={`absolute h-6 ${colors.bg} opacity-30 rounded`}
                                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: '4px' }}
                                />
                                {/* 各work_detailバー */}
                                {shift.work_details.map((wd, wdIdx) => {
                                  const wdPos = getShiftPosition({ start_time: wd.start_time, end_time: wd.end_time });
                                  const wdColors = [
                                    { bg: 'bg-amber-200', text: 'text-amber-900', border: 'border-amber-300' },
                                    { bg: 'bg-violet-200', text: 'text-violet-900', border: 'border-violet-300' },
                                    { bg: 'bg-teal-200', text: 'text-teal-900', border: 'border-teal-300' },
                                    { bg: 'bg-rose-200', text: 'text-rose-900', border: 'border-rose-300' },
                                    { bg: 'bg-sky-200', text: 'text-sky-900', border: 'border-sky-300' },
                                  ];
                                  const wdColor = wdColors[wdIdx % wdColors.length];
                                  return (
                                    <div
                                      key={`wd-${shift.id}-${wdIdx}`}
                                      className={`absolute h-6 ${wdColor.bg} ${wdColor.text} border ${wdColor.border} rounded px-0.5 flex items-center text-[8px] sm:text-[10px] font-bold shadow-sm cursor-pointer hover:shadow-md hover:brightness-95 transition-all`}
                                      style={{ left: `${wdPos.leftPct}%`, width: `${wdPos.widthPct}%`, top: '4px' }}
                                      title={`${wd.start_time?.slice(0,5)}-${wd.end_time?.slice(0,5)} ${wd.label || wd.activity || ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onEditShift(shift, format(day, 'M月d日(E)', { locale: ja }));
                                      }}
                                    >
                                      <span className="truncate">
                                        {wd.label || wd.activity || ''}
                                      </span>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                            {shift.additional_times && shift.additional_times.map((at, atIdx) => {
                              const atPos = getShiftPosition({ start_time: at.start_time, end_time: at.end_time });
                              const atColors = getShiftColor({ start_time: at.start_time });
                              return (
                                <div
                                  key={`at-${shift.id}-${atIdx}`}
                                  className={`absolute h-4 ${atColors.bg} ${atColors.text} rounded px-1 flex items-center text-[8px] font-semibold shadow-sm border border-dashed border-white/50 cursor-pointer hover:shadow-md transition-all`}
                                  style={{ left: `${atPos.leftPct}%`, width: `${atPos.widthPct}%`, top: '5px' }}
                                  title={`追加: ${at.start_time?.slice(0, 5)} - ${at.end_time?.slice(0, 5)}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditShift(shift, format(day, 'M月d日(E)', { locale: ja }));
                                  }}
                                >
                                  <span className="truncate">{at.start_time?.slice(0, 5)}-{at.end_time?.slice(0, 5)}</span>
                                </div>
                              );
                            })}
                            {showNotes && shift.notes && (
                              <div
                                className="absolute text-[7px] sm:text-[8px] text-indigo-600 bg-indigo-50 rounded px-1 truncate max-w-full pointer-events-none"
                                style={{ left: `${getShiftPosition(shift).leftPct}%`, top: '28px', maxWidth: `${getShiftPosition(shift).widthPct}%` }}
                                title={shift.notes}
                              >
                                📝{shift.notes}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {userShifts.length === 0 && dayOffRequest && (
                        <div className={`absolute inset-0 rounded flex items-center justify-center text-[9px] sm:text-[11px] font-bold ${
                          dayOffRequest.is_negotiable ? 'bg-amber-50/50 text-amber-500' : 'bg-rose-50/50 text-rose-400'
                        }`}>
                          {dayOffRequest.is_negotiable ? '△ 相談可' : '休希望'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {dayShifts.length === 0 && (
              <div className="text-center py-2 text-slate-300 text-[10px] sm:text-xs">
                シフト未登録
              </div>
            )}
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Sortable header cell for user columns
function SortableUserHeader({ id, user }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="border border-slate-200 px-1 py-1.5 sm:py-2 text-center min-w-[70px] bg-gradient-to-b from-slate-50 to-slate-100 sticky top-0 z-20"
    >
      <div className="flex items-center justify-center gap-0.5">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-200/60 rounded touch-none">
          <GripVertical className="w-3 h-3 text-slate-300" />
        </div>
        <span className="font-bold text-xs sm:text-sm text-slate-600 truncate">
          {user?.metadata?.display_name || user?.full_name || user?.email}
        </span>
      </div>
    </th>
  );
}

// Sortable user row for day view (timeline)
function SortableUserRow({ id, user, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center border-b border-slate-200 pb-2">
      <div className="w-32 flex-shrink-0 pr-3 flex items-center gap-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-100 rounded touch-none">
          <GripVertical className="w-3 h-3 text-slate-400" />
        </div>
        <span className="text-sm font-medium text-slate-700 truncate">
          {user?.metadata?.display_name || user?.full_name || user?.email?.split('@')[0]}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function ShiftTableView({ selectedMonth, users, workShifts, storeId, store, shiftRequests: propsShiftRequests, hideStaffSelector }) {
  // 週開始曜日: store設定から取得（0=日曜, 1=月曜）
  const weekStartsOn = store?.week_start_day ?? 1;
  const [localWeekStart, setLocalWeekStart] = useState(null);
  const effectiveWeekStart = localWeekStart !== null ? localWeekStart : weekStartsOn;
  const [isTransposed, setIsTransposed] = useState(true);
  const [visibleAdminIds, setVisibleAdminIds] = useState(() => {
    try {
      const saved = localStorage.getItem('shiftTable_visibleAdminIds');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    const saved = sessionStorage.getItem('shiftTableViewMode');
    return saved || 'month';
  });
  
  // Calculate the week index that contains today (or first future week)
  const getInitialWeekIndex = () => {
    const today = new Date();
    const weeks = eachWeekOfInterval({
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth)
    }, { weekStartsOn: effectiveWeekStart });
    
    // If today is in the selected month, find the week containing today
    if (isSameMonth(today, selectedMonth)) {
      for (let i = 0; i < weeks.length; i++) {
        const weekStart = weeks[i];
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: effectiveWeekStart });
        if (isWithinInterval(today, { start: weekStart, end: weekEnd })) {
          return i;
        }
      }
    }
    
    // If selected month is in the future, show first week
    if (selectedMonth > today) return 0;
    
    // If selected month is in the past, show last week
    return Math.max(0, weeks.length - 1);
  };
  
  const [selectedWeek, setSelectedWeek] = useState(getInitialWeekIndex);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [editDateLabel, setEditDateLabel] = useState('');
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [editingHelpSlot, setEditingHelpSlot] = useState(null);
  const [helpDateLabel, setHelpDateLabel] = useState('');
  const [showNotes, setShowNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('shiftTable_showNotes') || 'false');
    } catch { return false; }
  });
  React.useEffect(() => {
    localStorage.setItem('shiftTable_showNotes', JSON.stringify(showNotes));
  }, [showNotes]);
  
  // Update selectedWeek when selectedMonth changes
  React.useEffect(() => {
    setSelectedWeek(getInitialWeekIndex());
  }, [selectedMonth]);
  
  const queryClient = useQueryClient();
  const printRef = useRef(null);

  React.useEffect(() => {
    sessionStorage.setItem('shiftTableViewMode', viewMode);
  }, [viewMode]);

  // selectedWeekをsessionStorageに保存（ShiftConfirmDialogで使用）
  React.useEffect(() => {
    sessionStorage.setItem('shiftTableSelectedWeek', String(selectedWeek));
  }, [selectedWeek]);

  // selectedDayをsessionStorageに保存（ShiftConfirmDialogで使用）
  React.useEffect(() => {
    if (selectedDay) {
      sessionStorage.setItem('shiftTableSelectedDay', format(selectedDay, 'yyyy-MM-dd'));
    }
  }, [selectedDay]);

  // weekStartsOnをsessionStorageに保存（ShiftConfirmDialogで使用）
  React.useEffect(() => {
    sessionStorage.setItem('shiftTableWeekStartsOn', String(effectiveWeekStart));
  }, [effectiveWeekStart]);

  const { data: dbShiftRequests = [] } = useQuery({
    queryKey: ['shiftRequests', storeId],
    queryFn: async () => {
      if (!storeId) return [];
      return supabase.from('ShiftRequest').select('*').eq('store_id', storeId).then(res => res.data || []);
    },
    enabled: !!storeId && !propsShiftRequests,
  });

  const shiftRequests = propsShiftRequests || dbShiftRequests;
  
  const monthDays = eachDayOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth)
  });

  const weeksInMonth = eachWeekOfInterval({
    start: startOfMonth(selectedMonth),
    end: endOfMonth(selectedMonth)
  }, { weekStartsOn: effectiveWeekStart });

  const getWeekDays = () => {
    if (selectedWeek >= weeksInMonth.length) return [];
    const weekStart = weeksInMonth[selectedWeek];
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: effectiveWeekStart });
    return eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(d => 
      d >= startOfMonth(selectedMonth) && d <= endOfMonth(selectedMonth)
    );
  };

  const weekDays = viewMode === 'week' ? getWeekDays() : [];
  const dayViewDays = viewMode === 'day' ? getWeekDays() : [];
  const displayDays = viewMode === 'month' || viewMode === 'confirm' ? monthDays : viewMode === 'week' ? weekDays : dayViewDays;

  const [userOrder, setUserOrder] = useState([]);

  // visibleAdminIdsをlocalStorageに保存
  React.useEffect(() => {
    localStorage.setItem('shiftTable_visibleAdminIds', JSON.stringify(visibleAdminIds));
  }, [visibleAdminIds]);

  // 管理者・マネージャーのリスト
  const adminUsers = users
    .filter(u => {
      const role = u.user_role || u.role;
      return role === 'admin' || role === 'manager';
    })
    .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999));

  const toggleAdminUser = (userId) => {
    setVisibleAdminIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const orderedUsers = users
    .filter(u => {
      const role = u.user_role || u.role;
      if (role === 'user') return true;
      return visibleAdminIds.includes(u.id);
    })
    .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999));

  // Sync userOrder state with orderedUsers
  React.useEffect(() => {
    setUserOrder(orderedUsers.map(u => u.id));
  }, [users, visibleAdminIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5
      }
    })
  );

  const updateSortOrderMutation = useMutation({
    mutationFn: async (newOrder) => {
      // Use already-fetched users prop instead of fetchAll('User') for better performance
      for (let i = 0; i < newOrder.length; i++) {
        const u = users.find(usr => usr.id === newOrder[i]);
        if (u) {
          const currentMetadata = u.metadata || {};
          await updateRecord('User', newOrder[i], {
            metadata: {
              ...currentMetadata,
              sort_order: i
            }
          });
        }
      }
    },
    onSuccess: () => {
      invalidateUserQueries(queryClient);
      toast.success('ユーザーの並び順を保存しました');
    },
    onError: (error) => {
      toast.error('並び順の保存に失敗しました');
    }
  });

  const handleUserDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setUserOrder(prev => {
        const oldIndex = prev.indexOf(active.id);
        const newIndex = prev.indexOf(over.id);
        const newOrder = arrayMove(prev, oldIndex, newIndex);
        updateSortOrderMutation.mutate(newOrder);
        return newOrder;
      });
    }
  }, [updateSortOrderMutation]);

  // Get ordered users based on current drag state
  const getSortedUsers = useCallback(() => {
    if (userOrder.length === 0) return orderedUsers;
    return userOrder.map(id => orderedUsers.find(u => u.id === id)).filter(Boolean);
  }, [userOrder, orderedUsers]);

  const getShiftForUserAndDate = (userEmail, dateStr) => {
    return workShifts.filter(s => s.user_email === userEmail && s.date === dateStr);
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

  const getShiftColor = (startTime) => {
    const hour = parseInt(startTime.split(':')[0]);
    if (hour < 12) return 'bg-cyan-50 text-cyan-800 border-cyan-200';
    if (hour < 17) return 'bg-lime-50 text-lime-800 border-lime-200';
    return 'bg-orange-50 text-orange-800 border-orange-200';
  };

  const handleEditShift = (shift, dateLabel) => {
    setEditingShift(shift);
    setEditDateLabel(dateLabel);
    setEditDialogOpen(true);
  };

  const handleSaveShift = async (data) => {
    try {
      if (editingShift?.id) {
        await supabase.from('WorkShift').update(data).eq('id', editingShift.id);
        toast.success('シフトを更新しました');
      } else {
        await insertRecord('WorkShift', { ...data, store_id: storeId });
        toast.success('シフトを作成しました');
      }
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      setEditDialogOpen(false);
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
      setEditDialogOpen(false);
      setEditingShift(null);
    } catch (error) {
      toast.error('削除に失敗しました');
    }
  };

  // ヘルプ枠の追加ボタンクリック
  const handleAddHelpSlot = (dateStr) => {
    const date = parseISO(dateStr);
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
  const handleEditHelpSlot = (shift, dateLabel) => {
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

  // ある日付のヘルプ枠を取得
  const getHelpSlotsForDate = (dateStr) => {
    return workShifts.filter(s => s.is_help_slot && s.date === dateStr);
  };

  const handleCellClick = (userEmail, dateStr, e) => {
    e.stopPropagation();
    const date = parseISO(dateStr);
    const dateLabel = format(date, 'M月d日(E)', { locale: ja });
    
    // Check if user has a day-off request (only block if is_day_off and NOT is_negotiable)
    const dayOffRequest = shiftRequests.find(
      r => r.created_by === userEmail && r.date === dateStr && r.is_day_off && !r.is_negotiable
    );
    
    if (dayOffRequest) {
      toast.error('この日は休み希望が出されているため編集できません');
      return;
    }
    
    // Get shift request for default time values
    const request = shiftRequests.find(
      r => r.created_by === userEmail && r.date === dateStr && !r.is_day_off
    );
    
    // Create new shift
    setEditingShift({
      user_email: userEmail,
      date: dateStr,
      start_time: request?.start_time || '09:00',
      end_time: request?.end_time || '17:00',
      notes: '',
      is_confirmed: true,
      additional_times: request?.additional_times || [],
      work_details: []
    });
    setEditDateLabel(dateLabel);
    setEditDialogOpen(true);
  };

  const handlePrint = () => {
    const storeName = store?.store_name || '';
    const monthLabel = format(selectedMonth, 'yyyy年M月', { locale: ja });
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const sortedUsers = getSortedUsers();

    const fmtTime = (t) => {
      if (!t) return '';
      const [h, m] = t.split(':');
      const hour = parseInt(h, 10);
      const min = parseInt(m, 10);
      return min === 0 ? `${hour}時` : `${hour}:${String(min).padStart(2, '0')}`;
    };

    const getShiftColor = (startTime) => {
      const hour = parseInt(startTime.split(':')[0]);
      if (hour < 12) return 'background:#cffafe;color:#164e63;';
      if (hour < 17) return 'background:#ecfccb;color:#365314;';
      return 'background:#ffedd5;color:#7c2d12;';
    };

    const buildTableHtml = (targetDays) => {
      const userCount = sortedUsers.length;
      const dayCount = targetDays.length;
      // A4縦の場合の行の高さを動的に計算
      const isLandscape = viewMode === 'week';
      const rowHeight = isLandscape ? Math.max(20, Math.floor(500 / dayCount)) : Math.max(16, Math.floor(700 / dayCount));
      const dateColWidth = 42;
      const totalColWidth = 45;
      const userColWidth = `calc((100% - ${dateColWidth + totalColWidth}px) / ${userCount})`;
      const fontSize = userCount > 12 ? '7px' : userCount > 8 ? '8px' : '9px';
      const headerFontSize = userCount > 12 ? '7px' : '8px';

      const userHeaders = sortedUsers.map(u => {
        const name = u.metadata?.display_name || u.full_name || u.email.split('@')[0];
        return `<th style="width:${userColWidth};border:1px solid #94a3b8;padding:1px;background:#f1f5f9;font-size:${headerFontSize};font-weight:700;white-space:nowrap;overflow:hidden;">${name}</th>`;
      }).join('');
      let rows = '';
      targetDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dow = day.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const rowBg = isWeekend ? 'background:#fff5f5;' : '';
        const dateCellColor = dow === 0 ? 'color:#dc2626;' : dow === 6 ? 'color:#2563eb;' : '';
        let cells = `<td style="width:${dateColWidth}px;height:${rowHeight}px;border:1px solid #94a3b8;padding:1px;font-weight:600;font-size:${fontSize};${dateCellColor}${rowBg}">${format(day, 'M/d')}(${dayNames[dow]})</td>`;

        sortedUsers.forEach(user => {
          const shifts = workShifts.filter(s => s.user_email === user.email && s.date === dateStr);
          let cellContent = '';
          if (shifts.length > 0) {
            cellContent = shifts.map(s => {
              let html = `<span style="display:inline-block;padding:1px 2px;border-radius:2px;font-size:8px;${getShiftColor(s.start_time)}">${fmtTime(s.start_time)}-${fmtTime(s.end_time)}</span>`;
              if (s.additional_times && s.additional_times.length > 0) {
                s.additional_times.forEach(at => {
                  html += `<br><span style="display:inline-block;padding:1px 2px;border-radius:2px;font-size:7px;color:#7e22ce;">+${fmtTime(at.start_time)}-${fmtTime(at.end_time)}</span>`;
                });
              }
              if (s.work_details && s.work_details.length > 0) {
                s.work_details.forEach(d => {
                  html += `<br><span style="font-size:6px;color:#d97706;">${fmtTime(d.start_time)}-${fmtTime(d.end_time)} ${d.label || d.activity || ''}</span>`;
                });
              }
              return html;
            }).join('<br>');
          }
          const dayOffReq = shiftRequests.find(
            r => r.created_by === user.email && r.date === dateStr && r.is_day_off
          );
          if (shifts.length === 0 && dayOffReq) {
            cellContent = '<span style="color:#94a3b8;font-size:10px;">休</span>';
          }
          cells += `<td style="width:${userColWidth};height:${rowHeight}px;border:1px solid #94a3b8;padding:1px;text-align:center;font-size:${fontSize};vertical-align:middle;${rowBg}">${cellContent}</td>`;
        });

        // Daily totals
        const dayShifts = workShifts.filter(s => s.date === dateStr);
        let totalHours = 0;
        const staffSet = new Set();
        dayShifts.forEach(s => {
          staffSet.add(s.user_email);
          const st = new Date(`2000-01-01T${s.start_time}`);
          const en = new Date(`2000-01-01T${s.end_time}`);
          const h = (en - st) / 3600000;
          if (h > 0) totalHours += h;
        });
        cells += `<td style="width:${totalColWidth}px;height:${rowHeight}px;border:1px solid #94a3b8;padding:1px;text-align:center;font-size:${fontSize};font-weight:600;background:#fefce8;vertical-align:middle;">${staffSet.size}人<br>${totalHours.toFixed(1)}h</td>`;
        rows += `<tr>${cells}</tr>`;
      });

      // Total row
      let totalCells = '<td style="border:1px solid #cbd5e1;padding:1px 3px;font-weight:700;font-size:8px;background:#f1f5f9;">合計</td>';
      sortedUsers.forEach(user => {
        let totalH = 0;
        const workDates = new Set();
        workShifts.filter(s => {
          const sDate = s.date;
          return targetDays.some(d => format(d, 'yyyy-MM-dd') === sDate);
        }).forEach(s => {
          if (s.user_email === user.email) {
            workDates.add(s.date);
            const st = new Date(`2000-01-01T${s.start_time}`);
            const en = new Date(`2000-01-01T${s.end_time}`);
            const h = (en - st) / 3600000;
            if (h > 0) totalH += h;
          }
        });
        totalCells += `<td style="border:1px solid #cbd5e1;padding:1px 2px;text-align:center;font-size:7px;font-weight:600;background:#fef9c3;">${workDates.size}日/${totalH.toFixed(1)}h</td>`;
      });
      totalCells += '<td style="border:1px solid #cbd5e1;background:#fef9c3;"></td>';
      rows += `<tr>${totalCells}</tr>`;

      return `<table style="border-collapse:collapse;width:100%;table-layout:fixed;">
        <thead><tr>
          <th style="width:${dateColWidth}px;border:1px solid #94a3b8;padding:1px;background:#f1f5f9;font-weight:700;font-size:${headerFontSize};">日付</th>
          ${userHeaders}
          <th style="width:${totalColWidth}px;border:1px solid #94a3b8;padding:1px;background:#fefce8;font-weight:700;font-size:${headerFontSize};">合計</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    };

    const buildTimelineHtml = (targetDays) => {
      let timelineHtml = '';
      const userCount = sortedUsers.length;
      const dayCount = targetDays.length;
      let startHour = 8;
      let endHour = 20;
      if (store?.business_hours) {
        const bh = store.business_hours;
        let minOpen = 24, maxClose = 0;
        ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
          const dc = bh[day];
          if (dc && !dc.closed) {
            const oh = parseInt(dc.open?.split(':')[0] || '9');
            const ch = parseInt(dc.close?.split(':')[0] || '18');
            if (oh < minOpen) minOpen = oh;
            if (ch > maxClose) maxClose = ch;
          }
        });
        if (minOpen < 24) startHour = minOpen;
        if (maxClose > 0) endHour = maxClose;
      }
      const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);
      // A4縦に収めるため、日数・ユーザー数に応じてサイズを動的調整
      // A4縦の印刷可能高さ≒277mm、ヘッダー等で約20mm使用→残り約257mm
      const availableHeightMm = 257;
      const blockHeightMm = Math.floor(availableHeightMm / dayCount);
      const nameWidth = userCount > 8 ? '50px' : '60px';
      const nameFontSize = userCount > 10 ? '6px' : userCount > 6 ? '7px' : '8px';
      const rowHeight = userCount > 10 ? '14px' : userCount > 6 ? '16px' : '18px';
      const dateFontSize = userCount > 10 ? '8px' : '10px';
      const timeFontSize = userCount > 10 ? '6px' : '7px';
      const hourLabelFontSize = userCount > 10 ? '6px' : '7px';
      // タイムラインの1時間あたりのピクセル幅（A4用紙幅いっぱいに使う）
      // A4縦の印刷可能幅≒190mm ≒ 720px相当（96dpi）
      const availableWidthPx = 720 - parseInt(nameWidth);
      const hourWidth = Math.max(20, Math.floor(availableWidthPx / (endHour - startHour)));
      const blockPadding = dayCount > 5 ? '3px' : '6px';
      const blockMargin = dayCount > 5 ? '4px' : '8px';

      targetDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayShifts = workShifts.filter(s => s.date === dateStr);
        const dow = day.getDay();
        const bgColor = (dow === 0 || dow === 6) ? '#fff5f5' : '#ffffff';

        // page-break-inside: avoid で日付ブロックが途中で切れないようにする
        timelineHtml += `<div style="border:1px solid #e2e8f0;border-radius:3px;padding:${blockPadding};margin-bottom:${blockMargin};background:${bgColor};page-break-inside:avoid;break-inside:avoid;">`;
        timelineHtml += `<h3 style="font-size:${dateFontSize};font-weight:700;margin:0 0 2px 0;">${format(day, 'M月d日(E)', { locale: ja })}</h3>`;

        // Timeline header
        timelineHtml += '<div style="display:flex;border-bottom:1px solid #cbd5e1;margin-bottom:2px;">';
        timelineHtml += `<div style="width:${nameWidth};flex-shrink:0;"></div>`;
        timelineHtml += `<div style="position:relative;height:14px;flex:1;">`;
        hours.forEach(h => {
          timelineHtml += `<span style="position:absolute;left:${(h - startHour) * hourWidth}px;font-size:${hourLabelFontSize};color:#64748b;">${h}</span>`;
        });
        timelineHtml += '</div></div>';

        // Staff rows
        sortedUsers.forEach(user => {
          const userShifts = dayShifts.filter(s => s.user_email === user.email);
          const name = user.metadata?.display_name || user.full_name || user.email.split('@')[0];
          const dayOffReq = shiftRequests.find(
            r => r.created_by === user.email && r.date === dateStr && r.is_day_off
          );

          timelineHtml += `<div style="display:flex;align-items:center;border-bottom:1px solid #e2e8f0;padding:0;">`;
          timelineHtml += `<div style="width:${nameWidth};flex-shrink:0;font-size:${nameFontSize};font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${name}</div>`;
          timelineHtml += `<div style="position:relative;height:${rowHeight};flex:1;min-width:${(endHour - startHour) * hourWidth}px;">`;

          // Grid lines
          hours.forEach(h => {
            timelineHtml += `<div style="position:absolute;left:${(h - startHour) * hourWidth}px;height:100%;border-left:1px solid #e2e8f0;"></div>`;
          });

          if (userShifts.length > 0) {
            userShifts.forEach(shift => {
              const [sh, sm] = shift.start_time.split(':').map(Number);
              const [eh, em] = shift.end_time.split(':').map(Number);
              const left = ((sh - startHour) + sm / 60) * hourWidth;
              const width = ((eh - sh) + (em - sm) / 60) * hourWidth;
              timelineHtml += `<div style="position:absolute;left:${Math.max(0, left)}px;width:${width}px;height:calc(${rowHeight} - 4px);top:2px;border-radius:3px;padding:0 1px;display:flex;align-items:center;font-size:${timeFontSize};font-weight:600;overflow:visible;white-space:nowrap;${getShiftColor(shift.start_time)}">${shift.start_time?.slice(0,5)}-${shift.end_time?.slice(0,5)}</div>`;
            });
          } else if (dayOffReq) {
            timelineHtml += `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${timeFontSize};color:#94a3b8;">休</div>`;
          }

          timelineHtml += '</div></div>';
        });

        timelineHtml += '</div>';
      });

      return timelineHtml;
    };

    let subtitle = '';
    let bodyContent = '';
    // 月ごとA4縦、週ごとA4横、日ごとA4縦、確定シフト表A4横
    let pageSize = viewMode === 'week' ? 'A4 landscape' : viewMode === 'confirm' ? 'A4 landscape' : 'A4 portrait';

    if (viewMode === 'confirm') {
      subtitle = '月ごと横表';
      // 月ごと横表形式（ユーザーが行、日付が列）
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const dayCount = monthDays.length;
      const userCount = sortedUsers.length;
      const cellFontSize = dayCount > 28 ? '7px' : '8px';
      const headerFontSize = dayCount > 28 ? '7px' : '8px';
      const dowFontSize = dayCount > 28 ? '6px' : '7px';
      const nameFontSize = userCount > 10 ? '8px' : '9px';
      const nameColWidth = '60px';
      const cellHeight = userCount > 10 ? '24px' : '28px';

      const headerDays = monthDays.map(day => {
        const dow = day.getDay();
        const isSun = dow === 0;
        const isSat = dow === 6;
        const color = isSun ? '#ef4444' : isSat ? '#3b82f6' : '#475569';
        return `<th style="border:1px solid #d1d5db;padding:1px;font-size:${headerFontSize};color:${color};background:#f8fafc;vertical-align:middle;">${format(day, 'd')}<br/><span style="font-size:${dowFontSize};">${dayNames[dow]}</span></th>`;
      }).join('');

      let userRows = '';
      sortedUsers.forEach(user => {
        const displayName = user.metadata?.display_name || user.full_name || user.email.split('@')[0];
        let cells = monthDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const shift = workShifts.find(s => s.user_email === user.email && s.date === dateStr);
          let content = '';
          let bgColor = 'transparent';
          if (shift) {
            const startH = parseInt(shift.start_time?.split(':')[0] || '0');
            if (startH < 12) bgColor = '#cffafe';
            else if (startH < 17) bgColor = '#ecfccb';
            else bgColor = '#ffedd5';
            const fmtT = (t) => { if (!t) return ''; const [h, m] = t.split(':'); return parseInt(m) === 0 ? `${parseInt(h)}` : `${parseInt(h)}:${m}`; };
            content = `<div style="font-size:${cellFontSize};line-height:1.1;">${fmtT(shift.start_time)}-${fmtT(shift.end_time)}</div>`;
          }
          const dow = day.getDay();
          const isWeekend = dow === 0 || dow === 6;
          const cellBg = shift ? bgColor : (isWeekend ? '#f8fafc' : 'white');
          return `<td style="border:1px solid #d1d5db;text-align:center;background-color:${cellBg};padding:0 1px;height:${cellHeight};vertical-align:middle;">${content}</td>`;
        }).join('');
        userRows += `<tr><td style="border:1px solid #d1d5db;padding:2px 3px;font-size:${nameFontSize};font-weight:bold;background:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName}</td>${cells}</tr>`;
      });

      bodyContent = `<table style="width:100%;border-collapse:collapse;border:2px solid #94a3b8;table-layout:fixed;">
        <thead><tr><th style="width:${nameColWidth};border:1px solid #d1d5db;padding:2px;font-size:${nameFontSize};background:#f1f5f9;">氏名</th>${headerDays}</tr></thead>
        <tbody>${userRows}</tbody>
      </table>`;
    } else if (viewMode === 'month') {
      subtitle = '';
      bodyContent = buildTableHtml(monthDays);
    } else if (viewMode === 'week') {
      const currentWeekDays = getWeekDays();
      const weekStart = currentWeekDays[0];
      const weekEnd = currentWeekDays[currentWeekDays.length - 1];
      subtitle = `第${selectedWeek + 1}週 (${format(weekStart, 'M/d', { locale: ja })} - ${format(weekEnd, 'M/d', { locale: ja })})`;
      bodyContent = buildTableHtml(currentWeekDays);
    } else if (viewMode === 'day') {
      const currentWeekDays = getWeekDays();
      const weekStart = currentWeekDays[0];
      const weekEnd = currentWeekDays[currentWeekDays.length - 1];
      subtitle = `第${selectedWeek + 1}週 タイムライン (${format(weekStart, 'M/d', { locale: ja })} - ${format(weekEnd, 'M/d', { locale: ja })})`;
      bodyContent = buildTimelineHtml(currentWeekDays);
    }

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${storeName} ${monthLabel} シフト表</title>
        <style>
          @page { size: ${pageSize}; margin: 5mm; }
          html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
          body { font-family: 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; line-height: 1.2; }
          h1 { font-size: 14px; margin: 0 0 3px 0; text-align: center; }
          .subtitle { font-size: 11px; color: #475569; margin-bottom: 3px; text-align: center; }
          .meta { font-size: 8px; color: #64748b; margin-bottom: 5px; text-align: right; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          th, td { border: 1px solid #94a3b8; padding: 1px !important; text-align: center; overflow: hidden; word-break: break-all; }
          th { background-color: #f1f5f9 !important; font-weight: bold; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <h1>${storeName} ${monthLabel} シフト表</h1>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
        <div class="meta">出力日時: ${format(new Date(), 'yyyy/MM/dd HH:mm', { locale: ja })}</div>
        ${bodyContent}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      toast.error('ポップアップがブロックされています。ポップアップを許可してください。');
    }
  };

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const storeName = store?.store_name || '';
      const monthLabel = format(selectedMonth, 'yyyy年M月', { locale: ja });

      // ConfirmedShiftViewerと同じprintRefキャプチャ方式
      const isLandscapeFormat = viewMode === 'confirm' || viewMode === 'week';
      const captureWidth = isLandscapeFormat ? 1400 : 1200;

      // printRefの非表示コンテナを一時的に表示してキャプチャ
      printRef.current.classList.remove('hidden');
      printRef.current.style.width = `${captureWidth}px`;
      printRef.current.style.position = 'absolute';
      printRef.current.style.left = '-9999px';
      printRef.current.style.top = '0';

      // PDF用カスタムスタイルを注入（ConfirmedShiftViewerと同じ）
      const pdfStyle = document.createElement('style');
      pdfStyle.id = 'pdf-custom-style-shift';
      pdfStyle.textContent = `
        /* WeekTimelineView（日ごと）: 名前欄を小さいフォントで全体表示 */
        .space-y-8 .w-24, .space-y-8 .sm\\:w-32 {
          width: 100px !important;
          font-size: 10px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        /* ConfirmShiftPreview（月ごと横表）: 名前欄 */
        table .whitespace-nowrap {
          font-size: 10px !important;
          max-width: 80px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        /* ReadOnlyTableView（月ごと/週ごと）: ユーザー名ヘッダー */
        table thead th.whitespace-nowrap {
          font-size: 10px !important;
          max-width: 80px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        /* タイムラインのシフトバー内テキスト - 切れないようにoverflow:visible */
        .space-y-8 .truncate {
          font-size: 8px !important;
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: nowrap !important;
        }
        /* シフトバー自体もoverflow:visibleでテキストがはみ出せるように */
        .space-y-8 .absolute.rounded {
          overflow: visible !important;
          padding: 0 1px !important;
        }
        /* 全体のレスポンシブクラスをPC表示に強制 */
        .text-sm.sm\\:text-xl { font-size: 16px !important; }
        .text-\\[9px\\].sm\\:text-xs { font-size: 11px !important; }
        .mb-2.sm\\:mb-6 { margin-bottom: 12px !important; }
      `;
      document.head.appendChild(pdfStyle);

      // レンダリング完了を待つ
      await new Promise(r => setTimeout(r, 400));
      const canvas = await html2canvas(printRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
        width: captureWidth,
      });

      // カスタムスタイルを削除
      pdfStyle.remove();
      // 元に戻す
      printRef.current.style.width = '';
      printRef.current.style.position = '';
      printRef.current.style.left = '';
      printRef.current.style.top = '';
      printRef.current.classList.add('hidden');
      const imgData = canvas.toDataURL('image/png');
      const imgAspect = canvas.width / canvas.height;

      // A4の両方の向きでどちらがより大きく表示できるか判定
      const a4W_p = 210, a4H_p = 297;
      const a4W_l = 297, a4H_l = 210;
      const margin = 5;

      const usableW_p = a4W_p - margin * 2;
      const usableH_p = a4H_p - margin * 2;
      const usableW_l = a4W_l - margin * 2;
      const usableH_l = a4H_l - margin * 2;

      const fitW_p = Math.min(usableW_p, imgAspect * usableH_p);
      const fitH_p = fitW_p / imgAspect;
      const fitW_l = Math.min(usableW_l, imgAspect * usableH_l);
      const fitH_l = fitW_l / imgAspect;

      const area_p = fitW_p * fitH_p;
      const area_l = fitW_l * fitH_l;
      const useOrientation = isLandscapeFormat || (area_l > area_p * 1.1) ? 'landscape' : 'portrait';

      const pdf = new jsPDF({
        orientation: useOrientation, unit: 'mm', format: 'a4'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const usableW = pdfWidth - margin * 2;
      const usableH = pdfHeight - margin * 2;

      // A4 1枚に収まるようにスケーリング
      let imgWidth, imgHeight;
      if (imgAspect > usableW / usableH) {
        imgWidth = usableW;
        imgHeight = usableW / imgAspect;
      } else {
        imgHeight = usableH;
        imgWidth = usableH * imgAspect;
      }

      // 中央配置
      const xOffset = margin + (usableW - imgWidth) / 2;
      const yOffset = margin + (usableH - imgHeight) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);

      const viewLabel = viewMode === 'confirm' ? '月ごと横表' : viewMode === 'month' ? '月ごと' : viewMode === 'week' ? `第${selectedWeek + 1}週` : `第${selectedWeek + 1}週タイムライン`;
      pdf.save(`シフト表_${storeName}_${monthLabel}_${viewLabel}.pdf`);

      toast.success('PDFをダウンロードしました');
    } catch (error) {
      console.error('PDF生成エラー:', error);
      toast.error('PDF生成に失敗しました');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Select value={viewMode} onValueChange={(v) => {
              setViewMode(v);
              if (v === 'day' && !selectedDay) setSelectedDay(monthDays[0]);
            }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">月ごと</SelectItem>
                <SelectItem value="week">週ごと</SelectItem>
                <SelectItem value="day">日ごと</SelectItem>
                <SelectItem value="confirm">月ごと横表</SelectItem>
              </SelectContent>
            </Select>

            {(viewMode === 'week' || viewMode === 'day') && (
              <Select value={String(effectiveWeekStart)} onValueChange={(v) => setLocalWeekStart(parseInt(v))}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">月曜始まり</SelectItem>
                  <SelectItem value="0">日曜始まり</SelectItem>
                </SelectContent>
              </Select>
            )}
            
            {viewMode === 'week' && (
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
            )}
            
            {viewMode === 'day' && (
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
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap items-center">
            <Button
              variant={showNotes ? "default" : "outline"}
              size="sm"
              onClick={() => setShowNotes(!showNotes)}
              className={`gap-1 ${showNotes ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="text-xs">メモ</span>
            </Button>
            {adminUsers.length > 0 && (
              <AdminDropdown
                adminUsers={adminUsers}
                visibleAdminIds={visibleAdminIds}
                toggleAdminUser={toggleAdminUser}
                setVisibleAdminIds={setVisibleAdminIds}
                adminDropdownOpen={adminDropdownOpen}
                setAdminDropdownOpen={setAdminDropdownOpen}
                title="シフト表に表示する管理者"
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-600 mr-2"></div>
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 mr-2" />
              印刷
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ZoomableWrapper>
          {viewMode === 'confirm' ? (
            <ConfirmShiftPreview
              selectedMonth={selectedMonth}
              users={users}
              workShifts={workShifts}
              store={store}
              monthDays={monthDays}
              shiftRequests={shiftRequests}
              onEditShift={handleEditShift}
              onCellClick={handleCellClick}
              visibleAdminIds={visibleAdminIds}
              showNotes={showNotes}
            />
          ) : viewMode === 'day' && dayViewDays.length > 0 ? (
            <WeekTimelineView 
              weekDays={dayViewDays}
              users={users}
              workShifts={workShifts}
              onEditShift={handleEditShift}
              onCellClick={handleCellClick}
              shiftRequests={shiftRequests}
              visibleAdminIds={visibleAdminIds}
              store={store}
              showNotes={showNotes}
            />
          ) : isTransposed ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleUserDragEnd}>
            <table className="w-full border-collapse text-xs sm:text-sm min-w-[600px]">
              <thead>
                <tr>
                  <th className="border border-slate-200 px-2 py-1.5 sm:py-2 font-bold text-slate-600 sticky top-0 sticky left-0 bg-gradient-to-b from-slate-50 to-slate-100 z-30 text-xs sm:text-sm min-w-[80px]">
                    日付
                  </th>
                  <SortableContext items={userOrder} strategy={horizontalListSortingStrategy}>
                    {getSortedUsers().map(user => (
                      <SortableUserHeader key={user.id} id={user.id} user={user} />
                    ))}
                  </SortableContext>
                  <th className="border border-slate-200 px-1 py-1.5 sm:py-2 font-bold text-orange-600 bg-gradient-to-b from-orange-50 to-orange-100/80 sticky top-0 z-20 min-w-[50px] sm:min-w-[70px] text-[10px] sm:text-xs">
                    <div className="flex items-center justify-center gap-0.5">
                      <UserPlus className="w-3 h-3" />
                      <span>ヘルプ</span>
                    </div>
                  </th>
                  <th className="border border-slate-200 px-1 py-1.5 sm:py-2 font-bold text-amber-700 bg-gradient-to-b from-amber-50 to-amber-100/80 sticky top-0 z-20 min-w-[60px] sm:min-w-[80px] text-[10px] sm:text-xs">
                    合計
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayDays.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const dayOfWeek = getDay(date);
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const { hours, staff } = calculateDailyTotals(dateStr);

                  const storeSettings = store ? getStoreSettingsForDate(store, dateStr) : null;
                  const isClosed = storeSettings?.isClosedDay;

                  return (
                    <tr key={date.toString()} className={`hover:bg-slate-50/50 ${isClosed ? 'opacity-50' : ''}`}>
                      <td className={`border border-slate-200 px-2 py-1 font-medium sticky left-0 z-20 ${
                        isClosed ? 'bg-slate-100' : dayOfWeek === 0 ? 'bg-red-50/60' : dayOfWeek === 6 ? 'bg-blue-50/60' : 'bg-white'
                      }`}>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-[11px] sm:text-sm font-bold ${
                            dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700'
                          }`}>
                            {format(date, 'M/d')}
                          </span>
                          <span className={`text-[9px] sm:text-xs ${
                            dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-blue-400' : 'text-slate-400'
                          }`}>
                            {format(date, 'E', { locale: ja })}
                          </span>
                          {isClosed && (
                            <span className="text-[8px] sm:text-[10px] text-red-400 font-bold">休</span>
                          )}
                        </div>
                        {storeSettings?.businessHours && !isClosed && (
                          <div className="text-[8px] sm:text-[9px] text-slate-400 leading-tight">
                            {storeSettings.businessHours.open}-{storeSettings.businessHours.close}
                          </div>
                        )}
                      </td>
                      {getSortedUsers().map(user => {
                        const shifts = getShiftForUserAndDate(user?.email, dateStr).filter(s => !s.is_help_slot);
                        return (
                          <td
                            key={user?.email}
                            className={`border border-slate-200 p-0.5 align-middle ${
                              dayOfWeek === 0 ? 'bg-red-50/30' : dayOfWeek === 6 ? 'bg-blue-50/30' : 'bg-white'
                            } cursor-pointer hover:bg-blue-50/40 transition-colors`}
                            onClick={(e) => {
                              if (shifts.length === 0) {
                                handleCellClick(user?.email, dateStr, e);
                              }
                            }}
                          >
                            {shifts.length > 0 ? (
                              <div className="space-y-0.5">
                                {shifts.map(shift => (
                                  <div
                                    key={shift.id}
                                    className="cursor-pointer hover:opacity-80"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditShift(shift, `${format(date, 'M月d日(E)', { locale: ja })}`);
                                    }}
                                  >
                                    <div className={`${getShiftColor(shift.start_time)} border rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-semibold text-center leading-tight`}>
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
                                    {showNotes && shift.notes && (
                                      <div className="mt-0.5 px-0.5">
                                        <div className="text-[7px] sm:text-[8px] text-indigo-500 bg-indigo-50 rounded px-0.5 py-px leading-tight truncate" title={shift.notes}>
                                          📝 {shift.notes}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center text-slate-300 text-xs hover:text-blue-500">+</div>
                            )}
                          </td>
                        );
                      })}
                      {/* ヘルプ枠セル */}
                      <td className={`border border-slate-200 p-0.5 align-middle ${
                        dayOfWeek === 0 ? 'bg-red-50/30' : dayOfWeek === 6 ? 'bg-blue-50/30' : 'bg-orange-50/20'
                      }`}>
                        <div className="space-y-0.5">
                          {getHelpSlotsForDate(dateStr).map(helpShift => (
                            <div
                              key={helpShift.id}
                              className="cursor-pointer hover:opacity-80"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditHelpSlot(helpShift, `${format(date, 'M月d日(E)', { locale: ja })}`);
                              }}
                            >
                              <div className="bg-orange-100 border border-orange-300 rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-semibold text-center leading-tight text-orange-700">
                                {helpShift.help_name ? <div className="text-[8px] sm:text-[9px] truncate">{helpShift.help_name}</div> : null}
                                {formatTimeJa(helpShift.start_time)}-{formatTimeJa(helpShift.end_time)}
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => handleAddHelpSlot(dateStr)}
                            className="w-full text-center text-orange-400 text-[9px] sm:text-[10px] hover:text-orange-600 hover:bg-orange-50 rounded py-0.5 transition-colors"
                          >
                            <UserPlus className="w-3 h-3 inline" />
                          </button>
                        </div>
                      </td>
                      <td className={`border border-slate-200 px-1 py-1 text-center font-bold align-middle ${
                        dayOfWeek === 0 ? 'bg-red-50/50' : dayOfWeek === 6 ? 'bg-blue-50/50' : 'bg-amber-50/60'
                      }`}>
                        <div className="text-[10px] sm:text-xs">
                          <div className="text-slate-700">{staff}人</div>
                          <div className="text-slate-500">{hours}h</div>
                          {store && (
                            <StaffRequirementDisplay 
                              store={store}
                              workShifts={workShifts}
                              dateStr={dateStr}
                              onUpdateStore={async (data) => {
                                await supabase.from('Store').update(data).eq('id', storeId);
                                invalidateStoreQueries(queryClient);
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-bold">
                  <td className="border border-slate-200 px-2 py-1.5 text-[11px] sm:text-xs text-slate-600 sticky left-0 bg-gradient-to-b from-slate-50 to-slate-100 z-20">
                    合計
                  </td>
                  {getSortedUsers().map(user => {
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
                  {/* ヘルプ枠合計 */}
                  <td className="border border-slate-200 px-1 py-1 text-center bg-gradient-to-b from-orange-50 to-orange-100/60">
                    {(() => {
                      const allHelp = workShifts.filter(s => s.is_help_slot);
                      const helpDays = new Set(allHelp.map(s => s.date)).size;
                      let helpHours = 0;
                      allHelp.forEach(s => {
                        const st = new Date(`2000-01-01T${s.start_time}`);
                        const en = new Date(`2000-01-01T${s.end_time}`);
                        const h = (en - st) / (1000 * 60 * 60);
                        if (h > 0) helpHours += h;
                        if (s.additional_times) s.additional_times.forEach(at => {
                          const as2 = new Date(`2000-01-01T${at.start_time}`);
                          const ae2 = new Date(`2000-01-01T${at.end_time}`);
                          const h2 = (ae2 - as2) / (1000 * 60 * 60);
                          if (h2 > 0) helpHours += h2;
                        });
                      });
                      return allHelp.length > 0 ? (
                        <>
                          <div className="text-[10px] sm:text-xs text-orange-700">{helpDays}日</div>
                          <div className="text-[9px] sm:text-[10px] text-orange-500">{helpHours.toFixed(1)}h</div>
                        </>
                      ) : null;
                    })()}
                  </td>
                  <td className="border border-slate-200 px-1 py-1 bg-gradient-to-b from-amber-50 to-amber-100/60"></td>
                </tr>
              </tbody>
            </table>
            </DndContext>
          ) : null}
        </ZoomableWrapper>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] sm:text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-cyan-50 border border-cyan-200"></div>
            <span className="text-slate-500">早番（〜12時）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-lime-50 border border-lime-200"></div>
            <span className="text-slate-500">中番（12-17時）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-orange-50 border border-orange-200"></div>
            <span className="text-slate-500">遅番（17時〜）</span>
          </div>
        </div>


      </CardContent>

      <ShiftEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
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

      {/* PDF用非表示コンテナ（printRef） */}
      <div ref={printRef} className="hidden">
        <div className="bg-white p-4">
          <h2 className="text-sm sm:text-xl font-bold text-center mb-2 sm:mb-6">
            {store?.store_name} {format(selectedMonth, 'yyyy年M月', { locale: ja })} シフト表
          </h2>
          <div className="text-[9px] sm:text-xs text-slate-500 text-right mb-2">
            出力日時: {format(new Date(), 'yyyy/MM/dd HH:mm', { locale: ja })}
          </div>
          {viewMode === 'confirm' ? (
            <ConfirmShiftPreview
              selectedMonth={selectedMonth}
              users={users}
              workShifts={workShifts}
              store={store}
              monthDays={monthDays}
              shiftRequests={shiftRequests}
              visibleAdminIds={visibleAdminIds}
            />
          ) : viewMode === 'day' ? (
            <WeekTimelineView
              weekDays={dayViewDays}
              users={users}
              workShifts={workShifts}
              onEditShift={() => {}}
              onCellClick={() => {}}
              shiftRequests={shiftRequests}
              store={store}
              visibleAdminIds={visibleAdminIds}
            />
          ) : (
            <ReadOnlyTableView
              displayDays={displayDays}
              users={users}
              workShifts={workShifts}
              store={store}
              shiftRequests={shiftRequests}
              visibleAdminIds={visibleAdminIds}
            />
          )}
        </div>
      </div>
    </Card>
  );
}