import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { differenceInMinutes, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from 'date-fns';
import { notifyWorkHoursExceeded, notifyOvertimeExceeded, notifyDeadlineReminder, notifyStaffShortage } from './NotificationSystem';
import { fetchAll, fetchFiltered } from '@/api/supabaseHelpers';

// バックグラウンドで動作する通知モニター
export default function NotificationMonitor({ user }) {
  const { data: workShifts = [] } = useQuery({
    queryKey: ['workShifts'],
    queryFn: () => fetchAll('WorkShift'),
    refetchInterval: 300000, // 5分ごとにチェック
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: () => fetchAll('Store'),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => fetchAll('User'),
  });

  const { data: shiftDeadlines = [] } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
  });

  const { data: userPreferences } = useQuery({
    queryKey: ['notificationPreferences', user?.email],
    queryFn: async () => {
      const settings = await fetchFiltered('AppSettings', {
        setting_key: 'notification_preferences',
        store_id: user?.email
      });
      return settings[0] ? JSON.parse(settings[0].setting_value) : null;
    },
  });

  // 勤務時間チェック
  useEffect(() => {
    if (!user || !userPreferences?.enable_work_hours_alert) return;

    const myShifts = workShifts.filter(s => s.user_email === user?.email);
    
    // 週の勤務時間チェック
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const weekShifts = myShifts.filter(s => {
      const date = parseISO(s.date);
      return date >= weekStart && date <= weekEnd;
    });

    let weekHours = 0;
    weekShifts.forEach(shift => {
      const start = parseISO(`${shift.date}T${shift.start_time}`);
      const end = parseISO(`${shift.date}T${shift.end_time}`);
      weekHours += differenceInMinutes(end, start) / 60;
    });

    if (weekHours > userPreferences.max_work_hours_per_week) {
      notifyWorkHoursExceeded({
        userEmail: user?.email,
        hours: weekHours.toFixed(1),
        limit: userPreferences.max_work_hours_per_week,
        period: '今週'
      });
    }

    // 月の勤務時間チェック
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const monthShifts = myShifts.filter(s => {
      const date = parseISO(s.date);
      return date >= monthStart && date <= monthEnd;
    });

    let monthHours = 0;
    monthShifts.forEach(shift => {
      const start = parseISO(`${shift.date}T${shift.start_time}`);
      const end = parseISO(`${shift.date}T${shift.end_time}`);
      monthHours += differenceInMinutes(end, start) / 60;
    });

    if (monthHours > userPreferences.max_work_hours_per_month) {
      notifyWorkHoursExceeded({
        userEmail: user?.email,
        hours: monthHours.toFixed(1),
        limit: userPreferences.max_work_hours_per_month,
        period: '今月'
      });
    }
  }, [workShifts, user, userPreferences]);

  // 残業時間チェック
  useEffect(() => {
    if (!user || !userPreferences?.enable_overtime_alert) return;

    const myShifts = workShifts.filter(s => s.user_email === user?.email);
    
    // 週の残業時間
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const weekShifts = myShifts.filter(s => {
      const date = parseISO(s.date);
      return date >= weekStart && date <= weekEnd;
    });

    let weekOvertime = 0;
    weekShifts.forEach(shift => {
      const start = parseISO(`${shift.date}T${shift.start_time}`);
      const end = parseISO(`${shift.date}T${shift.end_time}`);
      const minutes = differenceInMinutes(end, start);
      if (minutes > 480) { // 8時間超過分を残業とみなす
        weekOvertime += (minutes - 480) / 60;
      }
    });

    if (weekOvertime > userPreferences.max_overtime_hours_per_week) {
      notifyOvertimeExceeded({
        userEmail: user?.email,
        overtimeHours: weekOvertime.toFixed(1),
        limit: userPreferences.max_overtime_hours_per_week,
        period: '今週'
      });
    }
  }, [workShifts, user, userPreferences]);

  // 締切リマインダーチェック
  useEffect(() => {
    if (!user || !userPreferences?.enable_deadline_reminder) return;

    const today = new Date();
    const reminderDate = subDays(today, -(userPreferences.deadline_reminder_days_before || 3));

    shiftDeadlines.forEach(deadline => {
      const deadlineDate = parseISO(deadline.deadline_date);
      
      // 締切の数日前に通知
      if (format(deadlineDate, 'yyyy-MM-dd') === format(reminderDate, 'yyyy-MM-dd')) {
        const store = stores.find(s => s.id === deadline.store_id);
        if (store && user?.store_ids?.includes(store.id)) {
          notifyDeadlineReminder({
            userEmail: user?.email,
            storeName: store.store_name,
            deadline: format(deadlineDate, 'M月d日'),
            targetMonth: deadline.description || '次月'
          });
        }
      }
    });
  }, [shiftDeadlines, user, stores, userPreferences]);

  // 人員不足チェック（管理者のみ）
  useEffect(() => {
    if (!user || (user?.user_role !== 'admin' && user?.user_role !== 'manager')) return;

    stores.forEach(store => {
      if (!store.staff_requirements) return;

      // 今後7日間の各日をチェック
      for (let i = 0; i < 7; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() + i);
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][checkDate.getDay()];

        // その日のシフトを取得
        const dayShifts = workShifts.filter(s => s.date === dateStr && s.store_id === store.id);

        // 時間帯別の必要人数をチェック
        const requirements = store.staff_requirements.filter(r => r.day_of_week === dayOfWeek);
        
        requirements.forEach(req => {
          // その時間帯に勤務しているスタッフ数をカウント
          const staffCount = dayShifts.filter(shift => {
            return shift.start_time <= req.time_slot_start && shift.end_time >= req.time_slot_end;
          }).length;

          // 人員不足の場合は通知
          if (staffCount < req.required_staff) {
            notifyStaffShortage({
              adminEmail: user?.email,
              storeName: store.store_name,
              date: dateStr,
              requiredStaff: req.required_staff,
              currentStaff: staffCount,
              timeSlot: `${req.time_slot_start}-${req.time_slot_end}`
            });
          }
        });
      }
    });
  }, [workShifts, stores, user]);

  return null; // UIを持たないモニターコンポーネント
}