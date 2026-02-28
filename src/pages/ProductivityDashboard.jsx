import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Activity, Wifi, WifiOff, TrendingUp, TrendingDown,
  Users, Clock, DollarSign, ChevronRight, X, BarChart3, Target,
  AlertTriangle, CheckCircle, Zap, Building2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell
} from 'recharts';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';

// 人時生産性の目標値（円/時間）
const PRODUCTIVITY_TARGET = 3000;
const PRODUCTIVITY_GOOD = 2500;
const PRODUCTIVITY_WARNING = 2000;

function getProductivityLevel(prod) {
  if (prod >= PRODUCTIVITY_TARGET) return 'excellent';
  if (prod >= PRODUCTIVITY_GOOD) return 'good';
  if (prod >= PRODUCTIVITY_WARNING) return 'warning';
  return 'danger';
}

const LEVEL_CONFIG = {
  excellent: {
    label: '優秀',
    color: '#22c55e',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-500',
    icon: CheckCircle,
  },
  good: {
    label: '良好',
    color: '#3b82f6',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-500',
    icon: TrendingUp,
  },
  warning: {
    label: '注意',
    color: '#f59e0b',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-500',
    icon: AlertTriangle,
  },
  danger: {
    label: '要改善',
    color: '#ef4444',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-400',
    text: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-500',
    icon: TrendingDown,
  },
};

/**
 * APIレスポンスをダッシュボード用データに変換
 */
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
    productivity: parseInt(item.spd || item.productivity || 0),
    update_time: item.update_time || '',
    employees: item.employees || [],
  }));
}

function calcSummary(stores) {
  if (!stores || stores.length === 0) {
    return { totalSales: 0, totalWorkHours: 0, totalWorkers: 0, avgProductivity: 0, workingNow: 0 };
  }
  const totalSales = stores.reduce((s, st) => s + (st.total_sales || 0), 0);
  const totalWorkHours = stores.reduce((s, st) => s + (st.total_hours || 0), 0);
  const totalWorkers = stores.reduce((s, st) => s + (st.attended_employees || 0), 0);
  const workingNow = stores.reduce((s, st) => s + (st.working_employees || 0), 0);
  const avgProductivity = totalWorkHours > 0 ? Math.round(totalSales / totalWorkHours) : 0;
  return { totalSales, totalWorkHours, totalWorkers, avgProductivity, workingNow };
}

/**
 * リアルタイムデータをAPIから取得
 */
async function fetchRealtimeData() {
  const response = await fetch('/api/productivity/realtime', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`APIエラー: ${response.status}`);
  const result = await response.json();
  return {
    stores: transformStoreData(result.data || []),
    sources: result.sources || {},
    timestamp: result.timestamp,
  };
}

/**
 * 人時生産性ゲージ（プログレスバー形式）
 */
function ProductivityGauge({ value, target = PRODUCTIVITY_TARGET }) {
  const percentage = Math.min(100, Math.round((value / target) * 100));
  const level = getProductivityLevel(value);
  const config = LEVEL_CONFIG[level];

  return (
    <div className="mt-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-muted-foreground">目標達成率</span>
        <span className={`text-xs font-bold ${config.text}`}>{percentage}%</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: config.color }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

/**
 * 店舗カード
 */
function StoreCard({ store, onClick, index }) {
  const level = getProductivityLevel(store.productivity);
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`rounded-xl border-2 ${config.border} ${config.bg} p-4 cursor-pointer group hover:shadow-lg transition-shadow relative`}
      onClick={() => onClick(store)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(store)}
    >
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-base leading-tight">{store.store_name}</h3>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white mt-1 ${config.badge}`}>
            <Icon className="h-3 w-3" />
            {config.label}
          </span>
        </div>
        {store.working_employees > 0 && (
          <span className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block"></span>
            {store.working_employees}人稼働中
          </span>
        )}
      </div>

      {/* メトリクス */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" />本日売上
          </span>
          <span className="font-bold text-lg">¥{store.total_sales.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />出勤/稼働
          </span>
          <span className="text-sm font-semibold">
            {store.attended_employees}人 / <span className="text-green-600">{store.working_employees}人</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />総労働時間
          </span>
          <span className="text-sm font-semibold">{store.total_hours.toFixed(1)}h</span>
        </div>
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">人時生産性</span>
            <span className={`text-2xl font-bold ${config.text}`}>
              ¥{store.productivity.toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground">/h</span>
            </span>
          </div>
          <ProductivityGauge value={store.productivity} />
        </div>
      </div>

      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${configs[status] || 'bg-gray-300 text-gray-700'}`}>
      {status}
    </span>
  );
}

/**
 * 店舗詳細モーダル
 */
function StoreDetailModal({ store, onClose }) {
  if (!store) return null;

  const level = getProductivityLevel(store.productivity);
  const config = LEVEL_CONFIG[level];

  const sortedEmployees = [...(store.employees || [])].sort((a, b) => {
    const order = { '勤務中': 0, '休憩中': 1, '退勤済み': 2, '未出勤': 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const workingCount = sortedEmployees.filter(e => e.status === '勤務中' || e.status === '休憩中').length;
  const finishedCount = sortedEmployees.filter(e => e.status === '退勤済み').length;
  const absentCount = sortedEmployees.filter(e => e.status === '未出勤').length;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
        >
          {/* ヘッダー */}
          <div className={`p-5 ${config.bg} border-b ${config.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {store.store_name}
                </h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white mt-1 ${config.badge}`}>
                  {config.label}
                </span>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-black/10 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-5 overflow-y-auto max-h-[calc(90vh-120px)]">
            {/* KPIグリッド */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">本日売上</p>
                <p className="text-lg font-bold">¥{store.total_sales.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">稼働中</p>
                <p className="text-lg font-bold">
                  <span className="text-green-600">{workingCount}</span>
                  <span className="text-muted-foreground text-sm">/{store.total_employees}人</span>
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">総労働時間</p>
                <p className="text-lg font-bold">{store.total_hours.toFixed(1)}h</p>
              </div>
              <div className={`${config.bg} border ${config.border} rounded-xl p-3 text-center`}>
                <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${config.text}`} />
                <p className="text-xs text-muted-foreground">人時生産性</p>
                <p className={`text-lg font-bold ${config.text}`}>
                  ¥{store.productivity.toLocaleString()}
                  <span className="text-xs font-normal">/h</span>
                </p>
              </div>
            </div>

            {/* 勤務状況サマリー */}
            <div className="flex items-center gap-4 text-sm mb-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
                勤務中: <strong>{workingCount}人</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"></span>
                退勤済み: <strong>{finishedCount}人</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
                未出勤: <strong>{absentCount}人</strong>
              </span>
              {store.update_time && (
                <span className="ml-auto text-xs text-muted-foreground">
                  売上更新: {store.update_time}
                </span>
              )}
            </div>

            {/* 従業員テーブル */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 dark:bg-gray-800">
                  <th className="text-left p-2 font-medium">氏名</th>
                  <th className="text-center p-2 font-medium">状態</th>
                  <th className="text-center p-2 font-medium">出勤</th>
                  <th className="text-center p-2 font-medium">退勤</th>
                  <th className="text-right p-2 font-medium">労働時間</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      本日のシフトデータがありません
                    </td>
                  </tr>
                ) : (
                  sortedEmployees.map((emp, i) => (
                    <tr
                      key={i}
                      className={`border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        emp.status === '勤務中' ? 'bg-green-50/50 dark:bg-green-950/10' :
                        emp.status === '未出勤' ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="p-2 font-medium">{emp.name}</td>
                      <td className="p-2 text-center"><StatusBadge status={emp.status} /></td>
                      <td className="p-2 text-center text-muted-foreground">{emp.clock_in || '-'}</td>
                      <td className="p-2 text-center text-muted-foreground">{emp.clock_out || '-'}</td>
                      <td className="p-2 text-right font-medium">
                        {emp.work_hours > 0 ? `${emp.work_hours.toFixed(1)}h` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {sortedEmployees.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                    <td className="p-2" colSpan={4}>合計</td>
                    <td className="p-2 text-right">{store.total_hours.toFixed(1)}h</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * サマリーカード
 */
function SummaryCard({ title, value, unit, icon: Icon, color, description, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </div>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </motion.div>
  );
}

/**
 * 店舗別棒グラフ
 */
function StoreBarChart({ stores }) {
  const data = stores
    .filter(s => s.total_sales > 0 || s.productivity > 0)
    .map(s => ({
      name: s.store_name.replace('店', '').replace('FC', ''),
      売上: s.total_sales,
      人時生産性: s.productivity,
    }))
    .sort((a, b) => b.人時生産性 - a.人時生産性);

  if (data.length === 0) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg text-sm">
        <p className="font-bold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.name === '売上' ? `¥${p.value.toLocaleString()}` : `¥${p.value.toLocaleString()}/h`}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        店舗別人時生産性比較
        <span className="text-xs font-normal text-muted-foreground ml-1">（目標: ¥{PRODUCTIVITY_TARGET.toLocaleString()}/h）</span>
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={PRODUCTIVITY_TARGET} stroke="#22c55e" strokeDasharray="5 5" label={{ value: '目標', position: 'right', fontSize: 10, fill: '#22c55e' }} />
          <Bar dataKey="人時生産性" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={LEVEL_CONFIG[getProductivityLevel(entry.人時生産性)].color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * リアルタイム人時生産性ダッシュボード（メインコンポーネント）
 */
export default function ProductivityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedStore, setSelectedStore] = useState(null);
  const [viewMode, setViewMode] = useState('cards');

  // React Queryでデータ取得・キャッシュ
  // staleTime: 25秒（自動更新間隔30秒に合わせて、ページ遷移後も即座に表示）
  const {
    data: queryData,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['productivity-realtime'],
    queryFn: fetchRealtimeData,
    staleTime: 25 * 1000,       // 25秒間はキャッシュを新鮮とみなす（ページ遷移時にリロードしない）
    gcTime: 5 * 60 * 1000,      // 5分間キャッシュ保持
    refetchInterval: autoRefresh ? 30 * 1000 : false,  // 30秒ごとに自動更新
    refetchIntervalInBackground: false,  // バックグラウンドでは更新しない
    refetchOnWindowFocus: false, // フォーカス時に再取得しない
    refetchOnMount: 'always',    // マウント時は常に（ただしstaleTime内はキャッシュ使用）
  });

  const stores = queryData?.stores || [];
  const sources = queryData?.sources || {};
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const isLive = sources.tempovisor === 'live' || sources.jobcan === 'live';
  const summary = calcSummary(stores);
  const sortedStores = [...stores].sort((a, b) => b.productivity - a.productivity);

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            リアルタイム人時生産性
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), 'yyyy年MM月dd日（E）', { locale: ja })}
            {lastUpdated && (
              <span className="ml-2">最終更新: {format(lastUpdated, 'HH:mm:ss')}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* ライブ/オフライン表示 */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isLive ? (
              <><Wifi className="h-3.5 w-3.5 text-green-500" /><span className="text-green-600 font-medium">ライブ</span></>
            ) : (
              <><WifiOff className="h-3.5 w-3.5 text-amber-500" /><span className="text-amber-600">オフライン</span></>
            )}
          </div>

          {/* 表示切替 */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'cards' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-muted-foreground'}`}
            >
              カード
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'chart' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-muted-foreground'}`}
            >
              グラフ
            </button>
          </div>

          {/* 自動更新 */}
          <div className="flex items-center gap-2">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">自動更新(30秒)</Label>
          </div>

          {/* 手動更新 */}
          <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard title="総売上" value={Math.round(summary.totalSales)} unit="円" icon={DollarSign} color="bg-blue-500" description="全店舗合計" index={0} />
        <SummaryCard
          title="平均人時生産性"
          value={Math.round(summary.avgProductivity)}
          unit="円/h"
          icon={Zap}
          color={summary.avgProductivity >= PRODUCTIVITY_TARGET ? 'bg-emerald-500' : summary.avgProductivity >= PRODUCTIVITY_GOOD ? 'bg-blue-500' : summary.avgProductivity >= PRODUCTIVITY_WARNING ? 'bg-amber-500' : 'bg-red-500'}
          description={`目標: ¥${PRODUCTIVITY_TARGET.toLocaleString()}/h`}
          index={1}
        />
        <SummaryCard title="総勤務時間" value={summary.totalWorkHours.toFixed(1)} unit="時間" icon={Clock} color="bg-purple-500" description="全スタッフ合計" index={2} />
        <SummaryCard title="現在稼働中" value={summary.workingNow} unit="人" icon={Activity} color="bg-green-500" description="リアルタイム" index={3} />
        <SummaryCard title="本日出勤延べ" value={summary.totalWorkers} unit="人" icon={Users} color="bg-indigo-500" description="退勤済み含む" index={4} />
      </div>

      {/* 目標達成状況バー */}
      {stores.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              目標達成状況
            </h3>
            <div className="flex items-center gap-3 text-xs">
              {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cfg.color }}></span>
                  {cfg.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
            {sortedStores.map((store, i) => {
              const level = getProductivityLevel(store.productivity);
              const cfg = LEVEL_CONFIG[level];
              return (
                <motion.div
                  key={store.store_name}
                  className="flex-1 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: cfg.color }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                  onClick={() => setSelectedStore(store)}
                  title={`${store.store_name}: ¥${store.productivity.toLocaleString()}/h`}
                >
                  <span className="text-white text-[9px] font-bold truncate px-0.5 hidden sm:block">
                    {store.store_name.replace('店', '').replace('FC', '').slice(0, 3)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* 店舗別表示 */}
      {viewMode === 'cards' ? (
        <div>
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            店舗別リアルタイム状況
            <span className="text-xs font-normal text-muted-foreground">（カードをクリックで詳細）</span>
          </h2>
          {isLoading && stores.length === 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {[...Array(13)].map((_, i) => (
                <div key={i} className="rounded-xl border bg-gray-50 dark:bg-gray-800 p-4 animate-pulse">
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded mb-3 w-2/3"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-4 w-1/4"></div>
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mt-3"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">データがありません</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {sortedStores.map((store, i) => (
                <StoreCard
                  key={store.store_code || store.store_name}
                  store={store}
                  onClick={setSelectedStore}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <StoreBarChart stores={stores} />
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              店舗別本日売上
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[...stores].sort((a, b) => b.total_sales - a.total_sales).map(s => ({
                  name: s.store_name.replace('店', '').replace('FC', ''),
                  売上: s.total_sales,
                }))}
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v) => [`¥${v.toLocaleString()}`, '売上']} />
                <Bar dataKey="売上" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedStore && (
        <StoreDetailModal store={selectedStore} onClose={() => setSelectedStore(null)} />
      )}
    </div>
  );
}
