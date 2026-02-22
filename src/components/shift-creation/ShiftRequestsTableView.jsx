import React, { useState, useCallback } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, startOfWeek, endOfWeek, eachWeekOfInterval, isWithinInterval, isSameMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { updateRecord, fetchAll } from '@/api/supabaseHelpers';
import { toast } from 'sonner';
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
import { invalidateUserQueries } from '@/lib/invalidateHelpers';

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
      className="border border-slate-300 p-2 text-center min-w-[100px] bg-white"
    >
      <div className="flex items-center justify-center gap-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-100 rounded touch-none">
          <GripVertical className="w-3 h-3 text-slate-400" />
        </div>
        <span className="font-semibold text-sm truncate">
          {user?.metadata?.display_name || user?.full_name || user?.email?.split('@')[0]}
        </span>
      </div>
    </th>
  );
}

// Week timeline view component for requests (read-only)
function WeekTimelineView({ weekDays, users, shiftRequests, store }) {
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
    if (minOpen >= maxClose) return { startHour: 6, endHour: 23 };
    return { startHour: Math.max(0, minOpen - 1), endHour: Math.min(24, maxClose + 1) };
  };
  const { startHour: timelineStart, endHour: timelineEnd } = getTimeRange();
  const hourCount = timelineEnd - timelineStart;
  const hours = Array.from({ length: hourCount }, (_, i) => i + timelineStart);
  
  const getRequestPosition = (request) => {
    const [startHour, startMin] = request.start_time.split(':').map(Number);
    const [endHour, endMin] = request.end_time.split(':').map(Number);
    const startPos = ((startHour - timelineStart) + startMin / 60) * 60;
    const duration = (endHour - startHour + (endMin - startMin) / 60) * 60;
    return { left: Math.max(0, startPos), width: duration };
  };
  
  const getRequestColor = (request) => {
    if (request.is_day_off) return { bg: 'bg-slate-200', text: 'text-slate-800' };
    if (request.is_paid_leave) return { bg: 'bg-purple-200', text: 'text-purple-900' };
    if (request.is_full_day_available) return { bg: 'bg-green-200', text: 'text-green-900' };
    const hour = parseInt(request.start_time?.split(':')[0] || 9);
    if (hour < 12) return { bg: 'bg-cyan-200', text: 'text-cyan-900' };
    if (hour < 17) return { bg: 'bg-lime-200', text: 'text-lime-900' };
    return { bg: 'bg-orange-200', text: 'text-orange-900' };
  };
  
  return (
    <div className="space-y-8">
      {weekDays.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayRequests = shiftRequests.filter(r => r.date === dateStr);
        const dayOfWeek = getDay(day);
        
        return (
          <div key={dateStr} className={`border rounded-lg p-4 ${dayOfWeek === 0 || dayOfWeek === 6 ? 'bg-red-50/30' : 'bg-white'}`}>
            <div className="mb-3">
              <h3 className="text-lg font-bold text-slate-800">
                {format(day, 'M月d日(E)', { locale: ja })}
              </h3>
            </div>
            
            {/* Timeline header */}
            <div className="flex border-b-2 border-slate-300 mb-2">
              <div className="w-32 flex-shrink-0"></div>
              <div className="flex-1 relative h-8">
                {hours.map(hour => (
                  <div
                    key={hour}
                    className="absolute text-xs text-slate-600 font-medium"
                    style={{ left: `${(hour - timelineStart) * 60}px` }}
                  >
                    {hour}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Staff rows */}
            <div className="space-y-2">
              {users
                .filter(u => (u.user_role || u.role) === 'user')
                .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999))
                .map(user => {
                const userRequests = dayRequests.filter(r => r.created_by === user?.email);
                
                return (
                  <div key={user?.email} className="flex items-center border-b border-slate-200 pb-2">
                    <div className="w-32 flex-shrink-0 pr-3 text-sm font-medium text-slate-700 truncate">
                      {user?.metadata?.display_name || user?.full_name || user?.email.split('@')[0]}
                    </div>
                    <div className="flex-1 relative h-10" style={{ width: `${hourCount * 60}px` }}>
                      {/* Time grid */}
                      {hours.map(hour => (
                        <div
                          key={hour}
                          className="absolute h-full border-l border-slate-200"
                          style={{ left: `${(hour - timelineStart) * 60}px` }}
                        />
                      ))}
                      
                      {/* Request bars */}
                      {userRequests.length > 0 && userRequests.map((request, idx) => {
                        if (request.is_day_off) {
                          return (
                            <div key={idx} className="absolute inset-0 bg-slate-200/50 rounded flex items-center justify-center text-xs font-semibold text-slate-700">
                              休希望
                            </div>
                          );
                        }
                        if (request.is_full_day_available) {
                          return (
                            <div key={idx} className="absolute inset-0 bg-green-200/50 rounded flex items-center justify-center text-xs font-semibold text-green-700">
                              終日対応可
                            </div>
                          );
                        }
                        if (request.is_paid_leave) {
                          return (
                            <div key={idx} className="absolute inset-0 bg-purple-200/50 rounded flex items-center justify-center text-xs font-semibold text-purple-700">
                              有給希望
                            </div>
                          );
                        }
                        
                        const { left, width } = getRequestPosition(request);
                        const colors = getRequestColor(request);
                        
                        return (
                          <React.Fragment key={idx}>
                            <div
                              className={`absolute h-8 ${colors.bg} ${colors.text} rounded px-2 flex items-center text-xs font-semibold shadow-sm`}
                              style={{ left: `${left}px`, width: `${width}px`, top: '4px' }}
                              title={`希望: ${request.start_time?.slice(0, 5)} - ${request.end_time?.slice(0, 5)}`}
                            >
                              <span className="truncate">
                                {request.start_time?.slice(0, 5)} - {request.end_time?.slice(0, 5)}
                              </span>
                            </div>
                            {request.additional_times && request.additional_times.map((at, atIdx) => {
                              const atPos = getRequestPosition({ start_time: at.start_time, end_time: at.end_time });
                              const atColors = getRequestColor({ start_time: at.start_time });
                              return (
                                <div
                                  key={`at-${atIdx}`}
                                  className={`absolute h-6 ${atColors.bg} ${atColors.text} rounded px-1.5 flex items-center text-[10px] font-semibold shadow-sm border-2 border-dashed border-white/50`}
                                  style={{ left: `${atPos.left}px`, width: `${atPos.width}px`, top: '5px' }}
                                  title={`追加: ${at.start_time?.slice(0, 5)} - ${at.end_time?.slice(0, 5)}`}
                                >
                                  <span className="truncate">{at.start_time?.slice(0, 5)}-{at.end_time?.slice(0, 5)}</span>
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
              <div className="text-center py-4 text-slate-400 text-sm">
                この日のシフト希望はまだ提出されていません
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ShiftRequestsTableView({ selectedMonth, users, storeId, store, shiftRequests: propShiftRequests }) {
  const [viewMode, setViewMode] = useState(() => {
    const saved = sessionStorage.getItem('shiftRequestsTableViewMode');
    return saved || 'month';
  });
  
  // Week start day setting: local override > store setting
  const storeWeekStart = store?.week_start_day ?? 0;
  const [localWeekStart, setLocalWeekStart] = useState(null);
  const effectiveWeekStart = localWeekStart !== null ? localWeekStart : storeWeekStart;

  // Calculate the week index that contains today
  const getInitialWeekIndex = () => {
    const today = new Date();
    const weeks = eachWeekOfInterval({
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth)
    }, { weekStartsOn: effectiveWeekStart });
    
    if (isSameMonth(today, selectedMonth)) {
      for (let i = 0; i < weeks.length; i++) {
        const weekStart = weeks[i];
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: effectiveWeekStart });
        if (isWithinInterval(today, { start: weekStart, end: weekEnd })) {
          return i;
        }
      }
    }
    if (selectedMonth > today) return 0;
    return Math.max(0, weeks.length - 1);
  };
  
  const [selectedWeek, setSelectedWeek] = useState(getInitialWeekIndex);
  
  // Update selectedWeek when selectedMonth changes
  React.useEffect(() => {
    setSelectedWeek(getInitialWeekIndex());
  }, [selectedMonth]);

  React.useEffect(() => {
    sessionStorage.setItem('shiftRequestsTableViewMode', viewMode);
  }, [viewMode]);

  // Use prop shiftRequests if provided (includes default shifts), otherwise fetch from DB
  const { data: dbShiftRequests = [] } = useQuery({
    queryKey: ['shiftRequestsTable', storeId],
    queryFn: async () => {
      if (!storeId) return [];
      return supabase.from('ShiftRequest').select('*').eq('store_id', storeId).then(res => res.data || []);
    },
    enabled: !!storeId && !propShiftRequests,
  });

  const shiftRequests = propShiftRequests || dbShiftRequests;
  
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
    // 月を跨ぐ週も正しく表示するため、フィルタリングを削除
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  };

  const weekDays = viewMode === 'week' ? getWeekDays() : [];
  const dayViewDays = viewMode === 'day' ? getWeekDays() : [];
  const displayDays = viewMode === 'month' ? monthDays : viewMode === 'week' ? weekDays : dayViewDays;

  const queryClient = useQueryClient();
  const [userOrder, setUserOrder] = useState([]);

  const orderedUsers = users
    .filter(u => (u.user_role || u.role) === 'user')
    .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999));

  React.useEffect(() => {
    if (orderedUsers.length > 0) {
      setUserOrder(orderedUsers.map(u => u.id));
    }
  }, [users]);

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
            metadata: { ...currentMetadata, sort_order: i }
          });
        }
      }
    },
    onSuccess: () => {
      invalidateUserQueries(queryClient);
      toast.success('ユーザーの並び順を保存しました');
    },
    onError: () => {
      toast.error('\u4e26\u3073\u9806\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f');
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

  const getSortedUsers = useCallback(() => {
    if (userOrder.length === 0) return orderedUsers;
    return userOrder.map(id => orderedUsers.find(u => u.id === id)).filter(Boolean);
  }, [userOrder, orderedUsers]);

  const getRequestsForUserAndDate = (userEmail, dateStr) => {
    return shiftRequests.filter(r => r.created_by === userEmail && r.date === dateStr);
  };

  const getRequestStatusDisplay = (requests) => {
    if (requests.length === 0) return <span className="text-slate-300">-</span>;
    
    const request = requests[0];
    if (request.is_day_off) {
      return <span className="bg-slate-200 px-2 py-1 rounded text-xs font-semibold text-slate-700">休希望</span>;
    }
    if (request.is_paid_leave) {
      return <span className="bg-purple-200 px-2 py-1 rounded text-xs font-semibold text-purple-700">有給</span>;
    }
    if (request.is_full_day_available) {
      return <span className="bg-green-200 px-2 py-1 rounded text-xs font-semibold text-green-700">終日対応</span>;
    }
    
    const hour = parseInt(request.start_time?.split(':')[0] || 0);
    const bgColor = hour < 12 ? 'bg-cyan-100' : hour < 17 ? 'bg-lime-100' : 'bg-orange-100';
    const textColor = hour < 12 ? 'text-cyan-900' : hour < 17 ? 'text-lime-900' : 'text-orange-900';
    
    const hasAdditional = request.additional_times && request.additional_times.length > 0;
    
    return (
      <div className="space-y-0.5">
        <span className={`${bgColor} px-2 py-1 rounded text-xs font-semibold ${textColor}`}>
          {request.start_time?.slice(0, 5)} - {request.end_time?.slice(0, 5)}
        </span>
        {hasAdditional && request.additional_times.map((at, idx) => {
          const atHour = parseInt(at.start_time?.split(':')[0] || 0);
          const atBg = atHour < 12 ? 'bg-cyan-100' : atHour < 17 ? 'bg-lime-100' : 'bg-orange-100';
          const atText = atHour < 12 ? 'text-cyan-900' : atHour < 17 ? 'text-lime-900' : 'text-orange-900';
          return (
            <span key={idx} className={`${atBg} px-1.5 py-0.5 rounded text-[10px] font-semibold ${atText} block`}>
              {at.start_time?.slice(0, 5)}-{at.end_time?.slice(0, 5)}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle className="text-base sm:text-lg">シフト希望一覧（読み取り専用）</CardTitle>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Select value={viewMode} onValueChange={setViewMode}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">月ごと</SelectItem>
                <SelectItem value="week">週ごと</SelectItem>
                <SelectItem value="day">日ごと</SelectItem>
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
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          {viewMode === 'day' && dayViewDays.length > 0 ? (
            <WeekTimelineView 
              weekDays={dayViewDays}
              users={users}
              shiftRequests={shiftRequests}
              store={store}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleUserDragEnd}>
            <table className="w-full border-collapse text-xs sm:text-sm min-w-[600px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-1 sm:p-2 font-semibold text-slate-700 sticky top-0 bg-slate-100 z-10 text-xs sm:text-sm">
                    日付
                  </th>
                  <SortableContext items={userOrder} strategy={horizontalListSortingStrategy}>
                    {getSortedUsers().map(user => (
                      <SortableUserHeader key={user.id} id={user.id} user={user} />
                    ))}
                  </SortableContext>
                </tr>
              </thead>
              <tbody>
                {displayDays.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const dayOfWeek = getDay(date);
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                  return (
                    <tr key={date.toString()} className="hover:bg-slate-50">
                      <td className={`border border-slate-300 p-2 font-medium sticky left-0 z-10 ${
                        isWeekend ? 'bg-red-50' : 'bg-white'
                      }`}>
                        <div className="text-sm">
                          <span className={dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-slate-700'}>
                            {format(date, 'M/d')}
                          </span>
                          <span className="text-xs text-slate-500 ml-1">
                            ({format(date, 'E', { locale: ja })})
                          </span>
                        </div>
                      </td>
                      {getSortedUsers().map(user => {
                        const requests = getRequestsForUserAndDate(user?.email, dateStr);
                        return (
                          <td
                            key={user?.email}
                            className={`border border-slate-300 p-1 text-center ${
                              isWeekend ? 'bg-red-50/50' : 'bg-white'
                            }`}
                          >
                            {getRequestStatusDisplay(requests)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </DndContext>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-cyan-100 border border-cyan-300"></div>
            <span className="text-slate-600">早番希望（〜12時）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-lime-100 border border-lime-300"></div>
            <span className="text-slate-600">中番希望（12-17時）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-100 border border-orange-300"></div>
            <span className="text-slate-600">遅番希望（17時〜）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-100 border border-green-300"></div>
            <span className="text-slate-600">終日対応可</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-100 border border-purple-300"></div>
            <span className="text-slate-600">有給希望</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-slate-200 border border-slate-300"></div>
            <span className="text-slate-600">休希望</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}