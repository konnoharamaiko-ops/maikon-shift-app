import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { RefreshCw, Activity, Wifi, WifiOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { ProductivitySummaryGrid } from '../components/productivity/ProductivitySummaryCard';
import { StoreStatusGrid } from '../components/productivity/StoreStatusCard';

/**
 * サマリーを計算
 */
function calcSummary(stores) {
  if (!stores || stores.length === 0) {
    return { totalSales: 0, totalWorkHours: 0, totalWorkers: 0, avgProductivity: 0 };
  }
  const totalSales = stores.reduce((s, st) => s + (st.total_sales || 0), 0);
  const totalWorkHours = stores.reduce((s, st) => s + (st.total_hours || 0), 0);
  const totalWorkers = stores.reduce((s, st) => s + (st.attended_employees || 0), 0);  // 本日出勤した延べ人数
  const avgProductivity = totalWorkHours > 0 ? Math.round(totalSales / totalWorkHours) : 0;
  return { totalSales, totalWorkHours, totalWorkers, avgProductivity };
}

/**
 * APIレスポンスをStoreStatusCardが期待する形式に変換
 */
function transformStoreData(apiData) {
  if (!apiData || apiData.length === 0) return [];

  return apiData.map(item => ({
    store_code: item.code || item.store_code || '',
    store_name: item.tenpo_name || item.store_name || '',
    total_sales: parseInt(item.kingaku || item.total_sales || 0),
    total_hours: parseFloat(item.wk_tm || item.total_hours || 0),
    total_employees: parseInt(item.total_employees || 0),
    attended_employees: parseInt(item.wk_cnt || item.attended_employees || 0),  // 本日出勤した延べ人数
    working_employees: parseInt(item.working_now || item.working_employees || 0),  // 現在稼働中
    productivity: parseInt(item.spd || item.productivity || 0),
    customers: parseInt(item.customers || 0),
    update_time: item.update_time || '',
    employees: item.employees || [],
  }));
}

/**
 * リアルタイム人時生産性ダッシュボード
 */
export default function ProductivityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dataSource, setDataSource] = useState({ tempovisor: null, jobcan: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // リアルタイムAPIを呼び出し
      const response = await fetch('/api/productivity/realtime', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        // リアルタイムAPIが失敗した場合は従来のAPIにフォールバック
        const today = format(new Date(), 'yyyy-MM-dd');
        const fallbackRes = await fetch('/api/productivity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date_from: today, date_to: today }),
        });
        if (!fallbackRes.ok) {
          throw new Error(`APIエラー: ${response.status}`);
        }
        const fallbackData = await fallbackRes.json();
        const transformed = transformStoreData(fallbackData.data || []);
        setStores(transformed);
        setDataSource({ tempovisor: 'fallback', jobcan: 'fallback' });
      } else {
        const result = await response.json();
        const transformed = transformStoreData(result.data || []);
        setStores(transformed);
        setDataSource(result.sources || { tempovisor: 'live', jobcan: 'live' });
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Data fetch error:', err);
      setError(err.message || 'データの取得に失敗しました');
      // エラー時は従来のAPIにフォールバック
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const fallbackRes = await fetch('/api/productivity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date_from: today, date_to: today }),
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const transformed = transformStoreData(fallbackData.data || []);
          setStores(transformed);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自動更新（30秒ごと）
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const summary = calcSummary(stores);

  const isLive = dataSource.tempovisor === 'live' || dataSource.jobcan === 'live';

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary" />
            リアルタイム人時生産性
          </h1>
          <p className="text-muted-foreground mt-1">
            各店舗の売上・稼働状況をリアルタイムで監視。カードをクリックすると詳細が表示されます。
          </p>
        </div>

        {/* コントロール */}
        <div className="flex items-center gap-4">
          {/* データソース表示 */}
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isLive ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-yellow-500" />
              )}
              <span>{isLive ? 'ライブデータ' : 'サンプルデータ'}</span>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="cursor-pointer text-sm">
              自動更新 {autoRefresh ? 'ON' : 'OFF'}
            </Label>
          </div>
          <Button onClick={fetchData} variant="outline" size="icon" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 日付と最終更新時刻 */}
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-sm text-muted-foreground">対象日</span>
            <p className="text-lg font-semibold">
              {format(new Date(), 'yyyy年MM月dd日', { locale: ja })}
              （{format(new Date(), 'E', { locale: ja })}曜日）
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
          <p className="font-semibold">データ取得エラー</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* サマリーカード */}
      <ProductivitySummaryGrid summary={summary} />

      {/* 店舗別状況カード */}
      <div>
        <h2 className="text-2xl font-bold mb-4">
          店舗別リアルタイム状況
          <span className="text-sm font-normal text-muted-foreground ml-2">
            （各カードをクリックで従業員詳細を表示）
          </span>
        </h2>
        <StoreStatusGrid stores={stores} loading={loading} />
      </div>
    </div>
  );
}
