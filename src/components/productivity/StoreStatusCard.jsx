import { useState } from 'react';
import { TrendingUp, TrendingDown, Users, DollarSign, Activity, Clock, ChevronRight } from 'lucide-react';
import { StoreDetailModal } from './StoreDetailModal';

/**
 * 店舗状況カード - リアルタイムで各店舗の状況を視覚的に表示
 * クリックで詳細モーダルを開く
 */
export function StoreStatusCard({ store }) {
  const [modalOpen, setModalOpen] = useState(false);

  const {
    store_name,
    total_sales = 0,
    total_employees = 0,
    attended_employees = 0,
    total_hours = 0,
    working_employees = 0,
    productivity = 0,
    customers = 0,
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
      label: '優秀',
      icon: TrendingUp,
    },
    good: {
      bg: 'bg-blue-50 dark:bg-blue-950',
      border: 'border-blue-500',
      text: 'text-blue-700 dark:text-blue-300',
      badge: 'bg-blue-500',
      label: '良好',
      icon: Activity,
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-950',
      border: 'border-yellow-500',
      text: 'text-yellow-700 dark:text-yellow-300',
      badge: 'bg-yellow-500',
      label: '注意',
      icon: TrendingDown,
    },
    danger: {
      bg: 'bg-red-50 dark:bg-red-950',
      border: 'border-red-500',
      text: 'text-red-700 dark:text-red-300',
      badge: 'bg-red-500',
      label: '要改善',
      icon: TrendingDown,
    },
  };

  const style = levelStyles[level];
  const Icon = style.icon;

  return (
    <>
      <div
        className={`rounded-xl border-2 ${style.border} ${style.bg} p-5 transition-all hover:shadow-lg cursor-pointer group relative`}
        onClick={() => setModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setModalOpen(true)}
        aria-label={`${store_name}の詳細を表示`}
      >
        {/* クリックヒント */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold leading-tight">{store_name}</h3>
          <div className={`${style.badge} rounded-full p-1.5 flex-shrink-0`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* 生産性レベルバッジ */}
        <div className="mb-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.badge} text-white`}>
            {style.label}
          </span>
        </div>

        {/* メトリクス */}
        <div className="space-y-3">
          {/* 売上 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">本日売上</span>
            </div>
            <div className="text-xl font-bold">
              ¥{total_sales.toLocaleString()}
            </div>
          </div>

          {/* 勤務人数 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">稼働中/本日出勤</span>
            </div>
            <div className="text-base font-semibold">
              <span className="text-green-600 dark:text-green-400">{working_employees}</span>
              <span className="text-muted-foreground"> / {attended_employees}人</span>
            </div>
          </div>

          {/* 労働時間 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">総労働時間</span>
            </div>
            <div className="text-base font-semibold">
              {total_hours.toFixed(1)}時間
            </div>
          </div>

          {/* 人時生産性 */}
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">人時生産性</span>
              <div className={`text-2xl font-bold ${style.text}`}>
                ¥{productivity.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground">/時</span>
              </div>
            </div>
          </div>
        </div>

        {/* 詳細を見るヒント */}
        <div className="mt-3 pt-2 border-t border-dashed opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-center text-muted-foreground">クリックして詳細を表示</p>
        </div>
      </div>

      {/* 詳細モーダル */}
      <StoreDetailModal
        store={store}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

/**
 * 店舗状況カードグリッド
 */
export function StoreStatusGrid({ stores, loading }) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {[...Array(13)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 animate-pulse">
            <div className="h-5 bg-muted rounded mb-3 w-2/3"></div>
            <div className="h-4 bg-muted rounded mb-4 w-1/4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-6 bg-muted rounded mt-3"></div>
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {stores.map((store) => (
        <StoreStatusCard key={store.store_code || store.store_name} store={store} />
      ))}
    </div>
  );
}
