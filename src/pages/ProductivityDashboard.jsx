import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { RefreshCw, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { ProductivitySummaryGrid } from '../components/productivity/ProductivitySummaryCard';
import { StoreStatusGrid } from '../components/productivity/StoreStatusCard';
import { EmployeeProductivityTable } from '../components/productivity/EmployeeProductivityTable';

/**
 * APIレスポンスをStoreStatusCardが期待する形式に変換
 * APIレスポンス: { tenpo_name, kingaku, wk_tm, wk_cnt, spd, code, detail }
 * StoreStatusCard期待: { store_name, store_code, total_sales, total_hours, total_employees, working_employees, productivity }
 */
function transformApiDataToStoreStatus(apiData) {
  if (!apiData || apiData.length === 0) return [];

  // 店舗ごとに集計（同じ店舗の複数日分を合算）
  const storeMap = {};

  apiData.forEach(item => {
    const code = item.code || item.store_code || '';
    const name = item.tenpo_name || item.store_name || '';

    if (!storeMap[code]) {
      storeMap[code] = {
        store_code: code,
        store_name: name,
        total_sales: 0,
        total_hours: 0,
        total_employees: 0,
        working_employees: 0,
        productivity: 0,
      };
    }

    const sales = parseFloat(item.kingaku || item.total_sales || 0);
    const hours = parseFloat(item.wk_tm || item.total_hours || 0);
    const workers = parseInt(item.wk_cnt || item.total_employees || 0);

    storeMap[code].total_sales += sales;
    storeMap[code].total_hours += hours;
    storeMap[code].total_employees = Math.max(storeMap[code].total_employees, workers);
  });

  // 人時生産性を計算
  return Object.values(storeMap).map(store => ({
    ...store,
    productivity: store.total_hours > 0
      ? Math.round(store.total_sales / store.total_hours)
      : 0,
  }));
}

/**
 * サマリーを計算
 */
function calcSummary(stores) {
  if (!stores || stores.length === 0) {
    return { totalSales: 0, totalWorkHours: 0, totalWorkers: 0, avgProductivity: 0 };
  }
  const totalSales = stores.reduce((s, st) => s + st.total_sales, 0);
  const totalWorkHours = stores.reduce((s, st) => s + st.total_hours, 0);
  const totalWorkers = stores.reduce((s, st) => s + st.total_employees, 0);
  const avgProductivity = totalWorkHours > 0 ? Math.round(totalSales / totalWorkHours) : 0;
  return { totalSales, totalWorkHours, totalWorkers, avgProductivity };
}

/**
 * リアルタイム人時生産性ダッシュボード
 * 本日の各店舗・各従業員の現在状況を視覚的に表示
 */
export default function ProductivityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/productivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: today, date_to: today }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `APIエラー: ${response.status}`);
      }

      const result = await response.json();
      const rawData = result.data || [];
      const transformed = transformApiDataToStoreStatus(rawData);
      setStores(transformed);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Data fetch error:', err);
      setError(err.message || 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [today]);

  // 初回取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自動更新
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const summary = calcSummary(stores);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary" />
            リアルタイム生産性ダッシュボード
          </h1>
          <p className="text-muted-foreground mt-1">
            本日の各店舗・各従業員の勤務状況と人時生産性をリアルタイムで監視
          </p>
        </div>

        {/* コントロール */}
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="cursor-pointer">
              自動更新 {autoRefresh ? 'ON' : 'OFF'}
            </Label>
          </div>
          <Button onClick={fetchData} variant="outline" size="icon">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 日付と最終更新時刻 */}
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-muted-foreground">対象日</span>
            <p className="text-lg font-semibold">
              {format(new Date(), 'yyyy年MM月dd日', { locale: ja })}
              （{format(new Date(), 'E', { locale: ja })}）
            </p>
          </div>
          {lastUpdated && (
            <div className="text-right">
              <span className="text-sm text-muted-foreground">最終更新</span>
              <p className="text-lg font-semibold">{format(lastUpdated, 'HH:mm:ss')}</p>
            </div>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4">
          <p className="font-semibold">エラーが発生しました</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* サマリーカード */}
      <ProductivitySummaryGrid summary={summary} />

      {/* 店舗別状況カード */}
      <div>
        <h2 className="text-2xl font-bold mb-4">店舗別リアルタイム状況</h2>
        <StoreStatusGrid stores={stores} loading={loading} />
      </div>

      {/* 従業員別生産性テーブル */}
      <EmployeeProductivityTable data={stores} loading={loading} />
    </div>
  );
}
