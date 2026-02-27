import React, { useState, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, startOfDay, endOfMonth, startOfWeek, endOfWeek, parseISO, eachDayOfInterval, differenceInDays, isPast, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Shield, Calendar, ChevronLeft, ChevronRight, Store, Layout, Sparkles, Wand2, Copy, RotateCcw, Grid, List, GripVertical, ArrowRight, CheckCircle, Users, FileSpreadsheet, ClipboardList, Clock, Edit3, AlertCircle, Plus, Trash2 } from 'lucide-react';
import InlineDeadlineEditor from '@/components/shift/InlineDeadlineEditor';
import ExportButton from '@/components/export/ExportButton';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { notifyShiftConfirmed, notifyShiftChanged, notifyShiftDeleted } from '@/components/notifications/NotificationSystem';
import { sortStoresByOrder } from '@/lib/storeOrder';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import ShiftRequestsTableView from '@/components/shift-creation/ShiftRequestsTableView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
// ResizablePanel removed - shift edit is now full width
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import ShiftTemplateManager from '@/components/shift-creation/ShiftTemplateManager';
import ShiftCalendarEditor from '@/components/shift-creation/ShiftCalendarEditor';
import AutoGenerateShift from '@/components/shift-creation/AutoGenerateShift';
import ShiftStatistics from '@/components/shift-creation/ShiftStatistics';
import ShiftTableView from '@/components/shift-creation/ShiftTableView';
import ShiftRequestsOverview from '@/components/shift-creation/ShiftRequestsOverview';
import ShiftRequestsViewToggle from '@/components/shift-creation/ShiftRequestsViewToggle';
import ShiftRequestEditDialog from '@/components/shift-creation/ShiftRequestEditDialog';
import AIShiftSuggestion from '@/components/ai-shift/AIShiftSuggestion';
import UserStatisticsPanel from '@/components/shift-creation/UserStatisticsPanel';
import ShiftConfirmDialog from '@/components/shift-creation/ShiftConfirmDialog';
import { toast } from 'sonner';
import { fetchAll, fetchFiltered, insertRecord, insertRecords, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { invalidateUserQueries } from '@/lib/invalidateHelpers';

function SortableUserItem({ id, user, isSelected, onSelect }) {
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
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer",
        isSelected ? "bg-blue-50 border-blue-200 shadow-sm" : "bg-white border-slate-100 hover:border-slate-200"
      )}
      onClick={() => onSelect(user)}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-100 rounded">
        <GripVertical className="w-4 h-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-700 truncate">
          {user.metadata?.display_name || user.full_name || user.email.split('@')[0]}
        </p>
      </div>
    </div>
  );
}

export default function ShiftCreation() {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [openDialog, setOpenDialog] = useState(null);
  const [editViewMode, setEditViewMode] = useState('calendar');
  // requestsViewMode removed - shift request list removed from this page
  const [editingRequest, setEditingRequest] = useState(null);
  const [editRequestDialogOpen, setEditRequestDialogOpen] = useState(false);
  const [userOrder, setUserOrder] = useState([]);
  const [applyRequestsDialogOpen, setApplyRequestsDialogOpen] = useState(false);
  const [applyStartDate, setApplyStartDate] = useState('');
  const [applyEndDate, setApplyEndDate] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetStartDate, setResetStartDate] = useState('');
  const [resetEndDate, setResetEndDate] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSelectedUsers, setResetSelectedUsers] = useState([]);
  const [shiftConfirmDialogOpen, setShiftConfirmDialogOpen] = useState(false);
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false);
  const [confirmDeadlinePopoverOpen, setConfirmDeadlinePopoverOpen] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState(null);
  const [deadlineDialogMode, setDeadlineDialogMode] = useState('add');
  
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Note: Auto-update to current month removed to allow free month navigation

  const { user } = useAuth();

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      const sortedStores = sortStoresByOrder(allStores);
      
      // Filter stores based on user permissions
      if (user?.user_role !== 'admin' && user?.role !== 'admin') {
        return sortedStores.filter(store => user?.store_ids?.includes(store.id));
      }
      return sortedStores;
    },
  });

  React.useEffect(() => {
    if (selectedStoreId) return;
    if (user?.store_ids?.[0]) {
      setSelectedStoreId(user.store_ids[0]);
    } else if (stores?.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [user, stores, selectedStoreId]);

  const primaryStoreId = selectedStoreId;
  const selectedStore = stores?.find(s => s.id === selectedStoreId);
  const primaryStore = stores.find(s => s.id === primaryStoreId);
  const effectiveWeekStart = primaryStore?.week_start_day ?? 0;

  const handleCopyShifts = async () => {
    if (!window.confirm('前月のシフトを今月にコピーしますか？')) return;
    try {
      const prevMonth = new Date(selectedMonth);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const prevMonthStart = startOfMonth(prevMonth);
      const prevMonthEnd = endOfMonth(prevMonth);
      
      const prevShifts = await fetchFiltered('WorkShift', { store_id: primaryStoreId });
      const prevMonthShifts = prevShifts.filter(s => {
        const sDate = parseISO(s.date);
        return sDate >= prevMonthStart && sDate <= prevMonthEnd;
      });

      const newShifts = prevMonthShifts.map(s => {
        const prevDate = parseISO(s.date);
        const dayOfMonth = prevDate.getDate();
        const newDate = new Date(selectedMonth);
        newDate.setDate(dayOfMonth);
        return {
          ...s,
          date: format(newDate, 'yyyy-MM-dd'),
          id: undefined
        };
      });

      await insertRecords('WorkShift', newShifts);
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      toast.success(`${newShifts.length}件のシフトをコピーしました`);
    } catch (error) {
      toast.error('コピーに失敗しました');
    }
  };


  const handleResetShifts = () => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    setResetStartDate(format(monthStart, 'yyyy-MM-dd'));
    setResetEndDate(format(monthEnd, 'yyyy-MM-dd'));
    setResetSelectedUsers(resetTargetUsers.map(u => u.email));
    setResetDialogOpen(true);
  };

  const handleExecuteReset = async () => {
    if (!resetStartDate || !resetEndDate) {
      toast.error('期間を設定してください');
      return;
    }
    if (resetSelectedUsers.length === 0) {
      toast.error('リセット対象のユーザーを選択してください');
      return;
    }
    const start = parseISO(resetStartDate);
    const end = parseISO(resetEndDate);
    if (start > end) {
      toast.error('開始日は終了日より前に設定してください');
      return;
    }

    setIsResetting(true);
    try {
      const targetShifts = workShifts.filter(ws => {
        const wsDate = parseISO(ws.date);
        return wsDate >= start && wsDate <= end && resetSelectedUsers.includes(ws.user_email);
      });

      if (targetShifts.length === 0) {
        toast.error('指定条件に一致するシフトがありません');
        setIsResetting(false);
        return;
      }

      for (const shift of targetShifts) {
        await deleteRecord('WorkShift', shift.id);
      }
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      toast.success(`${targetShifts.length}件のシフトを削除しました`);
      setResetDialogOpen(false);
    } catch (error) {
      toast.error('リセットに失敗しました');
    } finally {
      setIsResetting(false);
    }
  };

  const { data: users = [] } = useQuery({
    queryKey: ['storeUsers', primaryStoreId],
    queryFn: async () => {
      if (!primaryStoreId) return [];
      // Use contains filter for store_ids array
      const { data, error } = await supabase
        .from('User')
        .select('*')
        .contains('store_ids', [primaryStoreId]);
      
      if (error) throw error;
      
      return (data || []).sort((a, b) => {
        const orderA = a.metadata?.sort_order ?? 999;
        const orderB = b.metadata?.sort_order ?? 999;
        return orderA - orderB;
      });
    },
    enabled: !!primaryStoreId,
  });

  React.useEffect(() => {
    if (users.length > 0) {
      setUserOrder(users.map(u => u.id));
    }
  }, [users]);

  const updateSortOrderMutation = useMutation({
    mutationFn: async (newOrder) => {
      // Use already-fetched users instead of fetchAll('User') for better performance
      for (let i = 0; i < newOrder.length; i++) {
        const targetUser = users.find(u => u.id === newOrder[i]);
        if (targetUser) {
          const currentMetadata = targetUser.metadata || {};
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
      toast.error('並び順の保存に失敗しました: ' + error.message);
    }
  });

  const handleUserDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = userOrder.indexOf(active.id);
      const newIndex = userOrder.indexOf(over.id);
      const newOrder = arrayMove(userOrder, oldIndex, newIndex);
      setUserOrder(newOrder);
      updateSortOrderMutation.mutate(newOrder);
    }
  };

  const { data: shiftRequests = [] } = useQuery({
    queryKey: ['shiftRequests', primaryStoreId, format(selectedMonth, 'yyyy-MM'), effectiveWeekStart],
    queryFn: async () => {
      if (!primaryStoreId) return [];
      
      // Get shift requests - extend range to cover cross-month weeks
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      const fetchStart = startOfWeek(monthStart, { weekStartsOn: effectiveWeekStart });
      const fetchEnd = endOfWeek(monthEnd, { weekStartsOn: effectiveWeekStart });
      
      const { data: dbRequests, error } = await supabase
        .from('ShiftRequest')
        .select('*')
        .eq('store_id', primaryStoreId)
        .gte('date', format(fetchStart, 'yyyy-MM-dd'))
        .lte('date', format(fetchEnd, 'yyyy-MM-dd'));
      
      if (error) throw error;
      
      // Use the already fetched 'users' data instead of fetching all users again
      const storeUsers = users;
      
      // Generate default shifts for each user based on their default_shift_settings
      const days = eachDayOfInterval({ start: fetchStart, end: fetchEnd });
      const dayMap = {
        0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
      };
      
      const allDefaultShifts = [];
      
      storeUsers.forEach(user => {
        const defaultSettings = user.default_shift_settings;
        if (!defaultSettings) return;
        
        days.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          
          // Skip if user already has a shift request for this date
          const hasExistingShift = dbRequests.some(r => 
            r.created_by === user.email && r.date === dateStr
          );
          if (hasExistingShift) return;
          
          const dayKey = dayMap[day.getDay()];
          const setting = defaultSettings[dayKey];
          
          if (setting?.enabled) {
            // Calculate week of month correctly considering the first day's day of week
            const firstDayOfMonth = new Date(day.getFullYear(), day.getMonth(), 1);
            const firstDayOfWeek = firstDayOfMonth.getDay();
            const adjustedDate = day.getDate() + firstDayOfWeek;
            const weekOfMonth = Math.ceil(adjustedDate / 7);
            
            // Support new week_settings format
            if (setting.week_settings) {
              const weekSetting = setting.week_settings[weekOfMonth];
              if (weekSetting) {
                allDefaultShifts.push({
                  id: `default-${user.email}-${dateStr}`,
                  date: dateStr,
                  start_time: weekSetting.is_day_off ? null : weekSetting.start_time,
                  end_time: weekSetting.is_day_off ? null : weekSetting.end_time,
                  is_day_off: weekSetting.is_day_off,
                  is_paid_leave: false,
                  is_full_day_available: false,
                  notes: weekSetting.notes || '',
                  store_id: primaryStoreId,
                  created_by: user.email,
                  is_default: true
                });
              }
            } else {
              // Legacy format fallback
              const allowedWeeks = setting.weeks || [1, 2, 3, 4, 5];
              if (allowedWeeks.includes(weekOfMonth)) {
                allDefaultShifts.push({
                  id: `default-${user.email}-${dateStr}`,
                  date: dateStr,
                  start_time: setting.is_day_off ? null : setting.start_time,
                  end_time: setting.is_day_off ? null : setting.end_time,
                  is_day_off: setting.is_day_off,
                  is_paid_leave: false,
                  is_full_day_available: setting.is_full_day_available || false,
                  notes: setting.notes || '',
                  store_id: primaryStoreId,
                  created_by: user.email,
                  is_default: true
                });
              }
            }
          }
        });
      });
      
      return [...(dbRequests || []), ...allDefaultShifts];
    },
    enabled: !!primaryStoreId && users.length > 0,
  });

  const { data: workShifts = [] } = useQuery({
    queryKey: ['workShifts', primaryStoreId, format(selectedMonth, 'yyyy-MM'), effectiveWeekStart],
    queryFn: async () => {
      if (!primaryStoreId) return [];
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      // 週表示で月をまたぐ週のデータも取得するため、範囲を拡張
      const fetchStart = startOfWeek(monthStart, { weekStartsOn: effectiveWeekStart });
      const fetchEnd = endOfWeek(monthEnd, { weekStartsOn: effectiveWeekStart });
      
      const { data, error } = await supabase
        .from('WorkShift')
        .select('*')
        .eq('store_id', primaryStoreId)
        .gte('date', format(fetchStart, 'yyyy-MM-dd'))
        .lte('date', format(fetchEnd, 'yyyy-MM-dd'));
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!primaryStoreId,
  });

  // Get all unique user emails from workShifts (includes deleted users)
  const allWorkShiftEmails = useMemo(() => {
    const emailSet = new Set();
    workShifts.forEach(ws => {
      if (ws.user_email) emailSet.add(ws.user_email);
    });
    return Array.from(emailSet);
  }, [workShifts]);

  // Combine active users + deleted users (from workShifts)
  const resetTargetUsers = useMemo(() => {
    const activeEmails = new Set(users.map(u => u.email));
    const deletedEmails = allWorkShiftEmails.filter(email => !activeEmails.has(email));
    const activeUserList = users.map(u => ({
      email: u.email,
      displayName: u.metadata?.display_name || u.full_name || u.email.split('@')[0],
      isDeleted: false,
    }));
    const deletedUserList = deletedEmails.map(email => ({
      email,
      displayName: email.split('@')[0] + ' (削除済み)',
      isDeleted: true,
    }));
    return [...activeUserList, ...deletedUserList];
  }, [users, allWorkShiftEmails]);

  const { data: templates = [] } = useQuery({
    queryKey: ['shiftTemplates', primaryStoreId],
    queryFn: async () => {
      if (!primaryStoreId) return [];
      return fetchFiltered('ShiftTemplate', { store_id: primaryStoreId });
    },
    enabled: !!primaryStoreId,
  });

  // ゲストユーザーでも表示可能

  const isAdminOrManager = !user ? true : (user?.user_role === 'admin' || user?.role === 'admin' || user?.user_role === 'manager');

  // 提出期限データ取得
  const { data: deadlines = [] } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
  });

  // 現在の月に対応するアクティブな提出期限を取得
  const activeStoreDeadlines = useMemo(() => {
    if (!primaryStoreId || deadlines.length === 0) return [];
    const monthStartStr = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
    const monthEndStr = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
    return deadlines.filter(d => {
      if (d.store_id !== primaryStoreId) return false;
      // 対象期間が選択月と重なる
      const targetOverlaps = d.target_month_start <= monthEndStr && d.target_month_end >= monthStartStr;
      // 確定締切日が選択月内にある
      const confirmInMonth = d.confirm_deadline_date && d.confirm_deadline_date >= monthStartStr && d.confirm_deadline_date <= monthEndStr;
      // 提出締切日が選択月内にある
      const submissionInMonth = d.submission_deadline_date && d.submission_deadline_date >= monthStartStr && d.submission_deadline_date <= monthEndStr;
      return targetOverlaps || confirmInMonth || submissionInMonth;
    });
  }, [deadlines, primaryStoreId, selectedMonth]);

  // 後方互換性のためactiveDeadlineも維持（確定締切が設定されているものを優先）
  const activeDeadline = useMemo(() => {
    if (activeStoreDeadlines.length === 0) return null;
    const withConfirm = activeStoreDeadlines.find(d => d.confirm_deadline_date);
    return withConfirm || activeStoreDeadlines[0];
  }, [activeStoreDeadlines]);

  // シフト確定締切の詳細情報を計算
  const confirmDeadlineInfo = useMemo(() => {
    if (!activeDeadline?.confirm_deadline_date) return null;
    const today = new Date();
    const deadlineDate = parseISO(activeDeadline.confirm_deadline_date);
    const daysLeft = differenceInDays(startOfDay(deadlineDate), startOfDay(today));
    const isExpired = isPast(deadlineDate) && !isToday(deadlineDate);
    const isUrgent = daysLeft <= 3 && !isExpired;
    const isTodayDeadline = isToday(deadlineDate);
    
    let targetTitle = '';
    if (activeDeadline.target_month_start && activeDeadline.target_month_end) {
      try {
        const startDate = parseISO(activeDeadline.target_month_start);
        const endDate = parseISO(activeDeadline.target_month_end);
        targetTitle = `${format(startDate, 'M/d(E)', { locale: ja })}〜${format(endDate, 'M/d(E)', { locale: ja })}分`;
      } catch { targetTitle = ''; }
    }
    
    return {
      deadline: activeDeadline,
      daysLeft,
      isExpired,
      isUrgent,
      isTodayDeadline,
      targetTitle,
      deadlineDateStr: format(deadlineDate, 'M月d日', { locale: ja }),
      deadlineDayOfWeek: format(deadlineDate, 'E', { locale: ja }),
    };
  }, [activeDeadline]);

  // 全店舗の確定締切一覧（ポップオーバー用）
  const allStoreConfirmDeadlines = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return (deadlines || [])
      .filter(d => d.confirm_deadline_date && d.target_month_end >= todayStr)
      .sort((a, b) => a.confirm_deadline_date.localeCompare(b.confirm_deadline_date))
      .map(d => {
        const store = (stores || []).find(s => s.id === d.store_id);
        return { ...d, storeName: store?.store_name || '不明' };
      });
  }, [deadlines, stores]);

  if (!isAdminOrManager) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">アクセス権限がありません</h2>
          <p className="text-slate-500">このページは管理者またはマネージャーのみアクセスできます</p>
        </div>
      </div>
    );
  }

  // 週表示で月をまたぐ週のデータも含めるため、フィルタ範囲を拡張
  const monthlyRequests = shiftRequests.filter(req => {
    const reqDate = parseISO(req.date);
    const rangeStart = startOfWeek(startOfMonth(selectedMonth), { weekStartsOn: effectiveWeekStart });
    const rangeEnd = endOfWeek(endOfMonth(selectedMonth), { weekStartsOn: effectiveWeekStart });
    return reqDate >= rangeStart && reqDate <= rangeEnd;
  });

  const handleRequestClick = (request, date) => {
    setEditingRequest({ ...request, date: format(date, 'yyyy-MM-dd') });
    setEditRequestDialogOpen(true);
  };

  const handleSaveRequest = async (data) => {
    try {
      if (editingRequest?.id) {
        await updateRecord('ShiftRequest', editingRequest.id, data);
        toast.success('シフト希望を更新しました');
      }
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      setEditRequestDialogOpen(false);
      setEditingRequest(null);
    } catch (error) {
      toast.error('保存に失敗しました');
    }
  };

  const handleDeleteRequest = async (id) => {
    try {
      // 有給申請が紐付いている場合、自動取り消し
      const targetShift = shiftRequests?.find(s => s.id === id);
      if (targetShift?.is_paid_leave && targetShift?.date) {
        try {
          const existingLeave = await fetchFiltered('PaidLeaveRequest', {
            user_email: targetShift.created_by,
            date: targetShift.date,
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
      await deleteRecord('ShiftRequest', id);
      toast.success('シフト希望を削除しました');
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myPaidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      setEditRequestDialogOpen(false);
      setEditingRequest(null);
    } catch (error) {
      toast.error('削除に失敗しました');
    }
  };

  const handleOpenApplyDialog = () => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    setApplyStartDate(format(monthStart, 'yyyy-MM-dd'));
    setApplyEndDate(format(monthEnd, 'yyyy-MM-dd'));
    setApplyRequestsDialogOpen(true);
  };

  const handleApplyRequestsToShifts = async () => {
    if (!applyStartDate || !applyEndDate) {
      toast.error('期間を設定してください');
      return;
    }
    const start = parseISO(applyStartDate);
    const end = parseISO(applyEndDate);
    if (start > end) {
      toast.error('開始日は終了日より前に設定してください');
      return;
    }

    setIsApplying(true);
    try {
      // Filter requests within the specified date range
      const targetRequests = monthlyRequests.filter(req => {
        const reqDate = parseISO(req.date);
        return reqDate >= start && reqDate <= end && !req.is_day_off && !req.is_paid_leave;
      });

      if (targetRequests.length === 0) {
        toast.error('指定期間内に出勤可能なシフト希望がありません');
        setIsApplying(false);
        return;
      }

      // Check for existing work shifts in the period to avoid duplicates
      const existingShifts = workShifts.filter(ws => {
        const wsDate = parseISO(ws.date);
        return wsDate >= start && wsDate <= end;
      });

      const newShifts = [];
      for (const req of targetRequests) {
        // Skip if a work shift already exists for this user on this date
        const alreadyExists = existingShifts.some(
          ws => ws.user_email === req.created_by && ws.date === req.date
        );
        if (alreadyExists) continue;

        newShifts.push({
          date: req.date,
          user_email: req.created_by,
          start_time: req.is_full_day_available ? (stores.find(s => s.id === primaryStoreId)?.business_hours?.monday?.open || '09:00') : req.start_time,
          end_time: req.is_full_day_available ? (stores.find(s => s.id === primaryStoreId)?.business_hours?.monday?.close || '18:00') : req.end_time,
          store_id: primaryStoreId,
          is_confirmed: false,
          created_by: user?.email || '',
        });
      }

      if (newShifts.length === 0) {
        toast.info('全てのシフト希望は既にシフト表に反映済みです');
        setIsApplying(false);
        setApplyRequestsDialogOpen(false);
        return;
      }

      await insertRecords('WorkShift', newShifts);
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      toast.success(`${newShifts.length}件のシフト希望をシフト表に反映しました`);
      setApplyRequestsDialogOpen(false);
    } catch (error) {
      console.error('Apply error:', error);
      toast.error('シフト希望の反映に失敗しました: ' + error.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-40">
        <div className="w-full px-2 sm:px-4 lg:px-6 xl:px-8 py-2.5 sm:py-4">
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-base sm:text-2xl font-bold text-slate-800">シフト作成</h1>
                  <p className="text-[10px] sm:text-sm text-slate-500">確定シフトの作成・編集・管理</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ExportButton
                  data={workShifts.map(shift => ({
                    ...shift,
                    user_name: users.find(u => u.email === shift.user_email)?.metadata?.display_name || 
                              users.find(u => u.email === shift.user_email)?.full_name || 
                              shift.user_email,
                    store_name: stores.find(s => s.id === shift.store_id)?.store_name
                  }))}
                  filename={`確定シフト_${format(selectedMonth, 'yyyyMM', { locale: ja })}`}
                  type="workShifts"
                  size="sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              {/* 店舗選択 - 常に表示（1店舗でも表示） */}
              {user?.store_ids && user?.store_ids.length > 0 && (
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-slate-400" />
                  <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                    <SelectTrigger className="h-9 w-[160px] sm:w-[200px]">
                      <SelectValue placeholder="店舗を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortStoresByOrder(stores.filter(s => user?.store_ids.includes(s.id))).map(store => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.store_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1))}
                  className="rounded-full h-8 w-8"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <span className="text-base sm:text-lg font-bold text-slate-800 min-w-[100px] sm:min-w-[120px] text-center">
                  {format(selectedMonth, 'yyyy年 M月', { locale: ja })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1))}
                  className="rounded-full h-8 w-8"
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
            {/* シフト確定締切バッジ - ポップオーバー付き */}
            <div className="flex items-center">
              <Popover open={confirmDeadlinePopoverOpen} onOpenChange={setConfirmDeadlinePopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center gap-1 sm:gap-2 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl shadow-lg text-[11px] sm:text-sm transition-all font-semibold active:scale-95 w-full sm:w-auto",
                      !confirmDeadlineInfo
                        ? "bg-slate-400 hover:bg-slate-500"
                        : confirmDeadlineInfo.isExpired
                        ? "bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600"
                        : confirmDeadlineInfo.isTodayDeadline
                        ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 animate-pulse"
                        : confirmDeadlineInfo.isUrgent
                        ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                        : "bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
                    )}
                  >
                    {confirmDeadlineInfo?.isTodayDeadline ? (
                      <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    ) : (
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-1.5 text-left min-w-0">
                      {confirmDeadlineInfo?.targetTitle && (
                        <span className="opacity-90 font-medium text-[10px] sm:text-xs truncate">{confirmDeadlineInfo.targetTitle}</span>
                      )}
                      <span className="font-bold truncate">
                        {confirmDeadlineInfo ? (
                          confirmDeadlineInfo.isExpired
                            ? `確定締切切れ (${confirmDeadlineInfo.deadlineDateStr})`
                            : confirmDeadlineInfo.isTodayDeadline
                            ? `確定締切は本日！`
                            : `確定締切 ${confirmDeadlineInfo.deadlineDateStr}(${confirmDeadlineInfo.deadlineDayOfWeek})迄`
                        ) : (
                          'シフト確定締切を設定'
                        )}
                      </span>
                    </div>
                    {confirmDeadlineInfo && !confirmDeadlineInfo.isExpired && (
                      <span className="text-[10px] sm:text-xs font-bold bg-white/25 px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
                        {confirmDeadlineInfo.isTodayDeadline ? '今日' : `残り${confirmDeadlineInfo.daysLeft}日`}
                      </span>
                    )}
                    <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-70 flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0" align="start">
                  <InlineDeadlineEditor
                    deadlines={deadlines}
                    storeId={primaryStoreId}
                    storeName={selectedStore?.store_name}
                    type="confirm"
                    isAdmin={true}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-2 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-8">
        <ShiftStatistics
          workShifts={workShifts}
          users={users}
          selectedMonth={selectedMonth}
        />

        <Tabs defaultValue="edit" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 h-12 bg-slate-100 rounded-xl p-1">
            <TabsTrigger value="edit" className="rounded-lg text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">シフト編集</TabsTrigger>
            <TabsTrigger value="table" className="rounded-lg text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">シフト表</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="mt-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6">
              {/* ヘッダー：表示形式切替 + アクションボタン */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <ToggleGroup type="single" value={editViewMode} onValueChange={setEditViewMode} className="border rounded-lg p-0.5 bg-slate-50">
                      <ToggleGroupItem value="calendar" aria-label="カレンダー表示" className="h-8 px-3 text-xs font-medium data-[state=on]:bg-white data-[state=on]:shadow-sm">
                        <Grid className="w-3.5 h-3.5 mr-1.5" />
                        カレンダー
                      </ToggleGroupItem>
                      <ToggleGroupItem value="table" aria-label="テーブル表示" className="h-8 px-3 text-xs font-medium data-[state=on]:bg-white data-[state=on]:shadow-sm">
                        <List className="w-3.5 h-3.5 mr-1.5" />
                        表形式
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={handleOpenApplyDialog}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-sm h-8 text-xs font-bold"
                  >
                    <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                    シフト希望をシフト表に反映
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyShifts} className="h-8 text-xs font-medium">
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    前月コピー
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResetShifts} className="h-8 text-xs font-medium text-red-600 hover:bg-red-50 border-red-200">
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    リセット
                  </Button>
                </div>
              </div>

              {/* シフト編集エリア（フル幅） */}
              <div>
                {editViewMode === 'calendar' ? (
                  <ShiftCalendarEditor
                    selectedMonth={selectedMonth}
                    users={users}
                    workShifts={workShifts}
                    storeId={primaryStoreId}
                    store={stores.find(s => s.id === primaryStoreId)}
                    shiftRequests={monthlyRequests}
                  />
                ) : (
                  <ShiftTableView
                    selectedMonth={selectedMonth}
                    users={users}
                    workShifts={workShifts}
                    storeId={primaryStoreId}
                    store={stores.find(s => s.id === primaryStoreId)}
                    shiftRequests={monthlyRequests}
                    hideStaffSelector={true}
                  />
                )}
              </div>
            </div>

            {/* Staff Statistics */}
            <div className="mb-6">
              <UserStatisticsPanel
                users={users.filter(u => (u.user_role || u.role) === 'user')}
                workShifts={workShifts}
              />
            </div>

            {/* User Sorting */}
            <div className="mb-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <List className="w-4 h-4 text-blue-600" />
                    スタッフ並び替え
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleUserDragEnd}
                  >
                    <SortableContext
                      items={userOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-wrap gap-2">
                        {userOrder.map(id => {
                          const user = users.find(u => u.id === id);
                          if (!user) return null;
                          return (
                            <SortableUserItem
                              key={user.id}
                              id={user.id}
                              user={user}
                              isSelected={false}
                              onSelect={() => {}}
                            />
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <p className="text-[10px] text-slate-400 mt-3 text-center">
                    ドラッグして並び替えると、表やグラフの順序が更新されます
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setOpenDialog('template')}
                className="flex flex-col items-center gap-2 py-5 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200">
                  <Layout className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-bold text-slate-700">テンプレート</span>
              </button>
              
              <button
                onClick={() => setOpenDialog('auto')}
                className="flex flex-col items-center gap-2 py-5 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-200 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-200">
                  <Wand2 className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-bold text-slate-700">自動生成</span>
              </button>
              
              <button
                onClick={() => setOpenDialog('ai')}
                className="flex flex-col items-center gap-2 py-5 px-8 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-200 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-bold text-slate-700">AI シフト提案</span>
              </button>
            </div>

            {/* Dialogs */}
            <Dialog open={openDialog === 'template'} onOpenChange={(open) => !open && setOpenDialog(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>テンプレート管理</DialogTitle>
                </DialogHeader>
                <ShiftTemplateManager templates={templates} storeId={primaryStoreId} />
              </DialogContent>
            </Dialog>

            <Dialog open={openDialog === 'auto'} onOpenChange={(open) => !open && setOpenDialog(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>シフト自動生成</DialogTitle>
                </DialogHeader>
                <AutoGenerateShift
                  selectedMonth={selectedMonth}
                  users={users}
                  templates={templates}
                  shiftRequests={monthlyRequests}
                  storeId={primaryStoreId}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={openDialog === 'ai'} onOpenChange={(open) => !open && setOpenDialog(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>AI シフト提案</DialogTitle>
                </DialogHeader>
                <AIShiftSuggestion
                  store={stores.find(s => s.id === primaryStoreId)}
                  targetMonth={selectedMonth}
                  users={users}
                  shiftRequests={monthlyRequests}
                />
              </DialogContent>
            </Dialog>

            <ShiftRequestEditDialog
              open={editRequestDialogOpen}
              onOpenChange={setEditRequestDialogOpen}
              request={editingRequest}
              onSave={handleSaveRequest}
              onDelete={handleDeleteRequest}
            />

            {/* Apply Shift Requests to Work Shifts Dialog */}
            <Dialog open={applyRequestsDialogOpen} onOpenChange={setApplyRequestsDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    シフト希望をシフト表に反映
                  </DialogTitle>
                  <DialogDescription>
                    シフト希望の内容（出勤可能な日のみ）をシフト表に一括反映します。反映する期間を設定してください。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="apply-start" className="text-sm font-medium">開始日</Label>
                      <Input
                        id="apply-start"
                        type="date"
                        value={applyStartDate}
                        onChange={(e) => setApplyStartDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="apply-end" className="text-sm font-medium">終了日</Label>
                      <Input
                        id="apply-end"
                        type="date"
                        value={applyEndDate}
                        onChange={(e) => setApplyEndDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                    <p className="font-medium mb-1">反映対象:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>出勤可能なシフト希望（休み希望・有給希望は除外）</li>
                      <li>基本シフト設定から自動生成されたシフト希望も含む</li>
                      <li>既にシフト表に存在するユーザー・日付の組み合わせはスキップ</li>
                    </ul>
                  </div>
                  {applyStartDate && applyEndDate && (() => {
                    const start = parseISO(applyStartDate);
                    const end = parseISO(applyEndDate);
                    if (start > end) return null;
                    const count = monthlyRequests.filter(req => {
                      const reqDate = parseISO(req.date);
                      return reqDate >= start && reqDate <= end && !req.is_day_off && !req.is_paid_leave;
                    }).length;
                    return (
                      <div className="bg-slate-50 rounded-lg p-3 text-sm">
                        <span className="text-slate-600">反映対象: </span>
                        <span className="font-bold text-green-700">{count}件</span>
                        <span className="text-slate-500">のシフト希望</span>
                      </div>
                    );
                  })()}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setApplyRequestsDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleApplyRequestsToShifts}
                    disabled={isApplying}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isApplying ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        反映中...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        反映する
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Reset Shifts Dialog */}
            <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                    <RotateCcw className="w-5 h-5" />
                    シフト表リセット
                  </DialogTitle>
                  <DialogDescription>
                    シフト表のシフトを削除します。対象ユーザーと期間を選択してください。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="reset-start" className="text-sm font-medium">開始日</Label>
                      <Input
                        id="reset-start"
                        type="date"
                        value={resetStartDate}
                        onChange={(e) => setResetStartDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="reset-end" className="text-sm font-medium">終了日</Label>
                      <Input
                        id="reset-end"
                        type="date"
                        value={resetEndDate}
                        onChange={(e) => setResetEndDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* ユーザー選択 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-slate-500" />
                        対象ユーザー
                      </Label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setResetSelectedUsers(resetTargetUsers.map(u => u.email))}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          全選択
                        </button>
                        <span className="text-xs text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setResetSelectedUsers([])}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          全解除
                        </button>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
                      {resetTargetUsers.map(u => {
                        const isChecked = resetSelectedUsers.includes(u.email);
                        return (
                          <label
                            key={u.email}
                            className={cn(
                              "flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer",
                              u.isDeleted && "bg-red-50/50"
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setResetSelectedUsers(prev => [...prev, u.email]);
                                } else {
                                  setResetSelectedUsers(prev => prev.filter(e => e !== u.email));
                                }
                              }}
                            />
                            <span className={cn("text-sm", u.isDeleted ? "text-red-500" : "text-slate-700")}>
                              {u.displayName}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {resetSelectedUsers.length}/{resetTargetUsers.length}人 選択中
                    </p>
                  </div>

                  <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
                    <p className="font-medium mb-1">注意:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>選択したユーザーのシフト表のシフトのみ削除されます</li>
                      <li>シフト希望は削除されません</li>
                      <li>この操作は元に戻せません</li>
                    </ul>
                  </div>
                  {resetStartDate && resetEndDate && (() => {
                    const start = parseISO(resetStartDate);
                    const end = parseISO(resetEndDate);
                    if (start > end) return null;
                    const count = workShifts.filter(ws => {
                      const wsDate = parseISO(ws.date);
                      return wsDate >= start && wsDate <= end && resetSelectedUsers.includes(ws.user_email);
                    }).length;
                    return (
                      <div className="bg-slate-50 rounded-lg p-3 text-sm">
                        <span className="text-slate-600">削除対象: </span>
                        <span className="font-bold text-red-700">{count}件</span>
                        <span className="text-slate-500">のシフト（{resetSelectedUsers.length}人分）</span>
                      </div>
                    );
                  })()}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleExecuteReset}
                    disabled={isResetting || resetSelectedUsers.length === 0}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isResetting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        削除中...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        リセットする
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="table" className="mt-4 sm:mt-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 sm:p-6">
              <ShiftTableView
                selectedMonth={selectedMonth}
                users={users}
                workShifts={workShifts}
                storeId={primaryStoreId}
                store={stores.find(s => s.id === primaryStoreId)}
                shiftRequests={monthlyRequests}
                hideStaffSelector={true}
              />
              {/* シフト確定ボタン */}
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={() => setShiftConfirmDialogOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2"
                  disabled={workShifts.length === 0}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  シフト確定
                </Button>
              </div>
            </div>
            <div className="mt-6">
              <UserStatisticsPanel
                users={users.filter(u => (u.user_role || u.role) === 'user')}
                workShifts={workShifts}
              />
            </div>

            {/* シフト確定連絡ダイアログ */}
            <ShiftConfirmDialog
              open={shiftConfirmDialogOpen}
              onOpenChange={setShiftConfirmDialogOpen}
              selectedMonth={selectedMonth}
              users={users}
              workShifts={workShifts}
              store={stores.find(s => s.id === primaryStoreId)}
              currentViewMode={sessionStorage.getItem('shiftTableViewMode') || 'month'}
            />
          </TabsContent>
        </Tabs>
      </main>


    </div>
  );
}