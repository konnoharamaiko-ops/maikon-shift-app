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
  Store, BanknoteIcon, Briefcase, ArrowRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, ComposedChart, Line, Legend, Area, AreaChart
} from 'recharts';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';

// ===== 定数 =====
const PRODUCTIVITY_TARGET = 8000;  // 優秀（8,000円以上）
const PRODUCTIVITY_GOOD = 5000;    // 良好（5,000円以上）
const PRODUCTIVITY_WARNING = 2000; // 注意（2,000円以上）

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
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-emerald-300 dark:border-emerald-600',
    topBar: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    badge: 'bg-emerald-500',
    ring: 'ring-emerald-400',
    icon: CheckCircle,
    lightBg: '#f0fdf4',
    darkAccent: '#10b981',
  },
  good: {
    label: '良好',
    color: '#2563eb',
    gradient: 'from-blue-500 to-indigo-600',
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-blue-300 dark:border-blue-600',
    topBar: 'bg-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
    badge: 'bg-blue-500',
    ring: 'ring-blue-400',
    icon: TrendingUp,
    lightBg: '#eff6ff',
    darkAccent: '#3b82f6',
  },
  warning: {
    label: '注意',
    color: '#d97706',
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-amber-300 dark:border-amber-600',
    topBar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-500',
    ring: 'ring-amber-400',
    icon: AlertTriangle,
    lightBg: '#fffbeb',
    darkAccent: '#f59e0b',
  },
  danger: {
    label: '要改善',
    color: '#dc2626',
    gradient: 'from-red-500 to-rose-600',
    bg: 'bg-white dark:bg-gray-800',
    border: 'border-red-300 dark:border-red-600',
    topBar: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-500',
    ring: 'ring-red-400',
    icon: TrendingDown,
    lightBg: '#fef2f2',
    darkAccent: '#ef4444',
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
const STORE_SETTINGS_KEY = 'maikon_store_settings_v2'; // v2: 曜日別対応

const ALL_STORE_NAMES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', 'エキマル', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂FC店'
];

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_FULL_LABELS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

// 曜日別設定のデフォルト値を生成するヘルパー
function makeDefaultDays(open, close, closedDayIndexes = []) {
  return Array.from({ length: 7 }, (_, i) => ({
    open,
    close,
    is_closed: closedDayIndexes.includes(i),
  }));
}

// デフォルト店舗設定（曜日別構造）
const DEFAULT_STORE_SETTINGS = {
  '田辺店':       { days: makeDefaultDays(9,  19) },
  '大正店':       { days: makeDefaultDays(10, 18) },
  '天下茶屋店':   { days: makeDefaultDays(10, 18) },
  '天王寺店':     { days: makeDefaultDays(10, 18) },
  'アベノ店':     { days: makeDefaultDays(10, 18) },
  '心斎橋店':     { days: makeDefaultDays(10, 18) },
  'かがや店':     { days: makeDefaultDays(10, 18) },
  'エキマル':     { days: makeDefaultDays(10, 22) },
  '北摂店':       { days: makeDefaultDays(10, 18) },
  '堺東店':       { days: (() => {
    const d = makeDefaultDays(10, 20);
    d[0] = { open: 10, close: 19, is_closed: false }; // 日曜日は19時閉店
    return d;
  })() },
  'イオン松原店': { days: makeDefaultDays(9,  20) },
  'イオン守口店': { days: makeDefaultDays(9,  20) },
  '美和堂FC店':   { days: makeDefaultDays(10, 18, [0]) }, // 日曜定休
};

// 旧形式（open/close/closed_days）を新形式（days[]）に変換
function migrateLegacySettings(legacy) {
  if (!legacy || legacy.days) return legacy; // 既に新形式
  const { open = 10, close = 18, closed_days = [], sunday_close } = legacy;
  const days = makeDefaultDays(open, close, closed_days);
  if (sunday_close) {
    days[0] = { open, close: sunday_close, is_closed: closed_days.includes(0) };
  }
  return { days };
}

function loadStoreSettings() {
  try {
    const saved = localStorage.getItem(STORE_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 新形式で保存されている場合はそのまま使用
      const merged = { ...DEFAULT_STORE_SETTINGS };
      ALL_STORE_NAMES.forEach(name => {
        if (parsed[name]) {
          merged[name] = migrateLegacySettings(parsed[name]);
        }
      });
      return merged;
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
    cached: result.cached || false,
    cacheAgeSeconds: result.cache_age_seconds || 0,
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
  if (store.is_closed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
        className="relative rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/30 p-4 opacity-60"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <Store className="h-4 w-4 text-gray-400" />
          </div>
          <h3 className="font-bold text-sm text-gray-500 dark:text-gray-400">{store.store_name}</h3>
        </div>
        <div className="flex items-center justify-center py-5 text-gray-400 dark:text-gray-500">
          <div className="text-center">
            <Calendar className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-bold">本日休業</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const hasData = store.total_sales > 0 || store.productivity > 0;
  const level = hasData ? getProductivityLevel(store.productivity) : 'danger';
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;
  const recentHourly = store.hourly_productivity?.slice(-2) || [];
  const activeCount = store.working_employees || 0;
  const achieveRate = hasData ? Math.min(100, Math.round((store.productivity / PRODUCTIVITY_TARGET) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
      className={`
        relative rounded-2xl border ${hasData ? config.border : 'border-gray-200 dark:border-gray-700'} ${config.bg}
        cursor-pointer group
        hover:shadow-xl hover:-translate-y-0.5
        transition-all duration-200
        overflow-hidden shadow-sm
      `}
      onClick={() => onClick(store)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(store)}
    >
      {/* トップカラーバー */}
      <div className={`h-1.5 w-full ${hasData ? config.topBar : 'bg-gray-300 dark:bg-gray-600'}`} />

      {/* カード本体 */}
      <div className="p-4">
        {/* 背景デコレーション */}
        <div className={`absolute top-0 right-0 w-28 h-28 rounded-full bg-gradient-to-br ${config.gradient} opacity-[0.06] -translate-y-10 translate-x-10`} />

        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-black text-base leading-tight tracking-tight">{store.store_name}</h3>
            </div>
            {store.update_time && (
              <p className="text-[10px] text-muted-foreground">{store.update_time}</p>
            )}
          </div>
          {/* ステータスバッジグループ */}
          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm ${hasData ? config.badge : 'bg-gray-400'}`}>
              <Icon className="h-3 w-3" />
              {hasData ? config.label : '取得中'}
            </span>
            {store.working_employees > 0 && (
              <div className="flex items-center gap-1 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                勤務中{store.working_employees}人
              </div>
            )}
            {store.break_employees > 0 && (
              <div className="flex items-center gap-1 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                <Coffee className="h-2.5 w-2.5" />
                休憩{store.break_employees}人
              </div>
            )}
          </div>
        </div>

        {/* 人時生産性（メイン指標） */}
        <div className="rounded-xl p-3 mb-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600/50">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">人時生産性</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black ${hasData ? config.text : 'text-gray-400 dark:text-gray-500'} leading-none`}>
                  ¥{store.productivity.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">/h</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">達成率</p>
              <div className="flex items-baseline gap-0.5 justify-end">
                <span className={`text-xl font-black ${hasData ? config.text : 'text-gray-400 dark:text-gray-500'}`}>{achieveRate}</span>
                <span className={`text-xs font-bold ${hasData ? config.text : 'text-gray-400 dark:text-gray-500'}`}>%</span>
              </div>
            </div>
          </div>
          <ProductivityGauge value={store.productivity} compact />
        </div>

        {/* メトリクスグリッド */}
        <div className="grid grid-cols-4 gap-1.5 text-xs mb-3">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2 text-center border border-gray-100 dark:border-gray-600/50">
            <DollarSign className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-[9px] text-muted-foreground leading-none mb-0.5">売上</p>
            <p className="font-black text-xs leading-none">¥{(store.total_sales / 1000).toFixed(0)}k</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2 text-center border border-gray-100 dark:border-gray-600/50">
            <Clock className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-[9px] text-muted-foreground leading-none mb-0.5">動務h</p>
            <p className="font-black text-xs leading-none">{store.total_hours.toFixed(1)}h</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2 text-center border border-gray-100 dark:border-gray-600/50">
            <Users className="h-3 w-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-[9px] text-muted-foreground leading-none mb-0.5">出勤</p>
            <p className="font-black text-xs leading-none">{store.attended_employees}人</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2 text-center border border-gray-100 dark:border-gray-600/50">
            <Activity className="h-3 w-3 mx-auto mb-0.5 text-green-500" />
            <p className="text-[9px] text-muted-foreground leading-none mb-0.5">稼働中</p>
            <p className="font-black text-xs leading-none text-green-600 dark:text-green-400">{activeCount}人</p>
          </div>
        </div>

        {/* 直近時間帯ミニグラフ */}
        {recentHourly.length > 0 && (
          <div className="border-t border-current/10 pt-2.5">
            <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
              <Timer className="h-3 w-3" />直近の人時生産性
            </p>
            <div className="flex gap-1.5">
              {recentHourly.map((h, i) => {
                const lv = getProductivityLevel(h.productivity);
                const cfg = LEVEL_CONFIG[lv];
                return (
                  <div key={i} className={`flex-1 rounded-xl p-2 text-center bg-gray-50 dark:bg-gray-700/50 border ${cfg.border}`}>
                    <p className="text-[9px] text-muted-foreground font-semibold">{h.hour}時台</p>
                    <p className={`text-xs font-black ${cfg.text}`}>¥{h.productivity.toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ホバー時の詳細オーバーレイ */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
        <div className={`p-1.5 rounded-full ${config.badge} shadow-md`}>
          <ChevronRight className="h-3.5 w-3.5 text-white" />
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
    '退出中': 'bg-blue-400 text-white',  // 休憩中と同じスタイル
  };
  const displayStatus = status === '退出中' ? '休憩中(外出)' : status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${configs[status] || 'bg-gray-300 text-gray-700'}`}>
      {status === '勤務中' && <span className="w-1.5 h-1.5 bg-white rounded-full mr-1 animate-pulse" />}
      {(status === '休憩中' || status === '退出中') && <Coffee className="h-2.5 w-2.5 mr-1" />}
      {displayStatus}
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
    const order = { '勤務中': 0, '休憩中': 1, '退出中': 1, '退勤済み': 2, '未出勤': 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const workingCount = sortedEmployees.filter(e => e.status === '勤務中').length;
  const breakCount = sortedEmployees.filter(e => e.status === '休憩中' || e.status === '退出中').length;
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
          className="relative bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col" style={{ maxHeight: 'calc(90dvh - env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
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
          <div className={`px-5 pt-4 pb-4 bg-gradient-to-r ${config.gradient} text-white relative`}>
            {/* 菌った円デコレーション（クリップしない） */}
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-16 translate-x-16 pointer-events-none" />
            <div className="relative flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-5 w-5 opacity-90 shrink-0" />
                  <h2 className="text-xl font-black truncate">{store.store_name}</h2>
                </div>
                <div className="flex items-center gap-2 text-xs opacity-90 flex-wrap">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    ¥{store.total_sales.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    ¥{store.productivity.toLocaleString()}/h
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {workingCount}人勤務中
                    {breakCount > 0 && <span className="ml-1 opacity-80">/ {breakCount}人休憩中</span>}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors shrink-0"
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
          <div className="flex-1 overflow-y-auto p-5 pb-16" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                      { label: '勤務中/出勤', value: `${workingCount}/${store.attended_employees}人`, icon: Users, color: 'text-green-600' },
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
                  {store.hourly_productivity && store.hourly_productivity.length > 0 && (() => {
                    // 従業員が実際に在籍している時間帯（person_hours > 0）の最初と最後を取得
                    const workingSlots = store.hourly_productivity.filter(h => h.person_hours > 0);
                    const firstWorkHour = workingSlots.length > 0 ? workingSlots[0].hour : null;
                    const lastWorkHour = workingSlots.length > 0 ? workingSlots[workingSlots.length - 1].hour : null;

                    // 営業時間の最初と最後（is_business_hour フラグから取得）
                    const bizSlots = store.hourly_productivity.filter(h => h.is_business_hour);
                    const firstBizHour = bizSlots.length > 0 ? bizSlots[0].hour : null;
                    const lastBizHour = bizSlots.length > 0 ? bizSlots[bizSlots.length - 1].hour : null;

                    // 表示範囲：出勤時間帯と営業時間帯の「広い方（union）」
                    const displayMin = (firstWorkHour !== null && firstBizHour !== null)
                      ? Math.min(firstWorkHour, firstBizHour)
                      : (firstWorkHour ?? firstBizHour ?? store.hourly_productivity[0].hour);
                    const displayMax = (lastWorkHour !== null && lastBizHour !== null)
                      ? Math.max(lastWorkHour, lastBizHour)
                      : (lastWorkHour ?? lastBizHour ?? store.hourly_productivity[store.hourly_productivity.length - 1].hour);

                    const filteredHours = store.hourly_productivity.filter(
                      h => h.hour >= displayMin && h.hour <= displayMax
                    );

                    return (
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
                            {filteredHours.map((h, i) => {
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
                    );
                  })()}
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
                            (emp.status === '休憩中' || emp.status === '退出中') ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800' :
                            emp.status === '未出勤' ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800' :
                            'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                            emp.status === '勤務中' ? 'bg-green-500' :
                            emp.status === '退勤済み' ? 'bg-gray-400' :
                            emp.status === '未出勤' ? 'bg-amber-400' : 'bg-blue-400'  // 休憩中・退出中は青
                          }`}>
                            {emp.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm truncate">{emp.name}</p>
                              {/* 店舗間移動バッジ */}
                              {emp.cross_store_transfer && (
                                <span className="text-[9px] bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                                  <ArrowRight className="h-2.5 w-2.5" />
                                  {emp.is_transfer_arrival ? `${emp.transfer_from}より移動` : `${emp.transfer_to}へ移動`}
                                </span>
                              )}
                              {/* 掛け持ち表示（店舗間移動でない場合のみ） */}
                              {!emp.cross_store_transfer && emp.clock_location && emp.clock_location !== emp.dept_store_name && (
                                <span className="text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full shrink-0">
                                  掛持
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              {emp.clock_in && <span>出勤 {emp.clock_in}</span>}
                              {emp.break_start && <span>休憩開始 {emp.break_start}</span>}
                              {/* 勤務中に戻った後も休憩実績があれば表示 */}
                              {!emp.break_start && emp.had_break && emp.break_minutes > 0 && (
                                <span className="text-blue-500">休憩 {Math.floor(emp.break_minutes / 60) > 0 ? `${Math.floor(emp.break_minutes / 60)}時間` : ''}{emp.break_minutes % 60 > 0 ? `${emp.break_minutes % 60}分` : ''}</span>
                              )}
                              {emp.clock_out && <span>{emp.cross_store_transfer && !emp.is_transfer_arrival ? '移動前退勤' : '退勤'} {emp.clock_out}</span>}
                              {!emp.cross_store_transfer && emp.clock_location && emp.clock_location !== emp.dept_store_name && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="h-2.5 w-2.5" />{emp.clock_location}
                                </span>
                              )}
                              {/* 所属店舗が異なる場合は所属店舗名を表示 */}
                              {emp.dept_store_name && emp.dept_store_name !== emp.store_name && (
                                <span className="text-[10px] text-muted-foreground">(所属:{emp.dept_store_name})</span>
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
 * ローディング中の進捗表示コンポーネント
 * 初回読み込み時に外部サービスへの接続状況を表示し、待ち時間の体感を軽減する
 */
function LoadingProgress() {
  const [step, setStep] = useState(0);
  const steps = [
    { label: 'TempoVisorに接続中...', icon: '📊', color: 'text-blue-600 dark:text-blue-400' },
    { label: '売上データを取得中...', icon: '💴', color: 'text-green-600 dark:text-green-400' },
    { label: 'ジョブカンに接続中...', icon: '👥', color: 'text-purple-600 dark:text-purple-400' },
    { label: '勤怠データを取得中...', icon: '⏰', color: 'text-orange-600 dark:text-orange-400' },
    { label: '人時生産性を計算中...', icon: '⚙️', color: 'text-red-600 dark:text-red-400' },
  ];

  useEffect(() => {
    const intervals = [1200, 2500, 4000, 5500];
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setStep(i + 1), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <div className="mb-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${current.color}`}>
            {current.icon} {current.label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            初回読み込みは10秒程度かかる場合があります。しばらくお待ちください。
          </p>
        </div>
        {/* ステップインジケーター */}
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                i <= step ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, unit, icon: Icon, gradient, description, index, trend }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: 'easeOut' }}
      className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* 背景グラデーション */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.04] group-hover:opacity-[0.07] transition-opacity`} />
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-[0.08] -translate-y-10 translate-x-10`} />
      <div className="relative">
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs text-muted-foreground font-semibold tracking-wide uppercase">{title}</span>
          <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient} shadow-sm`}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
        </div>
        <div className="flex items-end gap-1 mb-1">
          <span className="text-2xl font-black tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {unit && <span className="text-xs font-semibold text-muted-foreground mb-0.5">{unit}</span>}
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            {description}
          </p>
        )}
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
  const [saved, setSaved] = useState(false);

  const updateDaySetting = (storeName, dayIndex, key, value) => {
    setSettings(prev => {
      const storeSetting = prev[storeName] || DEFAULT_STORE_SETTINGS[storeName] || { days: makeDefaultDays(10, 18) };
      const days = [...(storeSetting.days || makeDefaultDays(10, 18))];
      days[dayIndex] = { ...days[dayIndex], [key]: value };
      return { ...prev, [storeName]: { ...storeSetting, days } };
    });
  };

  const applyToAllDays = (storeName, open, close) => {
    setSettings(prev => {
      const storeSetting = prev[storeName] || DEFAULT_STORE_SETTINGS[storeName] || { days: makeDefaultDays(10, 18) };
      const days = (storeSetting.days || makeDefaultDays(10, 18)).map(d => ({ ...d, open, close }));
      return { ...prev, [storeName]: { ...storeSetting, days } };
    });
  };

  const handleSave = () => {
    saveStoreSettings(settings);
    onSave(settings);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  const handleReset = () => {
    if (window.confirm('全店舗の設定をデフォルトに戻しますか？')) {
      setSettings(JSON.parse(JSON.stringify(DEFAULT_STORE_SETTINGS)));
    }
  };

  const currentStoreSetting = settings[activeStore] || DEFAULT_STORE_SETTINGS[activeStore] || { days: makeDefaultDays(10, 18) };
  const currentDays = currentStoreSetting.days || makeDefaultDays(10, 18);
  const today = new Date().getDay();

  // 店舗の今日の営業状況を取得
  const getStoreStatus = (name) => {
    const s = settings[name] || DEFAULT_STORE_SETTINGS[name] || {};
    const todayDay = s.days?.[today];
    if (todayDay?.is_closed) return 'closed';
    return 'open';
  };

  // 曜日の色設定
  const getDayColor = (dayIndex, isClosed, isToday) => {
    if (isClosed) return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-400 dark:text-gray-500' };
    if (isToday) return { bg: 'bg-red-800', text: 'text-white' };
    if (dayIndex === 0) return { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-600 dark:text-red-400' };
    if (dayIndex === 6) return { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400' };
    return { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' };
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 30 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
          style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-red-900 to-red-700">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-sm">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white tracking-wide">店舗営業時間設定</h2>
                <p className="text-xs text-red-200">曜日別の営業時間・定休日を管理</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* 店舗リスト（左サイドバー） */}
            <div className="w-44 border-r dark:border-gray-700 overflow-y-auto shrink-0 bg-gray-50 dark:bg-gray-800/50">
              <div className="p-3 border-b dark:border-gray-700">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">店舗一覧</p>
              </div>
              {ALL_STORE_NAMES.map(name => {
                const status = getStoreStatus(name);
                const isActive = activeStore === name;
                const s = settings[name] || DEFAULT_STORE_SETTINGS[name] || {};
                const todayDayCfg = s.days?.[today];
                const openHour = todayDayCfg?.open ?? 10;
                const closeHour = todayDayCfg?.close ?? 18;
                return (
                  <button
                    key={name}
                    onClick={() => setActiveStore(name)}
                    className={`w-full text-left px-3 py-3 transition-all border-b dark:border-gray-700/50 ${
                      isActive
                        ? 'bg-white dark:bg-gray-900 border-l-4 border-l-red-800 dark:border-l-red-500'
                        : 'hover:bg-white/70 dark:hover:bg-gray-800 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs font-bold ${
                        isActive ? 'text-red-800 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {name.replace('イオン', 'ｲｵﾝ').replace('FC店', 'FC')}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        status === 'closed'
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                          : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                      }`}>
                        {status === 'closed' ? '定休' : '営業'}
                      </span>
                    </div>
                    {status !== 'closed' && (
                      <p className="text-[10px] text-muted-foreground">
                        {openHour}:00〜{closeHour}:00
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 設定パネル（右メイン） */}
            <div className="flex-1 overflow-y-auto">
              {/* 店舗名ヘッダー */}
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-red-800 dark:text-red-400" />
                  <h3 className="font-black text-base">{activeStore}</h3>
                  <span className="text-xs text-muted-foreground">の営業時間設定</span>
                </div>
                <button
                  onClick={() => {
                    const firstDay = currentDays.find(d => !d.is_closed) || currentDays[0];
                    applyToAllDays(activeStore, firstDay.open, firstDay.close);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-200 dark:border-blue-800"
                >
                  <RefreshCw className="h-3 w-3" />
                  全曜日に一括適用
                </button>
              </div>

              <div className="p-5 space-y-2">
                {DAY_LABELS.map((label, dayIndex) => {
                  const dayConfig = currentDays[dayIndex] || { open: 10, close: 18, is_closed: false };
                  const isToday = dayIndex === today;
                  const dayColors = getDayColor(dayIndex, dayConfig.is_closed, isToday);

                  return (
                    <motion.div
                      key={dayIndex}
                      layout
                      className={`rounded-2xl border-2 transition-all ${
                        dayConfig.is_closed
                          ? 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700'
                          : isToday
                          ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-700 shadow-sm'
                          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        {/* 曜日バッジ */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black shrink-0 ${dayColors.bg} ${dayColors.text}`}>
                          {label}
                        </div>

                        {/* 曜日名 */}
                        <div className="w-12 shrink-0">
                          <p className={`text-xs font-semibold ${
                            isToday ? 'text-red-800 dark:text-red-400' : 'text-muted-foreground'
                          }`}>
                            {DAY_FULL_LABELS[dayIndex].replace('曜日', '')}
                            {isToday && <span className="ml-1 text-[9px] bg-red-800 text-white px-1 py-0.5 rounded-full">今日</span>}
                          </p>
                        </div>

                        {/* 営業/定休トグルボタン */}
                        <button
                          onClick={() => updateDaySetting(activeStore, dayIndex, 'is_closed', !dayConfig.is_closed)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border-2 ${
                            dayConfig.is_closed
                              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-100'
                              : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-100'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${
                            dayConfig.is_closed ? 'bg-red-500' : 'bg-green-500'
                          }`} />
                          {dayConfig.is_closed ? '定休日' : '営業日'}
                        </button>

                        {/* 時間設定 */}
                        {!dayConfig.is_closed ? (
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex items-center gap-1 flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-2 py-1 border border-gray-200 dark:border-gray-600">
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                              <select
                                value={dayConfig.open}
                                onChange={e => updateDaySetting(activeStore, dayIndex, 'open', parseInt(e.target.value))}
                                className="flex-1 bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                                ))}
                              </select>
                            </div>
                            <span className="text-muted-foreground text-sm font-bold shrink-0">〜</span>
                            <div className="flex items-center gap-1 flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-2 py-1 border border-gray-200 dark:border-gray-600">
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                              <select
                                value={dayConfig.close}
                                onChange={e => updateDaySetting(activeStore, dayIndex, 'close', parseInt(e.target.value))}
                                className="flex-1 bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
                              >
                                {Array.from({ length: 24 }, (_, i) => i + 1).map(i => (
                                  <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
                                ))}
                              </select>
                            </div>
                            {/* 営業時間数 */}
                            <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
                              {dayConfig.close - dayConfig.open}h
                            </span>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600">
                              <p className="text-xs text-muted-foreground text-center">定休日 — 営業なし</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* 週間サマリー */}
                <div className="mt-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    週間営業スケジュール
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {currentDays.map((d, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-2 text-center ${
                          d.is_closed
                            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                            : i === today
                            ? 'bg-red-800 text-white border border-red-700'
                            : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <p className={`text-[10px] font-bold mb-1 ${
                          d.is_closed ? 'text-red-500 dark:text-red-400' :
                          i === today ? 'text-white' :
                          i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
                        }`}>{DAY_LABELS[i]}</p>
                        {d.is_closed ? (
                          <p className="text-[9px] text-red-500 dark:text-red-400 font-semibold">定休</p>
                        ) : (
                          <>
                            <p className={`text-[9px] font-bold ${ i === today ? 'text-white' : '' }`}>{String(d.open).padStart(2,'0')}:00</p>
                            <p className={`text-[9px] ${ i === today ? 'text-red-200' : 'text-muted-foreground' }`}>〜</p>
                            <p className={`text-[9px] font-bold ${ i === today ? 'text-white' : '' }`}>{String(d.close).padStart(2,'0')}:00</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* 週間営業時間合計 */}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">週間営業時間合計</span>
                    <span className="text-sm font-black text-gray-800 dark:text-gray-200">
                      {currentDays.filter(d => !d.is_closed).reduce((sum, d) => sum + (d.close - d.open), 0)}時間 / 週
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* フッター */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors px-3 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <RefreshCw className="h-3 w-3" />
              デフォルトに戻す
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border-2 dark:border-gray-600 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className={`px-6 py-2.5 rounded-xl text-white text-sm font-black transition-all shadow-lg flex items-center gap-2 ${
                  saved
                    ? 'bg-green-500 scale-95'
                    : 'bg-gradient-to-r from-red-900 to-red-700 hover:from-red-800 hover:to-red-600 hover:shadow-xl active:scale-95'
                }`}
              >
                {saved ? (
                  <><CheckCircle className="h-4 w-4" />保存完了！</>
                ) : (
                  <><Settings className="h-4 w-4" />保存して反映</>
                )}
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
  const [storeSort, setStoreSort] = useState('default'); // 'default' | 'productivity' | 'sales' | 'person_hours'

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
  const isCachedData = queryData?.cached || false;  // キャッシュから返ったデータか
  const cacheAgeSeconds = queryData?.cacheAgeSeconds || 0;
  const summary = calcSummary(stores);

  const openStores = stores.filter(s => !s.is_closed);
  const closedStores = stores.filter(s => s.is_closed);

  // バイザー順（ALL_STORE_NAMESの定義順）
  const STORE_DEFAULT_ORDER = ALL_STORE_NAMES;
  const sortedOpenStores = (() => {
    const arr = [...openStores];
    if (storeSort === 'productivity') {
      arr.sort((a, b) => b.productivity - a.productivity);
    } else if (storeSort === 'sales') {
      arr.sort((a, b) => b.total_sales - a.total_sales);
    } else if (storeSort === 'person_hours') {
      arr.sort((a, b) => b.total_hours - a.total_hours);
    } else {
      // default: バイザー順
      arr.sort((a, b) => {
        const ai = STORE_DEFAULT_ORDER.indexOf(a.store_name);
        const bi = STORE_DEFAULT_ORDER.indexOf(b.store_name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
    return arr;
  })();

  return (
    <div className="space-y-5 pb-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-red-900 to-red-600 shadow-lg shadow-red-900/20">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">リアルタイム人時生産性</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs font-semibold text-muted-foreground">
                {format(new Date(), 'yyyy年MM月dd日（E）', { locale: ja })}
              </p>
              {lastUpdated && (
                <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-muted-foreground px-2 py-0.5 rounded-full">
                  最終更新: {format(lastUpdated, 'HH:mm:ss')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* ライブ/オフライン/キャッシュ */}
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold ${
            isCachedData ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
            isLive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
            'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          }`}>
            {isCachedData ? (
              <><RefreshCw className="h-3.5 w-3.5" /><span>キャッシュ {cacheAgeSeconds}秒前</span></>
            ) : isLive ? (
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
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-800 dark:hover:text-red-400 transition-all text-xs font-semibold"
            title="店舗営業時間設定"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden md:inline">店舗設定</span>
          </button>

          {/* スタッフ設定 */}
          <button
            onClick={() => setShowStaffSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-400 transition-all text-xs font-semibold"
            title="社員接客時間帯設定"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span className="hidden md:inline">スタッフ</span>
          </button>

          {/* ダークモード */}
          <button
            onClick={toggleDark}
            className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            title="ダークモード切替"
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
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-red-800 dark:text-red-400" />
              <h3 className="font-black text-sm tracking-tight">全店舗 目標達成状況</h3>
              <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-muted-foreground px-2 py-0.5 rounded-full font-semibold">
                営業中 {sortedOpenStores.length}店舗
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => (
                <span key={key} className="flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-1 rounded-2xl overflow-hidden" style={{ height: '140px' }}>
            {sortedOpenStores.map((store, i) => {
              // 売上0円（データ未取得）の場合はグレー表示
              const hasData = store.total_sales > 0 || store.productivity > 0;
              const level = hasData ? getProductivityLevel(store.productivity) : null;
              const cfg = hasData ? LEVEL_CONFIG[level] : null;
              const barColor = hasData ? cfg.color : '#9ca3af';
              const displayName = store.store_name
                .replace('イオンタウン', 'ｲｵﾝ')
                .replace('イオン', 'ｲｵﾝ')
                .replace('FC店', 'FC');
              const achieveRate = hasData ? Math.min(100, Math.round((store.productivity / PRODUCTIVITY_TARGET) * 100)) : null;
              return (
                <motion.div
                  key={store.store_name}
                  className="flex-1 flex flex-col items-center justify-between cursor-pointer hover:brightness-110 hover:scale-y-105 transition-all origin-bottom py-2 px-0.5"
                  style={{ backgroundColor: barColor }}
                  initial={{ scaleY: 0, originY: 1 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.45, delay: i * 0.03, ease: 'backOut' }}
                  onClick={() => setSelectedStore(store)}
                  title={hasData
                    ? `${store.store_name}: ¥${store.productivity.toLocaleString()}/h (達成率${achieveRate}%)`
                    : `${store.store_name}: データ取得中`
                  }
                >
                  {/* 達成率 or ロード中 */}
                  <span
                    className="text-white/90 font-black leading-none select-none"
                    style={{ fontSize: '11px', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                  >
                    {hasData ? `${achieveRate}%` : '-'}
                  </span>
                  {/* 店舗名 */}
                  <span
                    className="text-white font-black leading-none select-none"
                    style={{
                      fontSize: '14px',
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      letterSpacing: '0.12em',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 3px rgba(0,0,0,0.35)',
                    }}
                  >
                    {displayName}
                  </span>
                  {/* 人時生産性小表示 */}
                  <span
                    className="text-white/80 font-semibold leading-none select-none"
                    style={{ fontSize: '9px', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                  >
                    {hasData ? `¥${(store.productivity / 1000).toFixed(1)}k` : '---'}
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
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-bold flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-red-800 dark:text-red-400" />
              店舗別リアルタイム状況
              <span className="text-xs font-normal text-muted-foreground hidden sm:inline">（タップで詳細・時間帯別グラフ）</span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* ⚡ 並び順切り替え */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
                {[
                  { id: 'default', label: 'バイザー順', emoji: '🏪' },
                  { id: 'productivity', label: '人時生産性', emoji: '⚡' },
                  { id: 'sales', label: '売上順', emoji: '💴' },
                  { id: 'person_hours', label: '人時数順', emoji: '👥' },
                ].map(({ id, label, emoji }) => (
                  <button
                    key={id}
                    onClick={() => setStoreSort(id)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      storeSort === id
                        ? 'bg-white dark:bg-gray-700 shadow-md text-red-800 dark:text-red-400 scale-105'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/60 dark:hover:bg-gray-700/60'
                    }`}
                  >
                    <span>{emoji}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
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
          </div>

          {isLoading && stores.length === 0 ? (
            <div>
              {/* ローディングメッセージ */}
              <LoadingProgress />
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
                    (emp.status === '休憩中' || emp.status === '退出中') ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                    'bg-gray-100 dark:bg-gray-700 text-muted-foreground'
                  }`}>
                    {emp.status === '退出中' ? '休憩中(外出)' : emp.status}
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
