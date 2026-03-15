import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay, parseISO, startOfMonth, startOfDay, endOfMonth, eachDayOfInterval, addDays, addWeeks, addMonths, differenceInDays, isPast, isToday, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import { CalendarCheck, Sparkles, Copy, Repeat, Store, Trash2, Settings, Clock, Edit3, Calendar, CheckCircle, AlertCircle, ChevronRight, Plus, RefreshCw, Activity, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import ShiftCalendar from '@/components/shift/ShiftCalendar';
import ShiftForm from '@/components/shift/ShiftForm';
import ShiftList from '@/components/shift/ShiftList';
import ShiftCopyDialog from '@/components/shift/ShiftCopyDialog';
import ShiftResetDialog from '@/components/shift/ShiftResetDialog';
import RepeatShiftDialog from '@/components/shift/RepeatShiftDialog';
import InlineDeadlineEditor from '@/components/shift/InlineDeadlineEditor';
import { fetchAll, fetchFiltered, insertRecord, insertRecords, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { sortStoresByOrder } from '@/lib/storeOrder';
import { supabase as supabaseClient } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [repeatDialogOpen, setRepeatDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState(null);
  const [deadlineDialogMode, setDeadlineDialogMode] = useState('add');
  const queryClient = useQueryClient();

  const { user } = useAuth();

  // Fetch stores
  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      return sortStoresByOrder(allStores);
    },
  });

  // Initialize selected store (with fallback to first available store, sorted order)
  useEffect(() => {
    if (selectedStoreId) return;
    if (stores.length > 0) {
      // Use first store from sorted list (respects store settings order)
      const userStores = stores.filter(s => user?.store_ids?.includes(s.id));
      if (userStores.length > 0) {
        setSelectedStoreId(userStores[0].id);
      } else if (stores.length > 0) {
        setSelectedStoreId(stores[0].id);
      }
    }
  }, [user, stores, selectedStoreId]);

  // Fetch shift deadlines
  const { data: deadlines = [] } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
  });

  // Fetch app settings
  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => fetchAll('AppSettings'),
  });

  // Fetch events (通常イベント + 定期イベント)
  const { data: rawEvents = { normalEvents: [], recurringEvents: [] } } = useQuery({
    queryKey: ['events', selectedStoreId, format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const monthStartStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const monthEndStr = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      
      // 通常イベント: 当月に重なるイベント
      const { data: normalEvents } = await supabaseClient
        .from('Events')
        .select('*')
        .or('is_recurring.is.null,is_recurring.eq.false')
        .lte('event_date', monthEndStr)
        .or(`event_end_date.gte.${monthStartStr},event_end_date.is.null,event_date.gte.${monthStartStr}`)
        .order('event_date', { ascending: true });
      
      // 定期イベント: 開始日が当月末以前のもの全て
      const { data: recurringEvents } = await supabaseClient
        .from('Events')
        .select('*')
        .eq('is_recurring', true)
        .lte('event_date', monthEndStr)
        .order('event_date', { ascending: true });
      
      const filterByStore = (evts) => (evts || []).filter(e => e.all_stores || !e.store_id || (selectedStoreId && e.store_id === selectedStoreId));
      return { normalEvents: filterByStore(normalEvents), recurringEvents: filterByStore(recurringEvents) };
    },
    enabled: !!selectedStoreId,
  });

  // 定期イベントのインスタンスを生成してマージ
  const events = useMemo(() => {
    const { normalEvents = [], recurringEvents = [] } = rawEvents;
    const monthStartDate = startOfMonth(currentMonth);
    const monthEndDate = endOfMonth(currentMonth);
    
    let allEvents = [...normalEvents];
    
    recurringEvents.forEach(event => {
      const startDate = parseISO(event.event_date);
      const endDate = event.recurrence_end_date ? parseISO(event.recurrence_end_date) : addMonths(monthEndDate, 12);
      const pattern = event.recurrence_pattern;
      if (!pattern) return;
      
      if (pattern === 'weekly' || pattern === 'biweekly') {
        const dayOfWeek = event.recurrence_day_of_week != null ? event.recurrence_day_of_week : getDay(startDate);
        const weekInterval = pattern === 'biweekly' ? 2 : 1;
        let current = startDate;
        const diff = dayOfWeek - getDay(current);
        if (diff > 0) current = addDays(current, diff);
        else if (diff < 0) current = addDays(current, diff + 7);
        while (current <= endDate && current <= monthEndDate) {
          if (current >= monthStartDate && current <= monthEndDate) {
            allEvents.push({ ...event, id: `${event.id}-recurring-${format(current, 'yyyy-MM-dd')}`, event_date: format(current, 'yyyy-MM-dd'), event_end_date: null, _isRecurringInstance: true, _parentId: event.id });
          }
          current = addWeeks(current, weekInterval);
        }
      } else if (pattern === 'monthly_date') {
        const dayOfMonth = startDate.getDate();
        let current = new Date(monthStartDate.getFullYear(), monthStartDate.getMonth(), dayOfMonth);
        if (current < startDate) current = addMonths(current, 1);
        while (current <= endDate && current <= monthEndDate) {
          if (current >= monthStartDate && current.getDate() === dayOfMonth) {
            allEvents.push({ ...event, id: `${event.id}-recurring-${format(current, 'yyyy-MM-dd')}`, event_date: format(current, 'yyyy-MM-dd'), event_end_date: null, _isRecurringInstance: true, _parentId: event.id });
          }
          current = addMonths(current, 1);
          current = new Date(current.getFullYear(), current.getMonth(), Math.min(dayOfMonth, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
        }
      } else if (pattern === 'monthly_week') {
        const dayOfWeek = event.recurrence_day_of_week != null ? event.recurrence_day_of_week : getDay(startDate);
        const weekOfMonth = event.recurrence_week_of_month || Math.ceil(startDate.getDate() / 7);
        let checkMonth = new Date(monthStartDate.getFullYear(), monthStartDate.getMonth(), 1);
        while (checkMonth <= endDate && checkMonth <= monthEndDate) {
          let firstOfMonth = new Date(checkMonth.getFullYear(), checkMonth.getMonth(), 1);
          const d = dayOfWeek - getDay(firstOfMonth);
          let firstDayOfWeek = d >= 0 ? addDays(firstOfMonth, d) : addDays(firstOfMonth, d + 7);
          const targetDate = addWeeks(firstDayOfWeek, weekOfMonth - 1);
          if (targetDate.getMonth() === checkMonth.getMonth() && targetDate >= startDate && targetDate >= monthStartDate && targetDate <= monthEndDate && targetDate <= endDate) {
            allEvents.push({ ...event, id: `${event.id}-recurring-${format(targetDate, 'yyyy-MM-dd')}`, event_date: format(targetDate, 'yyyy-MM-dd'), event_end_date: null, _isRecurringInstance: true, _parentId: event.id });
          }
          checkMonth = addMonths(checkMonth, 1);
        }
      }
    });
    
    allEvents.sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
    return allEvents;
  }, [rawEvents, currentMonth]);

  // Fetch all users for display (MUST be before shiftRequests)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => fetchAll('User'),
  });

  // Fetch paid leave requests for current user
  const { data: myPaidLeaveRequests = [] } = useQuery({
    queryKey: ['myPaidLeaveRequests', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const data = await fetchFiltered('PaidLeaveRequest', { user_email: user.email });
      return (data || []).filter(r => r.status === 'approved' || r.status === 'pending');
    },
    enabled: !!user?.email,
  });

  // Fetch shift requests for current month
  const { data: shiftRequests = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['shiftRequests', user?.email, selectedStoreId, format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      if (!user?.email || !selectedStoreId) return [];
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');
      const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
      
      const data = await fetchFiltered('ShiftRequest', {
        created_by: user.email,
        store_id: selectedStoreId,
      });
      
      const existingShifts = (data || []).filter(s => s.date >= monthStartStr && s.date <= monthEndStr);
      
      // Use cached allUsers data instead of fetching again
      const userProfile = (allUsers || []).find(u => u.email === user.email);
      const defaultSettings = userProfile?.default_shift_settings || user?.default_shift_settings;

      if (defaultSettings) {
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const dayMap = {
          0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
        };
        
        const defaultShifts = [];
        days.forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          // Skip if already has a shift request
          if (existingShifts.some(s => s.date === dateStr)) return;
          
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
                defaultShifts.push({
                  id: `default-${dateStr}`,
                  date: dateStr,
                  start_time: weekSetting.is_day_off ? null : weekSetting.start_time,
                  end_time: weekSetting.is_day_off ? null : weekSetting.end_time,
                  is_day_off: weekSetting.is_day_off,
                  notes: weekSetting.notes,
                  is_default: true
                });
              }
            } else {
              // Legacy format fallback
              const allowedWeeks = setting.weeks || [1, 2, 3, 4, 5];
              if (allowedWeeks.includes(weekOfMonth)) {
                defaultShifts.push({
                  id: `default-${dateStr}`,
                  date: dateStr,
                  start_time: setting.is_day_off ? null : setting.start_time,
                  end_time: setting.is_day_off ? null : setting.end_time,
                  is_day_off: setting.is_day_off,
                  notes: setting.notes,
                  is_default: true
                });
              }
            }
          }
        });
        
        return [...existingShifts, ...defaultShifts];
      }
      
      return existingShifts;
    },
    enabled: !!user?.email && !!selectedStoreId,
  });

  const isAdmin = user?.user_role === 'admin' || user?.role === 'admin';
  const isManager = user?.user_role === 'manager';
  const isAdminOrManager = isAdmin || isManager;

  // Check if a date is locked by deadline or past date
  const isDateLocked = (dateStr) => {
    if (isAdmin) return false; // Admin can always edit
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDateObj = parseISO(dateStr);
    targetDateObj.setHours(0, 0, 0, 0);
    
    // Past dates: notes-only mode (can only add notes)
    if (targetDateObj < today) {
      return 'notes-only';
    }
    
    // Find relevant deadline for this date
    const relevantDeadline = (deadlines || []).find(d => 
      d.store_id === selectedStoreId &&
      d.target_month_start <= dateStr &&
      d.target_month_end >= dateStr
    );
    
    if (!relevantDeadline) return false;
    
    const deadlineDate = parseISO(relevantDeadline.deadline_date);
    deadlineDate.setHours(0, 0, 0, 0);
    
    // After deadline: notes-only mode (can only add notes)
    if (today > deadlineDate) {
      return 'notes-only';
    }
    return false;
  };

  // Save shift
  const saveMutation = useMutation({
    mutationFn: async (shiftData) => {
      const existing = (shiftRequests || []).find(s => s.date === shiftData.date && !s.is_default);
      let result;
      if (existing) {
        result = await updateRecord('ShiftRequest', existing.id, shiftData);
      } else {
        result = await insertRecord('ShiftRequest', {
          ...shiftData,
          store_id: selectedStoreId,
          created_by: user?.email,
        });
      }

      // 有給申請予定チェック時: PaidLeaveRequestを自動作成
      if (shiftData.is_paid_leave && shiftData.is_day_off) {
        try {
          // 既存の同日有給申請を確認
          const existingLeave = await fetchFiltered('PaidLeaveRequest', {
            user_email: user?.email,
            date: shiftData.date,
          });
          if (!existingLeave || existingLeave.length === 0) {
            await insertRecord('PaidLeaveRequest', {
              user_email: user?.email,
              date: shiftData.date,
              status: 'pending',
              notes: shiftData.notes || 'シフト希望より有給申請',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.warn('有給申請の自動作成に失敗:', e);
        }
      } else if (!shiftData.is_paid_leave && shiftData.is_day_off) {
        // 有給チェックを外した場合: pending状態の有給申請を削除
        try {
          const existingLeave = await fetchFiltered('PaidLeaveRequest', {
            user_email: user?.email,
            date: shiftData.date,
          });
          if (existingLeave && existingLeave.length > 0) {
            const pendingLeave = existingLeave.find(l => l.status === 'pending');
            if (pendingLeave) {
              await deleteRecord('PaidLeaveRequest', pendingLeave.id);
            }
          }
        } catch (e) {
          console.warn('有給申請の自動削除に失敗:', e);
        }
      }

      return result;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myPaidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      if (variables.is_paid_leave) {
        toast.success('シフト希望を保存し、有給申請を提出しました');
      } else {
        toast.success('シフト希望を保存しました');
      }
      setShowFormDialog(false);
    },
    onError: (error) => {
      toast.error('保存に失敗しました: ' + error.message);
    },
  });

  // Delete shift
  const deleteMutation = useMutation({
    mutationFn: async (shiftId) => {
      // 削除対象のシフトを取得
      const targetShift = (shiftRequests || []).find(s => s.id === shiftId);
      
      // シフト希望を削除
      await deleteRecord('ShiftRequest', shiftId);
      
      // 有給申請が紐付いている場合、自動取り消し
      if (targetShift?.is_paid_leave && targetShift?.date && user?.email) {
        try {
          const existingLeave = await fetchFiltered('PaidLeaveRequest', {
            user_email: user.email,
            date: targetShift.date,
          });
          if (existingLeave && existingLeave.length > 0) {
            // pendingまたはapproved状態の有給申請を取り消し
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myPaidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      setSelectedDate(null);
      toast.success('シフト希望を削除しました');
      setShowFormDialog(false);
    },
    onError: (error) => {
      toast.error('削除に失敗しました: ' + error.message);
    },
  });

  const handleSaveShift = (shiftData) => {
    const lockStatus = isDateLocked(shiftData.date);
    if (lockStatus === true) {
      toast.error('提出期限を過ぎているため編集できません');
      return;
    }
    // notes-onlyモードの場合もsaveMutationを通す（備考のみ更新）
    saveMutation.mutate(shiftData);
  };

  const handleDeleteShift = (shiftId) => {
    const shift = (shiftRequests || []).find(s => s.id === shiftId && !s.is_default);
    if (shift) {
      const lockStatus = isDateLocked(shift.date);
      if (lockStatus === true) {
        toast.error('提出期限を過ぎているため削除できません');
        return;
      }
      deleteMutation.mutate(shiftId);
    }
  };

  // Get active deadline for current month
  const getActiveDeadline = () => {
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    
    return (deadlines || []).find(d => 
      d.store_id === selectedStoreId &&
      d.target_month_start <= monthStart &&
      d.target_month_end >= monthStart
    );
  };

  const activeDeadline = getActiveDeadline();

  // Get simple deadline setting for current store
  const getSimpleDeadline = () => {
    return (appSettings || []).find(s => 
      s.setting_key === 'submission_deadline' && 
      s.store_id === selectedStoreId
    );
  };

  const simpleDeadline = getSimpleDeadline();


  // 直近の締切情報を計算（全店舗対象）
  const nearestDeadlineInfo = useMemo(() => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    
    // 現在の店舗の直近の未来の締切を取得
    const upcomingDeadlines = (deadlines || [])
      .filter(d => d.store_id === selectedStoreId && d.deadline_date >= todayStr)
      .sort((a, b) => a.deadline_date.localeCompare(b.deadline_date));
    
    const nearest = upcomingDeadlines[0] || activeDeadline;
    if (!nearest) return null;
    
    const deadlineDate = parseISO(nearest.deadline_date);
    const daysLeft = differenceInDays(startOfDay(deadlineDate), startOfDay(today));
    const isExpired = isPast(deadlineDate) && !isToday(deadlineDate);
    const isUrgent = daysLeft <= 3 && !isExpired;
    const isTodayDeadline = isToday(deadlineDate);
    
    // 対象期間のタイトルを生成（実際の対象期間を表示）
    let targetTitle = '';
    if (nearest.target_month_start && nearest.target_month_end) {
      try {
        const startDate = parseISO(nearest.target_month_start);
        const endDate = parseISO(nearest.target_month_end);
        targetTitle = `${format(startDate, 'M/d(E)', { locale: ja })}〜${format(endDate, 'M/d(E)', { locale: ja })}分`;
      } catch { targetTitle = ''; }
    } else if (nearest.description) {
      targetTitle = nearest.description;
    }
    
    return {
      deadline: nearest,
      daysLeft,
      isExpired,
      isUrgent,
      isTodayDeadline,
      targetTitle,
      deadlineDateStr: format(deadlineDate, 'M月d日', { locale: ja }),
      deadlineDayOfWeek: format(deadlineDate, 'E', { locale: ja }),
    };
  }, [deadlines, selectedStoreId, activeDeadline]);

  // 選択中の店舗の期限一覧（ポップオーバー用）
  const allStoreDeadlines = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return (deadlines || [])
      .filter(d => d.store_id === selectedStoreId && d.target_month_end >= todayStr)
      .sort((a, b) => a.deadline_date.localeCompare(b.deadline_date))
      .map(d => {
        const store = (stores || []).find(s => s.id === d.store_id);
        return { ...d, storeName: store?.store_name || '不明' };
      });
  }, [deadlines, stores, selectedStoreId]);

  // Copy shifts with period specification
  const handleCopyShifts = async (sourceStart, sourceEnd, targetStart, targetEnd) => {
    try {
      const sourceStartDate = parseISO(sourceStart);
      const targetStartDate = parseISO(targetStart);

      // Fetch source shifts
      const sourceShifts = await fetchFiltered('ShiftRequest', {
        created_by: user?.email,
        store_id: selectedStoreId,
      });
      const filteredSourceShifts = (sourceShifts || []).filter(s => s.date >= sourceStart && s.date <= sourceEnd);

      if (filteredSourceShifts.length === 0) {
        toast.error('コピー元にシフトがありません');
        return;
      }

      const daysDiff = Math.round((targetStartDate - sourceStartDate) / (1000 * 60 * 60 * 24));
      const newShifts = filteredSourceShifts.map(shift => {
        const shiftDate = parseISO(shift.date);
        const newDate = addDays(shiftDate, daysDiff);
        const newDateStr = format(newDate, 'yyyy-MM-dd');
        return {
          date: newDateStr,
          start_time: shift.start_time,
          end_time: shift.end_time,
          is_day_off: shift.is_day_off,
          is_paid_leave: shift.is_paid_leave,
          is_full_day_available: shift.is_full_day_available,
          notes: shift.notes,
          additional_times: shift.additional_times || [],
          store_id: selectedStoreId,
          created_by: user?.email,
        };
      }).filter(s => s.date >= targetStart && s.date <= targetEnd);

      if (newShifts.length > 0) {
        await insertRecords('ShiftRequest', newShifts);
        queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
        toast.success(`${newShifts.length}件のシフトをコピーしました`);
        setCopyDialogOpen(false);
      } else {
        toast.error('コピー先の期間に該当するシフトがありません');
      }
    } catch (error) {
      console.error('Copy error:', error);
      toast.error('コピーに失敗しました');
    }
  };

  // Reset shifts for a period
  const handleResetShifts = async (startDate, endDate) => {
    try {
      const shiftsToDelete = (shiftRequests || []).filter(s => 
        s.date >= startDate && 
        s.date <= endDate &&
        !s.is_default
      );

      if (shiftsToDelete.length === 0) {
        toast.error('削除するシフトがありません');
        return;
      }

      for (const shift of shiftsToDelete) {
        // 有給申請が紐付いている場合、自動取り消し
        if (shift.is_paid_leave && user?.email) {
          try {
            const existingLeave = await fetchFiltered('PaidLeaveRequest', {
              user_email: user.email,
              date: shift.date,
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
        await deleteRecord('ShiftRequest', shift.id);
      }
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myPaidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      toast.success(`${shiftsToDelete.length}件のシフトを削除しました`);;
      setResetDialogOpen(false);
    } catch (error) {
      console.error('Reset error:', error);
      toast.error('削除に失敗しました');
    }
  };

  // Repeat shift pattern
  const handleRepeatShift = async (sourceDate, targetDates) => {
    try {
      const sourceShift = (shiftRequests || []).find(s => s.date === sourceDate && !s.is_default);
      
      if (!sourceShift) {
        toast.error('コピー元のシフトがありません');
        return;
      }

      const newShifts = targetDates.map(date => ({
        date,
        start_time: sourceShift.start_time,
        end_time: sourceShift.end_time,
        is_day_off: sourceShift.is_day_off,
        is_paid_leave: sourceShift.is_paid_leave,
        is_full_day_available: sourceShift.is_full_day_available,
        notes: sourceShift.notes,
        additional_times: sourceShift.additional_times || [],
        store_id: selectedStoreId,
        created_by: user?.email,
      }));

      await insertRecords('ShiftRequest', newShifts);
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      toast.success(`${newShifts.length}件のシフトを登録しました`);
      setRepeatDialogOpen(false);
    } catch (error) {
      console.error('Repeat error:', error);
      toast.error('登録に失敗しました');
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setShowFormDialog(true);
  };

  const selectedShift = selectedDate 
    ? (shiftRequests || []).find(s => s.date === format(selectedDate, 'yyyy-MM-dd'))
    : null;

  const lockStatus = selectedDate ? isDateLocked(format(selectedDate, 'yyyy-MM-dd')) : false;

  // Safe filtered lists for ShiftList
  const nonDefaultShifts = (shiftRequests || []).filter(s => !s.is_default);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 flex-shrink-0">
                <CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl font-bold text-slate-800 truncate">シフト希望提出</h1>
                <p className="text-xs sm:text-sm text-slate-500 truncate">
                  {user?.metadata?.display_name || user?.display_name || user?.full_name || user?.email || ''}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">

            </div>
          </div>

          {/* 提出期限バッジ - 改善版 */}
          {(nearestDeadlineInfo || (simpleDeadline && !activeDeadline)) && (
            <div className="mt-2 sm:mt-2.5">
              <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center gap-1 sm:gap-2 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl shadow-lg text-[11px] sm:text-sm transition-all active:scale-95 w-full sm:w-auto",
                      nearestDeadlineInfo?.isExpired
                        ? "bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600"
                        : nearestDeadlineInfo?.isTodayDeadline
                        ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 animate-pulse"
                        : nearestDeadlineInfo?.isUrgent
                        ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                        : "bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                    )}
                  >
                    {nearestDeadlineInfo?.isTodayDeadline ? (
                      <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-1.5 text-left min-w-0">
                      {nearestDeadlineInfo?.targetTitle && (
                        <span className="opacity-90 font-medium text-[10px] sm:text-xs truncate">{nearestDeadlineInfo.targetTitle}</span>
                      )}
                      <span className="font-bold truncate">
                        {nearestDeadlineInfo ? (
                          nearestDeadlineInfo.isExpired
                            ? `期限切れ (${nearestDeadlineInfo.deadlineDateStr})`
                            : nearestDeadlineInfo.isTodayDeadline
                            ? `シフト期限は本日！`
                            : `シフト期限 ${nearestDeadlineInfo.deadlineDateStr}(${nearestDeadlineInfo.deadlineDayOfWeek})迄`
                        ) : (
                          `期限: ${simpleDeadline?.setting_value || ''}`
                        )}
                      </span>
                    </div>
                    {nearestDeadlineInfo && !nearestDeadlineInfo.isExpired && (
                      <span className="text-[10px] sm:text-xs font-bold bg-white/25 px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
                        {nearestDeadlineInfo.isTodayDeadline ? '今日' : `残り${nearestDeadlineInfo.daysLeft}日`}
                      </span>
                    )}
                    <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-70 flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0" align="start">
                  <InlineDeadlineEditor
                    deadlines={deadlines}
                    storeId={selectedStoreId}
                    storeName={(stores || []).find(s => s.id === selectedStoreId)?.store_name}
                    type="submission"
                    isAdmin={isAdminOrManager}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Store Selector - 常に表示（1店舗でも表示） */}
          {stores.length > 0 && (
            <div className="mt-2.5 sm:mt-4 flex items-center gap-2 sm:gap-3">
              <Store className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 flex-shrink-0" />
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger className="w-full sm:w-64 bg-white">
                  <SelectValue placeholder="店舗を選択" />
                </SelectTrigger>
                <SelectContent>
                  {sortStoresByOrder(stores).map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">

        {/* 生産性管理メニュー */}
        <div className="mb-4 sm:mb-6 space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground px-1 mb-2">生産性管理</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <a
              href="#/productivity-dashboard"
              className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-md hover:shadow-lg hover:from-indigo-600 hover:to-purple-700 transition-all group text-white"
            >
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">リアルタイム</p>
                <p className="text-xs text-white/80 truncate">売上・稼働をリアルタイム監視</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform flex-shrink-0" />
            </a>
            <a
              href="#/productivity-history"
              className="flex items-center gap-3 p-3 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all group text-white"
            >
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">過去実績</p>
                <p className="text-xs text-white/80 truncate">日別・店舗別の過去データ</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform flex-shrink-0" />
            </a>
            <a
              href="#/comparison-analysis"
              className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl shadow-md hover:shadow-lg hover:from-amber-600 hover:to-orange-700 transition-all group text-white"
            >
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">比較分析</p>
                <p className="text-xs text-white/80 truncate">昨対比較・売上分析</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform flex-shrink-0" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <ShiftCalendar
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              shiftRequests={shiftRequests || []}
              onSelectDate={handleDateSelect}
              selectedDate={selectedDate}
              enableQuickEntry={false}
              storeId={selectedStoreId}
              paidLeaveRequests={myPaidLeaveRequests}
              events={events}
            />

            {/* Action Buttons */}
            <div className="mt-3 sm:mt-4 flex flex-wrap gap-2 sm:gap-3">
              <Button
                onClick={() => setCopyDialogOpen(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                期間コピー
              </Button>
              <Button
                onClick={() => setRepeatDialogOpen(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Repeat className="w-4 h-4" />
                繰り返し登録
              </Button>
              <Button
                onClick={() => setResetDialogOpen(true)}
                variant="outline"
                className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                期間削除
              </Button>

            </div>
          </div>

          {/* Shift List Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                {format(currentMonth, 'yyyy年M月', { locale: ja })}のシフト
              </h2>
              <ShiftList
                shiftRequests={nonDefaultShifts}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setShowFormDialog(true);
                }}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Shift Form Dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide p-4 sm:p-6 md:p-8" aria-describedby={undefined}>
          <DialogTitle className="sr-only">シフト希望入力</DialogTitle>
          {selectedDate && (
            <ShiftForm
              date={selectedDate}
              shift={selectedShift}
              onSubmit={handleSaveShift}
              onDelete={selectedShift && !selectedShift.is_default ? () => handleDeleteShift(selectedShift.id) : undefined}
              onCancel={() => setShowFormDialog(false)}
              canEdit={lockStatus !== true}
              notesOnlyMode={lockStatus === 'notes-only'}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Copy Dialog */}
      {copyDialogOpen && (
        <ShiftCopyDialog
          open={copyDialogOpen}
          onOpenChange={setCopyDialogOpen}
          onCopy={handleCopyShifts}
          currentMonth={currentMonth}
        />
      )}

      {/* Reset Dialog */}
      {resetDialogOpen && (
        <ShiftResetDialog
          open={resetDialogOpen}
          onOpenChange={setResetDialogOpen}
          onReset={handleResetShifts}
          currentMonth={currentMonth}
        />
      )}

      {/* Repeat Dialog */}
      {repeatDialogOpen && (
        <RepeatShiftDialog
          open={repeatDialogOpen}
          onOpenChange={setRepeatDialogOpen}
          onRepeat={handleRepeatShift}
          shifts={nonDefaultShifts}
        />
      )}


    </div>
  );
}
