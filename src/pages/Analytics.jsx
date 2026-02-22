import React, { useState, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Clock, TrendingUp, Calendar, AlertCircle, BarChart3, Edit3, Save, Plus, Trash2, FileText, CalendarDays, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, Activity, Palmtree } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, differenceInMinutes, parseISO, addMonths, isBefore, isAfter, differenceInDays } from 'date-fns';
import { ja } from 'date-fns/locale';
import { fetchAll, fetchFiltered, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState(format(new Date(), 'yyyy'));
  const [expandedSection, setExpandedSection] = useState(null); // 'work' | 'leave' | null

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = user?.user_role === 'admin' || user?.role === 'admin' || user?.user_role === 'manager';

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: () => fetchAll('Store'),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsersAnalytics'],
    queryFn: () => fetchAll('User'),
  });

  const { data: allWorkShifts = [] } = useQuery({
    queryKey: ['workShifts'],
    queryFn: () => fetchAll('WorkShift'),
  });

  const { data: allShiftRequests = [] } = useQuery({
    queryKey: ['shiftRequests'],
    queryFn: () => fetchAll('ShiftRequest'),
  });

  const { data: allWorkActuals = [] } = useQuery({
    queryKey: ['workActuals'],
    queryFn: () => fetchAll('WorkActual'),
  });

  const { data: allPaidLeaveBalances = [] } = useQuery({
    queryKey: ['paidLeaveBalances'],
    queryFn: () => fetchAll('PaidLeaveBalance'),
  });

  const { data: allPaidLeaveRequests = [] } = useQuery({
    queryKey: ['paidLeaveRequests'],
    queryFn: () => fetchAll('PaidLeaveRequest'),
  });

  // 自分のシフトのみフィルタ
  const myWorkShifts = useMemo(() => {
    return allWorkShifts.filter(shift => shift.user_email === user?.email);
  }, [allWorkShifts, user]);

  const myShiftRequests = useMemo(() => {
    return allShiftRequests.filter(req => req.created_by === user?.email);
  }, [allShiftRequests, user]);

  // 期間でフィルタリング
  const filteredShifts = useMemo(() => {
    let start, end;
    if (selectedPeriod === 'month') {
      start = startOfMonth(parseISO(selectedMonth + '-01'));
      end = endOfMonth(parseISO(selectedMonth + '-01'));
    } else {
      start = startOfYear(parseISO(selectedYear + '-01-01'));
      end = endOfYear(parseISO(selectedYear + '-01-01'));
    }
    return myWorkShifts.filter(shift => {
      const shiftDate = parseISO(shift.date);
      return shiftDate >= start && shiftDate <= end;
    });
  }, [myWorkShifts, selectedPeriod, selectedMonth, selectedYear]);

  const filteredRequests = useMemo(() => {
    let start, end;
    if (selectedPeriod === 'month') {
      start = startOfMonth(parseISO(selectedMonth + '-01'));
      end = endOfMonth(parseISO(selectedMonth + '-01'));
    } else {
      start = startOfYear(parseISO(selectedYear + '-01-01'));
      end = endOfYear(parseISO(selectedYear + '-01-01'));
    }
    return myShiftRequests.filter(req => {
      const reqDate = parseISO(req.date);
      return reqDate >= start && reqDate <= end;
    });
  }, [myShiftRequests, selectedPeriod, selectedMonth, selectedYear]);

  // 労働時間の計算
  const workHoursAnalysis = useMemo(() => {
    let totalMinutes = 0;
    let overtimeMinutes = 0;
    filteredShifts.forEach(shift => {
      const start = parseISO(`${shift.date}T${shift.start_time}`);
      const end = parseISO(`${shift.date}T${shift.end_time}`);
      const minutes = differenceInMinutes(end, start);
      if (minutes > 0) {
        totalMinutes += minutes;
        if (minutes > 480) overtimeMinutes += minutes - 480;
      }
    });
    return {
      totalHours: (totalMinutes / 60).toFixed(1),
      overtimeHours: (overtimeMinutes / 60).toFixed(1),
      workDays: filteredShifts.length,
      averageHoursPerDay: filteredShifts.length > 0 ? (totalMinutes / 60 / filteredShifts.length).toFixed(1) : '0.0',
    };
  }, [filteredShifts]);

  // 月別勤務時間（年間表示用）
  const monthlyHours = useMemo(() => {
    if (selectedPeriod !== 'year') return [];
    const months = {};
    for (let i = 0; i < 12; i++) {
      const m = format(addMonths(parseISO(selectedYear + '-01-01'), i), 'yyyy-MM');
      months[m] = { month: format(addMonths(parseISO(selectedYear + '-01-01'), i), 'M月'), hours: 0 };
    }
    myWorkShifts.forEach(shift => {
      const m = shift.date.substring(0, 7);
      if (months[m]) {
        const start = parseISO(`${shift.date}T${shift.start_time}`);
        const end = parseISO(`${shift.date}T${shift.end_time}`);
        const minutes = differenceInMinutes(end, start);
        if (minutes > 0) months[m].hours += parseFloat((minutes / 60).toFixed(1));
      }
    });
    return Object.values(months);
  }, [myWorkShifts, selectedPeriod, selectedYear]);

  // 店舗別勤務時間
  const storeHours = useMemo(() => {
    const storeMap = {};
    filteredShifts.forEach(shift => {
      const store = stores.find(s => s.id === shift.store_id);
      const name = store?.name || '不明';
      if (!storeMap[name]) storeMap[name] = 0;
      const start = parseISO(`${shift.date}T${shift.start_time}`);
      const end = parseISO(`${shift.date}T${shift.end_time}`);
      const minutes = differenceInMinutes(end, start);
      if (minutes > 0) storeMap[name] += parseFloat((minutes / 60).toFixed(1));
    });
    return Object.entries(storeMap).map(([name, hours]) => ({ name, hours }));
  }, [filteredShifts, stores]);

  // 希望 vs 実績比較
  const requestVsActual = useMemo(() => {
    const dateMap = {};
    filteredRequests.forEach(req => {
      if (!req.is_day_off && req.start_time && req.end_time) {
        const start = parseISO(`${req.date}T${req.start_time}`);
        const end = parseISO(`${req.date}T${req.end_time}`);
        const hours = differenceInMinutes(end, start) / 60;
        dateMap[req.date] = { date: req.date, requested: parseFloat(hours.toFixed(1)), actual: 0 };
      }
    });
    filteredShifts.forEach(shift => {
      if (dateMap[shift.date]) {
        const start = parseISO(`${shift.date}T${shift.start_time}`);
        const end = parseISO(`${shift.date}T${shift.end_time}`);
        dateMap[shift.date].actual = parseFloat((differenceInMinutes(end, start) / 60).toFixed(1));
      }
    });
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredRequests, filteredShifts]);

  // 遅刻・早退統計
  const attendanceIssues = useMemo(() => {
    let lateCount = 0, lateTotalMinutes = 0;
    let earlyLeaveCount = 0, earlyLeaveTotalMinutes = 0;
    filteredShifts.forEach(shift => {
      const matchingReq = filteredRequests.find(r => r.date === shift.date && !r.is_day_off);
      if (matchingReq && matchingReq.start_time && shift.start_time) {
        const reqStart = parseISO(`${shift.date}T${matchingReq.start_time}`);
        const actStart = parseISO(`${shift.date}T${shift.start_time}`);
        const diff = differenceInMinutes(actStart, reqStart);
        if (diff > 15) { lateCount++; lateTotalMinutes += diff; }
      }
      if (matchingReq && matchingReq.end_time && shift.end_time) {
        const reqEnd = parseISO(`${shift.date}T${matchingReq.end_time}`);
        const actEnd = parseISO(`${shift.date}T${shift.end_time}`);
        const diff = differenceInMinutes(reqEnd, actEnd);
        if (diff > 15) { earlyLeaveCount++; earlyLeaveTotalMinutes += diff; }
      }
    });
    return {
      lateCount, earlyLeaveCount,
      lateAverage: lateCount > 0 ? (lateTotalMinutes / lateCount).toFixed(0) : 0,
      earlyLeaveAverage: earlyLeaveCount > 0 ? (earlyLeaveTotalMinutes / earlyLeaveCount).toFixed(0) : 0,
    };
  }, [filteredRequests, filteredShifts]);

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  // 有給残高（自分の）
  const myBalance = useMemo(() => {
    return allPaidLeaveBalances.find(b => b.user_email === user?.email);
  }, [allPaidLeaveBalances, user]);

  const myLeaveUsed = useMemo(() => {
    return allPaidLeaveRequests.filter(r => r.user_email === user?.email && r.status === 'approved').length;
  }, [allPaidLeaveRequests, user]);

  const myLeaveRemaining = useMemo(() => {
    if (!myBalance) return null;
    const total = parseFloat(myBalance.balance_days) || 0;
    return Math.max(0, total - myLeaveUsed);
  }, [myBalance, myLeaveUsed]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-2 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-200 flex-shrink-0">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-2xl font-bold text-slate-800">勤務・有給管理</h1>
              <p className="text-[10px] sm:text-sm text-slate-500">勤務状況の分析と有給休暇の管理</p>
            </div>
          </div>
        </div>

        {/* クイックサマリーカード（常に表示） */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">今月勤務</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 ml-1">{workHoursAnalysis.totalHours}<span className="text-xs sm:text-sm font-normal text-slate-400 ml-0.5">h</span></p>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">残業</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-orange-600 ml-1">{workHoursAnalysis.overtimeHours}<span className="text-xs sm:text-sm font-normal text-orange-400 ml-0.5">h</span></p>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Palmtree className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">有給残</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 ml-1">{myLeaveRemaining !== null ? myLeaveRemaining : '-'}<span className="text-xs sm:text-sm font-normal text-emerald-400 ml-0.5">日</span></p>
          </div>
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
              </div>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">出勤日数</span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-800 ml-1">{workHoursAnalysis.workDays}<span className="text-xs sm:text-sm font-normal text-slate-400 ml-0.5">日</span></p>
          </div>
        </div>

        {/* アコーディオンセクション */}
        <div className="space-y-3 sm:space-y-4">
          {/* ===== 勤務分析セクション ===== */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('work')}
              className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                  <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="text-left">
                  <h2 className="text-base sm:text-lg font-bold text-slate-800">勤務分析</h2>
                  <p className="text-[10px] sm:text-xs text-slate-400">勤務時間・実績入力・統計分析</p>
                </div>
              </div>
              <div className={`w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center transition-transform duration-300 ${expandedSection === 'work' ? 'rotate-180' : ''}`}>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </div>
            </button>

            {expandedSection === 'work' && (
              <div className="px-3 sm:px-5 pb-4 sm:pb-5 space-y-5 border-t border-slate-100 pt-4">
                {/* 期間選択 */}
                <div className="flex flex-wrap gap-3 items-center bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">期間:</label>
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger className="w-24 h-8 text-xs rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">月間</SelectItem>
                        <SelectItem value="year">年間</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedPeriod === 'month' && (
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                    />
                  )}
                  {selectedPeriod === 'year' && (
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="w-24 h-8 text-xs rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2024, 2025, 2026, 2027].map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}年</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* サマリーカード */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                  {[
                    { icon: Clock, label: '総労働時間', value: workHoursAnalysis.totalHours, unit: '時間', color: 'indigo' },
                    { icon: TrendingUp, label: '残業時間', value: workHoursAnalysis.overtimeHours, unit: '時間', color: 'orange' },
                    { icon: Calendar, label: '出勤日数', value: workHoursAnalysis.workDays, unit: '日', color: 'blue' },
                    { icon: BarChart3, label: '平均勤務', value: workHoursAnalysis.averageHoursPerDay, unit: 'h/日', color: 'purple' },
                  ].map(({ icon: Icon, label, value, unit, color }) => (
                    <div key={label} className={`p-3 sm:p-4 rounded-xl bg-gradient-to-br from-${color}-50 to-${color}-100/30 border border-${color}-100`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
                        <span className="text-[10px] sm:text-xs text-slate-500 font-medium">{label}</span>
                      </div>
                      <p className={`text-xl sm:text-2xl font-bold text-${color}-600`}>{value}</p>
                      <p className="text-[10px] text-slate-400">{unit}</p>
                    </div>
                  ))}
                </div>

                {/* 実績データとの比較 */}
                <WorkActualComparisonCard
                  workHoursAnalysis={workHoursAnalysis}
                  allWorkActuals={allWorkActuals}
                  userEmail={user?.email}
                  selectedMonth={selectedMonth}
                  selectedPeriod={selectedPeriod}
                />

                {/* グラフセクション */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {selectedPeriod === 'year' && monthlyHours.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-100 p-4">
                      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-500" />
                        月別勤務時間
                      </h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={monthlyHours}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="hours" fill="#6366f1" name="勤務時間（時間）" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {storeHours.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-100 p-4">
                      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-purple-500" />
                        店舗別勤務時間
                      </h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={storeHours} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(entry) => `${entry.name}: ${entry.hours}h`}>
                            {storeHours.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* 希望と実績の比較 */}
                {requestVsActual.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-100 p-4">
                    <h3 className="text-sm font-bold text-slate-700 mb-3">シフト希望と実績の比較</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={requestVsActual.slice(0, 15)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tickFormatter={(date) => format(parseISO(date), 'MM/dd')} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="requested" stroke="#8b5cf6" name="希望時間" strokeWidth={2} />
                        <Line type="monotone" dataKey="actual" stroke="#6366f1" name="実績時間" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 遅刻・早退の統計 */}
                <div className="bg-white rounded-xl border border-slate-100 p-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    勤務時間差異分析
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                    <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-[10px] sm:text-xs text-slate-500 mb-1">開始遅延</p>
                      <p className="text-lg sm:text-xl font-bold text-red-600">{attendanceIssues.lateCount}<span className="text-xs font-normal ml-0.5">回</span></p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-[10px] sm:text-xs text-slate-500 mb-1">平均遅延</p>
                      <p className="text-lg sm:text-xl font-bold text-red-600">{attendanceIssues.lateAverage}<span className="text-xs font-normal ml-0.5">分</span></p>
                    </div>
                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                      <p className="text-[10px] sm:text-xs text-slate-500 mb-1">早期終了</p>
                      <p className="text-lg sm:text-xl font-bold text-orange-600">{attendanceIssues.earlyLeaveCount}<span className="text-xs font-normal ml-0.5">回</span></p>
                    </div>
                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                      <p className="text-[10px] sm:text-xs text-slate-500 mb-1">平均早退</p>
                      <p className="text-lg sm:text-xl font-bold text-orange-600">{attendanceIssues.earlyLeaveAverage}<span className="text-xs font-normal ml-0.5">分</span></p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3">
                    ※ シフト希望時間と実際の勤務時間を比較し、15分以上の差異を計測
                  </p>
                </div>

                {/* 実績入力（勤務分析セクション内に統合） */}
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-indigo-500" />
                    実績入力
                  </h3>
                  <WorkActualInput
                    userEmail={user?.email}
                    allWorkActuals={allWorkActuals}
                    isAdmin={isAdmin}
                    allUsers={allUsers}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ===== 有給管理セクション ===== */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('leave')}
              className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
                  <Palmtree className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="text-left">
                  <h2 className="text-base sm:text-lg font-bold text-slate-800">有給管理</h2>
                  <p className="text-[10px] sm:text-xs text-slate-400">有給残高・申請・履歴管理</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {myLeaveRemaining !== null && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs font-bold">
                    残{myLeaveRemaining}日
                  </Badge>
                )}
                <div className={`w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center transition-transform duration-300 ${expandedSection === 'leave' ? 'rotate-180' : ''}`}>
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                </div>
              </div>
            </button>

            {expandedSection === 'leave' && (
              <div className="px-3 sm:px-5 pb-4 sm:pb-5 border-t border-slate-100 pt-4">
                <PaidLeaveManagement
                  userEmail={user?.email}
                  isAdmin={isAdmin}
                  allUsers={allUsers}
                  allPaidLeaveBalances={allPaidLeaveBalances}
                  allPaidLeaveRequests={allPaidLeaveRequests}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== 実績データ比較カード =====
function WorkActualComparisonCard({ workHoursAnalysis, allWorkActuals, userEmail, selectedMonth, selectedPeriod }) {
  if (selectedPeriod !== 'month') return null;
  const actual = allWorkActuals.find(wa => wa.user_email === userEmail && wa.month === selectedMonth);
  if (!actual) return null;

  const scheduledHours = parseFloat(workHoursAnalysis.totalHours);
  const actualHours = parseFloat(actual.actual_work_hours || 0);
  const diff = actualHours - scheduledHours;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-4">
      <h3 className="text-xs font-bold text-indigo-700 mb-3 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" />
        シフト予定 vs 実績比較（{selectedMonth}）
      </h3>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-slate-100">
          <p className="text-[10px] text-slate-400 mb-0.5">予定時間</p>
          <p className="text-lg sm:text-xl font-bold text-slate-700">{scheduledHours.toFixed(1)}<span className="text-xs font-normal">h</span></p>
        </div>
        <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-slate-100">
          <p className="text-[10px] text-slate-400 mb-0.5">実績時間</p>
          <p className="text-lg sm:text-xl font-bold text-indigo-700">{actualHours.toFixed(1)}<span className="text-xs font-normal">h</span></p>
        </div>
        <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-slate-100">
          <p className="text-[10px] text-slate-400 mb-0.5">差異</p>
          <p className={`text-lg sm:text-xl font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}<span className="text-xs font-normal">h</span>
          </p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 bg-white/60 rounded-lg">
          <span className="text-slate-400">出勤日数: </span>
          <span className="font-bold text-slate-700">{actual.actual_work_days || 0}日</span>
          <span className="text-slate-300 ml-1">(予定: {workHoursAnalysis.workDays}日)</span>
        </div>
        <div className="p-2 bg-white/60 rounded-lg">
          <span className="text-slate-400">残業: </span>
          <span className="font-bold text-orange-600">{actual.actual_overtime_hours || 0}h</span>
          <span className="text-slate-300 ml-1">(予定: {workHoursAnalysis.overtimeHours}h)</span>
        </div>
      </div>
    </div>
  );
}

// ===== 実績入力コンポーネント =====
function WorkActualInput({ userEmail, allWorkActuals, isAdmin, allUsers }) {
  const [selectedTargetEmail, setSelectedTargetEmail] = useState(userEmail || '');
  const [editMonth, setEditMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [formData, setFormData] = useState({
    actual_work_hours: '',
    actual_work_days: '',
    actual_overtime_hours: '',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const targetEmail = isAdmin ? selectedTargetEmail : userEmail;

  const existingRecord = useMemo(() => {
    return allWorkActuals.find(wa => wa.user_email === targetEmail && wa.month === editMonth);
  }, [allWorkActuals, targetEmail, editMonth]);

  React.useEffect(() => {
    if (existingRecord) {
      setFormData({
        actual_work_hours: existingRecord.actual_work_hours?.toString() || '',
        actual_work_days: existingRecord.actual_work_days?.toString() || '',
        actual_overtime_hours: existingRecord.actual_overtime_hours?.toString() || '',
        notes: existingRecord.notes || '',
      });
    } else {
      setFormData({ actual_work_hours: '', actual_work_days: '', actual_overtime_hours: '', notes: '' });
    }
  }, [existingRecord]);

  const handleSave = async () => {
    if (!targetEmail) { toast.error('対象ユーザーを選択してください'); return; }
    setIsSaving(true);
    try {
      const data = {
        user_email: targetEmail,
        month: editMonth,
        actual_work_hours: parseFloat(formData.actual_work_hours) || 0,
        actual_work_days: parseInt(formData.actual_work_days) || 0,
        actual_overtime_hours: parseFloat(formData.actual_overtime_hours) || 0,
        notes: formData.notes,
        updated_at: new Date().toISOString(),
      };
      if (existingRecord) {
        await updateRecord('WorkActual', existingRecord.id, data);
        toast.success('実績データを更新しました');
      } else {
        await insertRecord('WorkActual', { ...data, created_at: new Date().toISOString() });
        toast.success('実績データを保存しました');
      }
      queryClient.invalidateQueries({ queryKey: ['workActuals'] });
    } catch (error) {
      toast.error('保存に失敗しました: ' + error.message);
    } finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!existingRecord) return;
    if (!window.confirm('この実績データを削除しますか？')) return;
    try {
      await deleteRecord('WorkActual', existingRecord.id);
      toast.success('実績データを削除しました');
      queryClient.invalidateQueries({ queryKey: ['workActuals'] });
    } catch (error) { toast.error('削除に失敗しました'); }
  };

  const userActuals = useMemo(() => {
    return allWorkActuals.filter(wa => wa.user_email === targetEmail).sort((a, b) => b.month.localeCompare(a.month));
  }, [allWorkActuals, targetEmail]);

  return (
    <div className="space-y-4">
      {/* ユーザー選択（管理者のみ） */}
      {isAdmin && (
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
          <Label className="text-xs font-medium text-slate-600 whitespace-nowrap">対象:</Label>
          <Select value={selectedTargetEmail} onValueChange={setSelectedTargetEmail}>
            <SelectTrigger className="w-48 h-8 text-xs rounded-lg">
              <SelectValue placeholder="ユーザーを選択" />
            </SelectTrigger>
            <SelectContent>
              {allUsers.filter(u => u.is_active !== false).map(u => (
                <SelectItem key={u.id} value={u.email}>
                  {u.metadata?.display_name || u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 実績入力フォーム */}
      <div className="bg-slate-50 rounded-xl p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs font-medium whitespace-nowrap">対象月:</Label>
          <input
            type="month"
            value={editMonth}
            onChange={(e) => setEditMonth(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
          />
          {existingRecord && (
            <Badge variant="outline" className="text-green-600 border-green-300 text-[10px]">
              <CheckCircle className="w-2.5 h-2.5 mr-0.5" />入力済
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div>
            <Label className="text-[10px] sm:text-xs font-medium text-slate-500">実労働時間（h）</Label>
            <Input type="number" step="0.5" min="0" value={formData.actual_work_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, actual_work_hours: e.target.value }))}
              placeholder="160.5" className="mt-1 h-8 text-xs rounded-lg" />
          </div>
          <div>
            <Label className="text-[10px] sm:text-xs font-medium text-slate-500">出勤日数（日）</Label>
            <Input type="number" min="0" max="31" value={formData.actual_work_days}
              onChange={(e) => setFormData(prev => ({ ...prev, actual_work_days: e.target.value }))}
              placeholder="22" className="mt-1 h-8 text-xs rounded-lg" />
          </div>
          <div>
            <Label className="text-[10px] sm:text-xs font-medium text-slate-500">残業時間（h）</Label>
            <Input type="number" step="0.5" min="0" value={formData.actual_overtime_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, actual_overtime_hours: e.target.value }))}
              placeholder="20.0" className="mt-1 h-8 text-xs rounded-lg" />
          </div>
        </div>

        <div>
          <Label className="text-[10px] sm:text-xs font-medium text-slate-500">備考</Label>
          <Input value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="メモや備考" className="mt-1 h-8 text-xs rounded-lg" />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving} size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs rounded-lg">
            {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            {existingRecord ? '更新' : '保存'}
          </Button>
          {existingRecord && (
            <Button variant="outline" onClick={handleDelete} size="sm"
              className="text-red-600 hover:bg-red-50 h-8 text-xs rounded-lg border-red-200">
              <Trash2 className="w-3 h-3 mr-1" />削除
            </Button>
          )}
        </div>
      </div>

      {/* 実績一覧 */}
      {userActuals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <h4 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              実績一覧
            </h4>
          </div>
          <div className="divide-y divide-slate-50">
            {userActuals.map(wa => (
              <div key={wa.id} className="p-3 hover:bg-slate-50/50 cursor-pointer transition-colors"
                onClick={() => setEditMonth(wa.month)}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">{wa.month}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600">{wa.actual_work_hours}h</span>
                    <span className="text-slate-400">{wa.actual_work_days}日</span>
                    <span className="text-orange-500">{wa.actual_overtime_hours}h残業</span>
                  </div>
                </div>
                {wa.notes && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{wa.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 有給管理コンポーネント =====
function PaidLeaveManagement({ userEmail, isAdmin, allUsers, allPaidLeaveBalances, allPaidLeaveRequests }) {
  const [selectedTargetEmail, setSelectedTargetEmail] = useState(userEmail || '');
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestDate, setRequestDate] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [balanceEditOpen, setBalanceEditOpen] = useState(false);
  const [balanceForm, setBalanceForm] = useState({
    balance_date: format(new Date(), 'yyyy-MM-dd'),
    balance_days: '',
    grant_date: '',
    next_grant_date: '',
    next_grant_days: '',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const queryClient = useQueryClient();

  const targetEmail = isAdmin ? selectedTargetEmail : userEmail;

  const balance = useMemo(() => {
    return allPaidLeaveBalances.find(b => b.user_email === targetEmail);
  }, [allPaidLeaveBalances, targetEmail]);

  const userRequests = useMemo(() => {
    return allPaidLeaveRequests.filter(r => r.user_email === targetEmail).sort((a, b) => b.date.localeCompare(a.date));
  }, [allPaidLeaveRequests, targetEmail]);

  const usedDays = useMemo(() => {
    return userRequests.filter(r => r.status === 'approved').length;
  }, [userRequests]);

  const currentBalance = useMemo(() => {
    if (!balance) return null;
    const baseDays = parseFloat(balance.balance_days) || 0;
    const remaining = baseDays - usedDays;
    return {
      total: baseDays, used: usedDays, remaining: Math.max(0, remaining),
      balanceDate: balance.balance_date, grantDate: balance.grant_date,
      nextGrantDate: balance.next_grant_date, nextGrantDays: parseFloat(balance.next_grant_days) || 0,
    };
  }, [balance, usedDays]);

  const daysUntilNextGrant = useMemo(() => {
    if (!currentBalance?.nextGrantDate) return null;
    try {
      const nextDate = parseISO(currentBalance.nextGrantDate);
      return differenceInDays(nextDate, new Date());
    } catch { return null; }
  }, [currentBalance]);

  React.useEffect(() => {
    if (balance) {
      setBalanceForm({
        balance_date: balance.balance_date || format(new Date(), 'yyyy-MM-dd'),
        balance_days: balance.balance_days?.toString() || '',
        grant_date: balance.grant_date || '',
        next_grant_date: balance.next_grant_date || '',
        next_grant_days: balance.next_grant_days?.toString() || '',
        notes: balance.notes || '',
      });
    } else {
      setBalanceForm({ balance_date: format(new Date(), 'yyyy-MM-dd'), balance_days: '', grant_date: '', next_grant_date: '', next_grant_days: '', notes: '' });
    }
  }, [balance]);

  const handleSubmitRequest = async () => {
    if (!requestDate) { toast.error('日付を選択してください'); return; }
    setIsSaving(true);
    try {
      await insertRecord('PaidLeaveRequest', {
        user_email: targetEmail, date: requestDate, status: 'pending',
        notes: requestNotes, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      try {
        const { data: existingShifts } = await supabase.from('ShiftRequest').select('*').eq('created_by', targetEmail).eq('date', requestDate);
        if (existingShifts && existingShifts.length > 0) {
          await supabase.from('ShiftRequest').update({
            is_day_off: true, is_paid_leave: true, start_time: null, end_time: null,
            is_full_day_available: false, notes: requestNotes ? `有給申請: ${requestNotes}` : '有給申請',
            updated_at: new Date().toISOString(),
          }).eq('id', existingShifts[0].id);
        } else {
          const targetUser = allUsers.find(u => u.email === targetEmail);
          const storeId = targetUser?.store_ids?.[0] || '';
          await insertRecord('ShiftRequest', {
            created_by: targetEmail, store_id: storeId, date: requestDate,
            is_day_off: true, is_paid_leave: true, is_full_day_available: false, is_negotiable_if_needed: false,
            notes: requestNotes ? `有給申請: ${requestNotes}` : '有給申請',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          });
        }
        queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      } catch (shiftErr) { console.warn('シフト希望への反映に失敗:', shiftErr); }
      toast.success('有給申請を提出しました（シフト希望にも反映済み）');
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['pendingLeaveCount'] });
      setRequestDialogOpen(false); setRequestDate(''); setRequestNotes('');
    } catch (error) { toast.error('申請に失敗しました: ' + error.message); }
    finally { setIsSaving(false); }
  };

  const handleDeleteRequest = async (requestId) => {
    if (!window.confirm('この有給申請を削除しますか？')) return;
    try {
      await deleteRecord('PaidLeaveRequest', requestId);
      toast.success('有給申請を削除しました');
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['pendingLeaveCount'] });
    } catch (error) { toast.error('削除に失敗しました: ' + error.message); }
  };

  const handleOpenEdit = (req) => {
    setEditingRequest(req); setEditDate(req.date); setEditNotes(req.notes || ''); setEditStatus(req.status); setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRequest) return;
    setIsSaving(true);
    try {
      await updateRecord('PaidLeaveRequest', editingRequest.id, {
        date: editDate, notes: editNotes, status: editStatus, updated_at: new Date().toISOString(),
      });
      toast.success('有給申請を更新しました');
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['pendingLeaveCount'] });
      setEditDialogOpen(false); setEditingRequest(null);
    } catch (error) { toast.error('更新に失敗しました: ' + error.message); }
    finally { setIsSaving(false); }
  };

  const handleSaveBalance = async () => {
    if (!targetEmail) { toast.error('対象ユーザーを選択してください'); return; }
    setIsSaving(true);
    try {
      const data = {
        user_email: targetEmail, balance_date: balanceForm.balance_date,
        balance_days: parseFloat(balanceForm.balance_days) || 0,
        grant_date: balanceForm.grant_date || null, next_grant_date: balanceForm.next_grant_date || null,
        next_grant_days: parseFloat(balanceForm.next_grant_days) || 0,
        notes: balanceForm.notes, updated_at: new Date().toISOString(),
      };
      if (balance) {
        await updateRecord('PaidLeaveBalance', balance.id, data);
        toast.success('有給残高を更新しました');
      } else {
        await insertRecord('PaidLeaveBalance', { ...data, created_at: new Date().toISOString() });
        toast.success('有給残高を保存しました');
      }
      queryClient.invalidateQueries({ queryKey: ['paidLeaveBalances'] });
      setBalanceEditOpen(false);
    } catch (error) { toast.error('保存に失敗しました: ' + error.message); }
    finally { setIsSaving(false); }
  };

  const handleApproveReject = async (requestId, action, reason = '') => {
    try {
      await updateRecord('PaidLeaveRequest', requestId, {
        status: action, approved_by: userEmail, approved_at: new Date().toISOString(),
        rejection_reason: reason, updated_at: new Date().toISOString(),
      });
      toast.success(action === 'approved' ? '承認しました' : '却下しました');
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myPaidLeaveRequests'] });
    } catch (error) { toast.error('処理に失敗しました'); }
  };

  const pendingRequests = useMemo(() => {
    if (!isAdmin) return [];
    return allPaidLeaveRequests.filter(r => r.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  }, [allPaidLeaveRequests, isAdmin]);

  return (
    <div className="space-y-4">
      {/* ユーザー選択（管理者のみ） */}
      {isAdmin && (
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
          <Label className="text-xs font-medium text-slate-600 whitespace-nowrap">対象:</Label>
          <Select value={selectedTargetEmail} onValueChange={setSelectedTargetEmail}>
            <SelectTrigger className="w-48 h-8 text-xs rounded-lg">
              <SelectValue placeholder="ユーザーを選択" />
            </SelectTrigger>
            <SelectContent>
              {allUsers.filter(u => u.is_active !== false).map(u => (
                <SelectItem key={u.id} value={u.email}>
                  {u.metadata?.display_name || u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 未承認申請一覧（管理者のみ） */}
      {isAdmin && pendingRequests.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-3 sm:p-4">
          <h3 className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            未承認の有給申請
            <Badge className="bg-amber-500 text-white text-[10px] ml-auto">{pendingRequests.length}件</Badge>
          </h3>
          <div className="space-y-1.5">
            {pendingRequests.map(req => {
              const reqUser = allUsers.find(u => u.email === req.user_email);
              const displayName = reqUser?.metadata?.display_name || reqUser?.full_name || req.user_email;
              return (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-white rounded-lg border border-amber-100 gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-700 font-bold text-[10px]">{displayName.charAt(0)}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-xs text-slate-800">{displayName}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[10px]">{req.date}</span>
                        {req.notes && <span className="text-[10px] text-slate-400">- {req.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-9 sm:ml-0">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[10px] px-2 rounded-lg"
                      onClick={() => handleApproveReject(req.id, 'approved')}>
                      <CheckCircle className="w-3 h-3 mr-0.5" />承認
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 h-7 text-[10px] px-2 rounded-lg border-red-200"
                      onClick={() => { const reason = window.prompt('却下理由（任意）'); handleApproveReject(req.id, 'rejected', reason || ''); }}>
                      <XCircle className="w-3 h-3 mr-0.5" />却下
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 有給残高カード */}
      <div className="bg-gradient-to-br from-white to-emerald-50/30 rounded-xl border border-slate-100 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-emerald-600" />
            </div>
            有給残高
          </h3>
          <div className="flex gap-1.5 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none rounded-lg h-7 text-[10px] sm:text-xs" onClick={() => setBalanceEditOpen(true)}>
              <Edit3 className="w-3 h-3 mr-0.5" />残高設定
            </Button>
            <Button size="sm" className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-7 text-[10px] sm:text-xs shadow-sm" onClick={() => setRequestDialogOpen(true)}>
              <Plus className="w-3 h-3 mr-0.5" />有給申請
            </Button>
          </div>
        </div>

        {currentBalance ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl text-center border border-emerald-100">
                <p className="text-[9px] sm:text-[10px] text-emerald-600 font-medium">残り</p>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{currentBalance.remaining}</p>
                <p className="text-[9px] sm:text-[10px] text-emerald-500">日</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl text-center border border-blue-100">
                <p className="text-[9px] sm:text-[10px] text-blue-600 font-medium">付与</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">{currentBalance.total}</p>
                <p className="text-[9px] sm:text-[10px] text-blue-500">日</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl text-center border border-orange-100">
                <p className="text-[9px] sm:text-[10px] text-orange-600 font-medium">使用済</p>
                <p className="text-2xl sm:text-3xl font-bold text-orange-600">{currentBalance.used}</p>
                <p className="text-[9px] sm:text-[10px] text-orange-500">日</p>
              </div>
            </div>

            <div className="bg-white/60 rounded-xl p-3 border border-slate-100">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                <span className="font-medium">使用率</span>
                <span className="font-bold text-slate-700">{currentBalance.total > 0 ? ((currentBalance.used / currentBalance.total) * 100).toFixed(0) : 0}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${currentBalance.total > 0 ? Math.min(100, (currentBalance.used / currentBalance.total) * 100) : 0}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '残高基準日', value: currentBalance.balanceDate },
                { label: '前回付与日', value: currentBalance.grantDate },
                { label: '次回付与日', value: currentBalance.nextGrantDate, extra: daysUntilNextGrant !== null && daysUntilNextGrant > 0 ? `(あと${daysUntilNextGrant}日)` : null },
                { label: '次回付与日数', value: currentBalance.nextGrantDays ? `${currentBalance.nextGrantDays}日` : null },
              ].map(({ label, value, extra }) => (
                <div key={label} className="p-2 bg-white/80 rounded-lg border border-slate-100">
                  <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium">{label}</p>
                  <p className="font-semibold text-xs text-slate-700 mt-0.5">
                    {value || '-'}
                    {extra && <span className="text-[9px] text-indigo-500 ml-1 font-normal">{extra}</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CalendarDays className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500 mb-1">有給残高が設定されていません</p>
            <p className="text-[10px] text-slate-400 mb-3">残高を設定して有給休暇を管理しましょう</p>
            <Button variant="outline" size="sm" className="rounded-lg h-7 text-xs" onClick={() => setBalanceEditOpen(true)}>
              <Plus className="w-3 h-3 mr-1" />残高を設定
            </Button>
          </div>
        )}
      </div>

      {/* 有給申請履歴 */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            有給申請履歴
          </h3>
          {userRequests.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{userRequests.length}件</Badge>
          )}
        </div>
        {userRequests.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">有給申請がありません</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {userRequests.map(req => {
              const statusConfig = req.status === 'approved'
                ? { label: '承認済', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> }
                : req.status === 'rejected'
                ? { label: '却下', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: <XCircle className="w-3.5 h-3.5 text-red-500" /> }
                : { label: '申請中', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: <Clock className="w-3.5 h-3.5 text-amber-500" /> };
              return (
                <div key={req.id} className={`p-3 ${statusConfig.bg} hover:brightness-95 transition-all`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      {statusConfig.icon}
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-slate-800">{req.date}</span>
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusConfig.text} ${statusConfig.border}`}>
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {req.approved_by && (
                            <span className="text-[9px] text-slate-400">
                              承認: {allUsers.find(u => u.email === req.approved_by)?.metadata?.display_name || req.approved_by}
                            </span>
                          )}
                          {(req.rejection_reason || req.notes) && (
                            <span className="text-[9px] text-slate-400 truncate max-w-[180px]">{req.rejection_reason || req.notes}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 ml-6 sm:ml-0 flex-shrink-0">
                      {isAdmin && req.status === 'pending' && (
                        <>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-6 text-[10px] px-2 rounded-md"
                            onClick={() => handleApproveReject(req.id, 'approved')}>承認</Button>
                          <Button size="sm" variant="outline" className="text-red-600 h-6 text-[10px] px-2 rounded-md border-red-200"
                            onClick={() => { const reason = window.prompt('却下理由'); handleApproveReject(req.id, 'rejected', reason || ''); }}>却下</Button>
                        </>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5 rounded-md" onClick={() => handleOpenEdit(req)}>
                          <Edit3 className="w-2.5 h-2.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="text-red-500 hover:bg-red-50 h-6 text-[10px] px-1.5 rounded-md border-red-200"
                        onClick={() => handleDeleteRequest(req.id)}>
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 有給申請ダイアログ */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CalendarDays className="w-5 h-5" />有給申請
            </DialogTitle>
            <DialogDescription>有給休暇を申請します。管理者の承認後に反映されます。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">取得希望日</Label>
              <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium">理由・備考（任意）</Label>
              <Input value={requestNotes} onChange={(e) => setRequestNotes(e.target.value)} placeholder="例: 通院のため" className="mt-1" />
            </div>
            {currentBalance && (
              <div className="bg-emerald-50 rounded-lg p-3 text-sm">
                <p className="text-emerald-700">現在の有給残高: <span className="font-bold">{currentBalance.remaining}日</span></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSubmitRequest} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              申請する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 残高設定ダイアログ */}
      <Dialog open={balanceEditOpen} onOpenChange={setBalanceEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Edit3 className="w-5 h-5" />有給残高設定
            </DialogTitle>
            <DialogDescription>有給休暇の残高情報を設定します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">残高基準日</Label>
              <Input type="date" value={balanceForm.balance_date} onChange={(e) => setBalanceForm(prev => ({ ...prev, balance_date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium">残高日数</Label>
              <Input type="number" step="0.5" min="0" value={balanceForm.balance_days} onChange={(e) => setBalanceForm(prev => ({ ...prev, balance_days: e.target.value }))} placeholder="例: 10" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium">前回付与日</Label>
              <Input type="date" value={balanceForm.grant_date} onChange={(e) => setBalanceForm(prev => ({ ...prev, grant_date: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">次回付与日</Label>
                <Input type="date" value={balanceForm.next_grant_date} onChange={(e) => setBalanceForm(prev => ({ ...prev, next_grant_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm font-medium">次回付与日数</Label>
                <Input type="number" step="0.5" min="0" value={balanceForm.next_grant_days} onChange={(e) => setBalanceForm(prev => ({ ...prev, next_grant_days: e.target.value }))} placeholder="例: 11" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">備考</Label>
              <Input value={balanceForm.notes} onChange={(e) => setBalanceForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="メモ" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceEditOpen(false)}>キャンセル</Button>
            <Button onClick={handleSaveBalance} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 有給申請編集ダイアログ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Edit3 className="w-5 h-5" />有給申請の編集
            </DialogTitle>
            <DialogDescription>有給申請の内容を編集します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">取得希望日</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium">ステータス</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">申請中</SelectItem>
                  <SelectItem value="approved">承認済み</SelectItem>
                  <SelectItem value="rejected">却下</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">備考</Label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="備考を入力" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
