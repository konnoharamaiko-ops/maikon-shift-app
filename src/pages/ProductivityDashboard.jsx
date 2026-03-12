import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { toast } from 'sonner';
import {
  RefreshCw, Activity, Wifi, WifiOff, TrendingUp, TrendingDown,
  Users, Clock, DollarSign, ChevronRight, X, BarChart3, Target,
  AlertTriangle, CheckCircle, Zap, Building2, ChevronDown, ChevronUp,
  Sun, Moon, LayoutGrid, LineChart as LineChartIcon, Timer, Coffee,
  Settings, Calendar, MapPin, ArrowUpRight, ArrowDownRight, Minus,
  Store, BanknoteIcon, Briefcase, ArrowRight, ShoppingCart, Factory,
  Package, Truck, FlaskConical, Layers, Save, Edit3, Plus
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
    total_hours: parseFloat(item.total_hours ?? item.wk_tm ?? 0),  // total_hours（個人労働時間合計）を優先、wk_tm（時間帯別人時合計）はフォールバック
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
    is_after_close: item.is_after_close || false,  // 稼働中0人（閉店済み）フラグ
    is_before_open_no_data: item.is_before_open_no_data || false,  // 営業前かつ前日データなし（「準備中」表示用）
    is_yesterday_data: item.is_yesterday_data || false,  // 前日データ使用中フラグ
    time_zone: item.time_zone || 'during_business',
    first_clock_in: item.first_clock_in ?? null,
    last_clock_out: item.last_clock_out ?? null,
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
  '心斎橋店', 'かがや店', '駅丸', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂福島店'
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
  '駅丸':     { days: makeDefaultDays(10, 22) },
  '北摂店':       { days: makeDefaultDays(10, 18) },
  '堺東店':       { days: (() => {
    const d = makeDefaultDays(10, 20);
    d[0] = { open: 10, close: 19, is_closed: false }; // 日曜日は19時閉店
    return d;
  })() },
  'イオン松原店': { days: makeDefaultDays(9,  20) },
  'イオン守口店': { days: makeDefaultDays(9,  20) },
  '美和堂福島店':   { days: makeDefaultDays(10, 18, [0]) }, // 日曜定休
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

async function fetchRealtimeData(storeSettings, staffSettings) {
  // localStorageの設定をAPIに渡す
  let url = '/api/productivity/realtime';
  const params = [];
  if (storeSettings) {
    params.push(`store_settings=${encodeURIComponent(JSON.stringify(storeSettings))}`);
  }
  if (staffSettings && Object.keys(staffSettings).length > 0) {
    params.push(`staff_settings=${encodeURIComponent(JSON.stringify(staffSettings))}`);
  }
  if (params.length > 0) url += '?' + params.join('&');
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`APIエラー: ${response.status}`);
  const result = await response.json();
  return {
    stores: transformStoreData(result.data || []),
    departmentData: result.department_data || {},
    sources: result.sources || {},
    timestamp: result.timestamp,
    currentJstHour: result.current_jst_hour ?? new Date().getHours(),
    currentJstMinutes: result.current_jst_minutes ?? (new Date().getHours() * 60 + new Date().getMinutes()),
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
function StoreCard({ store, onClick, index, currentJstHour }) {
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

  // 閉店済み判定：稼働中0人かつ少なくとも1人以上退勤済みがいる場合
  const isAfterClose = store.is_after_close === true;
  // 閉店済みの場合は「3/3の結果」のように日付を表示
  const today = new Date();
  const frozenDateLabel = `${today.getMonth() + 1}/${today.getDate()}の結果`;

  const hasData = store.total_sales > 0 || store.productivity > 0;
  const level = hasData ? getProductivityLevel(store.productivity) : 'danger';
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;
  // 現在時刻以前の時間帯のみを対象にして直近の2件を取得
  // currentJstHourが未定義の場合はフィルタリングなし（安全フォールバック）
  // 閉店後（is_after_close）の場合はフィルタなしで全データの最後2件を返す（最終値固定）
  const recentHourly = (() => {
    const all = store.hourly_productivity || [];
    if (isAfterClose) return all.slice(-2); // 閉店後は最終値を固定表示
    if (currentJstHour === undefined || currentJstHour === null) return all.slice(-2);
    // 現在時刻の時間帯以前（hour <= currentJstHour）のみを対象
    const past = all.filter(h => h.hour <= currentJstHour);
    return past.slice(-2);
  })();
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
      {/* トップカラーバー：閉店済みはグレー */}
      <div className={`h-1.5 w-full ${isAfterClose ? 'bg-gray-400 dark:bg-gray-500' : hasData ? config.topBar : 'bg-gray-300 dark:bg-gray-600'}`} />

      {/* 閉店済みオーバーレイ（薄いグレー） */}
      {isAfterClose && (
        <div className="absolute inset-0 bg-gray-100/60 dark:bg-gray-900/50 pointer-events-none z-10 rounded-2xl" />
      )}

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
            {/* 閉店済みの場合は「3/3の結果」ラベルを表示 */}
            {isAfterClose ? (
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400" />
                {frozenDateLabel}
              </p>
            ) : store.update_time ? (
              <p className="text-[10px] text-muted-foreground">{store.update_time}</p>
            ) : null}
          </div>
          {/* ステータスバッジグループ */}
          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
            {isAfterClose ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm bg-gray-500">
                <Store className="h-3 w-3" />
                閉店済み
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-sm ${hasData ? config.badge : 'bg-gray-400'}`}>
                <Icon className="h-3 w-3" />
                {hasData ? config.label : '取得中'}
              </span>
            )}
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
          <div className={`rounded-xl p-2 text-center border ${isAfterClose ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-600/50'}`}>
            <Activity className={`h-3 w-3 mx-auto mb-0.5 ${isAfterClose ? 'text-gray-400' : 'text-green-500'}`} />
            <p className="text-[9px] text-muted-foreground leading-none mb-0.5">稼働中</p>
            <p className={`font-black text-xs leading-none ${isAfterClose ? 'text-gray-400 dark:text-gray-500' : 'text-green-600 dark:text-green-400'}`}>{activeCount}人</p>
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
 * 除外スタッフカード（ループ内useStateを避けるため別コンポーネント化）
 */
// 企画部メモ・タスクセクション
function PlanningMemoSection({ selectedDate }) {
  const dateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  const storageKey = `planning_memo_${dateKey}`;
  const [memo, setMemo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{"text":"","tasks":[]}'); }
    catch { return { text: '', tasks: [] }; }
  });
  const [newTask, setNewTask] = useState('');

  const save = (updated) => {
    setMemo(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    save({ ...memo, tasks: [...(memo.tasks || []), { id: Date.now(), text: newTask.trim(), done: false }] });
    setNewTask('');
  };

  const toggleTask = (id) => {
    save({ ...memo, tasks: memo.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) });
  };

  const removeTask = (id) => {
    save({ ...memo, tasks: memo.tasks.filter(t => t.id !== id) });
  };

  return (
    <div className="space-y-4">
      {/* 作業メモ */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-purple-200 dark:border-purple-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Edit3 className="h-4 w-4 text-purple-600" />
          <h3 className="font-bold text-sm">本日の作業メモ</h3>
          <span className="text-xs text-muted-foreground ml-auto">{dateKey}</span>
        </div>
        <textarea
          value={memo.text || ''}
          onChange={e => save({ ...memo, text: e.target.value })}
          placeholder="本日の企画・作業内容を記録..."
          rows={4}
          className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-900 text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>

      {/* タスクリスト */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-purple-200 dark:border-purple-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="h-4 w-4 text-purple-600" />
          <h3 className="font-bold text-sm">本日のタスク</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            {(memo.tasks || []).filter(t => t.done).length}/{(memo.tasks || []).length} 完了
          </span>
        </div>
        <div className="space-y-2 mb-3">
          {(memo.tasks || []).map(task => (
            <div key={task.id} className="flex items-center gap-2 group">
              <button
                onClick={() => toggleTask(task.id)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  task.done ? 'bg-purple-500 border-purple-500' : 'border-gray-300 dark:border-gray-600 hover:border-purple-400'
                }`}
              >
                {task.done && <CheckCircle className="h-3 w-3 text-white" />}
              </button>
              <span className={`flex-1 text-sm ${
                task.done ? 'line-through text-muted-foreground' : 'text-slate-800 dark:text-slate-100'
              }`}>{task.text}</span>
              <button
                onClick={() => removeTask(task.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {(memo.tasks || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">タスクがありません</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="タスクを追加..."
            className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button
            onClick={addTask}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-all"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExcludedStaffCard({ s, updateStaffSetting, i }) {
  const [editingReason, setEditingReason] = useState(false);
  const [reasonText, setReasonText] = useState(s.exclude_reason || '');
  return (
    <div key={s.id} className={`p-3 bg-white dark:bg-gray-900 ${i > 0 ? 'border-t border-red-100 dark:border-red-900' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold">{s.id}</p>
            {s.override_store && (
              <span className="text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 px-1.5 py-0.5 rounded-full">→{s.override_store}</span>
            )}
          </div>
          {s.excluded_from_store && (
            <p className="text-xs text-muted-foreground mt-0.5">除外元: {s.excluded_from_store}</p>
          )}
          {s.excluded_at && (
            <p className="text-xs text-muted-foreground">除外日時: {s.excluded_at}</p>
          )}
          {/* 除外理由 */}
          <div className="mt-1.5">
            {editingReason ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={reasonText}
                  onChange={e => setReasonText(e.target.value)}
                  placeholder="除外理由（例：研修・本社対応）"
                  className="flex-1 rounded border dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs"
                  autoFocus
                />
                <button
                  onClick={() => {
                    updateStaffSetting(s.id, 'exclude_reason', reasonText);
                    setEditingReason(false);
                  }}
                  className="px-2 py-1 bg-blue-500 text-white text-xs rounded"
                >保存</button>
                <button onClick={() => setEditingReason(false)} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-xs rounded">×</button>
              </div>
            ) : (
              <button
                onClick={() => setEditingReason(true)}
                className="text-xs text-blue-500 hover:underline"
              >
                {s.exclude_reason ? `理由: ${s.exclude_reason}` : '＋ 除外理由を入力'}
              </button>
            )}
          </div>
          {/* 移動先変更 */}
          <div className="mt-1.5">
            <label className="text-xs text-muted-foreground block mb-0.5">移動先店舗（任意）</label>
            <select
              value={s.override_store || ''}
              onChange={e => updateStaffSetting(s.id, 'override_store', e.target.value)}
              className="w-full rounded border dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs"
            >
              <option value="">移動先なし</option>
              <optgroup label="店1018">
                {ALL_STORE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
              </optgroup>
              <optgroup label="通企総0919">
                <option value="特販部">特販部</option>
                <option value="通販部">通販部</option>
                <option value="企画部">企画部</option>
              </optgroup>
              <optgroup label="工房0918">
                <option value="北摂工場">北摂工場</option>
                <option value="かがや工場">かがや工場</option>
                <option value="南田辺工房">南田辺工房</option>
              </optgroup>
              <optgroup label="駅催事出張">
                <option value="駅催事出張">駅催事出張</option>
              </optgroup>
            </select>
          </div>
        </div>
        {/* 除外解除ボタン */}
        <button
          onClick={() => updateStaffSetting(s.id, 'excluded', false)}
          className="shrink-0 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded-lg hover:bg-green-200 transition-colors"
        >
          解除
        </button>
      </div>
    </div>
  );
}

/**
 * 店舗詳細モーダル（時間帯別グラフ付き）
 */
function StoreDetailModal({ store, onClose, staffSettings = {}, onStaffSettingsChange }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedStaff, setExpandedStaff] = useState(null);
  const [showExcludedPanel, setShowExcludedPanel] = useState(false);
  const [showAddStaffForm, setShowAddStaffForm] = useState(false);
  const [addStaffForm, setAddStaffForm] = useState({ name: '', clock_in: '', clock_out: '', store_name: store?.store_name || '' });
  if (!store) return null;

  // 除外スタッフ一覧（このダイアログの店舗に関係なく全除外スタッフを表示）
  const excludedStaffList = Object.entries(staffSettings)
    .filter(([, s]) => s.excluded === true)
    .map(([id, s]) => ({ id, ...s }));

  const updateStaffSetting = (staffId, key, value) => {
    const current = staffSettings[staffId] || {};
    let extra = {};
    // 除外ONになった瞬間に履歴を記録
    if (key === 'excluded' && value === true && !current.excluded) {
      extra = {
        excluded_at: new Date().toLocaleString('ja-JP'),
        excluded_from_store: store.store_name,
        exclude_reason: current.exclude_reason || '',
      };
    }
    // 除外OFFになった瞬間に履歴をクリア
    if (key === 'excluded' && value === false) {
      extra = { excluded_at: null, excluded_from_store: null };
    }
    const newSettings = {
      ...staffSettings,
      [staffId]: { ...current, [key]: value, ...extra },
    };
    saveStaffSettings(newSettings);
    if (onStaffSettingsChange) onStaffSettingsChange(newSettings);
  };

  // 手動追加スタッフをlocalStorageに保存
  const loadManualStaff = () => {
    try { return JSON.parse(localStorage.getItem('manual_staff') || '[]'); } catch { return []; }
  };
  const saveManualStaff = (list) => {
    localStorage.setItem('manual_staff', JSON.stringify(list));
  };
  const handleAddStaff = () => {
    if (!addStaffForm.name.trim()) return;
    const list = loadManualStaff();
    const clockIn = addStaffForm.clock_in || '09:00';
    const clockOut = addStaffForm.clock_out || '18:00';
    const [inH, inM] = clockIn.split(':').map(Number);
    const [outH, outM] = clockOut.split(':').map(Number);
    const workHours = Math.max(0, (outH * 60 + outM - inH * 60 - inM) / 60);
    const newStaff = {
      id: `manual_${Date.now()}`,
      name: addStaffForm.name.trim(),
      clock_in: clockIn,
      clock_out: clockOut,
      work_hours: workHours,
      store_name: addStaffForm.store_name || store.store_name,
      status: '勤務中',
      is_manual: true,
      added_at: new Date().toLocaleString('ja-JP'),
    };
    list.push(newStaff);
    saveManualStaff(list);
    setAddStaffForm({ name: '', clock_in: '', clock_out: '', store_name: store?.store_name || '' });
    setShowAddStaffForm(false);
    if (onStaffSettingsChange) onStaffSettingsChange({ ...staffSettings });
  };
  const manualStaffForStore = loadManualStaff().filter(s => s.store_name === store.store_name);
  const removeManualStaff = (id) => {
    const list = loadManualStaff().filter(s => s.id !== id);
    saveManualStaff(list);
    if (onStaffSettingsChange) onStaffSettingsChange({ ...staffSettings });
  };

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
                  {/* ヘッダーアクションバー */}
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400">
                      各スタッフをタップすると除外・所属変更の設定ができます
                    </div>
                    <button
                      onClick={() => setShowAddStaffForm(v => !v)}
                      className="shrink-0 flex items-center gap-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl transition-colors"
                    >
                      <span className="text-base leading-none">＋</span>追加
                    </button>
                  </div>

                  {/* 手動スタッフ追加フォーム */}
                  <AnimatePresence>
                    {showAddStaffForm && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden mb-3"
                      >
                        <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl space-y-3">
                          <p className="text-xs font-bold text-green-700 dark:text-green-400">スタッフを手動追加（人時計算に含まれます）</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                              <label className="text-xs text-muted-foreground block mb-1">氏名 *</label>
                              <input
                                type="text"
                                value={addStaffForm.name}
                                onChange={e => setAddStaffForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="例：田中 太郎"
                                className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground block mb-1">出勤時刻</label>
                              <input
                                type="time"
                                value={addStaffForm.clock_in}
                                onChange={e => setAddStaffForm(f => ({ ...f, clock_in: e.target.value }))}
                                className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground block mb-1">退勤時刻</label>
                              <input
                                type="time"
                                value={addStaffForm.clock_out}
                                onChange={e => setAddStaffForm(f => ({ ...f, clock_out: e.target.value }))}
                                className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-muted-foreground block mb-1">所属先</label>
                              <select
                                value={addStaffForm.store_name}
                                onChange={e => setAddStaffForm(f => ({ ...f, store_name: e.target.value }))}
                                className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm"
                              >
                                {ALL_STORE_NAMES.map(s => <option key={s} value={s}>{s}</option>)}
                                <option value="通販">通販</option>
                                <option value="製造">製造</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleAddStaff}
                              disabled={!addStaffForm.name.trim()}
                              className="flex-1 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                            >
                              追加する
                            </button>
                            <button
                              onClick={() => setShowAddStaffForm(false)}
                              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-sm rounded-lg transition-colors"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 手動追加スタッフ一覧 */}
                  {manualStaffForStore.length > 0 && (
                    <div className="mb-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
                      <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-2">手動追加スタッフ（{manualStaffForStore.length}名）</p>
                      <div className="space-y-2">
                        {manualStaffForStore.map(s => (
                          <div key={s.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 py-2">
                            <div>
                              <p className="text-sm font-semibold">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.clock_in}〜{s.clock_out}（{s.work_hours.toFixed(1)}h）追加: {s.added_at}</p>
                            </div>
                            <button
                              onClick={() => removeManualStaff(s.id)}
                              className="ml-2 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 除外スタッフ履歴パネル */}
                  {excludedStaffList.length > 0 && (
                    <div className="mb-3">
                      <button
                        onClick={() => setShowExcludedPanel(v => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-xs font-bold text-red-700 dark:text-red-400"
                      >
                        <span>除外中スタッフ一覧（{excludedStaffList.length}名）</span>
                        {showExcludedPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <AnimatePresence>
                        {showExcludedPanel && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-1 border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
                              {excludedStaffList.map((s, i) => (
                                <ExcludedStaffCard key={s.id} s={s} i={i} updateStaffSetting={updateStaffSetting} />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* 通常スタッフ一覧 */}
                  <div className="space-y-2">
                    {sortedEmployees.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        本日のシフトデータがありません
                      </div>
                    ) : (
                      sortedEmployees.map((emp, i) => {
                        const staffId = emp.jobcan_id || emp.name;
                        const setting = staffSettings[staffId] || {};
                        const isExcluded = setting.excluded === true;
                        const isExpanded = expandedStaff === staffId;
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className={`rounded-xl border overflow-hidden ${
                              isExcluded ? 'opacity-50 border-red-300 dark:border-red-700' :
                              emp.status === '勤務中' ? 'border-green-200 dark:border-green-800' :
                              (emp.status === '休憩中' || emp.status === '退出中') ? 'border-blue-200 dark:border-blue-800' :
                              emp.status === '未出勤' ? 'border-amber-200 dark:border-amber-800' :
                              'border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            {/* スタッフ情報行（タップで展開） */}
                            <div
                              className={`p-3 flex items-center gap-3 cursor-pointer ${
                                isExcluded ? 'bg-red-50 dark:bg-red-950/20' :
                                emp.status === '勤務中' ? 'bg-green-50 dark:bg-green-950/20' :
                                (emp.status === '休憩中' || emp.status === '退出中') ? 'bg-blue-50 dark:bg-blue-950/20' :
                                emp.status === '未出勤' ? 'bg-amber-50 dark:bg-amber-950/20' :
                                'bg-gray-50 dark:bg-gray-800'
                              }`}
                              onClick={() => setExpandedStaff(isExpanded ? null : staffId)}
                            >
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                                isExcluded ? 'bg-red-400' :
                                emp.status === '勤務中' ? 'bg-green-500' :
                                emp.status === '退勤済み' ? 'bg-gray-400' :
                                emp.status === '未出勤' ? 'bg-amber-400' : 'bg-blue-400'
                              }`}>
                                {emp.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-sm truncate">{emp.name}</p>
                                  {isExcluded && (
                                    <span className="text-[9px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full shrink-0">除外中</span>
                                  )}
                                  {setting.override_store && (
                                    <span className="text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full shrink-0">→{setting.override_store}</span>
                                  )}
                                  {emp.cross_store_transfer && (
                                    <span className="text-[9px] bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                                      <ArrowRight className="h-2.5 w-2.5" />
                                      {emp.is_transfer_arrival ? `${emp.transfer_from}より移動` : `${emp.transfer_to}へ移動`}
                                    </span>
                                  )}
                                  {!emp.cross_store_transfer && emp.clock_location && emp.clock_location !== emp.dept_store_name && (
                                    <span className="text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full shrink-0">掛持</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                  {emp.clock_in && <span>出勤 {emp.clock_in}</span>}
                                  {emp.break_start && <span>休憩開始 {emp.break_start}</span>}
                                  {!emp.break_start && emp.had_break && emp.break_minutes > 0 && (
                                    <span className="text-blue-500">休憩 {Math.floor(emp.break_minutes / 60) > 0 ? `${Math.floor(emp.break_minutes / 60)}時間` : ''}{emp.break_minutes % 60 > 0 ? `${emp.break_minutes % 60}分` : ''}</span>
                                  )}
                                  {emp.clock_out && <span>{emp.cross_store_transfer && !emp.is_transfer_arrival ? '移動前退勤' : '退勤'} {emp.clock_out}</span>}
                                  {!emp.cross_store_transfer && emp.clock_location && emp.clock_location !== emp.dept_store_name && (
                                    <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{emp.clock_location}</span>
                                  )}
                                  {emp.dept_store_name && emp.dept_store_name !== emp.store_name && (
                                    <span className="text-[10px] text-muted-foreground">(所属:{emp.dept_store_name})</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <StatusBadge status={emp.status} />
                                  {emp.work_hours > 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">{emp.work_hours.toFixed(1)}h</p>
                                  )}
                                </div>
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </div>
                            {/* 展開パネル：除外・所属変更設定 */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 space-y-3">
                                    {/* 除外スイッチ */}
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="text-sm font-semibold">人時計算から除外</p>
                                        <p className="text-xs text-muted-foreground">このスタッフを人時生産性の計算対象外にします</p>
                                      </div>
                                      <button
                                        onClick={() => updateStaffSetting(staffId, 'excluded', !isExcluded)}
                                        className={`relative w-11 h-6 rounded-full transition-colors ${
                                          isExcluded ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
                                        }`}
                                      >
                                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                          isExcluded ? 'translate-x-5' : 'translate-x-0.5'
                                        }`} />
                                      </button>
                                    </div>
                                    {/* 所属先変更 */}
                                    <div>
                                      <label className="text-xs text-muted-foreground block mb-1">所属先変更（任意）</label>
                                      <select
                                        value={setting.override_store || ''}
                                        onChange={e => updateStaffSetting(staffId, 'override_store', e.target.value)}
                                        disabled={isExcluded}
                                        className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm disabled:opacity-50"
                                      >
                                        <option value="">デフォルト（{emp.dept_store_name || emp.store_name || '未設定'}）</option>
                                        {ALL_STORE_NAMES.map(s => (
                                          <option key={s} value={s}>{s}</option>
                                        ))}
                                        <optgroup label="通企総0919">
                                          <option value="特販部">特販部</option>
                                          <option value="通販部">通販部</option>
                                          <option value="企画部">企画部</option>
                                        </optgroup>
                                        <optgroup label="工房0918">
                                          <option value="北摂工場">北摂工場</option>
                                          <option value="かがや工場">かがや工場</option>
                                          <option value="南田辺工房">南田辺工房</option>
                                        </optgroup>
                                        <optgroup label="駅催事出張">
                                          <option value="駅催事出張">駅催事出張</option>
                                        </optgroup>
                                      </select>
                                    </div>
                                    {isExcluded && (
                                      <p className="text-xs text-red-500 dark:text-red-400">⚠ このスタッフは人時生産性計算から除外されます</p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })
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

  // 表示フィルター（社員のみ or 全スタッフ）
  const [showAllStaff, setShowAllStaff] = useState(false);
  const employeeList = showAllStaff
    ? staffList
    : staffList.filter(s =>
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
            {/* 表示フィルター */}
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">表示対象</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAllStaff(false)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    !showAllStaff ? 'bg-red-800 text-white shadow-sm' : 'text-muted-foreground hover:text-gray-700'
                  }`}
                >
                  社員のみ
                </button>
                <button
                  onClick={() => setShowAllStaff(true)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    showAllStaff ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-gray-700'
                  }`}
                >
                  全スタッフ
                </button>
              </div>
            </div>
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
                    const isExcluded = setting.excluded === true;
                    const isEmployee = staff.staff_type === '社員' || staff.staff_type === '契約社員' || staff.staff_type === '役員';
                    return (
                      <div key={staff.id} className={`rounded-xl p-4 border transition-all ${
                        isExcluded
                          ? 'bg-gray-100 dark:bg-gray-800/50 border-gray-300 dark:border-gray-600 opacity-70'
                          : 'bg-gray-50 dark:bg-gray-800 border-transparent'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-bold text-sm ${ isExcluded ? 'line-through text-muted-foreground' : '' }`}>{staff.staff_name}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                isEmployee
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              }`}>{staff.staff_type || 'パート'}</span>
                              {isExcluded && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 font-semibold">除外中</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {setting.override_store || staff.store_name || staff.dept_code || '未設定'}
                            </p>
                          </div>
                          {/* 除外スイッチ */}
                          <div className="flex items-center gap-2 ml-3">
                            <span className="text-xs text-muted-foreground">除外</span>
                            <button
                              onClick={() => updateStaffSetting(staff.id, 'excluded', !isExcluded)}
                              className={`relative w-10 h-5 rounded-full transition-colors ${
                                isExcluded ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                isExcluded ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          </div>
                        </div>

                        {/* 所属先変更 */}
                        <div className="mb-3">
                          <label className="text-xs text-muted-foreground block mb-1">所属先変更（任意）</label>
                          <select
                            value={setting.override_store || ''}
                            onChange={e => updateStaffSetting(staff.id, 'override_store', e.target.value)}
                            disabled={isExcluded}
                            className="w-full rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm disabled:opacity-50"
                          >
                            <option value="">デフォルト（{staff.store_name || '未設定'}）</option>
                            {ALL_STORE_NAMES.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                            <optgroup label="通企総0919">
                              <option value="特販部">特販部</option>
                              <option value="通販部">通販部</option>
                              <option value="企画部">企画部</option>
                            </optgroup>
                            <optgroup label="工房0918">
                              <option value="北摂工場">北摂工場</option>
                              <option value="かがや工場">かがや工場</option>
                              <option value="南田辺工房">南田辺工房</option>
                            </optgroup>
                            <optgroup label="駅催事出張">
                              <option value="駅催事出張">駅催事出張</option>
                            </optgroup>
                          </select>
                        </div>

                        {/* 接客時間帯設定（社員のみ） */}
                        {isEmployee && !isExcluded && (
                          <>
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
                          </>
                        )}

                        {isExcluded && (
                          <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                            ⚠ このスタッフは人時生産性計算から除外されます
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
  const [activeCategory, setActiveCategory] = useState('store'); // 'store' | 'online' | 'manufacturing'
  const [storeSettings, setStoreSettings] = useState(() => loadStoreSettings());
  const [storeSort, setStoreSort] = useState('default'); // 'default' | 'productivity' | 'sales' | 'person_hours'
  const [clientStaffSettings, setClientStaffSettings] = useState(() => {
    // localStorageからスタッフ設定を読み込む
    try {
      const saved = localStorage.getItem('maikon_staff_settings');
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      // 旧店舗名マイグレーション（エキマル→駅丸、美和堂FC店→美和堂福島店）
      const STORE_NAME_MIGRATION = { 'エキマル': '駅丸', '美和堂FC店': '美和堂福島店' };
      let migrated = false;
      const migratedSettings = {};
      for (const [id, setting] of Object.entries(parsed)) {
        const newSetting = { ...setting };
        if (setting.override_store && STORE_NAME_MIGRATION[setting.override_store]) {
          newSetting.override_store = STORE_NAME_MIGRATION[setting.override_store];
          migrated = true;
        }
        if (setting.excluded_from_store && STORE_NAME_MIGRATION[setting.excluded_from_store]) {
          newSetting.excluded_from_store = STORE_NAME_MIGRATION[setting.excluded_from_store];
          migrated = true;
        }
        migratedSettings[id] = newSetting;
      }
      if (migrated) {
        localStorage.setItem('maikon_staff_settings', JSON.stringify(migratedSettings));
        console.log('[Migration] 店舗名を新名称に更新しました');
      }
      // 除外スタッフの自動解除：除外日の翌日以降になったら自動的に解除
      const todayJaStr = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
      let autoReleased = false;
      for (const [id, setting] of Object.entries(migratedSettings)) {
        if (setting.excluded === true && setting.excluded_at) {
          // excluded_atは "2026/3/11 16:36:09" のような形式
          const excludedDateStr = setting.excluded_at.split(' ')[0]; // "2026/3/11"
          // 日付比較のためDateオブジェクトに変換
          const excludedDate = new Date(excludedDateStr.replace(/\//g, '-'));
          const today = new Date(todayJaStr.replace(/\//g, '-'));
          excludedDate.setHours(0, 0, 0, 0);
          today.setHours(0, 0, 0, 0);
          if (today > excludedDate) {
            // 翌日以降なので自動解除
            migratedSettings[id] = {
              ...setting,
              excluded: false,
              excluded_at: null,
              excluded_from_store: null,
              auto_released: true,
              auto_released_at: new Date().toLocaleString('ja-JP'),
            };
            autoReleased = true;
            console.log(`[除外自動解除] ${setting.staff_name || id}: 除外日=${excludedDateStr}, 今日=${todayJaStr}`);
          }
        }
      }
      if (autoReleased) {
        localStorage.setItem('maikon_staff_settings', JSON.stringify(migratedSettings));
        console.log('[除外自動解除] 翌日以降の除外スタッフを自動解除しました');
      }
      return migratedSettings;
    } catch { return {}; }
  });
  const queryClient = useQueryClient();

  // 通販・製造の手入力データ管理
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [onlineInputDate, setOnlineInputDate] = useState(todayStr);
  const [onlineForm, setOnlineForm] = useState({ order_count: '', total_sales: '', total_hours: '', memo: '' });
  const [onlineEditMode, setOnlineEditMode] = useState(false);

  const [mfgInputDate, setMfgInputDate] = useState(todayStr);
  const [mfgForms, setMfgForms] = useState({
    hokusetsu_bagging: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
    hokusetsu_cooking: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
    kagaya_bagging: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
    kagaya_cooking: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
  });
  const [mfgEditMode, setMfgEditMode] = useState(false);

  // 通販データ取得
  const { data: onlineData } = useQuery({
    queryKey: ['onlineSalesData', onlineInputDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('OnlineSalesData').select('*').eq('work_date', onlineInputDate).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // 製造データ取得
  const { data: mfgDataList = [] } = useQuery({
    queryKey: ['manufacturingData', mfgInputDate],
    queryFn: async () => {
      const { data, error } = await supabase.from('ManufacturingData').select('*').eq('work_date', mfgInputDate);
      if (error) throw error;
      return data || [];
    },
  });

  // 通販データをフォームに反映
  useEffect(() => {
    if (onlineData) {
      setOnlineForm({
        order_count: onlineData.order_count?.toString() || '',
        total_sales: onlineData.total_sales?.toString() || '',
        total_hours: onlineData.total_hours?.toString() || '',
        memo: onlineData.memo || '',
      });
    } else {
      setOnlineForm({ order_count: '', total_sales: '', total_hours: '', memo: '' });
    }
  }, [onlineData, onlineInputDate]);

  // 製造データをフォームに反映
  useEffect(() => {
    const newForms = {
      hokusetsu_bagging: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
      hokusetsu_cooking: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
      kagaya_bagging: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
      kagaya_cooking: { production_kg: '', total_sales: '', total_hours: '', memo: '' },
    };
    mfgDataList.forEach(d => {
      const key = `${d.factory_name === '北摂工場' ? 'hokusetsu' : 'kagaya'}_${d.section_name === '袋詰め' ? 'bagging' : 'cooking'}`;
      if (newForms[key]) {
        newForms[key] = { production_kg: d.production_kg?.toString() || '', total_sales: d.total_sales?.toString() || '', total_hours: d.total_hours?.toString() || '', memo: d.memo || '' };
      }
    });
    setMfgForms(newForms);
  }, [mfgDataList, mfgInputDate]);

  // 通販保存
  const saveOnlineMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = {
        work_date: onlineInputDate,
        order_count: parseInt(formData.order_count) || 0,
        total_sales: parseFloat(formData.total_sales) || 0,
        total_hours: parseFloat(formData.total_hours) || 0,
        memo: formData.memo || '',
      };
      payload.productivity = payload.total_hours > 0 ? Math.round(payload.total_sales / payload.total_hours) : 0;
      if (onlineData?.id) {
        const { error } = await supabase.from('OnlineSalesData').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', onlineData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('OnlineSalesData').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onlineSalesData', onlineInputDate] });
      toast.success('通販データを保存しました');
      setOnlineEditMode(false);
    },
    onError: (e) => toast.error('保存に失敗しました: ' + e.message),
  });

  // 製造保存
  const saveMfgMutation = useMutation({
    mutationFn: async (forms) => {
      const entries = [
        { factory_name: '北摂工場', section_name: '袋詰め', key: 'hokusetsu_bagging' },
        { factory_name: '北摂工場', section_name: '炊き場', key: 'hokusetsu_cooking' },
        { factory_name: '加賀屋工場', section_name: '袋詰め', key: 'kagaya_bagging' },
        { factory_name: '加賀屋工場', section_name: '炊き場', key: 'kagaya_cooking' },
      ];
      for (const { factory_name, section_name, key } of entries) {
        const f = forms[key];
        if (!f.production_kg && !f.total_sales && !f.total_hours) continue;
        const payload = {
          work_date: mfgInputDate,
          factory_name,
          section_name,
          production_kg: parseFloat(f.production_kg) || 0,
          total_sales: parseFloat(f.total_sales) || 0,
          total_hours: parseFloat(f.total_hours) || 0,
          memo: f.memo || '',
        };
        payload.productivity = payload.total_hours > 0 ? Math.round(payload.total_sales / payload.total_hours) : 0;
        const existing = mfgDataList.find(d => d.factory_name === factory_name && d.section_name === section_name);
        if (existing) {
          const { error } = await supabase.from('ManufacturingData').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('ManufacturingData').insert(payload);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manufacturingData', mfgInputDate] });
      toast.success('製造データを保存しました');
      setMfgEditMode(false);
    },
    onError: (e) => toast.error('保存に失敗しました: ' + e.message),
  });

  const {
    data: queryData,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['productivity-realtime', storeSettings, clientStaffSettings],
    queryFn: () => fetchRealtimeData(storeSettings, clientStaffSettings),
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
  const departmentData = queryData?.departmentData || {};
  const sources = queryData?.sources || {};
  const employeeProductivity = queryData?.employeeProductivity || [];
  // APIから取得したJST現在時刻（直近の人時生産性フィルタリング用）
  const currentJstHour = queryData?.currentJstHour ?? new Date().getHours();
  const currentJstMinutes = queryData?.currentJstMinutes ?? (new Date().getHours() * 60 + new Date().getMinutes());
  // 最終更新時刻：dataUpdatedAtはUTCなのでJST(+9h)に変換して表示
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const isLive = sources.tempovisor === 'live' || sources.jobcan === 'live';
  const isCachedData = queryData?.cached || false;  // キャッシュから返ったデータか
  const cacheAgeSeconds = queryData?.cacheAgeSeconds || 0;
  const summary = calcSummary(stores);

  const openStores = stores.filter(s => !s.is_closed);
  const closedStores = stores.filter(s => s.is_closed);
  // 閉店済み表示用日付
  const todayDate = new Date();

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
                  最終更新: {format(new Date(lastUpdated.getTime() + 9 * 60 * 60 * 1000), 'HH:mm:ss')}
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

      {/* カテゴリタブ（店舗・通販・製造） */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
        {[
          { id: 'store', label: '店舗', icon: Building2, count: stores.length, color: 'text-red-800 dark:text-red-400', activeBg: 'bg-white dark:bg-gray-700', activeText: 'text-red-800 dark:text-red-400', desc: `${stores.filter(s => !s.is_closed).length}店舗営業中` },
          { id: 'online', label: '通販', icon: ShoppingCart, count: null, color: 'text-blue-700 dark:text-blue-400', activeBg: 'bg-white dark:bg-gray-700', activeText: 'text-blue-700 dark:text-blue-400', desc: '受注処理・受電' },
          { id: 'manufacturing', label: '製造（工房）', icon: Factory, count: null, color: 'text-amber-700 dark:text-amber-400', activeBg: 'bg-white dark:bg-gray-700', activeText: 'text-amber-700 dark:text-amber-400', desc: '北摂・加賀屋工場' },
          { id: 'planning', label: '企画部', icon: Briefcase, count: null, color: 'text-purple-700 dark:text-purple-400', activeBg: 'bg-white dark:bg-gray-700', activeText: 'text-purple-700 dark:text-purple-400', desc: '企画・マーケティング' },
        ].map(({ id, label, icon: Icon, count, color, activeBg, activeText, desc }) => (
          <button
            key={id}
            onClick={() => setActiveCategory(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              activeCategory === id
                ? `${activeBg} shadow-md ${activeText} scale-[1.02]`
                : 'text-muted-foreground hover:text-foreground hover:bg-white/60 dark:hover:bg-gray-700/60'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {count !== null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeCategory === id ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-gray-200 dark:bg-gray-600 text-muted-foreground'
              }`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* 目標達成状況バー */}
      {activeCategory === 'store' && openStores.length > 0 && (
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
              const storeIsAfterClose = store.is_after_close === true;
              const level = hasData ? getProductivityLevel(store.productivity) : null;
              const cfg = hasData ? LEVEL_CONFIG[level] : null;
              // 閉店済みはグレー、データ未取得はライトグレー、それ以外はレベル色
              const barColor = storeIsAfterClose ? '#6b7280' : hasData ? cfg.color : '#9ca3af';
              const displayName = store.store_name
                .replace('イオンタウン', 'ｲｵﾝ')
                .replace('イオン', 'ｲｵﾝ')
                .replace('FC店', 'FC');
              const achieveRate = hasData ? Math.min(100, Math.round((store.productivity / PRODUCTIVITY_TARGET) * 100)) : null;
              return (
                <motion.div
                  key={store.store_name}
                  className="flex-1 flex flex-col items-center justify-between cursor-pointer hover:brightness-110 hover:scale-y-105 transition-all origin-bottom py-2 px-0.5"
                  style={{ backgroundColor: barColor, opacity: storeIsAfterClose ? 0.75 : 1 }}
                  initial={{ scaleY: 0, originY: 1 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.45, delay: i * 0.03, ease: 'backOut' }}
                  onClick={() => setSelectedStore(store)}
                  title={storeIsAfterClose
                    ? `${store.store_name}: 閉店済み（${todayDate.getMonth()+1}/${todayDate.getDate()}の結果）`
                    : hasData
                      ? `${store.store_name}: ¥${store.productivity.toLocaleString()}/h (達成率${achieveRate}%)`
                      : `${store.store_name}: データ取得中`
                  }
                >
                  {/* 達成率 or 閉店済み or ロード中 */}
                  <span
                    className="text-white/90 font-black leading-none select-none"
                    style={{ fontSize: '11px', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                  >
                    {storeIsAfterClose ? '閉店' : hasData ? `${achieveRate}%` : '-'}
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
                    {storeIsAfterClose
                      ? `¥${(store.productivity / 1000).toFixed(1)}k`
                      : hasData ? `¥${(store.productivity / 1000).toFixed(1)}k` : '---'}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* カテゴリ別コンテンツ */}
      {activeCategory === 'online' && (
        <motion.div
          key="online"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 shadow-lg">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">通販 リアルタイム状況</h2>
                <p className="text-xs text-muted-foreground">受注処理・受電</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={onlineInputDate} onChange={e => setOnlineInputDate(e.target.value)}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-300" />
              <button onClick={() => setOnlineEditMode(!onlineEditMode)}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  onlineEditMode ? 'bg-blue-600 text-white' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200'
                }`}>
                <Edit3 className="h-3 w-3" />
                {onlineEditMode ? '入力中' : '手入力'}
              </button>
            </div>
          </div>

          {/* サマリーカード */}
          {(() => {
            const onlineDept = departmentData?.online || {};
            const realtimeHours = onlineDept.total_hours || 0;
            const realtimeWorking = onlineDept.working_now || 0;
            const realtimeAttended = onlineDept.attended || 0;
            // 勤務時間：ジョブカンリアルタイム優先、なければ手入力
            const effectiveHours = realtimeHours > 0 ? realtimeHours : (onlineData?.total_hours || 0);
            const effectiveSales = onlineData?.total_sales || 0;
            const effectiveProductivity = effectiveHours > 0 && effectiveSales > 0 ? Math.round(effectiveSales / effectiveHours) : (onlineData?.productivity || 0);
            return (
              <>
                {realtimeWorking > 0 && (
                  <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-2 text-sm">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span className="text-blue-700 dark:text-blue-300 font-semibold">
                      勤務中 {realtimeWorking}人 / 本日出勤 {realtimeAttended}人
                    </span>
                    <span className="text-xs text-blue-500">（ジョブカン連携）</span>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: '本日受注件数', value: onlineData?.order_count ?? '-', unit: '件', icon: Package, color: 'from-blue-500 to-indigo-600' },
                    { label: '本日売上', value: effectiveSales > 0 ? effectiveSales.toLocaleString() : '-', unit: '円', icon: DollarSign, color: 'from-indigo-500 to-purple-600' },
                    { label: '勤務時間合計', value: effectiveHours > 0 ? effectiveHours.toFixed(1) : '-', unit: 'h', icon: Clock, color: 'from-emerald-500 to-teal-600', sub: realtimeHours > 0 ? 'JC自動取得' : '手入力' },
                    { label: '人時生産性', value: effectiveProductivity > 0 ? effectiveProductivity.toLocaleString() : '-', unit: '円/h', icon: Zap, color: 'from-amber-500 to-orange-500' },
                  ].map(({ label, value, unit, icon: Icon, color, sub }) => (
                    <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${color}`}>
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">{label}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-black ${value === '-' ? 'text-muted-foreground' : 'text-slate-800 dark:text-slate-100'}`}>{value}</span>
                        <span className="text-xs text-muted-foreground">{unit}</span>
                      </div>
                      {sub && <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">{sub}</div>}
                    </div>
                  ))}
                </div>
                {/* 通販スタッフ一覧 */}
                {onlineDept.employees && onlineDept.employees.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-blue-600" />
                      <h3 className="font-bold text-sm">通販スタッフ勤務状況</h3>
                    </div>
                    <div className="space-y-2">
                      {onlineDept.employees.map((emp, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                              emp.status === 'working' ? 'bg-emerald-500' : emp.status === 'break' ? 'bg-amber-500' : 'bg-gray-400'
                            }`}>
                              {emp.name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">{emp.name}</div>
                              <div className="text-xs text-muted-foreground">出勤 {emp.clock_in}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              emp.status === 'working' ? 'bg-emerald-100 text-emerald-700' : emp.status === 'break' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {emp.status === 'working' ? '勤務中' : emp.status === 'break' ? '休憩中' : '退勤済'}
                            </span>
                            <span className="text-sm font-bold">{emp.work_hours?.toFixed(1)}h</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* 手入力フォーム */}
          {onlineEditMode && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-blue-300 dark:border-blue-700 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Edit3 className="h-4 w-4 text-blue-600" />
                <h3 className="font-bold text-sm">通販データ入力 ({onlineInputDate})</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">受注件数</label>
                  <input type="number" value={onlineForm.order_count}
                    onChange={e => setOnlineForm(f => ({ ...f, order_count: e.target.value }))}
                    placeholder="0" className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">売上（円）</label>
                  <input type="number" value={onlineForm.total_sales}
                    onChange={e => setOnlineForm(f => ({ ...f, total_sales: e.target.value }))}
                    placeholder="0" className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">勤務時間（h）</label>
                  <input type="number" step="0.5" value={onlineForm.total_hours}
                    onChange={e => setOnlineForm(f => ({ ...f, total_hours: e.target.value }))}
                    placeholder="0.0" className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">メモ</label>
                  <input type="text" value={onlineForm.memo}
                    onChange={e => setOnlineForm(f => ({ ...f, memo: e.target.value }))}
                    placeholder="備考" className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100" />
                </div>
              </div>
              {onlineForm.total_hours && onlineForm.total_sales && (
                <div className="mb-3 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                  人時生産性: {Math.round(parseFloat(onlineForm.total_sales) / parseFloat(onlineForm.total_hours)).toLocaleString()}円/h
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => saveOnlineMutation.mutate(onlineForm)}
                  disabled={saveOnlineMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" />
                  {saveOnlineMutation.isPending ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setOnlineEditMode(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* 通販メモ */}
          {onlineData?.memo && !onlineEditMode && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
              <span className="font-semibold">メモ:</span> {onlineData.memo}
            </div>
          )}
        </motion.div>
      )}

      {activeCategory === 'manufacturing' && (
        <motion.div
          key="manufacturing"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-700 to-amber-500 shadow-lg">
                <Factory className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">製造（工房）リアルタイム状況</h2>
                <p className="text-xs text-muted-foreground">北摂工場・加賀屋工場</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={mfgInputDate} onChange={e => setMfgInputDate(e.target.value)}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-300" />
              <button onClick={() => setMfgEditMode(!mfgEditMode)}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  mfgEditMode ? 'bg-amber-600 text-white' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200'
                }`}>
                <Edit3 className="h-3 w-3" />
                {mfgEditMode ? '入力中' : '手入力'}
              </button>
            </div>
          </div>

          {/* サマリーカード */}
          {(() => {
            const totalKg = mfgDataList.reduce((s, d) => s + (d.production_kg || 0), 0);
            const totalSales = mfgDataList.reduce((s, d) => s + (d.total_sales || 0), 0);
            const totalHours = mfgDataList.reduce((s, d) => s + (d.total_hours || 0), 0);
            // ジョブカンリアルタイム勤務データ
            const mfgDeptHokusetsu = departmentData?.manufacturing_hokusetsu || {};
            const mfgDeptKagaya = departmentData?.manufacturing_kagaya || {};
            const realtimeMfgWorking = (mfgDeptHokusetsu.working_now || 0) + (mfgDeptKagaya.working_now || 0);
            const realtimeMfgAttended = (mfgDeptHokusetsu.attended || 0) + (mfgDeptKagaya.attended || 0);
            const realtimeMfgHours = (mfgDeptHokusetsu.total_hours || 0) + (mfgDeptKagaya.total_hours || 0);
            const effectiveMfgHours = realtimeMfgHours > 0 ? realtimeMfgHours : totalHours;
            const productivity = effectiveMfgHours > 0 && totalSales > 0 ? Math.round(totalSales / effectiveMfgHours) : 0;
            return (
              <>
                {realtimeMfgWorking > 0 && (
                  <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-2 text-sm">
                    <Users className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-700 dark:text-amber-300 font-semibold">
                      勤務中 {realtimeMfgWorking}人 / 本日出勤 {realtimeMfgAttended}人
                    </span>
                    <span className="text-xs text-amber-500">（ジョブカン連携）</span>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: '本日製造量', value: totalKg > 0 ? totalKg.toFixed(1) : '-', unit: 'kg', icon: FlaskConical, color: 'from-amber-500 to-orange-500' },
                    { label: '本日売上', value: totalSales > 0 ? totalSales.toLocaleString() : '-', unit: '円', icon: DollarSign, color: 'from-orange-500 to-red-500' },
                    { label: '勤務時間合計', value: effectiveMfgHours > 0 ? effectiveMfgHours.toFixed(1) : '-', unit: 'h', icon: Clock, color: 'from-emerald-500 to-teal-600', sub: realtimeMfgHours > 0 ? 'JC自動取得' : '手入力' },
                    { label: '人時生産性', value: productivity > 0 ? productivity.toLocaleString() : '-', unit: '円/h', icon: Zap, color: 'from-amber-500 to-orange-500' },
                  ].map(({ label, value, unit, icon: Icon, color, sub }) => (
                    <div key={label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1.5 rounded-lg bg-gradient-to-br ${color}`}>
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">{label}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-black ${value === '-' ? 'text-muted-foreground' : 'text-slate-800 dark:text-slate-100'}`}>{value}</span>
                        <span className="text-xs text-muted-foreground">{unit}</span>
                      </div>
                      {sub && <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">{sub}</div>}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* 工場別カード */}
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { name: '北摂工場', color: 'amber', baggingKey: 'hokusetsu_bagging', cookingKey: 'hokusetsu_cooking', deptKey: 'manufacturing_hokusetsu' },
              { name: '加賀屋工場', color: 'orange', baggingKey: 'kagaya_bagging', cookingKey: 'kagaya_cooking', deptKey: 'manufacturing_kagaya' },
            ].map(({ name, color, baggingKey, cookingKey, deptKey }) => {
              const baggingData = mfgDataList.find(d => d.factory_name === name && d.section_name === '袋詰め');
              const cookingData = mfgDataList.find(d => d.factory_name === name && d.section_name === '炊き場');
              const factoryDept = departmentData?.[deptKey] || {};
              return (
                <div key={name} className={`bg-white dark:bg-gray-800 rounded-2xl border border-${color}-200 dark:border-${color}-800 p-5 shadow-sm`}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Factory className={`h-4 w-4 text-${color}-600 dark:text-${color}-400`} />
                      <h3 className="font-bold text-sm">{name}</h3>
                    </div>
                    {factoryDept.working_now > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full bg-${color}-100 dark:bg-${color}-900/30 text-${color}-700 dark:text-${color}-300 font-semibold`}>
                        勤務中 {factoryDept.working_now}人 / 出勤 {factoryDept.attended}人
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[{ label: '袋詰め', data: baggingData, key: baggingKey }, { label: '炊き場', data: cookingData, key: cookingKey }].map(({ label, data, key }) => (
                      <div key={label} className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-xl p-3`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Layers className={`h-3.5 w-3.5 text-${color}-600 dark:text-${color}-400`} />
                          <p className={`text-xs font-bold text-${color}-700 dark:text-${color}-300`}>{label}</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">製造量</span>
                            <span className="font-semibold">{data?.production_kg ?? '-'} kg</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">勤務時間</span>
                            <span className="font-semibold">{data?.total_hours ?? '-'} h</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">人時生産性</span>
                            <span className="font-semibold">{data?.productivity ? data.productivity.toLocaleString() : '-'} 円/h</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 工場別手入力フォーム */}
                  {mfgEditMode && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                      {[{ label: '袋詰め', key: baggingKey }, { label: '炊き場', key: cookingKey }].map(({ label, key }) => (
                        <div key={key}>
                          <p className={`text-xs font-bold text-${color}-700 dark:text-${color}-300 mb-2`}>{label} 入力</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1">製造量(kg)</label>
                              <input type="number" step="0.1" value={mfgForms[key]?.production_kg || ''}
                                onChange={e => setMfgForms(f => ({ ...f, [key]: { ...f[key], production_kg: e.target.value } }))}
                                placeholder="0.0" className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1">売上(円)</label>
                              <input type="number" value={mfgForms[key]?.total_sales || ''}
                                onChange={e => setMfgForms(f => ({ ...f, [key]: { ...f[key], total_sales: e.target.value } }))}
                                placeholder="0" className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100" />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1">勤務時間(h)</label>
                              <input type="number" step="0.5" value={mfgForms[key]?.total_hours || ''}
                                onChange={e => setMfgForms(f => ({ ...f, [key]: { ...f[key], total_hours: e.target.value } }))}
                                placeholder="0.0" className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 工場スタッフ一覧（ジョブカン） */}
                  {factoryDept.employees && factoryDept.employees.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Users className={`h-3.5 w-3.5 text-${color}-600`} />
                        <span className="text-xs font-bold text-muted-foreground">勤務スタッフ</span>
                      </div>
                      <div className="space-y-1.5">
                        {factoryDept.employees.map((emp, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                emp.status === 'working' ? 'bg-emerald-500' : emp.status === 'break' ? 'bg-amber-500' : 'bg-gray-400'
                              }`}>
                                {emp.name?.charAt(0) || '?'}
                              </div>
                              <span className="text-xs font-semibold">{emp.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                emp.status === 'working' ? 'bg-emerald-100 text-emerald-700' : emp.status === 'break' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {emp.status === 'working' ? '勤務中' : emp.status === 'break' ? '休憩' : '退勤'}
                              </span>
                              <span className="text-xs font-bold">{emp.work_hours?.toFixed(1)}h</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 製造保存ボタン */}
          {mfgEditMode && (
            <div className="flex gap-2">
              <button onClick={() => saveMfgMutation.mutate(mfgForms)}
                disabled={saveMfgMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50">
                <Save className="h-3.5 w-3.5" />
                {saveMfgMutation.isPending ? '保存中...' : '製造データを保存'}
              </button>
              <button onClick={() => setMfgEditMode(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">
                キャンセル
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* 企画部セクション */}
      {activeCategory === 'planning' && (
        <motion.div
          key="planning"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* ヘッダー */}
          <div className="bg-gradient-to-r from-purple-600 to-violet-700 rounded-3xl p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Briefcase className="h-5 w-5" />
                  <h2 className="text-xl font-black">企画部</h2>
                </div>
                <p className="text-purple-100 text-sm">企画・マーケティング・デザイン</p>
              </div>
              {(() => {
                const planningDept = departmentData?.planning || {};
                return planningDept.working_now > 0 ? (
                  <div className="text-right">
                    <div className="text-3xl font-black">{planningDept.working_now}</div>
                    <div className="text-purple-200 text-xs">勤務中 / 出勤{planningDept.attended}人</div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          {/* ジョブカン連携スタッフ一覧 */}
          {(() => {
            const planningDept = departmentData?.planning || {};
            return planningDept.employees && planningDept.employees.length > 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-purple-200 dark:border-purple-800 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-purple-600" />
                  <h3 className="font-bold text-sm">企画部スタッフ勤務状況</h3>
                  <span className="text-xs text-muted-foreground ml-auto">（ジョブカン連携）</span>
                </div>
                <div className="space-y-2">
                  {planningDept.employees.map((emp, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                          emp.status === 'working' ? 'bg-purple-500' : emp.status === 'break' ? 'bg-amber-500' : 'bg-gray-400'
                        }`}>
                          {emp.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{emp.name}</div>
                          <div className="text-xs text-muted-foreground">出勤 {emp.clock_in}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          emp.status === 'working' ? 'bg-purple-100 text-purple-700' : emp.status === 'break' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {emp.status === 'working' ? '勤務中' : emp.status === 'break' ? '休憩中' : '退勤済'}
                        </span>
                        <span className="text-sm font-bold">{emp.work_hours?.toFixed(1)}h</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-black text-purple-600">{planningDept.attended || 0}</div>
                    <div className="text-[10px] text-muted-foreground">本日出勤</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black text-emerald-600">{planningDept.working_now || 0}</div>
                    <div className="text-[10px] text-muted-foreground">現在勤務中</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-black text-slate-700 dark:text-slate-300">{planningDept.total_hours?.toFixed(1) || '0.0'}</div>
                    <div className="text-[10px] text-muted-foreground">合計勤務時間(h)</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground text-sm">現在勤務中の企画部スタッフはいません</p>
              </div>
            );
          })()}

          {/* 作業メモ・当日タスク入力 */}
          <PlanningMemoSection selectedDate={new Date()} />
        </motion.div>
      )}

      {/* 店舗別表示（店舗タブのみ表示） */}
      {activeCategory === 'store' && viewMode === 'cards' ? (
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
                    currentJstHour={currentJstHour}
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
                        currentJstHour={currentJstHour}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      ) : activeCategory === 'store' ? (
        <div className="space-y-4">
          <AllStoresHourlyChart stores={stores} />
          <StoreBarChart stores={stores} />
        </div>
      ) : null}

      {/* 社員個人生産性セクション（店舗タブのみ） */}
      {activeCategory === 'store' && employeeProductivity.length > 0 && (
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
        <StoreDetailModal
          store={selectedStore}
          onClose={() => setSelectedStore(null)}
          staffSettings={clientStaffSettings}
          onStaffSettingsChange={(newSettings) => {
            setClientStaffSettings(newSettings);
            queryClient.invalidateQueries({ queryKey: ['productivity-realtime'] });
          }}
        />
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


    </div>
  );
}
