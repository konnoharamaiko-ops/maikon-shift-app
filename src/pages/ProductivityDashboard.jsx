import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Activity, Wifi, WifiOff, TrendingUp, TrendingDown,
  Users, Clock, DollarSign, ChevronRight, X, BarChart3, Target,
  AlertTriangle, CheckCircle, Zap, Building2, ChevronDown, ChevronUp,
  Sun, Moon, LayoutGrid, LineChart as LineChartIcon, Timer, Coffee,
  Settings, Calendar, MapPin, ArrowUpRight, ArrowDownRight, Minus,
  Store, BanknoteIcon, Briefcase
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, ComposedChart, Line, Legend, Area, AreaChart
} from 'recharts';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';

// ===== 定数 =====
const PRODUCTIVITY_TARGET = 3000;
const PRODUCTIVITY_GOOD = 2500;
const PRODUCTIVITY_WARNING = 2000;

// 舞昆ブランドカラー
const BRAND = {
  primary: '#8B0000',    // 深紅
  secondary: '#C8960C',  // 金
  accent: '#2D5016',     // 深緑
};

const LEVEL_CONFIG = {
  excellent: {
    label: '優秀',
    color: '#16a34a',
    gradient: 'from-emerald-500 to-green-600',
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    border: 'border-emerald-400 dark:border-emerald-600',
    text: 'text-emerald-700 dark:text-emerald-400',
    badge: 'bg-emerald-500',
    ring: 'ring-emerald-400',
    icon: CheckCircle,
    lightBg: '#f0fdf4',
  },
  good: {
    label: '良好',
    color: '#2563eb',
    gradient: 'from-blue-500 to-indigo-600',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-400 dark:border-blue-600',
    text: 'text-blue-700 dark:text-blue-400',
    badge: 'bg-blue-500',
    ring: 'ring-blue-400',
    icon: TrendingUp,
    lightBg: '#eff6ff',
  },
  warning: {
    label: '注意',
    color: '#d97706',
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-400 dark:border-amber-600',
    text: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-500',
    ring: 'ring-amber-400',
    icon: AlertTriangle,
    lightBg: '#fffbeb',
  },
  danger: {
    label: '要改善',
    color: '#dc2626',
    gradient: 'from-red-500 to-rose-600',
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-400 dark:border-red-600',
    text: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-500',
    ring: 'ring-red-400',
    icon: TrendingDown,
    lightBg: '#fef2f2',
  },
};

function getProductivityLevel(prod) {
  if (prod >= PRODUCTIVITY_TARGET) return 'excellent';
  if (prod >= PRODUCTIVITY_GOOD) return 'good';
  if (prod >= PRODUCTIVITY_WARNING) return 'warning';
  return 'danger';
}

// ===== データ変換 =====
function transformStoreData(apiData) {
  if (!apiData || apiData.length === 0) return [];
  return apiData.map(item => ({
    store_code: item.code || item.store_code || '',
    store_name: item.tenpo_name || item.store_name || '',
    total_sales: parseInt(item.kingaku || item.total_sales || 0),
    total_hours: parseFloat(item.wk_tm || item.total_hours || 0),
    total_employees: parseInt(item.total_employees || 0),
    attended_employees: parseInt(item.wk_cnt || item.attended_employees || 0),
    working_employees: parseInt(item.working_now || item.working_employees || 0),
    break_employees: parseInt(item.break_now || item.break_employees || 0),
    productivity: parseInt(item.spd || item.productivity || 0),
    update_time: item.update_time || '',
    employees: item.employees || [],
    hourly_productivity: item.hourly_productivity || [],
    business_hours: item.business_hours || { open: 10, close: 18 },
    is_closed: item.is_closed || false,
  }));
}

function calcSummary(stores) {
  if (!stores || stores.length === 0) {
    return { totalSales: 0, totalWorkHours: 0, totalWorkers: 0, avgProductivity: 0, workingNow: 0, breakNow: 0 };
  }
  const activeStores = stores.filter(s => !s.is_closed);
  const totalSales = activeStores.reduce((s, st) => s + (st.total_sales || 0), 0);
  const totalWorkHours = activeStores.reduce((s, st) => s + (st.total_hours || 0), 0);
  const totalWorkers = activeStores.reduce((s, st) => s + (st.attended_employees || 0), 0);
  const workingNow = activeStores.reduce((s, st) => s + (st.working_employees || 0), 0);
  const breakNow = activeStores.reduce((s, st) => s + (st.break_employees || 0), 0);
  const avgProductivity = totalWorkHours > 0 ? Math.round(totalSales / totalWorkHours) : 0;
  return { totalSales, totalWorkHours, totalWorkers, avgProductivity, workingNow, breakNow };
}

// ===== 店舗設定（localStorageキー） =====
const STORE_SETTINGS_KEY = 'maikon_store_settings';

// デフォルト店舗設定
const DEFAULT_STORE_SETTINGS = {
  '田辺店':       { open: 9,  close: 19, closed_days: [] },
  '大正店':       { open: 10, close: 18, closed_days: [] },
  '天下茶屋店':   { open: 10, close: 18, closed_days: [] },
  '天王寺店':     { open: 10, close: 18, closed_days: [] },
  'アベノ店':     { open: 10, close: 18, closed_days: [] },
  '心斎橋店':     { open: 10, close: 18, closed_days: [] },
  'かがや店':     { open: 10, close: 18, closed_days: [] },
  'エキマル':     { open: 10, close: 22, closed_days: [] },
  '北摂店':       { open: 10, close: 18, closed_days: [] },
  '堺東店':       { open: 10, close: 20, closed_days: [], sunday_close: 19 },
  'イオン松原店': { open: 9,  close: 20, closed_days: [] },
  'イオン守口店': { open: 9,  close: 20, closed_days: [] },
  '美和堂FC店':   { open: 10, close: 18, closed_days: [0] }, // 0=日曜
};

const ALL_STORE_NAMES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', 'エキマル', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂FC店'
];

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function loadStoreSettings() {
  try {
    const saved = localStorage.getItem(STORE_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // デフォルト値とマージ（新しい店舗が追加された場合のフォールバック）
      return { ...DEFAULT_STORE_SETTINGS, ...parsed };
    }
  } catch (e) {}
  return { ...DEFAULT_STORE_SETTINGS };
}

function saveStoreSettings(settings) {
  try {
    localStorage.setItem(STORE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {}
}

async function fetchRealtimeData(storeSettings) {
  // localStorageの設定をAPIに渡す
  let url = '/api/productivity/realtime';
  if (storeSettings) {
    const encoded = encodeURIComponent(JSON.stringify(storeSettings));
    url += `?store_settings=${encoded}`;
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`APIエラー: ${response.status}`);
  const result = await response.json();
  return {
    stores: transformStoreData(result.data || []),
    sources: result.sources || {},
    timestamp: result.timestamp,
    employeeProductivity: result.employee_productivity || [],
  };
}

// ===== ダークモード =====
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const toggle = useCallback(() => {
    setDark(d => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  return [dark, toggle];
}

// ===== サブコンポーネント =====

/**
 * 人時生産性ゲージ（プログレスバー）
 */
function ProductivityGauge({ value, target = PRODUCTIVITY_TARGET, compact = false }) {
  const percentage = Math.min(100, Math.round((value / target) * 100));
  const level = getProductivityLevel(value);
  const config = LEVEL_CONFIG[level];

  return (
    <div className={compact ? '' : 'mt-2'}>
      {!compact && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-muted-foreground">目標達成率</span>
          <span className={`text-xs font-bold ${config.text}`}>{percentage}%</span>
        </div>
      )}
      <div className={`${compact ? 'h-1.5' : 'h-2'} bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`}>
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${config.gradient}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

/**
 * 時間帯別人時生産性グラフ
 */
function HourlyProductivityChart({ hourlyData, storeName }) {
  if (!hourlyData || hourlyData.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        時間帯別データなし
      </div>
    );
  }

  const chartData = hourlyData.map(h => ({
    time: `${h.hour}時`,
    売上: h.sales,
    人時生産性: h.productivity,
    人時数: parseFloat((h.person_hours || 0).toFixed(1)),
    is_business: h.is_business_hour,
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3 shadow-xl text-xs min-w-[160px]">
        <p className="font-bold text-sm mb-2 text-gray-800 dark:text-gray-100">{label}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex justify-between gap-3 mb-1">
            <span style={{ color: p.color }}>{p.name}:</span>
            <span className="font-semibold">
              {p.name === '売上' ? `¥${p.value.toLocaleString()}` :
               p.name === '人時生産性' ? `¥${p.value.toLocaleString()}/h` :
               `${p.value}h`}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={v => `¥${(v/1000).toFixed(0)}k`} width={45} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `¥${(v/1000).toFixed(0)}k`} width={45} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: '10px' }} />
        <ReferenceLine yAxisId="right" y={PRODUCTIVITY_TARGET} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1.5} />
        <Bar yAxisId="left" dataKey="売上" fill="#93c5fd" radius={[3, 3, 0, 0]} opacity={0.8} />
        <Line yAxisId="right" type="monotone" dataKey="人時生産性" stroke={BRAND.primary} strokeWidth={2.5} dot={{ fill: BRAND.primary, r: 3 }} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * 店舗カード
 */
function StoreCard({ store, onClick, index }) {
  // 休業日の場合
  if (store.is_closed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
        className="relative rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 opacity-60"
      >
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-bold text-base text-gray-500 dark:text-gray-400">{store.store_name}</h3>
        </div>
        <div className="flex items-center justify-center py-4 text-gray-400 dark:text-gray-500">
          <div className="text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold">本日休業</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const level = getProductivityLevel(store.productivity);
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;

  // 直近の時間帯データ（最新2時間）
  const recentHourly = store.hourly_productivity?.slice(-2) || [];
  const activeCount = store.working_employees + (store.break_employees || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
      className={`
        relative rounded-2xl border-2 ${config.border} ${config.bg}
        p-4 cursor-pointer group
        hover:shadow-xl hover:-translate-y-0.5
        transition-all duration-200
        overflow-hidden
      `}
      onClick={() => onClick(store)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(store)}
    >
      {/* 背景デコレーション */}
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${config.gradient} opacity-5 -translate-y-8 translate-x-8`} />

      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base leading-tight truncate pr-2">{store.store_name}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white ${config.badge}`}>
              <Icon className="h-3 w-3" />
              {config.label}
            </span>
            {store.update_time && (
              <span className="text-[10px] text-muted-foreground">{store.update_time}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {store.working_employees > 0 && (
            <div className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
              勤務中{store.working_employees}人
            </div>
          )}
          {store.break_employees > 0 && (
            <div className="flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
              <Coffee className="h-2.5 w-2.5" />
              休憩中{store.break_employees}人
            </div>
          )}
        </div>
      </div>

      {/* 人時生産性（メイン指標） */}
      <div className={`rounded-xl p-3 mb-3 ${config.bg} border ${config.border}`}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">人時生産性</p>
            <p className={`text-3xl font-black ${config.text} leading-none`}>
              ¥{store.productivity.toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground ml-1">/h</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">目標達成率</p>
            <p className={`text-lg font-bold ${config.text}`}>
              {Math.min(100, Math.round((store.productivity / PRODUCTIVITY_TARGET) * 100))}%
            </p>
          </div>
        </div>
        <ProductivityGauge value={store.productivity} compact />
      </div>

      {/* メトリクス */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2">
          <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
            <DollarSign className="h-3 w-3" />本日売上
          </p>
          <p className="font-bold text-sm">¥{store.total_sales.toLocaleString()}</p>
        </div>
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2">
          <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
            <Clock className="h-3 w-3" />総労働時間
          </p>
          <p className="font-bold text-sm">{store.total_hours.toFixed(1)}h</p>
        </div>
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2">
          <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
            <Users className="h-3 w-3" />出勤人数
          </p>
          <p className="font-bold text-sm">{store.attended_employees}人</p>
        </div>
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2">
          <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
            <Activity className="h-3 w-3" />稼働中
          </p>
          <p className="font-bold text-sm text-green-600 dark:text-green-400">{activeCount}人</p>
        </div>
      </div>

      {/* 直近時間帯ミニグラフ */}
      {recentHourly.length > 0 && (
        <div className="mt-3 pt-3 border-t border-current/10">
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Timer className="h-3 w-3" />直近の人時生産性
          </p>
          <div className="flex gap-1">
            {recentHourly.map((h, i) => {
              const lv = getProductivityLevel(h.productivity);
              const cfg = LEVEL_CONFIG[lv];
              return (
                <div key={i} className={`flex-1 rounded-lg p-1.5 text-center ${cfg.bg} border ${cfg.border}`}>
                  <p className="text-[9px] text-muted-foreground">{h.hour}時台</p>
                  <p className={`text-xs font-bold ${cfg.text}`}>¥{h.productivity.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ホバー時の詳細矢印 */}
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className={`p-1 rounded-full ${config.badge}`}>
          <ChevronRight className="h-3 w-3 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * 従業員状態バッジ
 */
function StatusBadge({ status }) {
  const configs = {
    '勤務中': 'bg-green-500 text-white',
    '退勤済み': 'bg-gray-400 text-white',
    '未出勤': 'bg-amber-400 text-white',
    '休憩中': 'bg-blue-400 text-white',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${configs[status] || 'bg-gray-300 text-gray-700'}`}>
      {status === '勤務中' && <span className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-pulse" />}
      {status === '休憩中' && <Coffee className="h-2.5 w-2.5 mr-1" />}
      {status}
    </span>
  );
}

/**
 * 店舗詳細モーダル（時間帯別グラフ付き）
 */
function StoreDetailModal({ store, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  if (!store) return null;

  const level = getProductivityLevel(store.productivity);
  const config = LEVEL_CONFIG[level];

  const sortedEmployees = [...(store.employees || [])].sort((a, b) => {
    const order = { '勤務中': 0, '休憩中': 1, '退勤済み': 2, '未出勤': 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const workingCount = sortedEmployees.filter(e => e.status === '勤務中').length;
  const breakCount = sortedEmployees.filter(e => e.status === '休憩中').length;
  const finishedCount = sortedEmployees.filter(e => e.status === '退勤済み').length;
  const absentCount = sortedEmployees.filter(e => e.status === '未出勤').length;

  const tabs = [
    { id: 'overview', label: '概要' },
    { id: 'hourly', label: '時間帯別' },
    { id: 'staff', label: 'スタッフ' },
  ];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
        <motion.div
          className="relative bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden flex flex-col"
          initial={{ y: '100%', scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: '100%', scale: 0.95 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* ドラッグハンドル（モバイル） */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>

          {/* ヘッダー */}
          <div className={`px-5 py-4 bg-gradient-to-r ${config.gradient} text-white relative overflow-hidden`}>
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white -translate-y-16 translate-x-16" />
            </div>
            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-5 w-5 opacity-90" />
                  <h2 className="text-xl font-black">{store.store_name}</h2>
                </div>
                <div className="flex items-center gap-3 text-sm opacity-90 flex-wrap">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    ¥{store.total_sales.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    ¥{store.productivity.toLocaleString()}/h
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {workingCount}人勤務中
                    {breakCount > 0 && <span className="ml-1 opacity-80">/ {breakCount}人休憩中</span>}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* 達成率バー */}
            <div className="mt-3">
              <div className="flex justify-between text-xs opacity-80 mb-1">
                <span>目標達成率</span>
                <span className="font-bold">{Math.min(100, Math.round((store.productivity / PRODUCTIVITY_TARGET) * 100))}%</span>
              </div>
              <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.round((store.productivity / PRODUCTIVITY_TARGET) * 100))}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>

          {/* タブ */}
          <div className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-red-800 text-red-800 dark:text-red-400 dark:border-red-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
                {tab.id === 'staff' && sortedEmployees.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">({sortedEmployees.length})</span>
                )}
              </button>
            ))}
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4"
                >
                  {/* KPIグリッド */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: '本日売上', value: `¥${store.total_sales.toLocaleString()}`, icon: DollarSign, color: 'text-blue-600' },
                      { label: '人時生産性', value: `¥${store.productivity.toLocaleString()}/h`, icon: Zap, color: config.text },
                      { label: '総労働時間', value: `${store.total_hours.toFixed(1)}h`, icon: Clock, color: 'text-purple-600' },
                      { label: '稼働中/出勤', value: `${workingCount + breakCount}/${store.attended_employees}人`, icon: Users, color: 'text-green-600' },
                    ].map((kpi, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                          <p className="text-xs text-muted-foreground">{kpi.label}</p>
                        </div>
                        <p className={`text-xl font-black ${kpi.color}`}>{kpi.value}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* 勤務状況サマリー */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" />勤務状況
                    </h4>
                    <div className="flex gap-2">
                      {[
                        { label: '勤務中', count: workingCount, color: 'bg-green-500', icon: Activity },
                        { label: '休憩中', count: breakCount, color: 'bg-blue-400', icon: Coffee },
                        { label: '退勤済み', count: finishedCount, color: 'bg-gray-400', icon: CheckCircle },
                        { label: '未出勤', count: absentCount, color: 'bg-amber-400', icon: AlertTriangle },
                      ].map((s, i) => (
                        <div key={i} className="flex-1 text-center">
                          <div className={`w-9 h-9 rounded-full ${s.color} flex items-center justify-center text-white font-bold text-sm mx-auto mb-1`}>
                            {s.count}
                          </div>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 営業時間情報 */}
                  {store.business_hours && !store.is_closed && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                      <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
                        <Clock className="h-4 w-4" />本日の営業時間
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {store.business_hours.open}:00 〜 {store.business_hours.close}:00
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'hourly' && (
                <motion.div
                  key="hourly"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4"
                >
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Timer className="h-4 w-4" />時間帯別人時生産性
                      <span className="text-xs font-normal text-muted-foreground">（棒:売上 / 折線:人時生産性）</span>
                    </h4>
                    <HourlyProductivityChart hourlyData={store.hourly_productivity} storeName={store.store_name} />
                  </div>

                  {/* 時間帯別テーブル */}
                  {store.hourly_productivity && store.hourly_productivity.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-700">
                            <th className="text-left p-2 font-semibold">時間帯</th>
                            <th className="text-right p-2 font-semibold">売上</th>
                            <th className="text-right p-2 font-semibold">人時数</th>
                            <th className="text-right p-2 font-semibold">人時生産性</th>
                          </tr>
                        </thead>
                        <tbody>
                          {store.hourly_productivity.map((h, i) => {
                            const lv = getProductivityLevel(h.productivity);
                            const cfg = LEVEL_CONFIG[lv];
                            return (
                              <tr key={i} className={`border-t dark:border-gray-700 ${h.is_business_hour ? '' : 'opacity-60'}`}>
                                <td className="p-2">
                                  <span className="font-medium">{h.hour}:00〜{h.hour+1}:00</span>
                                  {!h.is_business_hour && <span className="ml-1 text-[9px] text-muted-foreground">(営業外)</span>}
                                </td>
                                <td className="p-2 text-right">¥{h.sales.toLocaleString()}</td>
                                <td className="p-2 text-right">{h.person_hours.toFixed(1)}h</td>
                                <td className={`p-2 text-right font-bold ${cfg.text}`}>
                                  ¥{h.productivity.toLocaleString()}/h
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'staff' && (
                <motion.div
                  key="staff"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <div className="space-y-2">
                    {sortedEmployees.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        本日のシフトデータがありません
                      </div>
                    ) : (
                      sortedEmployees.map((emp, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`rounded-xl p-3 flex items-center gap-3 ${
                            emp.status === '勤務中' ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800' :
                            emp.status === '休憩中' ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800' :
                            emp.status === '未出勤' ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800' :
                            'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                            emp.status === '勤務中' ? 'bg-green-500' :
                            emp.status === '退勤済み' ? 'bg-gray-400' :
                            emp.status === '未出勤' ? 'bg-amber-400' : 'bg-blue-400'
                          }`}>
                            {emp.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">{emp.name}</p>
                              {/* 掛け持ち表示 */}
                              {emp.clock_location && emp.clock_location !== emp.dept_store_name && (
                                <span className="text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full shrink-0">
                                  掛持
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              {emp.clock_in && <span>出勤 {emp.clock_in}</span>}
                              {emp.clock_out && <span>退勤 {emp.clock_out}</span>}
                              {emp.clock_location && emp.clock_location !== emp.dept_store_name && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="h-2.5 w-2.5" />{emp.clock_location}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <StatusBadge status={emp.status} />
                            {emp.work_hours > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">{emp.work_hours.toFixed(1)}h</p>
                            )}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                  {sortedEmployees.length > 0 && (
                    <div className="mt-3 pt-3 border-t dark:border-gray-700 flex justify-between text-sm font-semibold">
                      <span>合計労働時間</span>
                      <span>{store.total_hours.toFixed(1)}h</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * サマリーカード
 */
function SummaryCard({ title, value, unit, icon: Icon, gradient, description, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
      className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm overflow-hidden"
    >
      <div className={`absolute top-0 right-0 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-10 -translate-y-8 translate-x-8`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground font-medium">{title}</span>
          <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="text-2xl font-black">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
    </motion.div>
  );
}

/**
 * 店舗別棒グラフ
 */
function StoreBarChart({ stores }) {
  const [chartType, setChartType] = useState('productivity');

  const data = stores
    .filter(s => !s.is_closed && (s.total_sales > 0 || s.productivity > 0))
    .map(s => ({
      name: s.store_name.replace('イオンタウン', 'ｲｵﾝ').replace('店', '').replace('FC', ''),
      売上: s.total_sales,
      人時生産性: s.productivity,
      労働時間: s.total_hours,
      level: getProductivityLevel(s.productivity),
    }))
    .sort((a, b) => b[chartType === 'productivity' ? '人時生産性' : '売上'] - a[chartType === 'productivity' ? '人時生産性' : '売上']);

  if (data.length === 0) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3 shadow-xl text-xs">
        <p className="font-bold text-sm mb-2">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.name === '売上' ? `¥${p.value.toLocaleString()}` : p.name === '人時生産性' ? `¥${p.value.toLocaleString()}/h` : `${p.value}h`}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-red-800 dark:text-red-400" />
          {chartType === 'productivity' ? '店舗別人時生産性' : '店舗別本日売上'}
        </h3>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setChartType('productivity')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${chartType === 'productivity' ? 'bg-white dark:bg-gray-700 shadow-sm text-red-800 dark:text-red-400' : 'text-muted-foreground'}`}
          >
            人時生産性
          </button>
          <button
            onClick={() => setChartType('sales')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${chartType === 'sales' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-muted-foreground'}`}
          >
            売上
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} />
          <YAxis tick={{ fontSize: 9 }} tickFormatter={v => chartType === 'productivity' ? `¥${(v/1000).toFixed(0)}k` : `¥${(v/10000).toFixed(0)}万`} width={48} />
          <Tooltip content={<CustomTooltip />} />
          {chartType === 'productivity' && (
            <ReferenceLine y={PRODUCTIVITY_TARGET} stroke="#22c55e" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: '目標', position: 'right', fontSize: 9, fill: '#22c55e' }} />
          )}
          <Bar dataKey={chartType === 'productivity' ? '人時生産性' : '売上'} radius={[5, 5, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={chartType === 'productivity' ? LEVEL_CONFIG[entry.level].color : '#3b82f6'}
                opacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 全店舗時間帯別サマリーグラフ
 */
function AllStoresHourlyChart({ stores }) {
  const hourlyMap = {};
  stores.filter(s => !s.is_closed).forEach(store => {
    (store.hourly_productivity || []).forEach(h => {
      if (!hourlyMap[h.hour]) {
        hourlyMap[h.hour] = { hour: h.hour, sales: 0, person_hours: 0 };
      }
      hourlyMap[h.hour].sales += h.sales;
      hourlyMap[h.hour].person_hours += h.person_hours;
    });
  });

  const data = Object.values(hourlyMap)
    .sort((a, b) => a.hour - b.hour)
    .map(h => ({
      time: `${h.hour}時`,
      売上合計: h.sales,
      人時生産性: h.person_hours > 0 ? Math.round(h.sales / h.person_hours) : 0,
    }));

  if (data.length === 0) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3 shadow-xl text-xs">
        <p className="font-bold text-sm mb-2">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.name === '売上合計' ? `¥${p.value.toLocaleString()}` : `¥${p.value.toLocaleString()}/h`}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Timer className="h-5 w-5 text-red-800 dark:text-red-400" />
        全店舗 時間帯別人時生産性
        <span className="text-xs font-normal text-muted-foreground">（棒:売上合計 / 折線:人時生産性）</span>
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={v => `¥${(v/10000).toFixed(0)}万`} width={48} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `¥${(v/1000).toFixed(0)}k`} width={48} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          <ReferenceLine yAxisId="right" y={PRODUCTIVITY_TARGET} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1.5} />
          <Bar yAxisId="left" dataKey="売上合計" fill="#93c5fd" radius={[3, 3, 0, 0]} opacity={0.8} />
          <Line yAxisId="right" type="monotone" dataKey="人時生産性" stroke={BRAND.primary} strokeWidth={2.5} dot={{ fill: BRAND.primary, r: 3 }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===== スタッフ設定モーダル =====
const STAFF_SETTINGS_KEY = 'maikon_staff_settings';

function loadStaffSettings() {
  try {
    const saved = localStorage.getItem(STAFF_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {};
}

function saveStaffSettings(settings) {
  try {
    localStorage.setItem(STAFF_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {}
}

function StaffSettingsModal({ onClose, onSave }) {
  const [staffSettings, setStaffSettings] = useState(() => loadStaffSettings());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Supabaseからスタッフマスタを取得
  useEffect(() => {
    fetch('/api/productivity/realtime?staff_only=1')
      .then(r => r.json())
      .then(data => {
        // スタッフマスタが存在する場合はそちらを使用
        if (data.staff_master && data.staff_master.length > 0) {
          setStaffList(data.staff_master);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ジョブカンからスタッフ情報を同期
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/productivity/sync-staff');
      const data = await res.json();
      if (data.success) {
        setSyncResult({ success: true, message: data.message });
        setStaffList(data.staff || []);
      } else {
        setSyncResult({ success: false, message: data.message || '同期に失敗しました' });
      }
    } catch (e) {
      setSyncResult({ success: false, message: '同期中にエラーが発生しました' });
    } finally {
      setSyncing(false);
    }
  };

  const updateStaffSetting = (staffId, key, value) => {
    setStaffSettings(prev => ({
      ...prev,
      [staffId]: { ...prev[staffId], [key]: value },
    }));
  };

  const handleSave = () => {
    saveStaffSettings(staffSettings);
    onSave(staffSettings);
    onClose();
  };

  // 社員のみフィルタリング
  const employeeList = staffList.filter(s =>
    s.staff_type === '社員' || s.staff_type === '契約社員' || s.staff_type === '役員'
  );

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0');
    return [`${h}:00`, `${h}:30`];
  }).flat();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700 bg-gradient-to-r from-red-800 to-red-600">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-white" />
              <h2 className="text-lg font-bold text-white">社員接客時間帯設定</h2>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* コンテンツ */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* 同期ボタン */}
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300">ジョブカンからスタッフ情報を同期</h3>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">ジョブカンのスタッフ詳細からスタッフ種別（社員/パート等）を取得してSupabaseに保存します。初回セットアップ時またはスタッフ変更時に実行してください。</p>
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? '同期中...' : 'スタッフ情報を同期'}
                </button>
              </div>
              {syncResult && (
                <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${syncResult.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {syncResult.message}
                </div>
              )}
            </div>

            {/* 社員一覧と接客時間帯設定 */}
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-red-800 dark:text-red-400" />
                社員の店舗接客時間帯設定
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                設定した時間帯のみ店舗の人時生産性に反映されます。それ以外の時間は社員個人の生産性として計算されます。
              </p>

              {loading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">スタッフ情報を読み込み中...</div>
              ) : employeeList.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm text-muted-foreground">社員情報がありません</p>
                  <p className="text-xs text-muted-foreground mt-1">上の「スタッフ情報を同期」ボタンを押してください</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {employeeList.map(staff => {
                    const setting = staffSettings[staff.id] || {};
                    return (
                      <div key={staff.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-bold text-sm">{staff.staff_name}</p>
                            <p className="text-xs text-muted-foreground">{staff.store_name || staff.dept_code || ''} ・ {staff.staff_type}</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold">社員</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">接客開始</label>
                            <select
                              value={setting.service_start || ''}
                              onChange={e => updateStaffSetting(staff.id, 'service_start', e.target.value)}
                              className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm"
                            >
                              <option value="">未設定（全時間帯）</option>
                              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">接客終了</label>
                            <select
                              value={setting.service_end || ''}
                              onChange={e => updateStaffSetting(staff.id, 'service_end', e.target.value)}
                              className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm"
                            >
                              <option value="">未設定（全時間帯）</option>
                              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        {setting.service_start && setting.service_end && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                            ✓ 店舗接客: {setting.service_start} 〜 {setting.service_end}（それ以外は社員個人業務）
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* フッター */}
          <div className="flex items-center justify-end gap-2 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border dark:border-gray-600 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-red-800 to-red-600 text-white text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
            >
              保存して反映
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ===== 店舗設定モーダル =====
function StoreHoursSettingsModal({ onClose, onSave }) {
  const [settings, setSettings] = useState(() => loadStoreSettings());
  const [activeStore, setActiveStore] = useState(ALL_STORE_NAMES[0]);

  const updateSetting = (storeName, key, value) => {
    setSettings(prev => ({
      ...prev,
      [storeName]: { ...prev[storeName], [key]: value },
    }));
  };

  const toggleClosedDay = (storeName, dayIndex) => {
    setSettings(prev => {
      const current = prev[storeName]?.closed_days || [];
      const newDays = current.includes(dayIndex)
        ? current.filter(d => d !== dayIndex)
        : [...current, dayIndex];
      return { ...prev, [storeName]: { ...prev[storeName], closed_days: newDays } };
    });
  };

  const handleSave = () => {
    saveStoreSettings(settings);
    onSave(settings);
    onClose();
  };

  const handleReset = () => {
    if (window.confirm('全店舗の設定をデフォルトに戻しますか？')) {
      setSettings({ ...DEFAULT_STORE_SETTINGS });
    }
  };

  const currentSettings = settings[activeStore] || DEFAULT_STORE_SETTINGS[activeStore] || { open: 10, close: 18, closed_days: [] };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-red-800 to-red-600">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black">店舗設定</h2>
                <p className="text-xs text-muted-foreground">営業時間・定休日を設定</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* 店舗リスト */}
            <div className="w-36 border-r dark:border-gray-700 overflow-y-auto shrink-0">
              {ALL_STORE_NAMES.map(name => {
                const s = settings[name] || {};
                const today = new Date().getDay();
                const isTodayClosed = (s.closed_days || []).includes(today);
                return (
                  <button
                    key={name}
                    onClick={() => setActiveStore(name)}
                    className={`w-full text-left px-3 py-2.5 text-xs font-medium transition-colors border-b dark:border-gray-700 flex items-center justify-between gap-1 ${
                      activeStore === name
                        ? 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-400 font-bold'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="truncate">{name.replace('イオン', 'ｲｵﾝ').replace('FC店', 'FC')}</span>
                    {isTodayClosed && <span className="text-[9px] bg-gray-200 dark:bg-gray-700 text-gray-500 px-1 rounded shrink-0">休</span>}
                  </button>
                );
              })}
            </div>

            {/* 設定パネル */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <h3 className="font-bold text-base">{activeStore}</h3>

              {/* 営業時間 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-red-800 dark:text-red-400" />
                  通常営業時間
                </h4>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground block mb-1">開店時刻</label>
                    <select
                      value={currentSettings.open}
                      onChange={e => updateSetting(activeStore, 'open', parseInt(e.target.value))}
                      className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i}:00</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-muted-foreground mt-5">〜</span>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground block mb-1">閉店時刻</label>
                    <select
                      value={currentSettings.close}
                      onChange={e => updateSetting(activeStore, 'close', parseInt(e.target.value))}
                      className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map(i => (
                        <option key={i} value={i}>{i}:00</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 堺東店の日曜特別設定 */}
                {activeStore === '堺東店' && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3">
                    <label className="text-xs font-semibold text-amber-700 dark:text-amber-400 block mb-2">
                      日曜日の閉店時刻（特別設定）
                    </label>
                    <select
                      value={currentSettings.sunday_close || currentSettings.close}
                      onChange={e => updateSetting(activeStore, 'sunday_close', parseInt(e.target.value))}
                      className="w-full rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map(i => (
                        <option key={i} value={i}>{i}:00</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 定休日 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-red-800 dark:text-red-400" />
                  定休日
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {DAY_LABELS.map((label, dayIndex) => {
                    const isSelected = (currentSettings.closed_days || []).includes(dayIndex);
                    return (
                      <button
                        key={dayIndex}
                        onClick={() => toggleClosedDay(activeStore, dayIndex)}
                        className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                          isSelected
                            ? 'bg-red-800 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {(currentSettings.closed_days || []).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    定休日: {(currentSettings.closed_days || []).sort().map(d => DAY_LABELS[d]).join('・')}曜日
                  </p>
                )}
              </div>

              {/* 現在の設定プレビュー */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">設定プレビュー</h4>
                <p className="text-sm font-bold">
                  {activeStore}: {currentSettings.open}:00 〜 {currentSettings.close}:00
                </p>
                {activeStore === '堺東店' && currentSettings.sunday_close && (
                  <p className="text-xs text-muted-foreground mt-1">日曜日のみ {currentSettings.open}:00 〜 {currentSettings.sunday_close}:00</p>
                )}
                {(currentSettings.closed_days || []).length > 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    定休日: {(currentSettings.closed_days || []).sort().map(d => DAY_LABELS[d]).join('・')}曜日
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">定休日なし（年中無休）</p>
                )}
              </div>
            </div>
          </div>

          {/* フッター */}
          <div className="flex items-center justify-between p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              デフォルトに戻す
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border dark:border-gray-600 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-red-800 to-red-600 text-white text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
              >
                保存して反映
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ===== メインコンポーネント =====
export default function ProductivityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedStore, setSelectedStore] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [dark, toggleDark] = useDarkMode();
  const [countdown, setCountdown] = useState(30);
  const [showClosedStores, setShowClosedStores] = useState(false);
  const [showStoreSettings, setShowStoreSettings] = useState(false);
  const [showStaffSettings, setShowStaffSettings] = useState(false);
  const [storeSettings, setStoreSettings] = useState(() => loadStoreSettings());

  const {
    data: queryData,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['productivity-realtime', storeSettings],
    queryFn: () => fetchRealtimeData(storeSettings),
    staleTime: 25 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: autoRefresh ? 30 * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });

  // カウントダウンタイマー
  useEffect(() => {
    if (!autoRefresh) return;
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) return 30;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, dataUpdatedAt]);

  const stores = queryData?.stores || [];
  const sources = queryData?.sources || {};
  const employeeProductivity = queryData?.employeeProductivity || [];
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const isLive = sources.tempovisor === 'live' || sources.jobcan === 'live';
  const summary = calcSummary(stores);

  const openStores = stores.filter(s => !s.is_closed);
  const closedStores = stores.filter(s => s.is_closed);
  const sortedOpenStores = [...openStores].sort((a, b) => b.productivity - a.productivity);

  return (
    <div className="space-y-5 pb-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-red-800 to-red-600">
              <Activity className="h-5 w-5 text-white" />
            </div>
            リアルタイム人時生産性
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-1">
            {format(new Date(), 'yyyy年MM月dd日（E）', { locale: ja })}
            {lastUpdated && (
              <span className="ml-2 text-xs">最終更新: {format(lastUpdated, 'HH:mm:ss')}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* ライブ/オフライン */}
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold ${
            isLive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
            'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          }`}>
            {isLive ? (
              <><Wifi className="h-3.5 w-3.5" /><span>ライブ</span></>
            ) : (
              <><WifiOff className="h-3.5 w-3.5" /><span>オフライン</span></>
            )}
          </div>

          {/* 表示切替 */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {[
              { id: 'cards', icon: LayoutGrid, label: 'カード' },
              { id: 'chart', icon: BarChart3, label: 'グラフ' },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === id
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-red-800 dark:text-red-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* 自動更新 */}
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-1.5">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="auto-refresh" className="text-xs cursor-pointer font-medium">
              {autoRefresh ? (
                <span className="text-green-600 dark:text-green-400">{countdown}秒後更新</span>
              ) : '自動更新'}
            </Label>
          </div>

          {/* 手動更新 */}
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-red-800' : ''}`} />
          </button>

          {/* 店舗設定 */}
          <button
            onClick={() => setShowStoreSettings(true)}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="店舗設定（営業時間・定休日）"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* スタッフ設定 */}
          <button
            onClick={() => setShowStaffSettings(true)}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="社員接客時間帯設定"
          >
            <Briefcase className="h-4 w-4" />
          </button>

          {/* ダークモード */}
          <button
            onClick={toggleDark}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {dark ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl p-4 flex items-center gap-3"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm">データ取得エラー</p>
            <p className="text-xs mt-0.5 opacity-80">{error.message}</p>
          </div>
        </motion.div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard title="総売上" value={Math.round(summary.totalSales)} unit="円" icon={DollarSign} gradient="from-blue-500 to-indigo-600" description="営業店舗合計" index={0} />
        <SummaryCard
          title="平均人時生産性"
          value={Math.round(summary.avgProductivity)}
          unit="円/h"
          icon={Zap}
          gradient={summary.avgProductivity >= PRODUCTIVITY_TARGET ? 'from-emerald-500 to-green-600' : summary.avgProductivity >= PRODUCTIVITY_GOOD ? 'from-blue-500 to-indigo-600' : summary.avgProductivity >= PRODUCTIVITY_WARNING ? 'from-amber-500 to-orange-500' : 'from-red-500 to-rose-600'}
          description={`目標: ¥${PRODUCTIVITY_TARGET.toLocaleString()}/h`}
          index={1}
        />
        <SummaryCard title="総勤務時間" value={summary.totalWorkHours.toFixed(1)} unit="時間" icon={Clock} gradient="from-purple-500 to-violet-600" description="全スタッフ合計" index={2} />
        <SummaryCard
          title="現在稼働中"
          value={summary.workingNow}
          unit="人"
          icon={Activity}
          gradient="from-emerald-500 to-teal-600"
          description={summary.breakNow > 0 ? `休憩中 ${summary.breakNow}人含まず` : 'リアルタイム'}
          index={3}
        />
        <SummaryCard title="本日出勤延べ" value={summary.totalWorkers} unit="人" icon={Users} gradient="from-indigo-500 to-purple-600" description="退勤済み含む" index={4} />
      </div>

      {/* 目標達成状況バー */}
      {openStores.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-red-800 dark:text-red-400" />
              全店舗 目標達成状況
            </h3>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-1 h-10 rounded-xl overflow-hidden">
            {sortedOpenStores.map((store, i) => {
              const level = getProductivityLevel(store.productivity);
              const cfg = LEVEL_CONFIG[level];
              return (
                <motion.div
                  key={store.store_name}
                  className="flex-1 flex items-center justify-center cursor-pointer hover:opacity-80 transition-all hover:scale-y-110 origin-bottom"
                  style={{ backgroundColor: cfg.color }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.03, ease: 'backOut' }}
                  onClick={() => setSelectedStore(store)}
                  title={`${store.store_name}: ¥${store.productivity.toLocaleString()}/h`}
                >
                  <span className="text-white text-[9px] font-bold truncate px-0.5 hidden sm:block">
                    {store.store_name.replace('イオンタウン', '').replace('店', '').replace('FC', '').slice(0, 3)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* 店舗別表示 */}
      {viewMode === 'cards' ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-red-800 dark:text-red-400" />
              店舗別リアルタイム状況
              <span className="text-xs font-normal text-muted-foreground hidden sm:inline">（タップで詳細・時間帯別グラフ）</span>
            </h2>
            {closedStores.length > 0 && (
              <button
                onClick={() => setShowClosedStores(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" />
                休業店舗 ({closedStores.length})
                {showClosedStores ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>

          {isLoading && stores.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {[...Array(13)].map((_, i) => (
                <div key={i} className="rounded-2xl border bg-gray-50 dark:bg-gray-800 p-4 animate-pulse">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3 w-2/3" />
                  <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl mb-3" />
                  <div className="grid grid-cols-2 gap-2">
                    {[...Array(4)].map((_, j) => (
                      <div key={j} className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>データがありません</p>
            </div>
          ) : (
            <>
              {/* 営業中の店舗 */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {sortedOpenStores.map((store, i) => (
                  <StoreCard
                    key={store.store_code || store.store_name}
                    store={store}
                    onClick={setSelectedStore}
                    index={i}
                  />
                ))}
              </div>

              {/* 休業中の店舗（折りたたみ） */}
              {closedStores.length > 0 && showClosedStores && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />本日休業
                  </p>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {closedStores.map((store, i) => (
                      <StoreCard
                        key={store.store_code || store.store_name}
                        store={store}
                        onClick={() => {}}
                        index={i}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <AllStoresHourlyChart stores={stores} />
          <StoreBarChart stores={stores} />
        </div>
      )}

      {/* 社員個人生産性セクション */}
      {employeeProductivity.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-700 to-blue-500">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            社員個人生産性
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {employeeProductivity.map((emp, i) => (
              <motion.div
                key={emp.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-sm">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.store_name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    emp.status === '勤務中' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                    emp.status === '休憩中' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                    'bg-gray-100 dark:bg-gray-700 text-muted-foreground'
                  }`}>
                    {emp.status}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">総勤務時間</span>
                    <span className="font-semibold">{emp.total_work_hours?.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600 dark:text-green-400">店舗接客時間</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{emp.service_hours?.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-blue-600 dark:text-blue-400">社員業務時間</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{emp.non_service_hours?.toFixed(1)}h</span>
                  </div>
                  {/* 時間帯バー */}
                  <div className="mt-2">
                    <div className="flex rounded-full overflow-hidden h-2 bg-gray-100 dark:bg-gray-700">
                      {emp.total_work_hours > 0 && (
                        <>
                          <div
                            className="bg-green-500 transition-all"
                            style={{ width: `${Math.round((emp.service_hours / emp.total_work_hours) * 100)}%` }}
                          />
                          <div
                            className="bg-blue-500 transition-all"
                            style={{ width: `${Math.round((emp.non_service_hours / emp.total_work_hours) * 100)}%` }}
                          />
                        </>
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>接客 {emp.service_start}〜{emp.service_end}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedStore && (
        <StoreDetailModal store={selectedStore} onClose={() => setSelectedStore(null)} />
      )}

      {/* 店舗設定モーダル */}
      {showStoreSettings && (
        <StoreHoursSettingsModal
          onClose={() => setShowStoreSettings(false)}
          onSave={(newSettings) => {
            setStoreSettings(newSettings);
            refetch();
          }}
        />
      )}

      {/* スタッフ設定モーダル */}
      {showStaffSettings && (
        <StaffSettingsModal
          onClose={() => setShowStaffSettings(false)}
          onSave={(newStaffSettings) => {
            refetch();
          }}
        />
      )}
    </div>
  );
}
