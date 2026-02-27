import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { RefreshCw, Calendar } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { useHRProductivity, useProductivitySummary, useProductivityAlerts } from '../hooks/useHRProductivity';
import { ProductivitySummaryGrid } from '../components/productivity/ProductivitySummaryCard';
import { ProductivityTimeline } from '../components/productivity/ProductivityTimeline';
import { ProductivityAlert, ProductivityAlertBadge } from '../components/productivity/ProductivityAlert';
import { ProductivityLineChart, ProductivityBarChart } from '../components/productivity/ProductivityChart';
import { StoreFilter, extractStoresFromData } from '../components/productivity/StoreFilter';

/**
 * リアルタイム人時生産性ダッシュボード
 */
export default function ProductivityDashboard() {
  // 日付範囲の初期値（過去7日間）
  const today = new Date();
  const [searchFrom, setSearchFrom] = useState(format(subDays(today, 7), 'yyyy-MM-dd'));
  const [searchTo, setSearchTo] = useState(format(today, 'yyyy-MM-dd'));
  const [storeCode, setStoreCode] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // データ取得
  const { data, loading, error, lastUpdated, refetch } = useHRProductivity(
    searchFrom,
    searchTo,
    storeCode,
    autoRefresh,
    60000 // 1分ごと
  );

  // サマリー計算
  const summary = useProductivitySummary(data);

  // アラート判定
  const alerts = useProductivityAlerts(data, 2000);

  // 店舗リスト抽出
  const [stores, setStores] = useState([]);
  
  useEffect(() => {
    if (data && data.length > 0) {
      const extractedStores = extractStoresFromData(data);
      setStores(extractedStores);
    }
  }, [data]);

  // 手動更新
  const handleRefresh = () => {
    refetch();
  };

  // 日付範囲の検証
  const validateDateRange = () => {
    const from = new Date(searchFrom);
    const to = new Date(searchTo);
    const diffDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 62) {
      alert('日付範囲は最大62日までです');
      return false;
    }
    
    if (from > to) {
      alert('開始日は終了日より前である必要があります');
      return false;
    }
    
    return true;
  };

  // 検索実行
  const handleSearch = () => {
    if (validateDateRange()) {
      refetch();
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">リアルタイム人時生産性ダッシュボード</h1>
          <p className="text-muted-foreground mt-1">
            各店舗・各従業員の勤務状況と人時生産性をリアルタイムで可視化
          </p>
        </div>
        <ProductivityAlertBadge alerts={alerts} />
      </div>

      {/* フィルター */}
      <div className="bg-card rounded-lg border p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 items-end">
          {/* 店舗選択 */}
          <StoreFilter
            value={storeCode}
            onChange={setStoreCode}
            stores={stores}
          />

          {/* 開始日 */}
          <div className="space-y-2">
            <Label htmlFor="search-from">
              <Calendar className="inline h-4 w-4 mr-1" />
              開始日
            </Label>
            <Input
              id="search-from"
              type="date"
              value={searchFrom}
              onChange={(e) => setSearchFrom(e.target.value)}
            />
          </div>

          {/* 終了日 */}
          <div className="space-y-2">
            <Label htmlFor="search-to">
              <Calendar className="inline h-4 w-4 mr-1" />
              終了日
            </Label>
            <Input
              id="search-to"
              type="date"
              value={searchTo}
              onChange={(e) => setSearchTo(e.target.value)}
            />
          </div>

          {/* 自動更新 */}
          <div className="space-y-2">
            <Label htmlFor="auto-refresh">リアルタイム更新</Label>
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <span className="text-sm text-muted-foreground">
                {autoRefresh ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          {/* 検索・更新ボタン */}
          <div className="space-y-2">
            <Label>&nbsp;</Label>
            <div className="flex gap-2">
              <Button onClick={handleSearch} className="flex-1">
                検索
              </Button>
              <Button onClick={handleRefresh} variant="outline" size="icon">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* 最終更新時刻 */}
        {lastUpdated && (
          <div className="mt-3 text-xs text-muted-foreground">
            最終更新: {format(lastUpdated, 'yyyy-MM-dd HH:mm:ss')}
          </div>
        )}
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

      {/* アラート */}
      <ProductivityAlert alerts={alerts} maxDisplay={3} />

      {/* タイムライン */}
      <ProductivityTimeline data={data} loading={loading} />

      {/* グラフ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProductivityLineChart data={data} />
        <ProductivityBarChart data={data} />
      </div>
    </div>
  );
}
