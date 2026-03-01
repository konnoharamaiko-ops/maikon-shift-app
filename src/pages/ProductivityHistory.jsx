import { useState, useCallback } from 'react';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion } from 'framer-motion';
import {
  Calendar, TrendingUp, TrendingDown, BarChart3, RefreshCw,
  DollarSign, Clock, Users, Download, ChevronLeft, ChevronRight,
  AlertTriangle, Target, Activity
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
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
  '心斎橋店', 'かがや店', 'エキマル', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂FC店'
];

const STORE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#10b981', '#6366f1',
  '#84cc16', '#14b8a6', '#a855f7'
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
  return result.data || [];
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
    to: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
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
        <div key={i} className="flex items-center justify-between gap-3 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }}></span>
            <span className="text-gray-600 dark:text-gray-400">{p.name}</span>
          </span>
          <span className="font-semibold" style={{ color: p.color }}>
            {p.name.includes('売上') ? `¥${Number(p.value).toLocaleString()}` :
             p.name.includes('生産性') ? `¥${Number(p.value).toLocaleString()}/h` :
             p.name.includes('時間') ? `${Number(p.value).toFixed(1)}h` :
             p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 集計サマリーカード
 */
function MetricCard({ title, value, unit, icon: Icon, color, change, index }) {
  const isPositive = change > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 text-xs mt-1 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          <span>{isPositive ? '+' : ''}{change.toFixed(1)}% 前期比</span>
        </div>
      )}
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
  const [selectedStores, setSelectedStores] = useState(ALL_STORES);
  const [activePreset, setActivePreset] = useState(1); // 直近7日
  const [chartType, setChartType] = useState('productivity'); // 'productivity' | 'sales' | 'hours'
  const [viewMode, setViewMode] = useState('trend'); // 'trend' | 'store'

  // データ取得（React Queryでキャッシュ）
  const { data: rawData = [], isLoading, error, refetch } = useQuery({
    queryKey: ['productivity-history', dateFrom, dateTo],
    queryFn: () => fetchHistoryData(dateFrom, dateTo),
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
    gcTime: 30 * 60 * 1000, // 30分間保持
  });

  // 日付ごとに集計（全店舗合計）
  const dailySummary = (() => {
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
  })();

  // 店舗ごとに集計
  const storesSummary = (() => {
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
  })();

  // 全体サマリー
  const overallSummary = (() => {
    const totalSales = dailySummary.reduce((s, d) => s + d.totalSales, 0);
    const totalHours = dailySummary.reduce((s, d) => s + d.totalHours, 0);
    const totalWorkers = dailySummary.reduce((s, d) => s + d.totalWorkers, 0);
    const avgProductivity = totalHours > 0 ? Math.round(totalSales / totalHours) : 0;
    return { totalSales, totalHours, totalWorkers, avgProductivity };
  })();

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
          {/* プリセットボタン */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {DATE_PRESETS.map((preset, i) => (
              <button
                key={i}
                onClick={() => handlePreset(preset, i)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activePreset === i
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* 期間ナビゲーション */}
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
                className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800"
              />
              <span className="text-muted-foreground text-sm">〜</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={e => { setDateTo(e.target.value); setActivePreset(-1); }}
                className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800"
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
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">データ取得エラー</p>
            <p className="text-xs mt-0.5">{error.message}</p>
          </div>
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          title="期間合計売上"
          value={Math.round(overallSummary.totalSales)}
          unit="円"
          icon={DollarSign}
          color="bg-blue-500"
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
          index={1}
        />
        <MetricCard
          title="期間合計労働時間"
          value={overallSummary.totalHours.toFixed(1)}
          unit="時間"
          icon={Clock}
          color="bg-purple-500"
          index={2}
        />
        <MetricCard
          title="延べ出勤人数"
          value={overallSummary.totalWorkers}
          unit="人"
          icon={Users}
          color="bg-indigo-500"
          index={3}
        />
      </div>

      {/* グラフ表示切替 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('trend')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'trend' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            日別推移
          </button>
          <button
            onClick={() => setViewMode('store')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'store' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-muted-foreground'}`}
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
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${chartType === key ? 'bg-white dark:bg-gray-700 shadow-sm text-primary' : 'text-muted-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* メイングラフ */}
      {isLoading ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
          <p className="text-muted-foreground">データを取得中...</p>
        </div>
      ) : viewMode === 'trend' ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {chartType === 'productivity' ? '人時生産性推移（全店舗合計）' :
             chartType === 'sales' ? '日別売上推移（全店舗合計）' : '日別労働時間推移（全店舗合計）'}
          </h3>
          {dailySummary.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>この期間のデータがありません</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailySummary} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                <Line
                  type="monotone"
                  dataKey={chartType === 'productivity' ? 'productivity' : chartType === 'sales' ? 'totalSales' : 'totalHours'}
                  name={chartType === 'productivity' ? '人時生産性' : chartType === 'sales' ? '売上' : '労働時間'}
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#3b82f6' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        /* 店舗別比較 */
        <div className="space-y-4">
          {/* 人時生産性棒グラフ */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              店舗別人時生産性（期間平均）
            </h3>
            {storesSummary.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">データがありません</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={storesSummary} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v, name) => [`¥${Number(v).toLocaleString()}/h`, '人時生産性']}
                    labelFormatter={l => l}
                  />
                  <ReferenceLine y={PRODUCTIVITY_TARGET} stroke="#22c55e" strokeDasharray="5 5" label={{ value: '目標', position: 'right', fontSize: 9, fill: '#22c55e' }} />
                  <Bar dataKey="productivity" name="人時生産性" radius={[4, 4, 0, 0]}>
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
                    <th className="text-left p-3 font-medium">店舗名</th>
                    <th className="text-right p-3 font-medium">期間合計売上</th>
                    <th className="text-right p-3 font-medium">日平均売上</th>
                    <th className="text-right p-3 font-medium">総労働時間</th>
                    <th className="text-right p-3 font-medium">延べ人数</th>
                    <th className="text-center p-3 font-medium">人時生産性</th>
                    <th className="text-center p-3 font-medium">評価</th>
                  </tr>
                </thead>
                <tbody>
                  {storesSummary.map((store, i) => (
                    <motion.tr
                      key={store.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="p-3 font-medium">{store.name}</td>
                      <td className="p-3 text-right">¥{store.totalSales.toLocaleString()}</td>
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
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
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

      {/* 注記 */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        ※ 過去データはTempoVisor・ジョブカンから取得。16時以降のレジ締め分は翌日反映の場合があります。
      </p>
    </div>
  );
}
