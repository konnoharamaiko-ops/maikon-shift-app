import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * カスタムツールチップ
 */
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {entry.value.toLocaleString()}
            {entry.dataKey === 'sales' && '円'}
            {entry.dataKey === 'workers' && '人'}
            {entry.dataKey === 'productivity' && '円/時間'}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/**
 * 時系列折れ線グラフ
 * @param {Object} props
 * @param {Array} props.data - グラフデータ
 */
export const ProductivityLineChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>時系列推移</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">データがありません</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // データを整形
  const chartData = data.map((item) => ({
    date: `${item.wk_date} (${item.dayweek})`,
    sales: parseFloat(item.kingaku) || 0,
    workers: item.wk_cnt || 0,
    productivity: parseFloat(item.spd) || 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>時系列推移</CardTitle>
        <p className="text-sm text-muted-foreground">
          売上・勤務人数・人時生産性の推移
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sales"
              stroke="#8884d8"
              name="売上"
              strokeWidth={2}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="workers"
              stroke="#82ca9d"
              name="勤務人数"
              strokeWidth={2}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="productivity"
              stroke="#ffc658"
              name="人時生産性"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

/**
 * 棒グラフ（店舗別比較）
 * @param {Object} props
 * @param {Array} props.data - グラフデータ
 */
export const ProductivityBarChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>店舗別比較</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">データがありません</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 店舗別に集計
  const storeMap = new Map();
  
  data.forEach((item) => {
    const storeName = item.tenpo_name;
    if (!storeMap.has(storeName)) {
      storeMap.set(storeName, {
        name: storeName,
        sales: 0,
        workers: 0,
        hours: 0,
        count: 0,
      });
    }
    
    const store = storeMap.get(storeName);
    store.sales += parseFloat(item.kingaku) || 0;
    store.workers += item.wk_cnt || 0;
    store.hours += parseFloat(item.wk_tm) || 0;
    store.count += 1;
  });

  const chartData = Array.from(storeMap.values()).map((store) => ({
    name: store.name,
    sales: Math.round(store.sales),
    avgWorkers: Math.round(store.workers / store.count),
    productivity: store.hours > 0 ? Math.round(store.sales / store.hours) : 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>店舗別比較</CardTitle>
        <p className="text-sm text-muted-foreground">
          各店舗の売上と人時生産性の比較
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar yAxisId="left" dataKey="sales" fill="#8884d8" name="売上" />
            <Bar
              yAxisId="left"
              dataKey="productivity"
              fill="#ffc658"
              name="人時生産性"
            />
            <Bar yAxisId="right" dataKey="avgWorkers" fill="#82ca9d" name="平均勤務人数" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
