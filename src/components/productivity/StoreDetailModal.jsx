import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Users, Clock, TrendingUp, TrendingDown, Activity, DollarSign, ShoppingCart } from 'lucide-react';

/**
 * 勤務状況バッジ
 */
function StatusBadge({ status }) {
  const statusConfig = {
    '勤務中': { color: 'bg-green-500', label: '勤務中' },
    '退勤済み': { color: 'bg-gray-400', label: '退勤済み' },
    '未出勤': { color: 'bg-yellow-400', label: '未出勤' },
    '休憩中': { color: 'bg-blue-400', label: '休憩中' },
  };
  const config = statusConfig[status] || { color: 'bg-gray-300', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * 店舗詳細モーダル
 */
export function StoreDetailModal({ store, open, onClose }) {
  const [activeTab, setActiveTab] = useState('employees');

  if (!store) return null;

  const {
    store_name,
    total_sales = 0,
    total_employees = 0,
    working_employees = 0,
    total_hours = 0,
    productivity = 0,
    customers = 0,
    update_time = '',
    employees = [],
  } = store;

  // 生産性レベル
  const getLevel = (prod) => {
    if (prod >= 3000) return { label: '優秀', color: 'text-green-600', bg: 'bg-green-100' };
    if (prod >= 2000) return { label: '良好', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (prod >= 1000) return { label: '注意', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: '要改善', color: 'text-red-600', bg: 'bg-red-100' };
  };
  const level = getLevel(productivity);

  // 従業員を状態でソート（勤務中 > 退勤済み > 未出勤）
  const sortedEmployees = [...employees].sort((a, b) => {
    const order = { '勤務中': 0, '休憩中': 1, '退勤済み': 2, '未出勤': 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const workingCount = employees.filter(e => e.status === '勤務中' || e.status === '休憩中').length;
  const finishedCount = employees.filter(e => e.status === '退勤済み').length;
  const absentCount = employees.filter(e => e.status === '未出勤').length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            {store_name} - 詳細状況
          </DialogTitle>
        </DialogHeader>

        {/* KPIサマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          <div className="bg-card border rounded-lg p-3 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">本日売上</p>
            <p className="text-lg font-bold">¥{total_sales.toLocaleString()}</p>
          </div>
          <div className="bg-card border rounded-lg p-3 text-center">
            <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">稼働人数</p>
            <p className="text-lg font-bold">
              <span className="text-green-600">{workingCount}</span>
              <span className="text-muted-foreground text-sm">/{total_employees}人</span>
            </p>
          </div>
          <div className="bg-card border rounded-lg p-3 text-center">
            <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">総労働時間</p>
            <p className="text-lg font-bold">{total_hours.toFixed(1)}h</p>
          </div>
          <div className={`border rounded-lg p-3 text-center ${level.bg}`}>
            <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${level.color}`} />
            <p className="text-xs text-muted-foreground">人時生産性</p>
            <p className={`text-lg font-bold ${level.color}`}>
              ¥{productivity.toLocaleString()}
              <span className="text-xs font-normal">/h</span>
            </p>
          </div>
        </div>

        {/* 勤務状況サマリーバー */}
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
            勤務中: <strong>{workingCount}人</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"></span>
            退勤済み: <strong>{finishedCount}人</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block"></span>
            未出勤: <strong>{absentCount}人</strong>
          </span>
          {update_time && (
            <span className="ml-auto text-muted-foreground text-xs">
              売上更新: {update_time}
            </span>
          )}
        </div>

        {/* タブ */}
        <div className="border-b flex gap-0">
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'employees'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            従業員一覧 ({employees.length}人)
          </button>
        </div>

        {/* 従業員一覧 */}
        {activeTab === 'employees' && (
          <div className="space-y-2">
            {sortedEmployees.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                本日のシフトデータがありません
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">氏名</th>
                      <th className="text-center p-2 font-medium">状態</th>
                      <th className="text-center p-2 font-medium">シフト</th>
                      <th className="text-center p-2 font-medium">出勤</th>
                      <th className="text-center p-2 font-medium">退勤</th>
                      <th className="text-right p-2 font-medium">労働時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEmployees.map((emp, i) => (
                      <tr
                        key={i}
                        className={`border-b transition-colors hover:bg-muted/30 ${
                          emp.status === '勤務中' ? 'bg-green-50 dark:bg-green-950/20' :
                          emp.status === '未出勤' ? 'bg-yellow-50/50 dark:bg-yellow-950/10' : ''
                        }`}
                      >
                        <td className="p-2 font-medium">{emp.name}</td>
                        <td className="p-2 text-center">
                          <StatusBadge status={emp.status} />
                        </td>
                        <td className="p-2 text-center text-muted-foreground">{emp.shift || '-'}</td>
                        <td className="p-2 text-center">{emp.start_time || '-'}</td>
                        <td className="p-2 text-center">{emp.end_time || '-'}</td>
                        <td className="p-2 text-right font-medium">
                          {emp.work_hours > 0 ? `${emp.work_hours.toFixed(1)}h` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold">
                      <td className="p-2">合計</td>
                      <td className="p-2 text-center">-</td>
                      <td className="p-2 text-center">-</td>
                      <td className="p-2 text-center">-</td>
                      <td className="p-2 text-center">-</td>
                      <td className="p-2 text-right">{total_hours.toFixed(1)}h</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
