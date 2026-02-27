import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { RefreshCw, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { useHRProductivity, useProductivitySummary } from '../hooks/useHRProductivity';
import { ProductivitySummaryGrid } from '../components/productivity/ProductivitySummaryCard';
import { StoreStatusGrid } from '../components/productivity/StoreStatusCard';
import { EmployeeProductivityTable } from '../components/productivity/EmployeeProductivityTable';

/**
 * リアルタイム人時生産性ダッシュボード
 * 本日の各店舗・各従業員の現在状況を視覚的に表示
 */
export default function ProductivityDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true); // デフォルトで自動更新ON

  // 本日のデータのみ取得
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const { data, loading, error, lastUpdated, refetch } = useHRProductivity(
    today,
    today,
    'all',
    autoRefresh,
    30000 // 30秒ごとに自動更新
  );

  // サマリー計算
  const summary = useProductivitySummary(data);

  // 手動更新
  const handleRefresh = () => {
    refetch();
  };

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
          {/* 自動更新トグル */}
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

          {/* 手動更新ボタン */}
          <Button onClick={handleRefresh} variant="outline" size="icon">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 日付と最終更新時刻 */}
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm text-muted-foreground">対象日</span>
              <p className="text-lg font-semibold">{format(new Date(), 'yyyy年MM月dd日（E）', { locale: ja })}</p>
            </div>
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
        <StoreStatusGrid stores={data} loading={loading} />
      </div>

      {/* 従業員別生産性テーブル */}
      <EmployeeProductivityTable data={data} loading={loading} />
    </div>
  );
}
