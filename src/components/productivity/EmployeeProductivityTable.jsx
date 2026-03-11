import { useState, useMemo } from 'react';
import { ArrowUpDown, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

/**
 * 従業員別生産性テーブル - ジョブカン登録従業員の個別生産性を表示
 */
export function EmployeeProductivityTable({ data, loading }) {
  const [sortBy, setSortBy] = useState('productivity'); // productivity, name, store
  const [sortOrder, setSortOrder] = useState('desc'); // asc, desc

  // データを従業員単位に変換
  const employees = useMemo(() => {
    if (!data || data.length === 0) return [];

    const employeeList = [];

    data.forEach((store) => {
      if (!store.employees || store.employees.length === 0) return;

      store.employees.forEach((emp) => {
        // 従業員の担当時間帯の売上を推定（簡易計算）
        const empSales = store.total_sales * (emp.work_hours / (store.total_hours || 1));
        const empProductivity = emp.work_hours > 0 ? empSales / emp.work_hours : 0;

        employeeList.push({
          employee_name: emp.employee_name,
          store_name: store.store_name,
          store_code: store.store_code,
          status: emp.status,
          clock_in: emp.clock_in,
          clock_out: emp.clock_out,
          work_hours: emp.work_hours,
          estimated_sales: empSales,
          productivity: empProductivity,
        });
      });
    });

    return employeeList;
  }, [data]);

  // ソート処理
  const sortedEmployees = useMemo(() => {
    const sorted = [...employees];

    sorted.sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'productivity':
          aVal = a.productivity;
          bVal = b.productivity;
          break;
        case 'name':
          aVal = a.employee_name;
          bVal = b.employee_name;
          break;
        case 'store':
          aVal = a.store_name;
          bVal = b.store_name;
          break;
        case 'hours':
          aVal = a.work_hours;
          bVal = b.work_hours;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  }, [employees, sortBy, sortOrder]);

  // ソート切り替え
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // 生産性レベルの判定
  const getProductivityLevel = (prod) => {
    if (prod >= 3000) return 'excellent';
    if (prod >= 2000) return 'good';
    if (prod >= 1000) return 'warning';
    return 'danger';
  };

  // レベルに応じたスタイル
  const getLevelStyle = (level) => {
    const styles = {
      excellent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      good: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return styles[level] || '';
  };

  // ステータスアイコン
  const getStatusIcon = (status) => {
    if (status === '勤務中') {
      return <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>;
    }
    return <div className="h-2 w-2 rounded-full bg-gray-400"></div>;
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="p-6">
          <div className="h-6 bg-muted rounded mb-4 w-48"></div>
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        従業員データがありません
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">従業員別生産性</h2>
          <div className="text-sm text-muted-foreground">
            総従業員数: {employees.length}名
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    従業員名
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                </th>
                <th className="text-left p-3">
                  <button
                    onClick={() => handleSort('store')}
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    所属先
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                </th>
                <th className="text-center p-3">状態</th>
                <th className="text-center p-3">出勤</th>
                <th className="text-center p-3">退勤</th>
                <th className="text-right p-3">
                  <button
                    onClick={() => handleSort('hours')}
                    className="flex items-center gap-1 hover:text-primary ml-auto"
                  >
                    労働時間
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                </th>
                <th className="text-right p-3">推定売上</th>
                <th className="text-right p-3">
                  <button
                    onClick={() => handleSort('productivity')}
                    className="flex items-center gap-1 hover:text-primary ml-auto"
                  >
                    生産性
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp, index) => {
                const level = getProductivityLevel(emp.productivity);
                const levelStyle = getLevelStyle(level);

                return (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="p-3 font-medium">{emp.employee_name}</td>
                    <td className="p-3 text-sm text-muted-foreground">{emp.store_name}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        {getStatusIcon(emp.status)}
                        <span className="text-xs">{emp.status}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-sm">{emp.clock_in}</td>
                    <td className="p-3 text-center text-sm">{emp.clock_out}</td>
                    <td className="p-3 text-right font-medium">
                      {emp.work_hours.toFixed(1)}h
                    </td>
                    <td className="p-3 text-right">
                      ¥{Math.round(emp.estimated_sales).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-semibold ${levelStyle}`}>
                        {level === 'excellent' && <TrendingUp className="h-3 w-3" />}
                        {level === 'danger' && <AlertTriangle className="h-3 w-3" />}
                        {level === 'warning' && <TrendingDown className="h-3 w-3" />}
                        ¥{Math.round(emp.productivity).toLocaleString()}/h
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
