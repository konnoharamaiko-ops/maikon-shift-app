import { useState, useMemo } from 'react';
import { format, subYears } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, BarChart3, RefreshCw,
  DollarSign, Clock, Users, ChevronDown, ChevronUp,
  Target, Activity, ArrowUpRight, ArrowDownRight, Minus,
  Store, Package, Factory, Briefcase, Truck, FlaskConical,
  Calendar, ArrowLeft, Layers, ShoppingCart, Lightbulb
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, ReferenceLine
} from 'recharts';
import { Button } from '../components/ui/button';

// ===== 定数 =====
const ALL_STORES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', '駅丸', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂福島店'
];

const DEPT_ICONS = {
  '通販部': Package,
  '企画部': Lightbulb,
  '特販部': ShoppingCart,
  'かがや工場': Factory,
  '北摂工場': Factory,
  '鶴橋工房': Factory,
  '都島工場': Factory,
};

const DEPT_COLORS = {
  '通販部': { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', icon: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-300' },
  '企画部': { bg: 'bg-cyan-50 dark:bg-cyan-950/30', border: 'border-cyan-200 dark:border-cyan-800', icon: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300' },
  '特販部': { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', icon: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
  'かがや工場': { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', icon: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  '北摂工場': { bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-200 dark:border-teal-800', icon: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300' },
  '鶴橋工房': { bg: 'bg-lime-50 dark:bg-lime-950/30', border: 'border-lime-200 dark:border-lime-800', icon: 'bg-lime-600', text: 'text-lime-700 dark:text-lime-300' },
  '都島工場': { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', icon: 'bg-green-500', text: 'text-green-700 dark:text-green-300' },
};

// ===== API取得 =====
async function fetchComparisonData(month1, month2) {
  const url = `/api/productivity?month1=${month1}&month2=${month2}&action=comparison`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`APIエラー: ${response.status}`);
  return response.json();
}

// ===== ユーティリティ =====
function calcYoY(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatYoY(pct) {
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return '±0%';
}

function getYoYColor(pct) {
  if (pct > 5) return 'text-emerald-600 dark:text-emerald-400';
  if (pct > 0) return 'text-blue-600 dark:text-blue-400';
  if (pct < -5) return 'text-red-600 dark:text-red-400';
  if (pct < 0) return 'text-amber-600 dark:text-amber-400';
  return 'text-gray-500';
}

function getYoYBg(pct) {
  if (pct > 5) return 'bg-emerald-100 dark:bg-emerald-900/40';
  if (pct > 0) return 'bg-blue-100 dark:bg-blue-900/40';
  if (pct < -5) return 'bg-red-100 dark:bg-red-900/40';
  if (pct < 0) return 'bg-amber-100 dark:bg-amber-900/40';
  return 'bg-gray-100 dark:bg-gray-800';
}

function getYoYIcon(pct) {
  if (pct > 0) return ArrowUpRight;
  if (pct < 0) return ArrowDownRight;
  return Minus;
}

// ===== カスタムツールチップ =====
function ComparisonTooltip({ active, payload, label }) {
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
             p.name.includes('客数') ? `${Number(p.value).toLocaleString()}人` :
             Number(p.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ===== スケルトン =====
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm animate-pulse">
      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-3"></div>
      <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
      <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
    </div>
  );
}

// ===== サマリーカード =====
function YoYMetricCard({ title, currentValue, previousValue, unit, icon: Icon, color, format: formatFn, index }) {
  const yoy = calcYoY(currentValue, previousValue);
  const YoYIcon = getYoYIcon(yoy);

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
      <div className="text-xl font-bold tracking-tight">
        {formatFn ? formatFn(currentValue) : currentValue.toLocaleString()}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${getYoYBg(yoy)} ${getYoYColor(yoy)}`}>
          <YoYIcon className="h-3 w-3" />
          {formatYoY(yoy)}
        </span>
        <span className="text-xs text-muted-foreground">
          前年: {formatFn ? formatFn(previousValue) : previousValue.toLocaleString()}{unit || ''}
        </span>
      </div>
    </motion.div>
  );
}

// ===== 店舗別比較行 =====
function StoreComparisonRow({ storeName, current, previous, isExpanded, onToggle }) {
  const salesYoY = calcYoY(current.sales, previous.sales);
  const customersYoY = calcYoY(current.customers, previous.customers);
  const hoursYoY = calcYoY(current.work_hours, previous.work_hours);
  const prodYoY = calcYoY(current.productivity, previous.productivity);

  const SalesIcon = getYoYIcon(salesYoY);
  const ProdIcon = getYoYIcon(prodYoY);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
    >
      <div
        className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-gray-400" />
            <span className="font-bold text-sm">{storeName}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* 売上昨対 */}
            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${getYoYBg(salesYoY)} ${getYoYColor(salesYoY)}`}>
              <SalesIcon className="h-3 w-3" />
              売上{formatYoY(salesYoY)}
            </span>
            {/* 生産性昨対 */}
            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${getYoYBg(prodYoY)} ${getYoYColor(prodYoY)}`}>
              <ProdIcon className="h-3 w-3" />
              生産性{formatYoY(prodYoY)}
            </span>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </div>
        </div>

        {/* コンパクト表示 */}
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
          <div>
            <span className="text-muted-foreground">今年売上: </span>
            <span className="font-semibold">¥{current.sales.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">人時生産性: </span>
            <span className="font-semibold">¥{current.productivity.toLocaleString()}/h</span>
          </div>
        </div>
      </div>

      {/* 展開詳細 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-1.5 px-1 font-semibold text-muted-foreground">指標</th>
                    <th className="text-right py-1.5 px-1 font-semibold text-muted-foreground">今年</th>
                    <th className="text-right py-1.5 px-1 font-semibold text-muted-foreground">前年</th>
                    <th className="text-right py-1.5 px-1 font-semibold text-muted-foreground">昨対比</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 px-1 font-medium flex items-center gap-1"><DollarSign className="h-3 w-3 text-emerald-500" />売上</td>
                    <td className="py-1.5 px-1 text-right font-semibold">¥{current.sales.toLocaleString()}</td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">¥{previous.sales.toLocaleString()}</td>
                    <td className={`py-1.5 px-1 text-right font-bold ${getYoYColor(salesYoY)}`}>{formatYoY(salesYoY)}</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 px-1 font-medium flex items-center gap-1"><Users className="h-3 w-3 text-blue-500" />客数</td>
                    <td className="py-1.5 px-1 text-right font-semibold">{current.customers.toLocaleString()}人</td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">{previous.customers.toLocaleString()}人</td>
                    <td className={`py-1.5 px-1 text-right font-bold ${getYoYColor(customersYoY)}`}>{formatYoY(customersYoY)}</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 px-1 font-medium flex items-center gap-1"><DollarSign className="h-3 w-3 text-purple-500" />客単価</td>
                    <td className="py-1.5 px-1 text-right font-semibold">¥{current.unit_price.toLocaleString()}</td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">¥{previous.unit_price.toLocaleString()}</td>
                    <td className={`py-1.5 px-1 text-right font-bold ${getYoYColor(calcYoY(current.unit_price, previous.unit_price))}`}>{formatYoY(calcYoY(current.unit_price, previous.unit_price))}</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 px-1 font-medium flex items-center gap-1"><Clock className="h-3 w-3 text-amber-500" />稼働時間</td>
                    <td className="py-1.5 px-1 text-right font-semibold">{current.work_hours.toFixed(1)}h</td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">{previous.work_hours.toFixed(1)}h</td>
                    <td className={`py-1.5 px-1 text-right font-bold ${getYoYColor(hoursYoY)}`}>{formatYoY(hoursYoY)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-1 font-medium flex items-center gap-1"><Target className="h-3 w-3 text-red-500" />人時生産性</td>
                    <td className="py-1.5 px-1 text-right font-semibold">¥{current.productivity.toLocaleString()}/h</td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">¥{previous.productivity.toLocaleString()}/h</td>
                    <td className={`py-1.5 px-1 text-right font-bold ${getYoYColor(prodYoY)}`}>{formatYoY(prodYoY)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ===== 部署別比較カード =====
function DeptComparisonCard({ deptName, current, previous }) {
  const hoursYoY = calcYoY(current.work_hours, previous.work_hours);
  const HoursIcon = getYoYIcon(hoursYoY);
  const IconComp = DEPT_ICONS[deptName] || Briefcase;
  const colors = DEPT_COLORS[deptName] || { bg: 'bg-gray-50 dark:bg-gray-950/30', border: 'border-gray-200 dark:border-gray-800', icon: 'bg-gray-500', text: 'text-gray-700 dark:text-gray-300' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl border shadow-sm ${colors.bg} ${colors.border} p-4`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${colors.icon}`}>
            <IconComp className="h-4 w-4 text-white" />
          </div>
          <h4 className={`font-bold text-sm ${colors.text}`}>{deptName}</h4>
        </div>
        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${getYoYBg(hoursYoY)} ${getYoYColor(hoursYoY)}`}>
          <HoursIcon className="h-3 w-3" />
          {formatYoY(hoursYoY)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">今年稼働時間</p>
          <p className="text-lg font-bold">{current.work_hours.toFixed(1)}<span className="text-xs font-normal ml-0.5">h</span></p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">前年稼働時間</p>
          <p className="text-lg font-bold text-muted-foreground">{previous.work_hours.toFixed(1)}<span className="text-xs font-normal ml-0.5">h</span></p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        ※ 売上データは手入力対応（ジョブカンから勤務時間のみ自動取得）
      </p>
    </motion.div>
  );
}

// ===== メインコンポーネント =====
export default function ComparisonAnalysis() {
  const now = new Date();
  const currentMonth = format(now, 'yyyy-MM');
  const lastYearMonth = format(subYears(now, 1), 'yyyy-MM');

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [comparisonMonth, setComparisonMonth] = useState('');
  const [activeTab, setActiveTab] = useState('store'); // 'store' | 'department'
  const [chartMetric, setChartMetric] = useState('sales'); // 'sales' | 'customers' | 'productivity' | 'work_hours'
  const [expandedStore, setExpandedStore] = useState(null);

  // 比較対象月の計算
  const effectiveCompMonth = useMemo(() => {
    if (comparisonMonth) return comparisonMonth;
    const [y, m] = selectedMonth.split('-').map(Number);
    return `${y - 1}-${String(m).padStart(2, '0')}`;
  }, [selectedMonth, comparisonMonth]);

  // データ取得
  const { data: apiResult, isLoading, error, refetch } = useQuery({
    queryKey: ['comparison-analysis', selectedMonth, effectiveCompMonth],
    queryFn: () => fetchComparisonData(selectedMonth, effectiveCompMonth),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const comparison = apiResult?.comparison || [];
  const currentData = comparison[0] || null;
  const previousData = comparison[1] || null;

  // 店舗別比較データ
  const storeComparisons = useMemo(() => {
    if (!currentData || !previousData) return [];
    return ALL_STORES.map(name => ({
      name,
      current: currentData.stores[name] || { sales: 0, customers: 0, unit_price: 0, work_hours: 0, productivity: 0 },
      previous: previousData.stores[name] || { sales: 0, customers: 0, unit_price: 0, work_hours: 0, productivity: 0 },
    }));
  }, [currentData, previousData]);

  // 部署別比較データ
  const deptComparisons = useMemo(() => {
    if (!currentData || !previousData) return [];
    const currentDepts = currentData.departments || {};
    const previousDepts = previousData.departments || {};
    const allDeptNames = [...new Set([...Object.keys(currentDepts), ...Object.keys(previousDepts)])];
    return allDeptNames.map(name => ({
      name,
      current: currentDepts[name] || { work_hours: 0, sales: 0, customers: 0, productivity: 0 },
      previous: previousDepts[name] || { work_hours: 0, sales: 0, customers: 0, productivity: 0 },
    }));
  }, [currentData, previousData]);

  // グラフデータ
  const chartData = useMemo(() => {
    return storeComparisons.map(s => ({
      name: s.name.replace('店', '').replace('イオン', 'ｲｵﾝ'),
      今年: chartMetric === 'sales' ? s.current.sales :
            chartMetric === 'customers' ? s.current.customers :
            chartMetric === 'productivity' ? s.current.productivity :
            s.current.work_hours,
      前年: chartMetric === 'sales' ? s.previous.sales :
            chartMetric === 'customers' ? s.previous.customers :
            chartMetric === 'productivity' ? s.previous.productivity :
            s.previous.work_hours,
    }));
  }, [storeComparisons, chartMetric]);

  // 全店合計
  const totalCurrent = currentData?.total || { sales: 0, customers: 0, unit_price: 0, work_hours: 0, productivity: 0 };
  const totalPrevious = previousData?.total || { sales: 0, customers: 0, unit_price: 0, work_hours: 0, productivity: 0 };

  // 月選択オプション生成
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(format(d, 'yyyy-MM'));
    }
    return options;
  }, []);

  const chartMetricLabels = {
    sales: { label: '売上', unit: '円', formatter: v => `¥${(v / 10000).toFixed(0)}万` },
    customers: { label: '客数', unit: '人', formatter: v => `${v}人` },
    productivity: { label: '人時生産性', unit: '円/h', formatter: v => `¥${v.toLocaleString()}` },
    work_hours: { label: '稼働時間', unit: 'h', formatter: v => `${v.toFixed(0)}h` },
  };

  const [y1, m1] = selectedMonth.split('-');
  const [y2, m2] = effectiveCompMonth.split('-');
  const currentLabel = `${y1}年${parseInt(m1)}月`;
  const previousLabel = `${y2}年${parseInt(m2)}月`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      {/* ヘッダー */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </a>
              <div>
                <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  比較分析
                </h1>
                <p className="text-xs text-muted-foreground">昨対比較 - 売上・客数・稼働時間・人時生産性</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">更新</span>
            </Button>
          </div>

          {/* 月選択 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {monthOptions.map(m => (
                  <option key={m} value={m}>{m.replace('-', '年') + '月'}</option>
                ))}
              </select>
            </div>
            <span className="text-xs text-muted-foreground">vs</span>
            <div className="flex items-center gap-2">
              <select
                value={comparisonMonth}
                onChange={(e) => setComparisonMonth(e.target.value)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">前年同月（自動）</option>
                {monthOptions.map(m => (
                  <option key={m} value={m}>{m.replace('-', '年') + '月'}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
            データ取得エラー: {error.message}
            <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-3">
              再試行
            </Button>
          </div>
        )}

        {/* ローディング */}
        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm animate-pulse">
              <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
              <div className="h-[280px] bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              </div>
            </div>
          </div>
        )}

        {/* データ表示 */}
        {!isLoading && currentData && previousData && (
          <>
            {/* 期間ラベル */}
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold">
                {currentLabel}
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold">
                {previousLabel}
              </span>
            </div>

            {/* 全店合計サマリー */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <YoYMetricCard
                title="全店売上"
                currentValue={totalCurrent.sales}
                previousValue={totalPrevious.sales}
                unit=""
                icon={DollarSign}
                color="bg-emerald-500"
                format={v => `¥${(v / 10000).toFixed(0)}万`}
                index={0}
              />
              <YoYMetricCard
                title="全店客数"
                currentValue={totalCurrent.customers}
                previousValue={totalPrevious.customers}
                unit="人"
                icon={Users}
                color="bg-blue-500"
                format={v => v.toLocaleString()}
                index={1}
              />
              <YoYMetricCard
                title="全店稼働時間"
                currentValue={totalCurrent.work_hours}
                previousValue={totalPrevious.work_hours}
                unit="h"
                icon={Clock}
                color="bg-amber-500"
                format={v => v.toFixed(1)}
                index={2}
              />
              <YoYMetricCard
                title="全店人時生産性"
                currentValue={totalCurrent.productivity}
                previousValue={totalPrevious.productivity}
                unit="/h"
                icon={Target}
                color="bg-red-500"
                format={v => `¥${v.toLocaleString()}`}
                index={3}
              />
            </div>

            {/* タブ切替 */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('store')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  activeTab === 'store'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Store className="h-4 w-4 inline mr-1" />
                店舗別
              </button>
              <button
                onClick={() => setActiveTab('department')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  activeTab === 'department'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Layers className="h-4 w-4 inline mr-1" />
                部署別
              </button>
            </div>

            {/* 店舗別タブ */}
            {activeTab === 'store' && (
              <>
                {/* グラフ */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-indigo-500" />
                      店舗別昨対比較
                    </h3>
                    <div className="flex gap-1">
                      {Object.entries(chartMetricLabels).map(([key, { label }]) => (
                        <button
                          key={key}
                          onClick={() => setChartMetric(key)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            chartMetric === key
                              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 9 }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tick={{ fontSize: 9 }}
                        tickFormatter={chartMetricLabels[chartMetric].formatter}
                      />
                      <Tooltip content={<ComparisonTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(value) => {
                          if (value === '今年') return currentLabel;
                          if (value === '前年') return previousLabel;
                          return value;
                        }}
                      />
                      <Bar
                        dataKey="今年"
                        name={`今年${chartMetricLabels[chartMetric].label}`}
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                      <Bar
                        dataKey="前年"
                        name={`前年${chartMetricLabels[chartMetric].label}`}
                        fill="#c7d2fe"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 店舗別一覧 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold flex items-center gap-2 px-1">
                    <Store className="h-4 w-4 text-gray-400" />
                    店舗別詳細（タップで展開）
                  </h3>
                  {storeComparisons.map(s => (
                    <StoreComparisonRow
                      key={s.name}
                      storeName={s.name}
                      current={s.current}
                      previous={s.previous}
                      isExpanded={expandedStore === s.name}
                      onToggle={() => setExpandedStore(expandedStore === s.name ? null : s.name)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* 部署別タブ */}
            {activeTab === 'department' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold flex items-center gap-2 px-1">
                  <Layers className="h-4 w-4 text-gray-400" />
                  部署別稼働時間比較
                </h3>
                <p className="text-xs text-muted-foreground px-1">
                  通販部・企画部・製造部等の勤務時間をジョブカンから自動取得しています。売上データは手入力対応です。
                </p>

                {deptComparisons.length === 0 ? (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                    <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">部署別データがありません</p>
                    <p className="text-xs text-muted-foreground mt-1">ジョブカンの勤怠集計データから部署別の勤務時間を取得します</p>
                  </div>
                ) : (
                  <>
                    {/* 部署別グラフ */}
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 shadow-sm">
                      <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-500" />
                        部署別稼働時間
                      </h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart
                          data={deptComparisons.map(d => ({
                            name: d.name,
                            今年: d.current.work_hours,
                            前年: d.previous.work_hours,
                          }))}
                          margin={{ top: 5, right: 5, left: -10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${v.toFixed(0)}h`} />
                          <Tooltip content={<ComparisonTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="今年" name={`${currentLabel}稼働時間`} fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                          <Bar dataKey="前年" name={`${previousLabel}稼働時間`} fill="#ddd6fe" radius={[4, 4, 0, 0]} maxBarSize={30} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 部署別カード */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {deptComparisons.map(d => (
                        <DeptComparisonCard
                          key={d.name}
                          deptName={d.name}
                          current={d.current}
                          previous={d.previous}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* データなし */}
        {!isLoading && !error && (!currentData || !previousData) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
            <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-bold text-gray-600 dark:text-gray-400">データを取得中...</p>
            <p className="text-sm text-muted-foreground mt-2">月を選択してデータを読み込んでください</p>
          </div>
        )}
      </main>
    </div>
  );
}
