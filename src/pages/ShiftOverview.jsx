import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, parseISO, addMonths, subMonths, getDay, isSameDay, isSameMonth, isWithinInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Eye, ChevronLeft, ChevronRight, Users, Edit3, UserCheck, UserMinus, UserPlus, Printer, GripVertical, X, Clock, LayoutGrid, Rows3, Calendar as CalendarIcon, Palmtree, ClipboardList, TrendingUp, BarChart3, CheckCircle2, AlertCircle, User as UserIcon, ChevronDown, Sun, Moon, Briefcase, Shield, Check, ShoppingCart, Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { fetchAll, fetchFiltered, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import AdminDropdown from '@/components/ui/AdminDropdown';
import { sortStoresByOrder } from '@/lib/storeOrder';
import { invalidateUserQueries } from '@/lib/invalidateHelpers';
import ZoomableWrapper from '@/components/ui/ZoomableWrapper';
import ShiftForm from '@/components/shift/ShiftForm';
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
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';



// ============ HELPER FUNCTIONS ============
function formatTimeJa(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  if (min === 0) return `${hour}時`;
  return `${hour}時${min}分`;
}

function getShiftColor(startTime) {
  if (!startTime) return 'bg-slate-100 text-slate-600 border-slate-300';
  const hour = parseInt(startTime.split(':')[0]);
  if (hour < 12) return 'bg-cyan-100 text-cyan-900 border-cyan-300';
  if (hour < 17) return 'bg-lime-100 text-lime-900 border-lime-300';
  return 'bg-orange-100 text-orange-900 border-orange-300';
}

// Sortable header cell
function SortableUserHeader({ id, user }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : 'auto' };
  return (
    <th ref={setNodeRef} style={style} className="border border-slate-300 p-2 text-center min-w-[100px] bg-white sticky top-0 z-20">
      <div className="flex items-center justify-center gap-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-100 rounded touch-none">
          <GripVertical className="w-3 h-3 text-slate-300" />
        </div>
        <span className="font-bold text-xs sm:text-sm truncate text-slate-800">
          {user?.metadata?.display_name || user?.full_name || user?.email?.split('@')[0]}
        </span>
      </div>
    </th>
  );
}

// ============ USER AVATAR COMPONENT ============
function UserAvatar({ user: u, isSelected, onClick, shiftSummary, isMe }) {
  const name = u?.metadata?.display_name || u?.full_name || u?.email?.split('@')[0] || '?';
  const initial = name.charAt(0);
  const colors = [
    'from-cyan-500 to-blue-600',
    'from-violet-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-red-600',
    'from-pink-500 to-rose-600',
    'from-amber-500 to-yellow-600',
    'from-indigo-500 to-blue-700',
    'from-lime-500 to-green-600',
  ];
  const colorIdx = name.charCodeAt(0) % colors.length;
  const gradientClass = colors[colorIdx];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-xl transition-all duration-200 min-w-[56px] sm:min-w-[72px] flex-shrink-0",
        isSelected
          ? "bg-white shadow-lg shadow-cyan-100 ring-2 ring-cyan-400 scale-105"
          : "hover:bg-white/80 hover:shadow-md active:scale-95"
      )}
    >
      <div className={cn(
        "relative w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm sm:text-base shadow-md transition-transform",
        gradientClass,
        isSelected && "ring-2 ring-white ring-offset-2 ring-offset-cyan-400"
      )}>
        {initial}
        {isMe && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 bg-cyan-500 rounded-full border-2 border-white flex items-center justify-center">
            <span className="text-[7px] sm:text-[8px] text-white font-bold">自</span>
          </div>
        )}
      </div>
      <span className={cn(
        "text-[10px] sm:text-xs font-semibold truncate max-w-[56px] sm:max-w-[72px] leading-tight",
        isSelected ? "text-cyan-700 font-bold" : "text-slate-600"
      )}>
        {name}
      </span>
      {shiftSummary && (
        <div className="flex items-center gap-0.5">
          <span className="text-[8px] sm:text-[9px] text-slate-500">{shiftSummary.workDays}日</span>
          <span className="text-[8px] sm:text-[9px] text-slate-300">|</span>
          <span className="text-[8px] sm:text-[9px] text-slate-500">{shiftSummary.totalHours}h</span>
        </div>
      )}
    </button>
  );
}

// ============ USER CALENDAR COMPONENT ============
function UserCalendarView({ userEmail, userName, allShiftRequests, currentMonth, onEditShift, isMe, isAdminOrManager, paidLeaveRequests, selectedStore }) {
  // カレンダービューは常に日曜始まり固定
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

  const userRequests = useMemo(() => {
    return allShiftRequests.filter(r => r.created_by === userEmail);
  }, [allShiftRequests, userEmail]);

  const getShiftForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return userRequests.find(r => r.date === dateStr);
  };

  const getPaidLeaveForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return (paidLeaveRequests || []).find(r => r.user_email === userEmail && r.date === dateStr);
  };

  const isToday = (date) => isSameDay(date, new Date());
  const isPastDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  // Summary stats
  const stats = useMemo(() => {
    const monthRequests = userRequests.filter(r => {
      const d = parseISO(r.date);
      return isSameMonth(d, currentMonth);
    });
    const workReqs = monthRequests.filter(r => !r.is_day_off);
    const dayOffReqs = monthRequests.filter(r => r.is_day_off);
    let totalH = 0;
    workReqs.forEach(r => {
      if (r.start_time && r.end_time) {
        const s = new Date(`2000-01-01T${r.start_time}`);
        const e = new Date(`2000-01-01T${r.end_time}`);
        const h = (e - s) / (1000 * 60 * 60);
        if (h > 0) totalH += h;
      }
      if (r.additional_times && r.additional_times.length > 0) {
        r.additional_times.forEach(at => {
          if (at.start_time && at.end_time) {
            const s2 = new Date(`2000-01-01T${at.start_time}`);
            const e2 = new Date(`2000-01-01T${at.end_time}`);
            const h2 = (e2 - s2) / (1000 * 60 * 60);
            if (h2 > 0) totalH += h2;
          }
        });
      }
    });
    return { total: monthRequests.length, work: workReqs.length, dayOff: dayOffReqs.length, hours: totalH.toFixed(1) };
  }, [userRequests, currentMonth]);

  return (
    <div className="animate-in slide-in-from-top-2 duration-300">
      {/* User stats bar */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 rounded-xl p-2 sm:p-2.5 text-center border border-cyan-100">
          <div className="text-[9px] sm:text-[10px] text-cyan-600 font-semibold mb-0.5">提出</div>
          <div className="text-base sm:text-lg font-bold text-cyan-700">{stats.total}<span className="text-[9px] sm:text-[10px] font-normal text-cyan-400">日</span></div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-2 sm:p-2.5 text-center border border-emerald-100">
          <div className="text-[9px] sm:text-[10px] text-emerald-600 font-semibold mb-0.5">出勤</div>
          <div className="text-base sm:text-lg font-bold text-emerald-700">{stats.work}<span className="text-[9px] sm:text-[10px] font-normal text-emerald-400">日</span></div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-2 sm:p-2.5 text-center border border-slate-200">
          <div className="text-[9px] sm:text-[10px] text-slate-500 font-semibold mb-0.5">休み</div>
          <div className="text-base sm:text-lg font-bold text-slate-600">{stats.dayOff}<span className="text-[9px] sm:text-[10px] font-normal text-slate-400">日</span></div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl p-2 sm:p-2.5 text-center border border-orange-100">
          <div className="text-[9px] sm:text-[10px] text-orange-600 font-semibold mb-0.5">時間</div>
          <div className="text-base sm:text-lg font-bold text-orange-700">{stats.hours}<span className="text-[9px] sm:text-[10px] font-normal text-orange-400">h</span></div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Week header */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {weekDays.map((day, i) => {
            const isSunday = day === '日';
            const isSaturday = day === '土';
            return (
              <div key={day} className={cn(
                "text-center py-1.5 sm:py-2 text-xs sm:text-sm font-bold",
                isSunday ? "text-red-500" : isSaturday ? "text-blue-500" : "text-slate-500"
              )}>
                {day}
              </div>
            );
          })}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const shift = getShiftForDate(day);
            const paidLeave = getPaidLeaveForDate(day);
            const dayOfWeek = day.getDay();
            const storeSettings = selectedStore ? getStoreSettingsForDate(selectedStore, format(day, 'yyyy-MM-dd')) : null;
            const isClosed = storeSettings?.isClosedDay;

            return (
              <div
                key={day.toISOString()}
                onClick={() => {
                  if (isMe && isCurrentMonth) onEditShift(day);
                }}
                className={cn(
                  "relative min-h-[52px] sm:min-h-[68px] p-0.5 sm:p-1 border-b border-r border-slate-100 transition-all",
                  isCurrentMonth ? "" : "opacity-20 bg-slate-50",
                  isToday(day) && isCurrentMonth && "bg-cyan-50/50 ring-1 ring-inset ring-cyan-300",
                  isPastDate(day) && isCurrentMonth && "opacity-40",
                  isMe && isCurrentMonth && !isPastDate(day) && "cursor-pointer hover:bg-cyan-50/30 active:scale-[0.97]",
                  isClosed && isCurrentMonth && "bg-slate-100/50 opacity-50"
                )}
              >
                {/* Date number */}
                <div className={cn(
                  "text-xs sm:text-sm font-bold text-center mb-0.5",
                  !isCurrentMonth && "text-slate-300",
                  isCurrentMonth && dayOfWeek === 0 && "text-red-500",
                  isCurrentMonth && dayOfWeek === 6 && "text-blue-500",
                  isCurrentMonth && dayOfWeek !== 0 && dayOfWeek !== 6 && "text-slate-600",
                  isToday(day) && isCurrentMonth && "text-cyan-700"
                )}>
                  {format(day, 'd')}
                  {isToday(day) && isCurrentMonth && (
                    <div className="w-1 h-1 rounded-full bg-cyan-500 mx-auto mt-0" />
                  )}
                </div>

                {/* Shift content */}
                {isCurrentMonth && shift && (
                  <div className="space-y-0.5 px-0.5">
                    {paidLeave && (isAdminOrManager || isMe) && (
                      <div className={cn(
                        "text-[8px] sm:text-[10px] font-bold text-center rounded px-0.5 py-px leading-tight",
                        paidLeave.status === 'approved' ? "bg-emerald-500 text-white" : "bg-amber-300 text-amber-900"
                      )}>
                        {paidLeave.status === 'approved' ? '有給' : '申請中'}
                      </div>
                    )}
                    {shift.is_day_off ? (
                      <div className={cn(
                        "text-[8px] sm:text-[10px] font-bold text-center rounded px-0.5 py-px leading-tight",
                        shift.is_negotiable_if_needed
                          ? "bg-amber-100 text-amber-700 border border-amber-300"
                          : "bg-slate-200/80 text-slate-600"
                      )}>
                        {shift.is_negotiable_if_needed ? '休⚡' : '休み'}
                      </div>
                    ) : shift.is_full_day_available ? (
                      <div className="text-[8px] sm:text-[10px] font-bold text-center rounded px-0.5 py-px bg-green-100 text-green-800 border border-green-300 leading-tight">
                        終日
                      </div>
                    ) : shift.start_time ? (
                      <>
                        <div className={cn(
                          "text-[8px] sm:text-[10px] font-bold text-center rounded px-0.5 py-px border leading-tight",
                          getShiftColor(shift.start_time)
                        )}>
                          {shift.start_time?.substring(0, 5)}
                        </div>
                        {shift.additional_times && shift.additional_times.length > 0 && shift.additional_times.map((at, atIdx) => (
                          <div key={atIdx} className={cn(
                            "text-[7px] sm:text-[9px] font-bold text-center rounded px-0.5 py-px border border-dashed leading-tight",
                            getShiftColor(at.start_time)
                          )}>
                            +{at.start_time?.substring(0, 5)}
                          </div>
                        ))}
                      </>
                    ) : null}
                    {shift.is_negotiable_if_needed && (
                      <div className="text-[7px] sm:text-[8px] font-bold text-center text-amber-600 leading-tight">相談</div>
                    )}
                  </div>
                )}

                {/* Closed day */}
                {isCurrentMonth && isClosed && !shift && (
                  <div className="text-[8px] sm:text-[9px] text-red-400 text-center font-semibold">休業</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2 text-[10px] sm:text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-100 border border-cyan-300" /> 早番</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-lime-100 border border-lime-300" /> 中番</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-100 border border-orange-300" /> 遅番</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-100 border border-green-300" /> 終日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200" /> 休み</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-100 border border-amber-300" /> 要相談</span>
        {isMe && <span className="text-[9px] sm:text-[10px] text-cyan-500 ml-auto">タップで編集</span>}
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function ShiftOverview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState(() => {
    const saved = sessionStorage.getItem('shiftOverviewViewMode');
    return saved || 'calendar';
  });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('store'); // 'store' | 'online' | 'manufacturing'
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [selectedWeek, setSelectedWeek] = useState(0);

  useEffect(() => { sessionStorage.setItem('shiftOverviewViewMode', viewMode); }, [viewMode]);

  const isAdmin = user?.user_role === 'admin' || user?.role === 'admin';
  const isManager = user?.user_role === 'manager';
  const isAdminOrManager = isAdmin || isManager;

  // Fetch stores (sorted by store settings order)
  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      return sortStoresByOrder(allStores);
    },
  });

  useEffect(() => {
    if (selectedStoreId) return;
    const userStoresSorted = stores.filter(s => user?.store_ids?.includes(s.id));
    if (userStoresSorted.length > 0) {
      setSelectedStoreId(userStoresSorted[0].id);
    } else if (stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [user, stores, selectedStoreId]);

  const userStores = useMemo(() => {
    if (isAdmin) return stores;
    return stores.filter(s => user?.store_ids?.includes(s.id));
  }, [stores, user, isAdmin]);

  const selectedStore = stores.find(s => s.id === selectedStoreId);

  // Week start day setting: local override > store setting
  const storeWeekStart = selectedStore?.week_start_day ?? 0;
  const [localWeekStart, setLocalWeekStart] = useState(null);
  const effectiveWeekStart = localWeekStart !== null ? localWeekStart : storeWeekStart;

  // Week selector (must be after effectiveWeekStart is defined)
  const getInitialWeekIndex = useCallback(() => {
    const today = new Date();
    const weeks = eachWeekOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    }, { weekStartsOn: effectiveWeekStart });
    if (isSameMonth(today, currentDate)) {
      for (let i = 0; i < weeks.length; i++) {
        const ws = weeks[i];
        const we = endOfWeek(ws, { weekStartsOn: effectiveWeekStart });
        if (isWithinInterval(today, { start: ws, end: we })) return i;
      }
    }
    if (currentDate > today) return 0;
    return Math.max(0, weeks.length - 1);
  }, [currentDate, effectiveWeekStart]);

  useEffect(() => { setSelectedWeek(getInitialWeekIndex()); }, [currentDate, effectiveWeekStart, getInitialWeekIndex]);

  // Fetch all users
  const { data: allUsers = [] } = useQuery({ queryKey: ['allUsers'], queryFn: () => fetchAll('User') });

  const storeUsers = useMemo(() => {
    const sortByOrder = (a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999);
    if (selectedCategory === 'online') {
      return allUsers.filter(u => u.belongs_online === true).sort(sortByOrder);
    }
    if (selectedCategory === 'manufacturing') {
      return allUsers.filter(u => u.belongs_hokusetsu || u.belongs_kagaya || u.belongs_minamitanabe).sort(sortByOrder);
    }
    if (!selectedStoreId) return [];
    return allUsers.filter(u => u.store_ids?.includes(selectedStoreId)).sort(sortByOrder);
  }, [allUsers, selectedStoreId, selectedCategory]);

  const [visibleAdminIds, setVisibleAdminIds] = useState(() => {
    try {
      const saved = localStorage.getItem('shiftOverview_visibleAdminIds');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('shiftOverview_visibleAdminIds', JSON.stringify(visibleAdminIds));
  }, [visibleAdminIds]);

  // 管理者・マネージャーのリスト
  const adminUsersList = storeUsers.filter(u => {
    const role = u.user_role || u.role;
    return role === 'admin' || role === 'manager';
  });

  const toggleAdminUser = (userId) => {
    setVisibleAdminIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const orderedUsers = storeUsers.filter(u => {
    const role = u.user_role || u.role;
    if (role === 'user') return true;
    return visibleAdminIds.includes(u.id);
  });
  const [userOrder, setUserOrder] = useState([]);
  
  useEffect(() => {
    setUserOrder(orderedUsers.map(u => u.id));
  }, [allUsers, selectedStoreId, visibleAdminIds]);

  const getSortedUsers = useCallback(() => {
    if (userOrder.length === 0) return orderedUsers;
    return userOrder.map(id => orderedUsers.find(u => u.id === id)).filter(Boolean);
  }, [userOrder, orderedUsers]);

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));

  const updateSortOrderMutation = useMutation({
    mutationFn: async (newOrder) => {
      for (let i = 0; i < newOrder.length; i++) {
        const u = (allUsers || []).find(usr => usr.id === newOrder[i]);
        if (u) {
          const currentMetadata = u.metadata || {};
          await updateRecord('User', newOrder[i], { metadata: { ...currentMetadata, sort_order: i } });
        }
      }
    },
    onSuccess: () => { invalidateUserQueries(queryClient); toast.success('並び順を保存しました'); },
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

  const selectedMonth = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthDays = useMemo(() => eachDayOfInterval({ start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) }), [selectedMonth]);
  const weeksInMonth = useMemo(() => eachWeekOfInterval({ start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) }, { weekStartsOn: effectiveWeekStart }), [selectedMonth, effectiveWeekStart]);

  const getWeekDays = () => {
    if (selectedWeek >= weeksInMonth.length) return [];
    const weekStart = weeksInMonth[selectedWeek];
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: effectiveWeekStart });
    // 月を跨ぐ週も正しく表示するため、フィルタリングを削除
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  };

  // Fetch shift requests - extend range to cover cross-month weeks
  const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
  const fetchStart = format(startOfWeek(startOfMonth(selectedMonth), { weekStartsOn: effectiveWeekStart }), 'yyyy-MM-dd');
  const fetchEnd = format(endOfWeek(endOfMonth(selectedMonth), { weekStartsOn: effectiveWeekStart }), 'yyyy-MM-dd');

  const { data: allPaidLeaveRequests = [] } = useQuery({
    queryKey: ['allPaidLeaveRequests', selectedStoreId, selectedCategory, fetchStart, fetchEnd],
    queryFn: async () => {
      let targetUserEmails = [];
      if (selectedCategory === 'online') {
        targetUserEmails = allUsers.filter(u => u.belongs_online === true).map(u => u.email);
      } else if (selectedCategory === 'manufacturing') {
        targetUserEmails = allUsers.filter(u => u.belongs_hokusetsu || u.belongs_kagaya || u.belongs_minamitanabe).map(u => u.email);
      } else {
        if (!selectedStoreId) return [];
        targetUserEmails = allUsers.filter(u => u.store_ids?.includes(selectedStoreId)).map(u => u.email);
      }
      if (targetUserEmails.length === 0) return [];
      const { data, error } = await supabase.from('PaidLeaveRequest').select('*')
        .in('user_email', targetUserEmails)
        .gte('date', fetchStart).lte('date', fetchEnd);
      if (error) throw error;
      return (data || []).filter(r => r.status === 'approved' || r.status === 'pending');
    },
    enabled: (selectedCategory !== 'store' || !!selectedStoreId) && isAdminOrManager && allUsers.length > 0,
  });

  const getPaidLeaveForUserDate = (userEmail, dateStr) => {
    return allPaidLeaveRequests.find(r => r.user_email === userEmail && r.date === dateStr);
  };

  const { data: allShiftRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['storeShiftRequests', selectedStoreId, selectedCategory, fetchStart, fetchEnd],
    queryFn: async () => {
      let dbData = [];
      let stUsers = [];
      if (selectedCategory === 'online') {
        stUsers = allUsers.filter(u => u.belongs_online === true);
        const emails = stUsers.map(u => u.email);
        if (emails.length > 0) {
          const { data, error } = await supabase.from('ShiftRequest').select('*')
            .in('created_by', emails).gte('date', fetchStart).lte('date', fetchEnd);
          if (error) throw error;
          dbData = data || [];
        }
      } else if (selectedCategory === 'manufacturing') {
        stUsers = allUsers.filter(u => u.belongs_hokusetsu || u.belongs_kagaya || u.belongs_minamitanabe);
        const emails = stUsers.map(u => u.email);
        if (emails.length > 0) {
          const { data, error } = await supabase.from('ShiftRequest').select('*')
            .in('created_by', emails).gte('date', fetchStart).lte('date', fetchEnd);
          if (error) throw error;
          dbData = data || [];
        }
      } else {
        if (!selectedStoreId) return [];
        const { data, error } = await supabase.from('ShiftRequest').select('*')
          .eq('store_id', selectedStoreId).gte('date', fetchStart).lte('date', fetchEnd);
        if (error) throw error;
        dbData = data || [];
        stUsers = allUsers.filter(u => u.store_ids?.includes(selectedStoreId));
      }
      // 以下は店舗カテゴリのみデフォルトシフト生成（通販・製造はスキップ）
      if (selectedCategory !== 'store') return dbData;
      const stUsersForDefault = allUsers.filter(u => u.store_ids?.includes(selectedStoreId));
      const fetchStartDate = startOfWeek(startOfMonth(selectedMonth), { weekStartsOn: effectiveWeekStart });
      const fetchEndDate = endOfWeek(endOfMonth(selectedMonth), { weekStartsOn: effectiveWeekStart });
      const days = eachDayOfInterval({ start: fetchStartDate, end: fetchEndDate });
      const dayMap = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
      const defaultShifts = [];
      
      stUsersForDefault.forEach(u => {
        const defaultSettings = u.default_shift_settings;
        if (!defaultSettings) return;
        days.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          if (dbData.some(r => r.created_by === u.email && r.date === dateStr)) return;
          const dayKey = dayMap[day.getDay()];
          const setting = defaultSettings[dayKey];
          if (setting?.enabled) {
            const firstDayOfMonth = new Date(day.getFullYear(), day.getMonth(), 1);
            const firstDayOfWeek = firstDayOfMonth.getDay();
            const adjustedDate = day.getDate() + firstDayOfWeek;
            const weekOfMonth = Math.ceil(adjustedDate / 7);
            if (setting.week_settings) {
              const weekSetting = setting.week_settings[weekOfMonth];
              if (weekSetting) {
                defaultShifts.push({
                  id: `default-${u.email}-${dateStr}`, date: dateStr,
                  start_time: weekSetting.is_day_off ? null : weekSetting.start_time,
                  end_time: weekSetting.is_day_off ? null : weekSetting.end_time,
                  is_day_off: weekSetting.is_day_off, is_paid_leave: false, is_full_day_available: false,
                  is_negotiable_if_needed: false, notes: weekSetting.notes,
                  created_by: u.email, store_id: selectedStoreId, is_default: true,
                });
              }
            } else {
              const allowedWeeks = setting.weeks || [1, 2, 3, 4, 5];
              if (allowedWeeks.includes(weekOfMonth)) {
                defaultShifts.push({
                  id: `default-${u.email}-${dateStr}`, date: dateStr,
                  start_time: setting.is_day_off ? null : setting.start_time,
                  end_time: setting.is_day_off ? null : setting.end_time,
                  is_day_off: setting.is_day_off, is_paid_leave: false, is_full_day_available: false,
                  is_negotiable_if_needed: false, notes: setting.notes,
                  created_by: u.email, store_id: selectedStoreId, is_default: true,
                });
              }
            }
          }
        });
      });
      return [...dbData, ...defaultShifts];
    },
    enabled: selectedCategory !== 'store' || !!selectedStoreId,
  });

  const getMyShift = (dateStr) => allShiftRequests.find(r => r.date === dateStr && r.created_by === user?.email);

  const navigatePrev = () => setCurrentDate(prev => subMonths(prev, 1));
  const navigateNext = () => setCurrentDate(prev => addMonths(prev, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleEditMyShift = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const myShift = getMyShift(dateStr);
    setEditingDate(date);
    setEditingShift(myShift || null);
    setEditDialogOpen(true);
  };

  const submitShiftMutation = useMutation({
    mutationFn: async (data) => {
      const existingShift = getMyShift(data.date);
      if (existingShift && !existingShift.id?.toString().startsWith('default-')) {
        return updateRecord('ShiftRequest', existingShift.id, { ...data, created_by: user.email, store_id: selectedStoreId });
      } else {
        return insertRecord('ShiftRequest', { ...data, created_by: user.email, store_id: selectedStoreId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeShiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      toast.success('シフト希望を保存しました');
      setEditDialogOpen(false);
    },
    onError: () => { toast.error('保存に失敗しました'); }
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async () => {
      const dateStr = format(editingDate, 'yyyy-MM-dd');
      const myShift = getMyShift(dateStr);
      if (myShift && !myShift.id?.toString().startsWith('default-')) {
        // 有給申請が紐付いている場合、自動取り消し
        if (myShift.is_paid_leave && user?.email) {
          try {
            const existingLeave = await fetchFiltered('PaidLeaveRequest', {
              user_email: user.email,
              date: dateStr,
            });
            if (existingLeave && existingLeave.length > 0) {
              for (const leave of existingLeave) {
                if (leave.status === 'pending' || leave.status === 'approved') {
                  await deleteRecord('PaidLeaveRequest', leave.id);
                }
              }
            }
          } catch (e) {
            console.warn('有給申請の自動取り消しに失敗:', e);
          }
        }
        return deleteRecord('ShiftRequest', myShift.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeShiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myPaidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      toast.success('シフト希望を削除しました');
      setEditDialogOpen(false);
    },
    onError: () => { toast.error('削除に失敗しました'); }
  });

  // ============ HELPER: Get cell content ============
  const getRequestCellContent = (userEmail, dateStr) => {
    const requests = allShiftRequests.filter(r => r.created_by === userEmail && r.date === dateStr);
    if (requests.length === 0) return null;
    const request = requests[0];
    // シフト提出者ユーザーは他人の有給申請予定を見れない（管理者・マネージャーまたは自分のシフトのみ表示）
    const showPaidLeave = (isAdminOrManager || userEmail === user?.email) ? request.is_paid_leave : false;
    if (request.is_day_off) return { type: 'dayoff', label: '休', isPaidLeave: showPaidLeave, isNegotiable: request.is_negotiable_if_needed };
    if (request.is_full_day_available) return { type: 'fullday', label: '終日可', startTime: null, endTime: null };
    if (request.start_time && request.end_time) return { type: 'shift', startTime: request.start_time, endTime: request.end_time, isNegotiable: request.is_negotiable_if_needed, additionalTimes: request.additional_times || [] };
    return null;
  };

  const calculateUserTotals = (userEmail, days) => {
    let totalHours = 0; let workDays = 0;
    days.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const requests = allShiftRequests.filter(r => r.created_by === userEmail && r.date === dateStr && !r.is_day_off);
      requests.forEach(r => {
        if (r.start_time && r.end_time) {
          const start = new Date(`2000-01-01T${r.start_time}`);
          const end = new Date(`2000-01-01T${r.end_time}`);
          const hours = (end - start) / (1000 * 60 * 60);
          if (hours > 0) totalHours += hours;
        }
        if (r.additional_times && r.additional_times.length > 0) {
          r.additional_times.forEach(at => {
            if (at.start_time && at.end_time) {
              const s = new Date(`2000-01-01T${at.start_time}`);
              const e = new Date(`2000-01-01T${at.end_time}`);
              const h = (e - s) / (1000 * 60 * 60);
              if (h > 0) totalHours += h;
            }
          });
        }
      });
      if (requests.length > 0) workDays++;
    });
    return { totalHours: totalHours.toFixed(1), workDays };
  };

  const calculateDailyTotals = (dateStr) => {
    const dayReqs = allShiftRequests.filter(r => r.date === dateStr && !r.is_day_off);
    let totalHours = 0;
    const staffSet = new Set();
    dayReqs.forEach(r => {
      staffSet.add(r.created_by);
      if (r.start_time && r.end_time) {
        const start = new Date(`2000-01-01T${r.start_time}`);
        const end = new Date(`2000-01-01T${r.end_time}`);
        const hours = (end - start) / (1000 * 60 * 60);
        if (hours > 0) totalHours += hours;
      }
      if (r.additional_times && r.additional_times.length > 0) {
        r.additional_times.forEach(at => {
          if (at.start_time && at.end_time) {
            const s = new Date(`2000-01-01T${at.start_time}`);
            const e = new Date(`2000-01-01T${at.end_time}`);
            const h = (e - s) / (1000 * 60 * 60);
            if (h > 0) totalHours += h;
          }
        });
      }
    });
    return { hours: totalHours.toFixed(1), staff: staffSet.size };
  };

  // ============ PRINT ============
  const handlePrint = () => {
    const storeName = selectedStore?.store_name || '';
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
    const getPrintShiftColor = (startTime) => {
      if (!startTime) return 'background:#f1f5f9;color:#475569;';
      const hour = parseInt(startTime.split(':')[0]);
      if (hour < 12) return 'background:#cffafe;color:#164e63;';
      if (hour < 17) return 'background:#ecfccb;color:#365314;';
      return 'background:#ffedd5;color:#7c2d12;';
    };
    const buildTableHtml = (targetDays) => {
      const userHeaders = sortedUsers.map(u => {
        const name = u.metadata?.display_name || u.full_name || u.email.split('@')[0];
        return `<th style="border:1px solid #cbd5e1;padding:1px 3px;background:#f1f5f9;font-size:8px;font-weight:700;white-space:nowrap;">${name}</th>`;
      }).join('');
      let rows = '';
      targetDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dow = day.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const rowBg = isWeekend ? 'background:#fff5f5;' : '';
        const dateCellColor = dow === 0 ? 'color:#dc2626;' : dow === 6 ? 'color:#2563eb;' : '';
        const storeSettings = selectedStore ? getStoreSettingsForDate(selectedStore, dateStr) : null;
        const isClosed = storeSettings?.isClosedDay;
        let cells = `<td style="border:1px solid #cbd5e1;padding:1px 3px;font-weight:600;white-space:nowrap;font-size:8px;${dateCellColor}${rowBg}">${format(day, 'M/d')}(${dayNames[dow]})${isClosed ? ' <span style="color:#ef4444;font-size:7px;">休</span>' : ''}</td>`;
        sortedUsers.forEach(u => {
          const content = getRequestCellContent(u.email, dateStr);
          let cellContent = '';
          if (content) {
            if (content.type === 'dayoff') cellContent = '<span style="color:#94a3b8;font-size:10px;">休</span>';
            else if (content.type === 'fullday') cellContent = '<span style="display:inline-block;padding:0 2px;border-radius:2px;font-size:7px;background:#bbf7d0;color:#166534;">終日可</span>';
            else if (content.type === 'shift') {
              cellContent = `<span style="display:inline-block;padding:0 2px;border-radius:2px;font-size:7px;${getPrintShiftColor(content.startTime)}">${fmtTime(content.startTime)}-${fmtTime(content.endTime)}</span>`;
              if (content.additionalTimes && content.additionalTimes.length > 0) {
                content.additionalTimes.forEach(at => {
                  cellContent += `<br><span style="display:inline-block;padding:0 2px;border-radius:2px;font-size:6px;color:#7e22ce;">+${fmtTime(at.start_time)}-${fmtTime(at.end_time)}</span>`;
                });
              }
            }
          }
          cells += `<td style="border:1px solid #cbd5e1;padding:1px 2px;text-align:center;font-size:7px;${rowBg}">${cellContent}</td>`;
        });
        const { hours, staff } = calculateDailyTotals(dateStr);
        cells += `<td style="border:1px solid #cbd5e1;padding:1px 2px;text-align:center;font-size:7px;font-weight:600;background:#fefce8;">${staff}人|${hours}h</td>`;
        rows += `<tr>${cells}</tr>`;
      });
      let totalCells = '<td style="border:1px solid #cbd5e1;padding:1px 3px;font-weight:700;font-size:8px;background:#f1f5f9;">合計</td>';
      sortedUsers.forEach(u => {
        const { totalHours, workDays } = calculateUserTotals(u.email, targetDays);
        totalCells += `<td style="border:1px solid #cbd5e1;padding:1px 2px;text-align:center;font-size:7px;font-weight:600;background:#fef9c3;">${workDays}日/${totalHours}h</td>`;
      });
      totalCells += '<td style="border:1px solid #cbd5e1;background:#fef9c3;"></td>';
      rows += `<tr>${totalCells}</tr>`;
      return `<table style="border-collapse:collapse;width:100%;font-size:8px;"><thead><tr><th style="border:1px solid #cbd5e1;padding:1px 3px;background:#f1f5f9;font-weight:700;font-size:8px;">日付</th>${userHeaders}<th style="border:1px solid #cbd5e1;padding:1px 3px;background:#fefce8;font-weight:700;font-size:8px;">合計</th></tr></thead><tbody>${rows}</tbody></table>`;
    };
    const displayDaysForPrint = viewMode === 'month' || viewMode === 'calendar' || viewMode === 'users' ? monthDays : getWeekDays();
    let subtitle = '';
    if (viewMode === 'week' || viewMode === 'day') {
      const wd = getWeekDays();
      if (wd.length > 0) subtitle = `第${selectedWeek + 1}週 (${format(wd[0], 'M/d', { locale: ja })} - ${format(wd[wd.length - 1], 'M/d', { locale: ja })})`;
    }
    const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${storeName} ${monthLabel} シフト一覧表</title><style>@page{size:A4 portrait;margin:8mm;}html,body{width:100%;height:100%;margin:0;padding:0;}body{font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;}h1{font-size:13px;margin:0 0 2px 0;}.subtitle{font-size:10px;color:#475569;margin-bottom:2px;}.meta{font-size:9px;color:#64748b;margin-bottom:6px;}table{border-collapse:collapse;width:100%;font-size:8px;}th,td{border:1px solid #cbd5e1;padding:1px 2px !important;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}table{page-break-inside:avoid;}}</style></head><body><h1>${storeName} ${monthLabel} シフト一覧表</h1>${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}<div class="meta">出力日時: ${format(new Date(), 'yyyy/MM/dd HH:mm', { locale: ja })}</div>${buildTableHtml(displayDaysForPrint)}</body></html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(printHtml); printWindow.document.close(); printWindow.onload = () => { printWindow.print(); }; }
    else { toast.error('ポップアップがブロックされています。ポップアップを許可してください。'); }
  };

  // ============ USERS VIEW (NEW - User avatars + individual calendars) ============
  const renderUsersView = () => {
    const sortedUsers = getSortedUsers();
    const selectedUser = selectedUserId ? sortedUsers.find(u => u.id === selectedUserId) : null;

    // Auto-select first user if none selected
    if (!selectedUserId && sortedUsers.length > 0) {
      // Find current user first, otherwise first user
      const meUser = sortedUsers.find(u => u.email === user?.email);
      if (meUser) {
        setTimeout(() => setSelectedUserId(meUser.id), 0);
      } else {
        setTimeout(() => setSelectedUserId(sortedUsers[0].id), 0);
      }
    }

    return (
      <div className="space-y-3 sm:space-y-4">
        {/* User avatars scroll area */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <Users className="w-4 h-4 text-cyan-600" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-700">スタッフ一覧</h3>
            <span className="text-[10px] sm:text-xs text-slate-400 ml-auto">{sortedUsers.length}名</span>
          </div>
          <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {/* All users button */}
            <button
              onClick={() => setSelectedUserId('all')}
              className={cn(
                "flex flex-col items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-xl transition-all duration-200 min-w-[56px] sm:min-w-[72px] flex-shrink-0",
                selectedUserId === 'all'
                  ? "bg-white shadow-lg shadow-cyan-100 ring-2 ring-cyan-400 scale-105"
                  : "hover:bg-white/80 hover:shadow-md active:scale-95"
              )}
            >
              <div className={cn(
                "w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white shadow-md",
                selectedUserId === 'all' && "ring-2 ring-white ring-offset-2 ring-offset-cyan-400"
              )}>
                <Users className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <span className={cn(
                "text-[9px] sm:text-[11px] font-medium leading-tight",
                selectedUserId === 'all' ? "text-cyan-700 font-bold" : "text-slate-600"
              )}>全員</span>
            </button>

            {sortedUsers.map(u => {
              const summary = calculateUserTotals(u.email, monthDays);
              return (
                <UserAvatar
                  key={u.id}
                  user={u}
                  isSelected={selectedUserId === u.id}
                  isMe={u.email === user?.email}
                  onClick={() => setSelectedUserId(u.id)}
                  shiftSummary={summary}
                />
              );
            })}
          </div>
        </div>

        {/* Selected user's calendar or all-users summary */}
        {selectedUserId === 'all' ? (
          renderCalendarView()
        ) : selectedUser ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                {(selectedUser?.metadata?.display_name || selectedUser?.full_name || '?').charAt(0)}
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-800">
                  {selectedUser?.metadata?.display_name || selectedUser?.full_name || selectedUser?.email?.split('@')[0]}
                  {selectedUser?.email === user?.email && (
                    <span className="text-[10px] sm:text-xs text-cyan-500 font-medium ml-1.5">(自分)</span>
                  )}
                </h3>
                <p className="text-[10px] sm:text-xs text-slate-400">
                  {format(currentDate, 'yyyy年M月', { locale: ja })}のシフト希望
                </p>
              </div>
            </div>
            <UserCalendarView
              userEmail={selectedUser.email}
              userName={selectedUser?.metadata?.display_name || selectedUser?.full_name || ''}
              allShiftRequests={allShiftRequests}
              currentMonth={currentDate}
              onEditShift={handleEditMyShift}
              isMe={selectedUser.email === user?.email}
              isAdminOrManager={isAdminOrManager}
              paidLeaveRequests={allPaidLeaveRequests}
              selectedStore={selectedStore}
            />
          </div>
        ) : null}
      </div>
    );
  };

  // ============ CALENDAR VIEW ============
  const renderCalendarView = () => {
    const handleDateClick = (date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      setExpandedDate(prev => prev === dateStr ? null : dateStr);
    };

    const renderExpandedDetail = (date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (expandedDate !== dateStr) return null;
      const requests = allShiftRequests.filter(r => r.date === dateStr);
      const workingCount = requests.filter(r => !r.is_day_off).length;
      const dayOffCount = requests.filter(r => r.is_day_off).length;
      
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setExpandedDate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{format(date, 'M月d日 (EEEE)', { locale: ja })}</h3>
                  <div className="flex gap-3 mt-1 text-sm opacity-90">
                    <span>出勤: {workingCount}人</span>
                    <span>休み: {dayOffCount}人</span>
                  </div>
                </div>
                <button onClick={() => setExpandedDate(null)} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
              {requests.length === 0 ? (
                <p className="text-center text-slate-400 py-8">この日のシフト希望はありません</p>
              ) : (
                requests.map(request => {
                  const reqUser = storeUsers.find(u => u.email === request.created_by);
                  const displayName = reqUser?.metadata?.display_name || reqUser?.full_name || request.created_by.split('@')[0];
                  const content = getRequestCellContent(request.created_by, dateStr);
                  const isOwnShift = request.created_by === user?.email;
                  const paidLeave = (isAdminOrManager || isOwnShift) ? getPaidLeaveForUserDate(request.created_by, dateStr) : null;
                  const showPaidLeaveLabel = isAdminOrManager || isOwnShift;
                  
                  return (
                    <div key={request.id} className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer hover:bg-slate-50",
                      request.is_day_off ? (request.is_negotiable_if_needed ? "border-amber-200 bg-amber-50/30" : "border-slate-200") : "border-cyan-200"
                    )} onClick={() => {
                      if (request.created_by === user?.email) handleEditMyShift(date);
                    }}>
                      <div className={cn(
                        "relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                        request.is_day_off ? (request.is_negotiable_if_needed ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600") : "bg-cyan-100 text-cyan-700"
                      )}>
                        {request.is_day_off ? '休' : (request.is_full_day_available ? '全' : <Clock className="w-4 h-4" />)}
                        {paidLeave && (
                          <span className={cn(
                            "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold shadow-sm border",
                            paidLeave.status === 'approved' ? "bg-emerald-500 text-white border-emerald-600" : "bg-amber-400 text-amber-900 border-amber-500"
                          )}>有</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-slate-800 truncate">{displayName}</span>
                          {paidLeave && (
                            <span className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0",
                              paidLeave.status === 'approved' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {paidLeave.status === 'approved' ? '有給確定' : '有給申請中'}
                            </span>
                          )}
                        </div>
                        <div className={cn("text-xs mt-0.5", request.is_day_off && request.is_negotiable_if_needed ? "text-amber-600 font-semibold" : "text-slate-500")}>
                          {request.is_day_off 
                            ? ((showPaidLeaveLabel && request.is_paid_leave) ? '休み（有給申請予定）' : '休み希望')
                            : request.is_full_day_available 
                              ? '終日出勤可能'
                              : `${request.start_time?.slice(0,5)} - ${request.end_time?.slice(0,5)}`
                          }
                          {request.is_negotiable_if_needed && ' ⚡要相談'}
                        </div>
                        {request.additional_times && request.additional_times.length > 0 && (
                          <div className="text-[10px] text-purple-600 mt-0.5">
                            {request.additional_times.map((at, atIdx) => (
                              <span key={atIdx} className="mr-1">+{at.start_time?.slice(0,5)}-{at.end_time?.slice(0,5)}</span>
                            ))}
                          </div>
                        )}
                        {request.notes && <div className="text-xs text-slate-400 mt-1 truncate">備考: {request.notes}</div>}
                      </div>
                      {content && content.type === 'shift' ? (
                         <div className="flex flex-col items-end gap-0.5">
                           <span className={cn("px-2 py-1 rounded text-[10px] font-semibold border", getShiftColor(content.startTime))}>
                             {formatTimeJa(content.startTime)}-{formatTimeJa(content.endTime)}
                           </span>
                           {content.additionalTimes && content.additionalTimes.length > 0 && content.additionalTimes.map((at, idx) => (
                             <span key={idx} className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold border border-dashed", getShiftColor(at.start_time))}>
                               {formatTimeJa(at.start_time)}-{formatTimeJa(at.end_time)}
                             </span>
                           ))}
                         </div>
                      ) : content && content.type === 'fullday' ? (
                        <span className="px-2 py-1 rounded text-[10px] font-semibold bg-green-100 text-green-800 border border-green-300">終日可</span>
                      ) : (
                        <span className="px-2 py-1 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">休み</span>
                      )}
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-2 sm:p-3">
        <div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => {
              const isSunday = day === '日';
              const isSaturday = day === '土';
              return (
                <div key={i} className={cn(
                  "text-center font-semibold py-1.5 sm:py-2 text-[10px] sm:text-xs rounded-lg",
                  isSunday ? 'text-red-500 bg-red-50/50' : isSaturday ? 'text-blue-500 bg-blue-50/50' : 'text-slate-600 bg-slate-50/50'
                )}>
                  {day}
                </div>
              );
            })}
            {Array.from({ length: getDay(monthDays[0]) }).map((_, i) => (
              <div key={`pad-${i}`} className="border border-slate-100 rounded-xl p-1 min-h-[70px] sm:min-h-[110px] bg-slate-50/30" />
            ))}
            {monthDays.map(date => {
              const dayOfWeek = getDay(date);
              const dateStr = format(date, 'yyyy-MM-dd');
              const requests = allShiftRequests.filter(r => r.date === dateStr);
              const storeSettings = selectedStore ? getStoreSettingsForDate(selectedStore, dateStr) : null;
              const isClosed = storeSettings?.isClosedDay;
              const { staff } = calculateDailyTotals(dateStr);
              const today = isSameDay(date, new Date());

              return (
                <div
                  key={date.toString()}
                  className={cn(
                    "border border-slate-200 rounded-xl p-1 sm:p-1.5 min-h-[70px] sm:min-h-[110px] cursor-pointer transition-all hover:shadow-md hover:border-cyan-300 active:scale-[0.98]",
                    isClosed ? 'bg-slate-100 opacity-60' : dayOfWeek === 0 ? 'bg-red-50/30' : dayOfWeek === 6 ? 'bg-blue-50/30' : 'bg-white',
                    today && 'ring-2 ring-cyan-400 bg-cyan-50/20',
                    expandedDate === dateStr && 'ring-2 ring-cyan-500 shadow-md'
                  )}
                  onClick={() => handleDateClick(date)}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn(
                      "text-[10px] sm:text-sm font-bold",
                      dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-slate-800',
                      today && 'text-cyan-700'
                    )}>
                      {format(date, 'd')}
                      {today && <span className="text-[7px] sm:text-[9px] text-cyan-500 ml-0.5">今日</span>}
                    </span>
                    {requests.length > 0 && (
                      <span className="text-[8px] sm:text-[10px] text-slate-400 font-medium">{staff}/{requests.length}</span>
                    )}
                  </div>
                  {isClosed && <div className="text-[9px] sm:text-xs text-red-500 font-semibold text-center">休業日</div>}
                  <div className="space-y-0.5">
                    {requests.slice(0, 3).map(request => {
                      const reqUser = storeUsers.find(u => u.email === request.created_by);
                      const userName = request.is_help_slot ? (request.help_name || 'ヘルプ') : (reqUser?.metadata?.display_name || reqUser?.full_name?.split(' ')[0] || request.created_by.split('@')[0]);
                      const isOwnShiftInTable = request.created_by === user?.email;
                      const paidLeave = (isAdminOrManager || isOwnShiftInTable) ? getPaidLeaveForUserDate(request.created_by, dateStr) : null;
                      if (request.is_day_off) {
                        return (
                          <div key={request.id} className={cn("relative text-[8px] sm:text-[10px] px-1 py-0.5 rounded truncate font-medium", request.is_negotiable_if_needed ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-slate-200 text-slate-700")}>
                            {paidLeave && (
                              <span className={cn("inline-flex items-center justify-center w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full text-[6px] sm:text-[7px] font-bold mr-0.5 flex-shrink-0",
                                paidLeave.status === 'approved' ? "bg-emerald-500 text-white" : "bg-amber-400 text-amber-900"
                              )}>有</span>
                            )}
                            {userName} 休{request.is_negotiable_if_needed && <span className="text-amber-600 font-bold">⚡</span>}
                          </div>
                        );
                      }
                      if (request.is_full_day_available) {
                        return (
                          <div key={request.id} className="text-[8px] sm:text-[10px] px-1 py-0.5 rounded truncate font-medium bg-green-100 text-green-800 border border-green-300">
                            {userName} 終日可
                          </div>
                        );
                      }
                      const colorClass = getShiftColor(request.start_time);
                      return (
                        <React.Fragment key={request.id}>
                          <div className={cn("text-[8px] sm:text-[10px] px-1 py-0.5 rounded truncate font-medium border", colorClass)}>
                            {userName} {formatTimeJa(request.start_time)}-{formatTimeJa(request.end_time)}
                          </div>
                          {request.additional_times && request.additional_times.length > 0 && request.additional_times.map((at, atIdx) => (
                            <div key={`${request.id}-at-${atIdx}`} className={cn("text-[7px] sm:text-[9px] px-1 py-0.5 rounded truncate font-medium border border-dashed", getShiftColor(at.start_time))}>
                              +{formatTimeJa(at.start_time)}-{formatTimeJa(at.end_time)}
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {requests.length > 3 && (
                      <div className="text-[8px] sm:text-[10px] text-slate-400 text-center font-medium">+{requests.length - 3}人</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-cyan-100 border border-cyan-300"></span> 早番</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-lime-100 border border-lime-300"></span> 中番</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-orange-100 border border-orange-300"></span> 遅番</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-green-100 border border-green-300"></span> 終日可</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-slate-200 border border-slate-300"></span> 休み</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-amber-100 border border-amber-300 flex items-center justify-center"><span className="text-amber-600 text-[7px]">⚡</span></span> 要相談</span>
            {isAdminOrManager && (
              <>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500 flex items-center justify-center"><span className="text-white text-[5px] sm:text-[6px] font-bold">有</span></span> 有給承認</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-400 flex items-center justify-center"><span className="text-amber-900 text-[5px] sm:text-[6px] font-bold">有</span></span> 有給申請中</span>
              </>
            )}
            <span className="text-[9px] sm:text-[10px] text-slate-400 ml-auto">※日付をタップで詳細表示</span>
          </div>
        </div>
        </div>
        {expandedDate && (() => {
          const date = monthDays.find(d => format(d, 'yyyy-MM-dd') === expandedDate);
          return date ? renderExpandedDetail(date) : null;
        })()}
      </div>
    );
  };

  // ============ TABLE VIEW ============
  const renderTableView = (days) => {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <ZoomableWrapper className="p-1 sm:p-2">
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleUserDragEnd}>
        <table className="w-full border-collapse text-xs sm:text-sm min-w-[600px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 p-1 sm:p-2 font-semibold text-slate-700 sticky top-0 sticky left-0 bg-slate-100 z-30 text-xs sm:text-sm min-w-[80px]">日付</th>
              <SortableContext items={userOrder} strategy={horizontalListSortingStrategy}>
                {getSortedUsers().map(u => (<SortableUserHeader key={u.id} id={u.id} user={u} />))}
              </SortableContext>
              <th className="border border-slate-300 p-1 font-semibold text-slate-700 sticky top-0 sticky right-0 bg-yellow-50 z-25 min-w-[80px]"><div className="text-sm">合計</div></th>
            </tr>
          </thead>
          <tbody>
            {days.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const dayOfWeek = getDay(date);
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const { hours, staff } = calculateDailyTotals(dateStr);
              const storeSettings = selectedStore ? getStoreSettingsForDate(selectedStore, dateStr) : null;
              const isClosed = storeSettings?.isClosedDay;
              const isToday = isSameDay(date, new Date());
              return (
                <tr key={date.toString()} className={cn(isClosed && 'opacity-60', isToday && 'bg-cyan-50/20')}>
                  <td className={cn("border border-slate-300 p-2 font-medium sticky left-0 z-20", isClosed ? 'bg-slate-200' : isWeekend ? 'bg-red-50' : 'bg-white')}>
                    <div className="text-sm">
                      <span className={dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-slate-700'}>{format(date, 'M/d')}</span>
                      <span className="text-xs text-slate-500 ml-1">({format(date, 'E', { locale: ja })})</span>
                      {isClosed && <span className="text-[10px] text-red-500 ml-1 font-semibold">休</span>}
                      {storeSettings?.businessHours && !isClosed && (<div className="text-[9px] text-slate-400">{storeSettings.businessHours.open}-{storeSettings.businessHours.close}</div>)}
                    </div>
                  </td>
                  {getSortedUsers().map(u => {
                    const content = getRequestCellContent(u.email, dateStr);
                    const isMe = u.email === user?.email;
                    return (
                      <td key={u.email} className={cn("border border-slate-300 p-0.5", isWeekend ? 'bg-red-50/50' : 'bg-white', isMe && 'bg-cyan-50/30', "cursor-pointer hover:bg-cyan-50/50 transition-colors")}
                        onClick={() => { if (u.email === user?.email) handleEditMyShift(date); }}>
                        {content ? (
                          content.type === 'dayoff' ? (<div className="text-center"><div className={cn("text-xs font-semibold rounded px-0.5 py-px", content.isNegotiable ? "bg-amber-100 text-amber-700 border border-amber-300" : "text-slate-400")}>{content.isNegotiable ? '休⚡' : '休'}</div>{content.isNegotiable && (<div className="text-[8px] text-amber-600 font-bold">要相談</div>)}{content.isPaidLeave && (<div className="text-[8px] text-emerald-600 font-bold">有給</div>)}</div>) :
                          content.type === 'fullday' ? (<div className="bg-green-100 text-green-800 border border-green-300 rounded px-1 py-0.5 text-[11px] font-semibold text-center leading-tight">終日可</div>) :
                          content.type === 'shift' ? (
                             <div className="space-y-0.5">
                               <div className={cn("border rounded px-1 py-0.5 text-[11px] font-semibold text-center leading-tight", getShiftColor(content.startTime))}>
                                 {formatTimeJa(content.startTime)}-{formatTimeJa(content.endTime)}
                               </div>
                               {content.additionalTimes && content.additionalTimes.length > 0 && content.additionalTimes.map((at, idx) => (
                                 <div key={idx} className={cn("border border-dashed rounded px-1 py-0.5 text-[10px] font-semibold text-center leading-tight", getShiftColor(at.start_time))}>
                                   {formatTimeJa(at.start_time)}-{formatTimeJa(at.end_time)}
                                 </div>
                               ))}
                               {content.isNegotiable && (<div className="text-[9px] text-amber-600 font-bold text-center">⚡要相談</div>)}
                             </div>
                          ) : (<div className="text-center text-slate-300 text-xs">+</div>)
                        ) : (<div className="text-center text-slate-300 text-xs hover:text-blue-500">-</div>)}
                      </td>
                    );
                  })}
                  <td className={cn("border border-slate-300 p-2 text-center font-semibold", isWeekend ? 'bg-red-100' : 'bg-yellow-50')}>
                    <div className="text-xs space-y-1"><div>{staff}人 | {hours}h</div></div>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-100 font-semibold">
              <td className="border border-slate-300 p-2 text-slate-700 sticky left-0 sticky bottom-0 bg-slate-100 z-30">合計</td>
              {getSortedUsers().map(u => {
                const { totalHours, workDays } = calculateUserTotals(u.email, days);
                return (<td key={u.email} className="border border-slate-300 p-1 text-center bg-yellow-100 sticky bottom-0"><div className="text-xs"><div>{workDays}日</div><div className="text-slate-600">{totalHours}h</div></div></td>);
              })}
              <td className="border border-slate-300 p-1 bg-yellow-100 sticky bottom-0"></td>
            </tr>
          </tbody>
        </table>
        </DndContext>
      </ZoomableWrapper>
      </div>
    );
  };

  // ============ TIMELINE VIEW ============
  const renderTimelineView = (days) => {
    const getTimeRange = () => {
      if (!selectedStore?.business_hours) return { startHour: 6, endHour: 23 };
      const bh = selectedStore.business_hours;
      let minOpen = 24, maxClose = 0;
      const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      dayKeys.forEach(day => {
        const dayConfig = bh[day];
        if (dayConfig && !dayConfig.closed) {
          const openH = parseInt(dayConfig.open?.split(':')[0] || '9');
          const closeH = parseInt(dayConfig.close?.split(':')[0] || '18');
          if (openH < minOpen) minOpen = openH;
          if (closeH > maxClose) maxClose = closeH;
        }
      });
      if (minOpen >= maxClose) return { startHour: 6, endHour: 23, startMinute: 0, endMinute: 0 };
      let mStart = minOpen, mStartMin = 0, mEnd = maxClose, mEndMin = 30;
      if (minOpen > 0) { mStart = minOpen - 1; mStartMin = 30; } else { mStart = 0; mStartMin = 0; }
      if (maxClose < 24) { mEnd = maxClose; mEndMin = 30; } else { mEnd = 24; mEndMin = 0; }
      return { startHour: mStart, endHour: mEnd, startMinute: mStartMin, endMinute: mEndMin };
    };
    const { startHour: rawStart, endHour: rawEnd, startMinute: startMin30 = 0, endMinute: endMin30 = 0 } = getTimeRange();
    const timelineStart = rawStart;
    const timelineEnd = rawEnd + (endMin30 > 0 ? 1 : 0);
    const hourCount = timelineEnd - timelineStart;
    const hours = Array.from({ length: hourCount }, (_, i) => i + timelineStart);
    const getRequestPosition = (request) => {
      const [startHour, startMin] = request.start_time.split(':').map(Number);
      const [endHour, endMin] = request.end_time.split(':').map(Number);
      const startFrac = ((startHour - timelineStart) + startMin / 60) / hourCount;
      const durationFrac = ((endHour - startHour) + (endMin - startMin) / 60) / hourCount;
      return { leftPct: Math.max(0, startFrac * 100), widthPct: Math.max(2, durationFrac * 100) };
    };
    const getBarColor = (request) => {
      if (request.is_full_day_available) return { bg: 'bg-green-300', text: 'text-green-950' };
      const hour = parseInt(request.start_time?.split(':')[0] || 9);
      if (hour < 12) return { bg: 'bg-cyan-300', text: 'text-cyan-950' };
      if (hour < 17) return { bg: 'bg-lime-300', text: 'text-lime-950' };
      return { bg: 'bg-orange-300', text: 'text-orange-950' };
    };

    return (
      <div className="space-y-4 sm:space-y-6">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayRequests = allShiftRequests.filter(r => r.date === dateStr);
          const dayOfWeek = getDay(day);
          const isToday = isSameDay(day, new Date());
          const { hours: dayHours, staff: dayStaff } = calculateDailyTotals(dateStr);
          return (
            <div key={dateStr} className={cn("border rounded-2xl p-4 shadow-sm", dayOfWeek === 0 || dayOfWeek === 6 ? 'bg-red-50/30 border-red-100' : 'bg-white border-slate-100', isToday && 'ring-2 ring-cyan-400')}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={cn("text-lg font-extrabold", dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-slate-800')}>
                  {format(day, 'M月d日(E)', { locale: ja })}
                  {isToday && <span className="text-xs text-cyan-500 ml-2 font-medium">今日</span>}
                </h3>
                <div className="flex items-center gap-3 text-sm text-slate-600 font-bold">
                  <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full"><Users className="w-4 h-4" />{dayStaff}人</span>
                  <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-full"><Clock className="w-4 h-4" />{dayHours}h</span>
                </div>
              </div>
              <div>
              <div className="flex border-b-2 border-slate-300 mb-2">
                  <div className="w-20 sm:w-28 flex-shrink-0"></div>
                  <div className="flex-1 relative h-8">
                    {hours.map(hour => (
                      <div key={hour} className="absolute text-xs sm:text-sm text-slate-700 font-bold" style={{ left: `${((hour - timelineStart) / hourCount) * 100}%` }}>{hour}</div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {getSortedUsers().map(u => {
                    const userRequests = dayRequests.filter(r => r.created_by === u?.email);
                    const isMe = u?.email === user?.email;
                    return (
                      <div key={u?.email} className={cn("flex items-center border-b border-slate-100 pb-2", isMe && "bg-cyan-50/50 rounded-lg px-2")}>
                        <div className={cn("w-20 sm:w-28 flex-shrink-0 pr-1 sm:pr-2 text-xs sm:text-sm font-extrabold truncate", isMe ? "text-cyan-700 bg-cyan-50/50" : "text-slate-800")}>
                          {u?.metadata?.display_name || u?.full_name || u?.email?.split('@')[0]}
                          {isMe && <span className="text-[10px] text-cyan-500 ml-1">(自分)</span>}
                        </div>
                        <div className="flex-1 relative h-10">
                          {hours.map(hour => (<div key={hour} className="absolute h-full border-l border-slate-200" style={{ left: `${((hour - timelineStart) / hourCount) * 100}%` }} />))}
                          {userRequests.length > 0 && userRequests.map((request, idx) => {
                            if (request.is_day_off) return (<div key={idx} className={cn("absolute inset-0 rounded-md flex items-center justify-center text-sm sm:text-base font-extrabold", request.is_negotiable_if_needed ? "bg-amber-200/70 text-amber-800 border border-amber-400" : "bg-slate-200/50 text-slate-700")}>休希望{request.is_negotiable_if_needed && <span className="ml-1 text-amber-500">⚡要相談</span>}</div>);
                            if (request.is_full_day_available) return (<div key={idx} className="absolute inset-0 bg-green-300/50 rounded-md flex items-center justify-center text-sm sm:text-base font-extrabold text-green-800">終日対応可</div>);
                            if (!request.start_time || !request.end_time) return null;
                            const { leftPct, widthPct } = getRequestPosition(request);
                            const colors = getBarColor(request);
                            return (
                              <React.Fragment key={idx}>
                                <div className={`absolute h-8 ${colors.bg} ${colors.text} rounded-md px-2 flex items-center text-sm sm:text-base font-extrabold shadow-sm cursor-default`}
                                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: '4px' }}
                                  title={`希望: ${request.start_time?.slice(0, 5)} - ${request.end_time?.slice(0, 5)}${request.is_negotiable_if_needed ? ' (要相談)' : ''}`}>
                                  <span className="truncate">{request.start_time?.slice(0, 5)} - {request.end_time?.slice(0, 5)}{request.is_negotiable_if_needed && ' ⚡'}</span>
                                </div>
                                {request.additional_times && request.additional_times.length > 0 && request.additional_times.map((at, atIdx) => {
                                  const atPos = getRequestPosition({ start_time: at.start_time, end_time: at.end_time });
                                  const atColors = getBarColor({ start_time: at.start_time });
                                  return (
                                    <div key={`at-${idx}-${atIdx}`} className={`absolute h-6 ${atColors.bg} ${atColors.text} rounded-md px-1 flex items-center text-xs sm:text-sm font-extrabold shadow-sm cursor-default border border-dashed ${atColors.bg.replace('bg-', 'border-').replace('-300', '-500')}`}
                                      style={{ left: `${atPos.leftPct}%`, width: `${atPos.widthPct}%`, top: '5px' }}
                                      title={`追加: ${at.start_time?.slice(0, 5)} - ${at.end_time?.slice(0, 5)}`}>
                                      <span className="truncate">+{at.start_time?.slice(0, 5)}-{at.end_time?.slice(0, 5)}</span>
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {dayRequests.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    この日のシフト希望はまだ提出されていません
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ============ VIEW MODE SELECTOR ============
  const viewModes = [
    { value: 'calendar', label: 'カレンダー', icon: LayoutGrid },
    { value: 'month', label: '月ごと', icon: Rows3 },
    { value: 'week', label: '週ごと', icon: Rows3 },
    { value: 'day', label: '日ごと', icon: CalendarIcon },
  ];

  const weekDays = getWeekDays();
  const displayDays = viewMode === 'month' ? monthDays : viewMode === 'week' ? weekDays : viewMode === 'day' ? weekDays : monthDays;

  // ============ SUMMARY STATS ============
  const summaryStats = useMemo(() => {
    if (selectedCategory === 'store' && !selectedStoreId) return { totalSubmissions: 0, totalUsers: 0, submittedUsers: 0, workDays: 0, totalHours: 0 };
    if (!allShiftRequests.length) return { totalSubmissions: 0, totalUsers: storeUsers.length, submittedUsers: 0, workDays: 0, totalHours: 0 };
    // 管理者表示/非表示設定を反映: 非表示の管理者のシフトを除外
    const hiddenAdminEmails = new Set(
      adminUsersList
        .filter(u => !visibleAdminIds.includes(u.id))
        .map(u => u.email)
    );
    const filteredRequests = allShiftRequests.filter(r => !hiddenAdminEmails.has(r.created_by));
    const filteredUsers = storeUsers.filter(u => !hiddenAdminEmails.has(u.email));
    const uniqueUsers = new Set(filteredRequests.map(r => r.created_by));
    const workRequests = filteredRequests.filter(r => !r.is_day_off && r.start_time && r.end_time);
    let totalH = 0;
    workRequests.forEach(r => {
      const start = new Date(`2000-01-01T${r.start_time}`);
      const end = new Date(`2000-01-01T${r.end_time}`);
      const h = (end - start) / (1000 * 60 * 60);
      if (h > 0) totalH += h;
    });
    const workDaySet = new Set(workRequests.map(r => r.date));
    return { totalSubmissions: filteredRequests.length, totalUsers: filteredUsers.length, submittedUsers: uniqueUsers.size, workDays: workDaySet.size, totalHours: totalH.toFixed(0) };
  }, [allShiftRequests, selectedStoreId, selectedCategory, storeUsers, visibleAdminIds, adminUsersList]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 p-2 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-3 sm:space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
         <div className="flex items-center gap-2.5 sm:gap-3">
           <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-200 flex-shrink-0">
             <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
           </div>
           <div>
             <h1 className="text-base sm:text-2xl font-bold text-slate-800">シフト一覧表</h1>
             <p className="text-[10px] sm:text-sm text-slate-500">所属先のシフト希望を確認・編集</p>
           </div>
         </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* カテゴリタブ */}
          {isAdminOrManager && (
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
              {[
                { id: 'store', label: '店舗', icon: null },
                { id: 'online', label: '通販', icon: ShoppingCart },
                { id: 'manufacturing', label: '製造', icon: Factory },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSelectedCategory(id)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    selectedCategory === id
                      ? 'bg-white shadow-sm text-cyan-700'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* 店舗セレクタ（店舗カテゴリのみ表示） */}
          {selectedCategory === 'store' && userStores.length > 0 && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-40 bg-white border-slate-200 shadow-sm"><SelectValue placeholder="店舗を選択" /></SelectTrigger>
              <SelectContent>
                {sortStoresByOrder(userStores).map(store => (<SelectItem key={store.id} value={store.id}>{store.store_name}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
          {/* 通販・製造カテゴリのラベル */}
          {selectedCategory === 'online' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1.5 rounded-xl">
              <ShoppingCart className="w-3.5 h-3.5" />受注処理・受電
            </span>
          )}
          {selectedCategory === 'manufacturing' && (
            <span className="flex items-center gap-1.5 text-xs font-semibold bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl">
              <Factory className="w-3.5 h-3.5" />北摂・加賀屋工場
            </span>
          )}
        </div>
      </div>

      {/* Summary Stats Cards */}
      {(selectedStoreId || selectedCategory !== 'store') && !requestsLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-cyan-50 flex items-center justify-center"><Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-600" /></div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">提出者</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-800">{summaryStats.submittedUsers}<span className="text-sm text-slate-400 font-normal">/{summaryStats.totalUsers}人</span></p>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 flex items-center justify-center"><ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" /></div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">提出件数</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-800">{summaryStats.totalSubmissions}<span className="text-sm text-slate-400 font-normal">件</span></p>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" /></div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">出勤日数</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-800">{summaryStats.workDays}<span className="text-sm text-slate-400 font-normal">日</span></p>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-orange-50 flex items-center justify-center"><Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600" /></div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">合計時間</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-800">{summaryStats.totalHours}<span className="text-sm text-slate-400 font-normal">h</span></p>
          </div>
        </div>
      )}

      {/* Navigation & View Mode */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <Button variant="ghost" size="sm" onClick={navigatePrev} className="h-8 w-8 p-0 hover:bg-white rounded-md"><ChevronLeft className="w-4 h-4" /></Button>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 px-2 sm:px-3 whitespace-nowrap">{format(currentDate, 'yyyy年\u3000M月', { locale: ja })}</h2>
              <Button variant="ghost" size="sm" onClick={navigateNext} className="h-8 w-8 p-0 hover:bg-white rounded-md"><ChevronRight className="w-4 h-4" /></Button>
            </div>
            {selectedStore && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">{selectedStore.store_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-slate-100 rounded-lg p-0.5 overflow-x-auto">
              {viewModes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    setViewMode(value);
                    if (value !== 'week' && value !== 'day') setSelectedWeek(getInitialWeekIndex());
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-sm font-medium transition-all whitespace-nowrap",
                    viewMode === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label.length > 3 ? label.substring(0, 3) : label}</span>
                </button>
              ))}
            </div>
            {(viewMode === 'week' || viewMode === 'day') && (
              <>
                <Select value={String(effectiveWeekStart)} onValueChange={(v) => setLocalWeekStart(parseInt(v))}>
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">月曜始まり</SelectItem>
                    <SelectItem value="0">日曜始まり</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white" disabled={selectedWeek === 0} onClick={() => setSelectedWeek(Math.max(0, selectedWeek - 1))}><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-xs sm:text-sm font-medium px-1.5 text-slate-700">第{selectedWeek + 1}週</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white" disabled={selectedWeek >= weeksInMonth.length - 1} onClick={() => setSelectedWeek(Math.min(weeksInMonth.length - 1, selectedWeek + 1))}><ChevronRight className="w-4 h-4" /></Button>
                </div>
              </>
            )}
            {isAdminOrManager && adminUsersList.length > 0 && (
              <AdminDropdown
                adminUsers={adminUsersList}
                visibleAdminIds={visibleAdminIds}
                toggleAdminUser={toggleAdminUser}
                setVisibleAdminIds={setVisibleAdminIds}
                adminDropdownOpen={adminDropdownOpen}
                setAdminDropdownOpen={setAdminDropdownOpen}
                title="表示する管理者"
              />
            )}
            <Button variant="outline" size="sm" onClick={handlePrint} className="flex-shrink-0 h-8 border-slate-200 shadow-sm hover:bg-slate-50">
              <Printer className="w-3.5 h-3.5 mr-1.5" />印刷
            </Button>
          </div>
        </div>

        {/* Legend - only for non-users view */}
        {viewMode !== 'users' && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-4 pb-3 sm:pb-4 text-[11px] sm:text-xs">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded bg-cyan-100 border border-cyan-300"></div><span className="text-slate-500">早番（〜12時）</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded bg-lime-100 border border-lime-300"></div><span className="text-slate-500">中番（12-17時）</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded bg-orange-100 border border-orange-300"></div><span className="text-slate-500">遅番（17時〜）</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded bg-green-100 border border-green-300"></div><span className="text-slate-500">終日可</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded bg-slate-200 border border-slate-300"></div><span className="text-slate-500">休み</span></div>
            {isAdminOrManager && (
              <>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-500 flex items-center justify-center"><span className="text-white text-[5px] sm:text-[6px] font-bold">有</span></div><span className="text-slate-500">有給承認</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-amber-400 flex items-center justify-center"><span className="text-amber-900 text-[5px] sm:text-[6px] font-bold">有</span></div><span className="text-slate-500">有給申請中</span></div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {requestsLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-200 mb-4 animate-pulse">
            <Eye className="w-6 h-6 text-white" />
          </div>
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-200 border-t-cyan-600 mb-3"></div>
          <span className="text-sm text-slate-500">読み込み中...</span>
        </div>
      ) : !selectedStoreId ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Users className="w-7 h-7 text-slate-300" /></div>
          <p className="text-sm text-slate-500 mb-1">店舗を選択してください</p>
          <p className="text-xs text-slate-400">シフト希望の一覧が表示されます</p>
        </div>
      ) : (
        <>
          {viewMode === 'calendar' ? (
            renderCalendarView()
          ) : viewMode === 'day' ? (
            renderTimelineView(displayDays)
          ) : (
            renderTableView(displayDays)
          )}
        </>
      )}

      {/* Edit My Shift Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit3 className="w-5 h-5 text-cyan-600" />シフト希望を編集</DialogTitle>
            <DialogDescription>{editingDate && format(editingDate, 'yyyy年M月d日 (EEEE)', { locale: ja })}</DialogDescription>
          </DialogHeader>
          <ShiftForm
            date={editingDate} shift={editingShift} storeId={selectedStoreId}
            onSubmit={(data) => submitShiftMutation.mutate(data)}
            onDelete={() => deleteShiftMutation.mutate()}
            onCancel={() => setEditDialogOpen(false)}
            isSubmitting={submitShiftMutation.isPending}
            isDeleting={deleteShiftMutation.isPending}
            canEdit={true}
          />
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
