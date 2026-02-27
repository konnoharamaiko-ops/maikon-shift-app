import { TrendingUp, TrendingDown, Users, DollarSign, Activity } from 'lucide-react';

/**
 * 店舗状況カード - リアルタイムで各店舗の状況を視覚的に表示
 */
export function StoreStatusCard({ store }) {
  const {
    store_name,
    total_sales = 0,
    total_employees = 0,
    total_hours = 0,
    working_employees = 0,
    productivity = 0,
  } = store;

  // 生産性レベルの判定（円/時間）
  const getProductivityLevel = (prod) => {
    if (prod >= 3000) return 'excellent'; // 優秀
    if (prod >= 2000) return 'good';      // 良好
    if (prod >= 1000) return 'warning';   // 注意
    return 'danger';                       // 警告
  };

  const level = getProductivityLevel(productivity);

  // レベルに応じた色とスタイル
  const levelStyles = {
    excellent: {
      bg: 'bg-green-50 dark:bg-green-950',
      border: 'border-green-500',
      text: 'text-green-700 dark:text-green-300',
      badge: 'bg-green-500',
      icon: TrendingUp,
    },
    good: {
      bg: 'bg-blue-50 dark:bg-blue-950',
      border: 'border-blue-500',
      text: 'text-blue-700 dark:text-blue-300',
      badge: 'bg-blue-500',
      icon: Activity,
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-950',
      border: 'border-yellow-500',
      text: 'text-yellow-700 dark:text-yellow-300',
      badge: 'bg-yellow-500',
      icon: TrendingDown,
    },
    danger: {
      bg: 'bg-red-50 dark:bg-red-950',
      border: 'border-red-500',
      text: 'text-red-700 dark:text-red-300',
      badge: 'bg-red-500',
      icon: TrendingDown,
    },
  };

  const style = levelStyles[level];
  const Icon = style.icon;

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} p-6 transition-all hover:shadow-lg`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{store_name}</h3>
        <div className={`${style.badge} rounded-full p-2`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>

      {/* メトリクス */}
      <div className="space-y-4">
        {/* 売上 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">本日売上</span>
          </div>
          <div className="text-2xl font-bold">
            ¥{total_sales.toLocaleString()}
          </div>
        </div>

        {/* 勤務人数 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">勤務中/総人数</span>
          </div>
          <div className="text-xl font-semibold">
            <span className={style.text}>{working_employees}</span>
            <span className="text-muted-foreground"> / {total_employees}人</span>
          </div>
        </div>

        {/* 労働時間 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">総労働時間</span>
          </div>
          <div className="text-xl font-semibold">
            {total_hours.toFixed(1)}時間
          </div>
        </div>

        {/* 人時生産性 */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">人時生産性</span>
            <div className={`text-3xl font-bold ${style.text}`}>
              ¥{productivity.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground">/時</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 店舗状況カードグリッド
 */
export function StoreStatusGrid({ stores, loading }) {
  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(14)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 animate-pulse">
            <div className="h-6 bg-muted rounded mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stores || stores.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        データがありません
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {stores.map((store) => (
        <StoreStatusCard key={store.store_code} store={store} />
      ))}
    </div>
  );
}
