import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Store as StoreIcon, Settings, Building2, Plus, Edit2, Trash2, MapPin,
  Calendar, Save, Copy, ChevronLeft, DollarSign, BarChart3, Clock,
  ShoppingCart, Factory, Users, Layers, X, RefreshCw, ChevronRight, TrendingUp, List
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import DetailedStoreSettings from '@/components/store-settings/DetailedStoreSettings';
import { fetchAll, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { invalidateStoreQueries } from '@/lib/invalidateHelpers';

// ========== 定数 ==========
const JOBCAN_STORE_LIST = [
  { id: 'store-10110', store_code: '10110', store_name: '田辺店' },
  { id: 'store-10400', store_code: '10400', store_name: '大正店' },
  { id: 'store-10500', store_code: '10500', store_name: '天下茶屋店' },
  { id: 'store-10600', store_code: '10600', store_name: '天王寺店' },
  { id: 'store-10800', store_code: '10800', store_name: 'アベノ店' },
  { id: 'store-10900', store_code: '10900', store_name: '心斎橋店' },
  { id: 'store-11010', store_code: '11010', store_name: 'かがや店' },
  { id: 'store-11200', store_code: '11200', store_name: '駅丸' },
  { id: 'store-12000', store_code: '12000', store_name: '北摂店' },
  { id: 'store-12200', store_code: '12200', store_name: '堺東店' },
  { id: 'store-12300', store_code: '12300', store_name: 'イオン松原店' },
  { id: 'store-12400', store_code: '12400', store_name: 'イオン守口店' },
  { id: 'store-20000', store_code: '20000', store_name: '美和堂福島店' },
];

// ========== 日別売上ダイアログ ==========
function DailySalesDialog({ open, onClose, store, year, month }) {
  const [loading, setLoading] = useState(false);
  const [dailyData, setDailyData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !store || !year || !month) return;
    setLoading(true);
    setError(null);
    setDailyData([]);
    const storeName = encodeURIComponent(store.store_name);
    fetch(`/api/productivity/sales?mode=daily&year=${year}&month=${month}&store_name=${storeName}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.daily_list && data.daily_list.length > 0) {
          // daily_listの各エントリに day（日部分）と day_of_week（0-6）を追加
          const enriched = data.daily_list.map(d => {
            const dateObj = new Date(d.date.replace(/\//g, '-'));
            return {
              ...d,
              day: dateObj.getDate(),
              day_of_week: dateObj.getDay(), // 0=日, 1=月, ..., 6=土
              customers: d.customers || 0,
              gross_profit_rate: d.gross_profit_rate || null,
            };
          });
          setDailyData(enriched);
        } else {
          setError(data.message || 'データが取得できませんでした');
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, store, year, month]);

  const maxSales = dailyData.length > 0 ? Math.max(...dailyData.map(d => d.sales)) : 1;
  const totalSales = dailyData.reduce((sum, d) => sum + d.sales, 0);
  const avgSales = dailyData.length > 0 ? Math.round(totalSales / dailyData.length) : 0;

  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
  const DAY_COLORS = {
    '土': 'bg-blue-400',
    '日': 'bg-red-400',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-500" />
            {store?.store_name} — {year}年{month}月 日別売上
          </DialogTitle>
          <DialogDescription>
            テンポバイザーから取得した日別売上データ
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mb-3" />
            <p className="text-sm text-slate-500">テンポバイザーからデータ取得中...</p>
          </div>
        )}

        {error && !loading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-sm text-red-600 font-semibold">取得エラー</p>
            <p className="text-xs text-red-500 mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && dailyData.length > 0 && (
          <div className="space-y-4">
            {/* サマリー */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-orange-50 rounded-xl text-center">
                <p className="text-xs text-orange-600 font-semibold">月間合計</p>
                <p className="text-base font-black text-orange-700">¥{totalSales.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl text-center">
                <p className="text-xs text-blue-600 font-semibold">日平均</p>
                <p className="text-base font-black text-blue-700">¥{avgSales.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl text-center">
                <p className="text-xs text-green-600 font-semibold">営業日数</p>
                <p className="text-base font-black text-green-700">{dailyData.filter(d => d.sales > 0).length}日</p>
              </div>
            </div>

            {/* 棒グラフ */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-600 mb-3">日別売上グラフ</p>
              <div className="flex items-end gap-0.5 h-32 overflow-x-auto">
                {dailyData.map((d, i) => {
                  const heightPct = maxSales > 0 ? (d.sales / maxSales) * 100 : 0;
                  const dayLabel = DAY_LABELS[d.day_of_week] || '';
                  const isSat = dayLabel === '土';
                  const isSun = dayLabel === '日';
                  return (
                    <div key={i} className="flex flex-col items-center flex-1 min-w-[16px]" title={`${d.date}: ¥${d.sales.toLocaleString()}`}>
                      <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                        <div
                          className={`w-full rounded-t-sm transition-all ${
                            isSun ? 'bg-red-400' : isSat ? 'bg-blue-400' : 'bg-orange-400'
                          }`}
                          style={{ height: `${Math.max(heightPct, d.sales > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <p className={`text-[8px] mt-0.5 font-semibold ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-slate-500'}`}>
                        {d.day}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 日別一覧テーブル */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                <p className="text-xs font-bold text-slate-600">日別売上一覧</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-500 font-semibold">日付</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-semibold">売上</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-semibold">客数</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-semibold">粗利率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyData.map((d, i) => {
                      const dayLabel = DAY_LABELS[d.day_of_week] || '';
                      const isSun = dayLabel === '日';
                      const isSat = dayLabel === '土';
                      return (
                        <tr key={i} className={`border-t border-slate-100 ${isSun ? 'bg-red-50' : isSat ? 'bg-blue-50' : ''}`}>
                          <td className={`px-3 py-1.5 font-medium ${isSun ? 'text-red-600' : isSat ? 'text-blue-600' : 'text-slate-700'}`}>
                            {d.date}（{dayLabel}）
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-slate-800">
                            {d.sales > 0 ? `¥${d.sales.toLocaleString()}` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600">
                            {d.customers > 0 ? `${d.customers.toLocaleString()}人` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600">
                            {d.gross_profit_rate ? `${d.gross_profit_rate}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && dailyData.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">データがありません</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ========== 売上入力コンポーネント ==========
function StoreSalesInput({ store }) {
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [fetchingMonth, setFetchingMonth] = useState(null);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [dailyDialogMonth, setDailyDialogMonth] = useState(null); // 日別ダイアログ表示中の月

  const { data: salesData = [] } = useQuery({
    queryKey: ['storeSales', store.id],
    queryFn: async () => {
      const { data } = await supabase.from('StoreSales').select('*').eq('store_id', store.id);
      return data || [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ storeId, yearMonth, amount, notes }) => {
      const existing = salesData.find(s => s.year_month === yearMonth);
      if (existing) {
        return updateRecord('StoreSales', existing.id, {
          sales_amount: amount,
          notes: notes || '',
          updated_at: new Date().toISOString()
        });
      } else {
        return insertRecord('StoreSales', {
          store_id: storeId,
          year_month: yearMonth,
          sales_amount: amount,
          notes: notes || ''
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeSales', store.id] });
      toast.success('売上を保存しました');
    },
    onError: () => {
      toast.error('保存に失敗しました');
    }
  });

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const getSalesForMonth = (month) => {
    const ym = `${selectedYear}-${String(month).padStart(2, '0')}`;
    return salesData.find(s => s.year_month === ym);
  };

  const handleSave = (month, amount, notes) => {
    const ym = `${selectedYear}-${String(month).padStart(2, '0')}`;
    upsertMutation.mutate({ storeId: store.id, yearMonth: ym, amount: parseFloat(amount) || 0, notes });
  };

  // テンポバイザーから1ヶ月分の売上を取得して保存
  const fetchFromTempoVisor = async (month) => {
    setFetchingMonth(month);
    try {
      const storeName = encodeURIComponent(store.store_name);
      const res = await fetch(`/api/productivity/sales?year=${selectedYear}&month=${month}&store_name=${storeName}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.total_sales > 0) {
        const ym = `${selectedYear}-${String(month).padStart(2, '0')}`;
        upsertMutation.mutate({
          storeId: store.id,
          yearMonth: ym,
          amount: data.total_sales,
          notes: `テンポバイザー取得 ${new Date().toLocaleDateString('ja-JP')}`
        });
        toast.success(`${month}月の売上を取得しました: ¥${data.total_sales.toLocaleString()}`);
      } else {
        toast.warning(`${month}月のデータが見つかりませんでした（売上0円）`);
      }
    } catch (e) {
      toast.error(`${month}月の取得に失敗: ${e.message}`);
    } finally {
      setFetchingMonth(null);
    }
  };

  // 全月一括取得
  const fetchAllMonths = async () => {
    setFetchingAll(true);
    toast.info(`${selectedYear}年の全月データを取得中...（時間がかかります）`);
    let successCount = 0;
    let failCount = 0;
    for (const month of months) {
      try {
        const storeName = encodeURIComponent(store.store_name);
        const res = await fetch(`/api/productivity/sales?year=${selectedYear}&month=${month}&store_name=${storeName}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success && data.total_sales > 0) {
          const ym = `${selectedYear}-${String(month).padStart(2, '0')}`;
          const existing = salesData.find(s => s.year_month === ym);
          if (existing) {
            await updateRecord('StoreSales', existing.id, {
              sales_amount: data.total_sales,
              notes: `テンポバイザー取得 ${new Date().toLocaleDateString('ja-JP')}`,
              updated_at: new Date().toISOString()
            });
          } else {
            await insertRecord('StoreSales', {
              store_id: store.id,
              year_month: ym,
              sales_amount: data.total_sales,
              notes: `テンポバイザー取得 ${new Date().toLocaleDateString('ja-JP')}`
            });
          }
          successCount++;
        }
      } catch (e) {
        failCount++;
        console.error(`Month ${month} failed:`, e);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['storeSales', store.id] });
    setFetchingAll(false);
    if (successCount > 0) {
      toast.success(`${successCount}ヶ月分の売上データを取得しました${failCount > 0 ? `（${failCount}ヶ月失敗）` : ''}`);
    } else {
      toast.error('売上データの取得に失敗しました');
    }
  };

  const totalYearSales = months.reduce((sum, m) => {
    const s = getSalesForMonth(m);
    return sum + (s ? parseFloat(s.sales_amount) || 0 : 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-base font-semibold text-slate-700">年度選択</Label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="h-9 px-3 rounded-md border border-slate-300 text-sm"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAllMonths}
            disabled={fetchingAll}
            className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-all border border-orange-200 disabled:opacity-50"
          >
            {fetchingAll ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BarChart3 className="w-3.5 h-3.5" />
            )}
            {fetchingAll ? '取得中...' : 'テンポバイザーから全月取得'}
          </button>
          <div className="text-right">
            <p className="text-xs text-slate-500">年間合計</p>
            <p className="text-lg font-bold text-blue-700">¥{totalYearSales.toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {months.map(month => {
          const sales = getSalesForMonth(month);
          const isFromTempoVisor = sales?.notes?.includes('テンポバイザー');
          return (
            <form
              key={month}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                handleSave(month, fd.get('amount'), fd.get('notes'));
              }}
              className="p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-colors shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-700">{month}月</span>
                <div className="flex items-center gap-1">
                  {sales && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isFromTempoVisor
                        ? 'text-orange-600 bg-orange-50'
                        : 'text-green-600 bg-green-50'
                    }`}>
                      {isFromTempoVisor ? 'TV取得' : '入力済'}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">¥</span>
                  <Input
                    type="number"
                    name="amount"
                    defaultValue={sales ? sales.sales_amount : ''}
                    key={sales?.sales_amount}
                    placeholder="売上金額"
                    className="h-8 pl-6 text-sm"
                    step="1"
                  />
                </div>
                <Input
                  type="text"
                  name="notes"
                  defaultValue={sales ? sales.notes : ''}
                  key={`notes-${sales?.notes}`}
                  placeholder="メモ（任意）"
                  className="h-7 text-xs"
                />
                <div className="flex gap-1">
                  <Button
                    type="submit"
                    size="sm"
                    className="flex-1 h-7 text-xs bg-blue-600 hover:bg-blue-700"
                    disabled={upsertMutation.isPending}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    保存
                  </Button>
                  {/* テンポバイザーから月別取得ボタン */}
                  <button
                    type="button"
                    onClick={() => fetchFromTempoVisor(month)}
                    disabled={fetchingMonth === month || fetchingAll}
                    title="テンポバイザーから月別売上を取得"
                    className="h-7 px-2 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md border border-orange-200 transition-all disabled:opacity-50 flex items-center"
                  >
                    {fetchingMonth === month ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <BarChart3 className="w-3 h-3" />
                    )}
                  </button>
                  {/* 日別売上ダイアログ表示ボタン */}
                  <button
                    type="button"
                    onClick={() => setDailyDialogMonth(month)}
                    title="日別売上を確認"
                    className="h-7 px-2 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-all flex items-center"
                  >
                    <List className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </form>
          );
        })}
      </div>

      {/* 日別売上ダイアログ */}
      <DailySalesDialog
        open={dailyDialogMonth !== null}
        onClose={() => setDailyDialogMonth(null)}
        store={store}
        year={selectedYear}
        month={dailyDialogMonth}
      />
    </div>
  );
}

// ========== 期間設定コンポーネント ==========
function StoreDeadlineSettings({ store, shiftDeadlines, appSettings, createDeadlineMutation, updateDeadlineMutation, deleteDeadlineMutation, createSettingMutation, updateSettingMutation }) {
  const storeDeadlines = shiftDeadlines.filter(d => d.store_id === store.id);

  return (
    <div className="space-y-6">
      {/* 既存の期限一覧 */}
      {storeDeadlines.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-3">設定済み期限</h3>
          <div className="space-y-2">
            {storeDeadlines.map(deadline => (
              <div key={deadline.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {deadline.deadline_name || format(new Date(deadline.target_month_start), 'yyyy年MM月')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {format(new Date(deadline.target_month_start), 'yyyy/MM/dd')} 〜 {format(new Date(deadline.target_month_end), 'yyyy/MM/dd')}
                  </p>
                  {deadline.submission_deadline_date && (
                    <p className="text-xs text-blue-600">
                      提出期限: {format(new Date(deadline.submission_deadline_date), 'yyyy/MM/dd')}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (window.confirm('この期限設定を削除しますか？')) {
                      deleteDeadlineMutation.mutate(deadline.id);
                    }
                  }}
                  className="text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 新規期限追加フォーム */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3">新規期限追加</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const name = fd.get('deadline_name');
            const start = fd.get('target_month_start');
            const end = fd.get('target_month_end');
            const submission = fd.get('submission_deadline_date');
            if (!start || !end || !submission) {
              toast.error('対象期間と提出締切日は必須です');
              return;
            }
            createDeadlineMutation.mutate({
              store_id: store.id,
              deadline_name: name || '',
              target_month_start: start,
              target_month_end: end,
              submission_deadline_date: submission,
              deadline_date: submission,
            });
            e.target.reset();
          }}
          className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200"
        >
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">締切名（任意）</Label>
            <Input type="text" name="deadline_name" placeholder="例: 2026年4月分" className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">対象期間 開始 *</Label>
              <Input type="date" name="target_month_start" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1 block">対象期間 終了 *</Label>
              <Input type="date" name="target_month_end" className="h-9" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">提出締切日 *</Label>
            <Input type="date" name="submission_deadline_date" className="h-9" />
          </div>
          <Button type="submit" size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createDeadlineMutation.isPending}>
            <Plus className="w-4 h-4 mr-2" />
            {createDeadlineMutation.isPending ? '追加中...' : '期限を追加'}
          </Button>
        </form>
      </div>

      {/* シンプルな期限設定 */}
      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-bold text-slate-700 mb-2">シンプルな期限設定</h3>
        <p className="text-xs text-slate-500 mb-3">従業員向けのシンプルな期限表示</p>
        {(() => {
          const storeSetting = appSettings.find(s =>
            s.setting_key === 'submission_deadline' && s.store_id === store.id
          );
          return (
            <form onSubmit={(e) => {
              e.preventDefault();
              const input = e.target.elements['deadline'];
              if (!input.value.trim()) { toast.error('提出期限を入力してください'); return; }
              if (storeSetting) {
                updateSettingMutation.mutate({ id: storeSetting.id, data: { setting_key: 'submission_deadline', setting_value: input.value, description: 'シフト希望の提出期限', store_id: store.id } });
              } else {
                createSettingMutation.mutate({ setting_key: 'submission_deadline', setting_value: input.value, description: 'シフト希望の提出期限', store_id: store.id });
              }
            }} className="space-y-3">
              <Input name="deadline" type="text" defaultValue={storeSetting?.setting_value || ''} placeholder="例: 毎月20日、翌月5日まで" className="h-10" />
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={createSettingMutation.isPending || updateSettingMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {(createSettingMutation.isPending || updateSettingMutation.isPending) ? '保存中...' : '保存'}
              </Button>
            </form>
          );
        })()}
      </div>
    </div>
  );
}

// ========== 店舗リストアイテム ==========
function StoreListItem({ store, isSelected, onSelect }) {
  const bh = store.business_hours || {};
  const today = new Date();
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = dayKeys[today.getDay()];
  const todayHours = bh[todayKey];
  const isClosed = todayHours?.closed;
  const openTime = todayHours?.open || '';
  const closeTime = todayHours?.close || '';

  let hoursText = '時間未設定';
  if (isClosed) {
    hoursText = '定休日';
  } else if (openTime && closeTime) {
    hoursText = `${openTime}〜${closeTime}`;
  }

  return (
    <button
      onClick={() => onSelect(store)}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-all ${
        isSelected
          ? 'bg-red-50 border-l-4 border-l-red-700'
          : 'hover:bg-slate-50 border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-bold ${isSelected ? 'text-red-800' : 'text-slate-800'}`}>
            {store.store_name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{hoursText}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
          isClosed
            ? 'bg-slate-100 text-slate-500'
            : 'bg-green-100 text-green-700'
        }`}>
          {isClosed ? '定休日' : '営業'}
        </span>
      </div>
    </button>
  );
}

// ========== メインコンポーネント ==========
export default function StoreSettings() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState('store');
  const [selectedStore, setSelectedStore] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const { user } = useAuth();

  const { data: storeDetailMap = {}, isLoading } = useQuery({
    queryKey: ['storeDetails'],
    queryFn: async () => {
      const { data = [] } = await supabase.from('Store').select('*');
      const map = {};
      data.forEach(s => { map[s.store_name] = s; });
      return map;
    },
  });

  const stores = JOBCAN_STORE_LIST.map(s => ({
    ...s,
    ...(storeDetailMap[s.store_name] || {}),
    id: storeDetailMap[s.store_name]?.id || s.id,
    store_name: s.store_name,
    store_code: s.store_code,
  }));

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => fetchAll('User'),
  });

  const { data: shiftDeadlines = [] } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => fetchAll('AppSettings'),
  });

  const createDeadlineMutation = useMutation({
    mutationFn: (data) => insertRecord('ShiftDeadline', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] }); toast.success('期限を作成しました'); },
  });

  const updateDeadlineMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('ShiftDeadline', id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] }); toast.success('期限を更新しました'); },
  });

  const deleteDeadlineMutation = useMutation({
    mutationFn: (id) => deleteRecord('ShiftDeadline', id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] }); toast.success('期限を削除しました'); },
  });

  const createSettingMutation = useMutation({
    mutationFn: (data) => insertRecord('AppSettings', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appSettings'] }); toast.success('設定を保存しました'); },
  });

  const updateSettingMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('AppSettings', id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appSettings'] }); toast.success('設定を更新しました'); },
  });

  const handleStoreSelect = (store) => {
    if (selectedStore?.id === store.id) {
      setSelectedStore(null);
      setActivePanel(null);
    } else {
      setSelectedStore(store);
      setActivePanel(null);
    }
  };

  useEffect(() => {
    if (selectedStore) {
      const updated = stores.find(s => s.id === selectedStore.id);
      if (updated) setSelectedStore(updated);
    }
  }, [storeDetailMap]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* ヘッダー */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-200 flex-shrink-0">
                <Layers className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold text-slate-800">所属先設定</h1>
                <p className="text-xs text-slate-500 hidden sm:block">店舗・通販・製造の所属先を管理</p>
              </div>
            </div>
            {/* メインタブ */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
              {[
                { id: 'store', label: '店舗', icon: Building2 },
                { id: 'online', label: '通販', icon: ShoppingCart },
                { id: 'manufacturing', label: '製造', icon: Factory },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setMainTab(id); setSelectedStore(null); setActivePanel(null); }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    mainTab === id
                      ? 'bg-white shadow-sm text-teal-700'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">

        {/* ===== 店舗タブ ===== */}
        {mainTab === 'store' && (
          <div className="flex gap-0 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
            {/* 左サイドバー: 店舗一覧 */}
            <div className={`${selectedStore ? 'hidden sm:flex' : 'flex'} flex-col w-full sm:w-56 md:w-64 border-r border-slate-100 flex-shrink-0`}>
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">店舗一覧</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : (
                  stores.map(store => (
                    <StoreListItem
                      key={store.id}
                      store={store}
                      isSelected={selectedStore?.id === store.id}
                      onSelect={handleStoreSelect}
                    />
                  ))
                )}
              </div>
            </div>

            {/* 右側: 詳細パネル */}
            <div className="flex-1 min-w-0">
              {!selectedStore ? (
                <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Building2 className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-semibold">店舗を選択してください</p>
                  <p className="text-slate-400 text-xs mt-1">左のリストから店舗を選択すると設定が表示されます</p>
                </div>
              ) : (
                <div className="p-4 sm:p-6 space-y-4">
                  {/* 店舗ヘッダー */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <StoreIcon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-800">{selectedStore.store_name}</h2>
                        <p className="text-xs text-slate-500">の営業時間設定</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedStore(null); setActivePanel(null); }}
                      className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-all sm:hidden"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      閉じる
                    </button>
                  </div>

                  {/* 3つのアクションカード */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* 期間設定 */}
                    <button
                      onClick={() => setActivePanel(activePanel === 'deadlines' ? null : 'deadlines')}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        activePanel === 'deadlines'
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 bg-white'
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-2 transition-colors ${
                        activePanel === 'deadlines' ? 'bg-blue-200' : 'bg-blue-100'
                      }`}>
                        <Clock className={`w-7 h-7 ${activePanel === 'deadlines' ? 'text-blue-700' : 'text-blue-600'}`} />
                      </div>
                      <p className="text-sm font-bold text-slate-800">期間設定</p>
                      <p className="text-xs text-slate-500 mt-0.5 text-center leading-tight">締切・期限<br/>管理</p>
                    </button>

                    {/* 詳細設定 */}
                    <button
                      onClick={() => setActivePanel(activePanel === 'details' ? null : 'details')}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        activePanel === 'details'
                          ? 'border-green-500 bg-green-50 shadow-md'
                          : 'border-slate-200 hover:border-green-400 hover:bg-green-50/50 bg-white'
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-2 transition-colors ${
                        activePanel === 'details' ? 'bg-green-200' : 'bg-green-100'
                      }`}>
                        <Settings className={`w-7 h-7 ${activePanel === 'details' ? 'text-green-700' : 'text-green-600'}`} />
                      </div>
                      <p className="text-sm font-bold text-slate-800">詳細設定</p>
                      <p className="text-xs text-slate-500 mt-0.5 text-center leading-tight">営業時間<br/>・人数</p>
                    </button>

                    {/* 売上入力 */}
                    <button
                      onClick={() => setActivePanel(activePanel === 'sales' ? null : 'sales')}
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        activePanel === 'sales'
                          ? 'border-orange-500 bg-orange-50 shadow-md'
                          : 'border-slate-200 hover:border-orange-400 hover:bg-orange-50/50 bg-white'
                      }`}
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-2 transition-colors ${
                        activePanel === 'sales' ? 'bg-orange-200' : 'bg-orange-100'
                      }`}>
                        <BarChart3 className={`w-7 h-7 ${activePanel === 'sales' ? 'text-orange-700' : 'text-orange-600'}`} />
                      </div>
                      <p className="text-sm font-bold text-slate-800">売上入力</p>
                      <p className="text-xs text-slate-500 mt-0.5 text-center leading-tight">過去売上<br/>データ</p>
                    </button>
                  </div>

                  {/* 展開パネル */}
                  {activePanel === 'deadlines' && (
                    <div className="animate-in slide-in-from-top-2 duration-200 pt-2 border-t border-slate-200">
                      <StoreDeadlineSettings
                        store={selectedStore}
                        shiftDeadlines={shiftDeadlines}
                        appSettings={appSettings}
                        createDeadlineMutation={createDeadlineMutation}
                        updateDeadlineMutation={updateDeadlineMutation}
                        deleteDeadlineMutation={deleteDeadlineMutation}
                        createSettingMutation={createSettingMutation}
                        updateSettingMutation={updateSettingMutation}
                      />
                    </div>
                  )}

                  {activePanel === 'details' && (
                    <div className="animate-in slide-in-from-top-2 duration-200 pt-2 border-t border-slate-200">
                      <DetailedStoreSettings
                        store={selectedStore}
                        onUpdate={async (data) => {
                          const dbRecord = storeDetailMap[selectedStore.store_name];
                          if (dbRecord?.id) {
                            await updateRecord('Store', dbRecord.id, data);
                          } else {
                            await insertRecord('Store', {
                              store_name: selectedStore.store_name,
                              store_code: selectedStore.store_code,
                              category: 'store',
                              ...data
                            });
                          }
                          invalidateStoreQueries(queryClient);
                          queryClient.invalidateQueries({ queryKey: ['storeDetails'] });
                        }}
                      />
                    </div>
                  )}

                  {activePanel === 'sales' && (
                    <div className="animate-in slide-in-from-top-2 duration-200 pt-2 border-t border-slate-200">
                      <StoreSalesInput store={selectedStore} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 通販タブ ===== */}
        {mainTab === 'online' && (() => {
          const onlineUsers = allUsers
            .filter(u => u.belongs_online === true && u.user_role !== 'admin' && u.role !== 'admin')
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          return (
            <div className="flex gap-0 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
              {/* 左サイドバー */}
              <div className="flex flex-col w-full sm:w-56 md:w-64 border-r border-slate-100 flex-shrink-0">
                <div className="px-4 py-3 border-b border-slate-100 bg-blue-50">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">通販部門</p>
                  <p className="text-2xl font-black text-blue-700 mt-1">{onlineUsers.length}<span className="text-sm font-normal text-blue-500 ml-1">名</span></p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {onlineUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <ShoppingCart className="w-8 h-8 text-slate-200 mb-2" />
                      <p className="text-xs text-slate-400">通販所属のスタッフがいません</p>
                    </div>
                  ) : (
                    onlineUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                          <span className="text-sm font-black text-white">{(u.full_name || u.email || '?')[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{u.full_name || u.email}</p>
                          {u.position && <p className="text-xs text-slate-400 truncate">{u.position}</p>}
                        </div>
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">通販</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {/* 右側: 説明 */}
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
                  <ShoppingCart className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">通販部門 所属スタッフ</h3>
                <p className="text-sm text-slate-500 mb-4">受注処理・受電業務を担当するスタッフ</p>
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-left max-w-sm">
                  <span className="text-amber-600 text-sm flex-shrink-0">⚠️</span>
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">所属先の変更</span>は「スタッフ管理」→各スタッフの「編集」から行ってください。
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ===== 製造タブ ===== */}
        {mainTab === 'manufacturing' && (() => {
          const hokuUsers = allUsers
            .filter(u => (u.belongs_hokusetsu_bagging || u.belongs_hokusetsu_cooking) && u.user_role !== 'admin' && u.role !== 'admin')
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          const kagaUsers = allUsers
            .filter(u => (u.belongs_kagaya_bagging || u.belongs_kagaya_cooking) && u.user_role !== 'admin' && u.role !== 'admin')
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

          const FactorySection = ({ title, users, accentColor, badgeText }) => (
            <div className="flex flex-col w-full sm:w-56 md:w-64 border-r border-slate-100 flex-shrink-0">
              <div className={`px-4 py-3 border-b border-slate-100 ${accentColor === 'amber' ? 'bg-amber-50' : 'bg-orange-50'}`}>
                <p className={`text-xs font-bold ${accentColor === 'amber' ? 'text-amber-600' : 'text-orange-600'} uppercase tracking-wider`}>{title}</p>
                <p className={`text-2xl font-black ${accentColor === 'amber' ? 'text-amber-700' : 'text-orange-700'} mt-1`}>{users.length}<span className="text-sm font-normal ml-1">名</span></p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <Factory className="w-8 h-8 text-slate-200 mb-2" />
                    <p className="text-xs text-slate-400">所属スタッフなし</p>
                  </div>
                ) : (
                  users.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-amber-50/50 transition-colors">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${accentColor === 'amber' ? 'from-amber-400 to-amber-600' : 'from-orange-400 to-orange-600'} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <span className="text-sm font-black text-white">{(u.full_name || u.email || '?')[0]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{u.full_name || u.email}</p>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {u.belongs_hokusetsu_bagging && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">袋詰め</span>}
                          {u.belongs_hokusetsu_cooking && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">炊き場</span>}
                          {u.belongs_kagaya_bagging && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">袋詰め</span>}
                          {u.belongs_kagaya_cooking && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">炊き場</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );

          return (
            <div className="flex gap-0 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
              {/* 北摂工場 */}
              <FactorySection title="北摂工場" users={hokuUsers} accentColor="amber" badgeText="北摂" />
              {/* 加賀屋工場 */}
              <FactorySection title="加賀屋工場" users={kagaUsers} accentColor="orange" badgeText="加賀屋" />
              {/* 右側: 説明 */}
              <div className="flex-1 hidden sm:flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
                  <Factory className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">製造部門 所属スタッフ</h3>
                <p className="text-sm text-slate-500 mb-4">北摂工場・加賀屋工場の製造スタッフ</p>
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-left max-w-sm">
                  <span className="text-amber-600 text-sm flex-shrink-0">⚠️</span>
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">所属先の変更</span>は「スタッフ管理」→各スタッフの「編集」から行ってください。
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

      </main>
    </div>
  );
}
