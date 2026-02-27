import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, Users, Clock, DollarSign } from 'lucide-react';

/**
 * サマリーカードコンポーネント
 * @param {Object} props
 * @param {string} props.title - カードタイトル
 * @param {string|number} props.value - 表示値
 * @param {string} props.unit - 単位
 * @param {string} props.trend - トレンド ('up' | 'down' | 'neutral')
 * @param {string} props.icon - アイコンタイプ
 * @param {string} props.description - 説明文
 */
export const ProductivitySummaryCard = ({
  title,
  value,
  unit = '',
  trend = 'neutral',
  icon = 'dollar',
  description,
}) => {
  const icons = {
    dollar: DollarSign,
    users: Users,
    clock: Clock,
    trending: trend === 'up' ? TrendingUp : TrendingDown,
  };

  const Icon = icons[icon] || DollarSign;

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-600',
  };

  const trendColor = trendColors[trend] || trendColors.neutral;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${trendColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-sm font-normal ml-1">{unit}</span>}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * サマリーカードグリッド
 * @param {Object} props
 * @param {Object} props.summary - サマリーデータ
 */
export const ProductivitySummaryGrid = ({ summary }) => {
  if (!summary) {
    return null;
  }

  const {
    totalSales,
    totalWorkHours,
    totalWorkers,
    avgProductivity,
  } = summary;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <ProductivitySummaryCard
        title="総売上"
        value={Math.round(totalSales)}
        unit="円"
        icon="dollar"
        description="期間内の合計売上"
      />
      <ProductivitySummaryCard
        title="総勤務時間"
        value={totalWorkHours.toFixed(1)}
        unit="時間"
        icon="clock"
        description="期間内の合計勤務時間"
      />
      <ProductivitySummaryCard
        title="平均人時生産性"
        value={Math.round(avgProductivity)}
        unit="円/時間"
        icon="trending"
        trend={avgProductivity > 2500 ? 'up' : avgProductivity < 2000 ? 'down' : 'neutral'}
        description="売上 ÷ 勤務時間"
      />
      <ProductivitySummaryCard
        title="総勤務人数"
        value={totalWorkers}
        unit="人"
        icon="users"
        description="期間内の延べ勤務人数"
      />
    </div>
  );
};
