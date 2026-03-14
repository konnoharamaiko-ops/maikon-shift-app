import { useState, useMemo } from 'react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, TrendingUp, TrendingDown, BarChart3, RefreshCw,
  DollarSign, Clock, Users, ChevronLeft, ChevronRight,
  AlertTriangle, Target, Activity, Package, ShoppingCart, Lightbulb,
  Factory, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell, Area, AreaChart, ComposedChart
} from 'recharts';
import { Button } from '../components/ui/button';
import { useQuery } from '@tanstack/react-query';

// 人時生産性の目標値
const PRODUCTIVITY_TARGET = 3000;
const PRODUCTIVITY_GOOD = 2500;
const PRODUCTIVITY_WARNING = 2000;

// 全13店舗リスト
const ALL_STORES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', '駅丸', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂福島店'
];

function getProductivityColor(prod) {
  if (prod >= PRODUCTIVITY_TARGET) return '#22c55e';
  if (prod >= PRODUCTIVITY_GOOD) return '#3b82f6';
  if (prod >= PRODUCTIVITY_WARNING) return '#f59e0b';
  return '#ef4444';
}

function getProductivityLabel(prod) {
  if (prod >= PRODUCTIVITY_TARGET) return '優秀';
  if (prod >= PRODUCTIVITY_GOOD) return '良好';
  if (prod >= PRODUCTIVITY_WARNING) return '注意';
  return '要改善';
}

function getProductivityBg(prod) {
  if (prod >= PRODUCTIVITY_TARGET) return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800';
  if (prod >= PRODUCTIVITY_GOOD) return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
  if (prod >= PRODUCTIVITY_WARNING) return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
  return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
}

/**
 * 過去データをAPIから取得
 */
async function fetchHistoryData(dateFrom, dateTo) {
  const response = await fetch('/api/productivity/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
  });
  if (!response.ok) throw new Error(`APIエラー: ${response.status}`);
  const result = await response.json();
  return {
    data: result.data || [],
    department_data: result.department_data || {},
  };
}

/**
 * 日付範囲プリセット
 */
const DATE_PRESETS = [
  { label: '今日', getDates: () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return { from: today, to: today };
  }},
  { label: '直近7日', getDates: () => ({
    from: format(subDays(new Date(), 6), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })},
  { label: '直近30日', getDates: () => ({
    from: format(subDays(new Date(), 29), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })},
  { label: '今月', getDates: () => ({
    from: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  })},
];

/**
 * カスタムツールチップ
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-xl text-sm max-w-xs">
      <p className="font-bold mb-2 text-gray-800 dark:text-gray-200">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: p.color }}></span>
            <span className="text-gray-600 dark:text-gray-400">{p.name}</span>
          </span>
          <span className="font-semibold" style={{ color: p.color }}>
            {p.name.includes('売上') ? `¥${Number(p.value).toLocaleString()}` :
             p.name.includes('生産性') ? `¥${Number(p.value).toLocaleString()}/h` :
             p.name.includes('時間') ? `${Number(p.value).toFixed(1)}h` :
             p.name.includes('人数') ? `${p.value}人` :
             p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * スケルトンローダー
 */
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
      <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
      <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm animate-pulse">
      <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
      <div className="h-[280px] bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <BarChart3 className="h-12 w-12 text-gray-300 dark:text-gray-600" />
      </div>
    </div>
  );
}

/**
 * 集計サマリーカード
 */
function MetricCard({ title, value, unit, icon: Icon, color, subtitle, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </motion.div>
  );
}

/**
 * 部署別勤怠サマリーカード
 */
function DeptCard({ name, category, totalHours, totalWorkers, days, icon: Icon, color, bgColor, deptDetails, onToggle, isExpanded }) {
  const avgHoursPerDay = days > 0 ? (totalHours / days).toFixed(1) : '0.0';
  const avgWorkersPerDay = days > 0 ? Math.round(totalWorkers / days) : 0;

  // 日別データをグラフ用に整形
  const dailyChartData = useMemo(() => {
    if (!deptDetails || !deptDetails.dates) return [];
    return Object.entries(deptDetails.dates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        label: format(parseISO(date), 'M/d', { locale: ja }),
        hours: d.total_hours || 0,
        workers: d.attended_employees || 0,
      }));
  }, [deptDetails]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl border shadow-sm ${bgColor} cursor-pointer transition-all hover:shadow-md`}
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${color}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <h4 className="font-bold text-sm">{name}</h4>
          </div>
          <span className="text-xs text-muted-foreground">{isExpanded ? '閉じる' : 'タップで詳細'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">期間合計時間</p>
            <p className="text-lg font-bold">{totalHours.toFixed(1)}<span className="text-xs font-normal ml-0.5">h</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">延べ出勤人数</p>
            <p className="text-lg font-bold">{totalWorkers}<span className="text-xs font-normal ml-0.5">人</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">日平均時間</p>
            <p className="text-sm font-semibold">{avgHoursPerDay}h/日</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">日平均人数</p>
            <p className="text-sm font-semibold">{avgWorkersPerDay}人/日</p>
          </div>
        </div>
      </div>

      {/* 展開詳細 */}
      <AnimatePresence>
        {isExpanded && dailyChartData.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-3">
              <h5 className="text-xs font-bold text-muted-foreground mb-2">日別勤務時間推移</h5>
              <ResponsiveContainer width="100%" height={150}>
                <ComposedChart data={dailyChartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v}h`} />
                  <Tooltip
                    formatter={(v, n) => [n === '勤務時間' ? `${Number(v).toFixed(1)}h` : `${v}人`, n]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="hours" name="勤務時間" fill="#3b82f680" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="workers" name="出勤人数" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>

              {/* 日別テーブル */}
              <div className="mt-3 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-1 px-2 font-semibold">日付</th>
                      <th className="text-right py-1 px-2 font-semibold">勤務時間</th>
                      <th className="text-right py-1 px-2 font-semibold">出勤人数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyChartData.map(d => (
                      <tr key={d.date} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-1 px-2">{d.label}</td>
                        <td className="py-1 px-2 text-right font-medium">{d.hours.toFixed(1)}h</td>
                        <td className="py-1 px-2 text-right font-medium">{d.workers}人</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * 過去実績ページ
 */
export default function ProductivityHistory() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(today);
  const [activePreset, setActivePreset] = useState(1);
  const [chartType, setChartType] = useState('productivity');
  const [viewMode, setViewMode] = useState('trend');
  const [activeTab, setActiveTab] = useState('store'); // 'store' | 'department'
  const [expandedDept, setExpandedDept] = useState(null); // タップ詳細展開用

  // データ取得
  const { data: apiResult, isLoading, error, refetch } = useQuery({
    queryKey: ['productivity-history', dateFrom, dateTo],
    queryFn: () => fetchHistoryData(dateFrom, dateTo),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const rawData = apiResult?.data || [];
  const departmentData = apiResult?.department_data || {};

  // 日付ごとに集計（全店舗合計）
  const dailySummary = useMemo(() => {
    const byDate = {};
    rawData.forEach(item => {
      const date = item.wk_date;
      if (!date) return;
      if (!byDate[date]) {
        byDate[date] = { date, totalSales: 0, totalHours: 0, totalWorkers: 0, storeCount: 0 };
      }
      byDate[date].totalSales += parseInt(item.kingaku || 0);
      byDate[date].totalHours += parseFloat(item.wk_tm || 0);
      byDate[date].totalWorkers += parseInt(item.wk_cnt || 0);
      byDate[date].storeCount++;
    });
    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        productivity: d.totalHours > 0 ? Math.round(d.totalSales / d.totalHours) : 0,
        label: format(parseISO(d.date), 'M/d（E）', { locale: ja }),
      }));
  }, [rawData]);

  // 店舗ごとに集計
  const storesSummary = useMemo(() => {
    const byStore = {};
    rawData.forEach(item => {
      const name = item.tenpo_name;
      if (!name) return;
      if (!byStore[name]) {
        byStore[name] = { name, totalSales: 0, totalHours: 0, totalWorkers: 0, days: 0 };
      }
      byStore[name].totalSales += parseInt(item.kingaku || 0);
      byStore[name].totalHours += parseFloat(item.wk_tm || 0);
      byStore[name].totalWorkers += parseInt(item.wk_cnt || 0);
      byStore[name].days++;
    });
    return Object.values(byStore)
      .map(s => ({
        ...s,
        productivity: s.totalHours > 0 ? Math.round(s.totalSales / s.totalHours) : 0,
        avgDailySales: s.days > 0 ? Math.round(s.totalSales / s.days) : 0,
      }))
      .sort((a, b) => b.productivity - a.productivity);
  }, [rawData]);

  // 部署別集計
  const deptSummary = useMemo(() => {
    const result = {};
    Object.entries(departmentData).forEach(([name, dept]) => {
      const dates = Object.values(dept.dates || {});
      const totalHours = dates.reduce((s, d) => s + (d.total_hours || 0), 0);
      const totalWorkers = dates.reduce((s, d) => s + (d.attended_employees || 0), 0);
      result[name] = {
        name,
        category: dept.category,
        totalHours,
        totalWorkers,
        days: dates.length,
        dates: dept.dates || {},
      };
    });
    return result;
  }, [departmentData]);

  // カテゴリ別集計
  const categorySummary = useMemo(() => {
    const cats = { online: { totalHours: 0, totalWorkers: 0, days: 0, depts: [] },
                   manufacturing: { totalHours: 0, totalWorkers: 0, days: 0, depts: [] },
                   planning: { totalHours: 0, totalWorkers: 0, days: 0, depts: [] } };
    Object.values(deptSummary).forEach(dept => {
      const cat = cats[dept.category];
      if (!cat) return;
      cat.totalHours += dept.totalHours;
      cat.totalWorkers += dept.totalWorkers;
      cat.days = Math.max(cat.days, dept.days);
      cat.depts.push(dept);
    });
    return cats;
  }, [deptSummary]);

  // 全体サマリー
  const overallSummary = useMemo(() => {
    const totalSales = dailySummary.reduce((s, d) => s + d.totalSales, 0);
    const totalHours = dailySummary.reduce((s, d) => s + d.totalHours, 0);
    const totalWorkers = dailySummary.reduce((s, d) => s + d.totalWorkers, 0);
    const avgProductivity = totalHours > 0 ? Math.round(totalSales / totalHours) : 0;
    const days = dailySummary.length;
    return { totalSales, totalHours, totalWorkers, avgProductivity, days };
  }, [dailySummary]);

  const handlePreset = (preset, index) => {
    const dates = preset.getDates();
    setDateFrom(dates.from);
    setDateTo(dates.to);
    setActivePreset(index);
  };

  const handlePrevPeriod = () => {
    const days = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24)) + 1;
    setDateFrom(format(subDays(new Date(dateFrom), days), 'yyyy-MM-dd'));
    setDateTo(format(subDays(new Date(dateTo), days), 'yyyy-MM-dd'));
    setActivePreset(-1);
  };

  const handleNextPeriod = () => {
    const days = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24)) + 1;
    const newTo = new Date(dateTo);
    newTo.setDate(newTo.getDate() + days);
    if (newTo > new Date()) {
      setDateTo(today);
    } else {
      setDateTo(format(newTo, 'yyyy-MM-dd'));
    }
    setDateFrom(format(new Date(new Date(dateFrom).getTime() + days * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
    setActivePreset(-1);
  };

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            過去実績・分析
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            期間を選択して人時生産性の推移を確認
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          更新
        </Button>
      </div>

      {/* 期間選択 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {DATE_PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => handlePreset(preset, i)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activePreset === i
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-primary ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPeriod}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={e => { setDateFrom(e.target.value); setActivePreset(-1); }}
                className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <span className="text-muted-foreground text-sm">〜</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={e => { setDateTo(e.target.value); setActivePreset(-1); }}
                className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <button
              onClick={handleNextPeriod}
              disabled={dateTo >= today}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-4 flex items-center gap-3"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">データ取得エラー</p>
            <p className="text-xs mt-0.5">{error.message}</p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm" className="ml-auto">再試行</Button>
        </motion.div>
      )}

      {/* カテゴリタブ */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
            activeTab === 'store'
              ? 'bg-white dark:bg-gray-700 shadow-sm text-primary ring-1 ring-primary/20'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package className="h-4 w-4" />
          店舗
        </button>
        <button
          onClick={() => setActiveTab('department')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
            activeTab === 'department'
              ? 'bg-white dark:bg-gray-700 shadow-sm text-primary ring-1 ring-primary/20'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Factory className="h-4 w-4" />
          通販・製造・企画
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'store' ? (
          <motion.div
            key="store"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* サマリーカード */}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                  title="期間合計売上"
                  value={Math.round(overallSummary.totalSales)}
                  unit="円"
                  icon={DollarSign}
                  color="bg-blue-500"
                  subtitle={overallSummary.days > 0 ? `日平均 ¥${Math.round(overallSummary.totalSales / overallSummary.days).toLocaleString()}` : ''}
                  index={0}
                />
                <MetricCard
                  title="平均人時生産性"
                  value={Math.round(overallSummary.avgProductivity)}
                  unit="円/h"
                  icon={Activity}
                  color={overallSummary.avgProductivity >= PRODUCTIVITY_TARGET ? 'bg-emerald-500' :
                         overallSummary.avgProductivity >= PRODUCTIVITY_GOOD ? 'bg-blue-500' :
                         overallSummary.avgProductivity >= PRODUCTIVITY_WARNING ? 'bg-amber-500' : 'bg-red-500'}
                  subtitle={`目標 ¥${PRODUCTIVITY_TARGET.toLocaleString()}/h`}
                  index={1}
                />
                <MetricCard
                  title="期間合計労働時間"
                  value={overallSummary.totalHours.toFixed(1)}
                  unit="時間"
                  icon={Clock}
                  color="bg-purple-500"
                  subtitle={overallSummary.days > 0 ? `日平均 ${(overallSummary.totalHours / overallSummary.days).toFixed(1)}h` : ''}
                  index={2}
                />
                <MetricCard
                  title="延べ出勤人数"
                  value={overallSummary.totalWorkers}
                  unit="人"
                  icon={Users}
                  color="bg-indigo-500"
                  subtitle={overallSummary.days > 0 ? `日平均 ${Math.round(overallSummary.totalWorkers / overallSummary.days)}人` : ''}
                  index={3}
                />
              </div>
            )}

            {/* グラフ表示切替 */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('trend')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'trend' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary ring-1 ring-primary/20' : 'text-muted-foreground'}`}
                >
                  日別推移
                </button>
                <button
                  onClick={() => setViewMode('store')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'store' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary ring-1 ring-primary/20' : 'text-muted-foreground'}`}
                >
                  店舗別比較
                </button>
              </div>

              {viewMode === 'trend' && (
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  {[
                    { key: 'productivity', label: '人時生産性' },
                    { key: 'sales', label: '売上' },
                    { key: 'hours', label: '労働時間' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setChartType(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${chartType === key ? 'bg-white dark:bg-gray-700 shadow-sm text-primary ring-1 ring-primary/20' : 'text-muted-foreground'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* メイングラフ */}
            {isLoading ? (
              <SkeletonChart />
            ) : viewMode === 'trend' ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {chartType === 'productivity' ? '人時生産性推移（全店舗合計）' :
                   chartType === 'sales' ? '日別売上推移（全店舗合計）' : '日別労働時間推移（全店舗合計）'}
                </h3>
                {dailySummary.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">この期間のデータがありません</p>
                    <p className="text-xs mt-1">別の期間を選択してください</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={dailySummary} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={v =>
                          chartType === 'productivity' ? `¥${(v / 1000).toFixed(0)}k` :
                          chartType === 'sales' ? `¥${(v / 10000).toFixed(0)}万` :
                          `${v.toFixed(0)}h`
                        }
                      />
                      <Tooltip content={<CustomTooltip />} />
                      {chartType === 'productivity' && (
                        <ReferenceLine
                          y={PRODUCTIVITY_TARGET}
                          stroke="#22c55e"
                          strokeDasharray="5 5"
                          label={{ value: `目標¥${PRODUCTIVITY_TARGET.toLocaleString()}`, position: 'right', fontSize: 9, fill: '#22c55e' }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey={chartType === 'productivity' ? 'productivity' : chartType === 'sales' ? 'totalSales' : 'totalHours'}
                        fill="url(#colorArea)"
                        stroke="none"
                      />
                      <Line
                        type="monotone"
                        dataKey={chartType === 'productivity' ? 'productivity' : chartType === 'sales' ? 'totalSales' : 'totalHours'}
                        name={chartType === 'productivity' ? '人時生産性' : chartType === 'sales' ? '売上' : '労働時間'}
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              /* 店舗別比較 */
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    店舗別人時生産性（期間平均）
                  </h3>
                  {storesSummary.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>データがありません</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={storesSummary} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          formatter={(v) => [`¥${Number(v).toLocaleString()}/h`, '人時生産性']}
                          labelFormatter={l => l}
                        />
                        <ReferenceLine y={PRODUCTIVITY_TARGET} stroke="#22c55e" strokeDasharray="5 5" label={{ value: '目標', position: 'right', fontSize: 9, fill: '#22c55e' }} />
                        <Bar dataKey="productivity" name="人時生産性" radius={[6, 6, 0, 0]}>
                          {storesSummary.map((entry, i) => (
                            <Cell key={i} fill={getProductivityColor(entry.productivity)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* 店舗別サマリーテーブル */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      店舗別実績サマリー
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider">店舗名</th>
                          <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">期間合計売上</th>
                          <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">日平均売上</th>
                          <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">総労働時間</th>
                          <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">延べ人数</th>
                          <th className="text-center p-3 font-semibold text-xs uppercase tracking-wider">人時生産性</th>
                          <th className="text-center p-3 font-semibold text-xs uppercase tracking-wider">評価</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storesSummary.map((store, i) => (
                          <motion.tr
                            key={store.name}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: i * 0.03 }}
                            className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i === 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}
                          >
                            <td className="p-3 font-medium flex items-center gap-2">
                              {i === 0 && <span className="text-xs">🥇</span>}
                              {i === 1 && <span className="text-xs">🥈</span>}
                              {i === 2 && <span className="text-xs">🥉</span>}
                              {store.name}
                            </td>
                            <td className="p-3 text-right font-medium">¥{store.totalSales.toLocaleString()}</td>
                            <td className="p-3 text-right text-muted-foreground">¥{store.avgDailySales.toLocaleString()}</td>
                            <td className="p-3 text-right">{store.totalHours.toFixed(1)}h</td>
                            <td className="p-3 text-right">{store.totalWorkers}人</td>
                            <td className="p-3 text-center">
                              <span className="font-bold" style={{ color: getProductivityColor(store.productivity) }}>
                                ¥{store.productivity.toLocaleString()}/h
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm"
                                style={{ backgroundColor: getProductivityColor(store.productivity) }}
                              >
                                {getProductivityLabel(store.productivity)}
                              </span>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          /* 通販・製造・企画タブ */
          <motion.div
            key="department"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <>
                {/* カテゴリ別サマリーカード */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <DeptCard
                    name="通販部"
                    category="online"
                    totalHours={categorySummary.online.totalHours}
                    totalWorkers={categorySummary.online.totalWorkers}
                    days={categorySummary.online.days}
                    icon={ShoppingCart}
                    color="bg-orange-500"
                    bgColor="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                    deptDetails={(() => {
                      const onlineDepts = categorySummary.online.depts || [];
                      const mergedDates = {};
                      onlineDepts.forEach(d => {
                        Object.entries(d.dates || {}).forEach(([date, val]) => {
                          if (!mergedDates[date]) mergedDates[date] = { total_hours: 0, attended_employees: 0 };
                          mergedDates[date].total_hours += val.total_hours || 0;
                          mergedDates[date].attended_employees += val.attended_employees || 0;
                        });
                      });
                      return { dates: mergedDates };
                    })()}
                    onToggle={() => setExpandedDept(expandedDept === 'online' ? null : 'online')}
                    isExpanded={expandedDept === 'online'}
                  />
                  <DeptCard
                    name="製造部（工房）"
                    category="manufacturing"
                    totalHours={categorySummary.manufacturing.totalHours}
                    totalWorkers={categorySummary.manufacturing.totalWorkers}
                    days={categorySummary.manufacturing.days}
                    icon={Factory}
                    color="bg-teal-500"
                    bgColor="bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800"
                    deptDetails={(() => {
                      const mfgDepts = categorySummary.manufacturing.depts || [];
                      const mergedDates = {};
                      mfgDepts.forEach(d => {
                        Object.entries(d.dates || {}).forEach(([date, val]) => {
                          if (!mergedDates[date]) mergedDates[date] = { total_hours: 0, attended_employees: 0 };
                          mergedDates[date].total_hours += val.total_hours || 0;
                          mergedDates[date].attended_employees += val.attended_employees || 0;
                        });
                      });
                      return { dates: mergedDates };
                    })()}
                    onToggle={() => setExpandedDept(expandedDept === 'manufacturing' ? null : 'manufacturing')}
                    isExpanded={expandedDept === 'manufacturing'}
                  />
                  <DeptCard
                    name="企画部"
                    category="planning"
                    totalHours={categorySummary.planning.totalHours}
                    totalWorkers={categorySummary.planning.totalWorkers}
                    days={categorySummary.planning.days}
                    icon={Lightbulb}
                    color="bg-violet-500"
                    bgColor="bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800"
                    deptDetails={(() => {
                      const planDepts = categorySummary.planning.depts || [];
                      const mergedDates = {};
                      planDepts.forEach(d => {
                        Object.entries(d.dates || {}).forEach(([date, val]) => {
                          if (!mergedDates[date]) mergedDates[date] = { total_hours: 0, attended_employees: 0 };
                          mergedDates[date].total_hours += val.total_hours || 0;
                          mergedDates[date].attended_employees += val.attended_employees || 0;
                        });
                      });
                      return { dates: mergedDates };
                    })()}
                    onToggle={() => setExpandedDept(expandedDept === 'planning' ? null : 'planning')}
                    isExpanded={expandedDept === 'planning'}
                  />
                </div>

                {/* 部署別詳細テーブル */}
                {Object.keys(deptSummary).length > 0 ? (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="font-bold flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        部署別勤怠サマリー
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        ジョブカンから取得した勤怠データ（売上・生産量は手入力が必要です）
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left p-3 font-semibold text-xs uppercase tracking-wider">部署名</th>
                            <th className="text-center p-3 font-semibold text-xs uppercase tracking-wider">カテゴリ</th>
                            <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">期間合計時間</th>
                            <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">日平均時間</th>
                            <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">延べ出勤人数</th>
                            <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">日平均人数</th>
                            <th className="text-right p-3 font-semibold text-xs uppercase tracking-wider">稼働日数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(deptSummary).map((dept, i) => {
                            const catLabel = dept.category === 'online' ? '通販' :
                                             dept.category === 'manufacturing' ? '製造' : '企画';
                            const catColor = dept.category === 'online' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                                             dept.category === 'manufacturing' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' :
                                             'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
                            return (
                              <motion.tr
                                key={dept.name}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: i * 0.05 }}
                                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                              >
                                <td className="p-3 font-medium">{dept.name}</td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${catColor}`}>
                                    {catLabel}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-semibold">{dept.totalHours.toFixed(1)}h</td>
                                <td className="p-3 text-right text-muted-foreground">
                                  {dept.days > 0 ? (dept.totalHours / dept.days).toFixed(1) : '0.0'}h
                                </td>
                                <td className="p-3 text-right font-semibold">{dept.totalWorkers}人</td>
                                <td className="p-3 text-right text-muted-foreground">
                                  {dept.days > 0 ? Math.round(dept.totalWorkers / dept.days) : 0}人
                                </td>
                                <td className="p-3 text-right">{dept.days}日</td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <Factory className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="font-medium text-muted-foreground">この期間の部署データがありません</p>
                    <p className="text-xs text-muted-foreground mt-1">別の期間を選択してください</p>
                  </div>
                )}

                {/* 工場別詳細 */}
                {categorySummary.manufacturing.depts.length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                      <Factory className="h-5 w-5 text-teal-500" />
                      工場別 勤務時間推移
                    </h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={categorySummary.manufacturing.depts.map(d => ({
                          name: d.name,
                          totalHours: d.totalHours,
                          totalWorkers: d.totalWorkers,
                        }))}
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`} />
                        <Tooltip
                          formatter={(v, name) => [
                            name === '合計時間' ? `${Number(v).toFixed(1)}h` : `${v}人`,
                            name
                          ]}
                        />
                        <Legend />
                        <Bar dataKey="totalHours" name="合計時間" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="totalWorkers" name="延べ人数" fill="#5eead4" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 注記 */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        ※ 店舗売上はTempoVisor（店舗バイザー）、勤怠データはジョブカンから取得しています。通販部・製造部・企画部は勤怠データのみ表示。
      </p>
    </div>
  );
}
