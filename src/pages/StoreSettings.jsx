import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Store as StoreIcon, Settings, Shield, Building2, Plus, Edit2, Trash2, MapPin, Calendar, Save, RotateCcw, Copy, Palette, ChevronLeft, DollarSign, BarChart3, Clock, ArrowLeft, ShoppingCart, Factory, Users, Layers } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import DetailedStoreSettings from '@/components/store-settings/DetailedStoreSettings';
import StoreCard from '@/components/store-settings/StoreCard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fetchAll, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { invalidateStoreQueries } from '@/lib/invalidateHelpers';
import { sortStoresByOrder } from '@/lib/storeOrder';

function SortableStoreCard({ id, store, color, isSelected, onSelect, onEdit, onDelete, onColorChange, showColorPicker, setShowColorPicker, canEdit, canDelete, colorOptions }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <StoreCard
        store={store}
        color={color}
        isSelected={isSelected}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
        onColorChange={onColorChange}
        showColorPicker={showColorPicker}
        setShowColorPicker={setShowColorPicker}
        canEdit={canEdit}
        canDelete={canDelete}
        colorOptions={colorOptions}
      />
    </div>
  );
}

// ========== Sales Input Component ==========
function StoreSalesInput({ store }) {
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
    upsertMutation.mutate({
      storeId: store.id,
      yearMonth: ym,
      amount: parseFloat(amount) || 0,
      notes
    });
  };

  const totalYearSales = months.reduce((sum, m) => {
    const s = getSalesForMonth(m);
    return sum + (s ? parseFloat(s.sales_amount) || 0 : 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
        <div className="text-right">
          <p className="text-xs text-slate-500">年間合計</p>
          <p className="text-lg font-bold text-blue-700">¥{totalYearSales.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {months.map(month => {
          const sales = getSalesForMonth(month);
          const currentAmount = sales ? sales.sales_amount : '';
          const currentNotes = sales ? sales.notes : '';

          return (
            <form
              key={month}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                handleSave(month, fd.get('amount'), fd.get('notes'));
              }}
              className="p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-700">{month}月</span>
                {sales && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">入力済</span>
                )}
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">¥</span>
                  <Input
                    type="number"
                    name="amount"
                    defaultValue={currentAmount}
                    placeholder="売上金額"
                    className="h-8 pl-6 text-sm"
                    step="1"
                  />
                </div>
                <Input
                  type="text"
                  name="notes"
                  defaultValue={currentNotes}
                  placeholder="メモ（任意）"
                  className="h-7 text-xs"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700"
                  disabled={upsertMutation.isPending}
                >
                  <Save className="w-3 h-3 mr-1" />
                  保存
                </Button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

// ========== Deadline Settings Component ==========
function StoreDeadlineSettings({ store, shiftDeadlines, appSettings, createDeadlineMutation, updateDeadlineMutation, deleteDeadlineMutation, createSettingMutation, updateSettingMutation }) {
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [copyTargetName, setCopyTargetName] = useState('');
  const [copyTargetStart, setCopyTargetStart] = useState('');
  const [copyTargetEnd, setCopyTargetEnd] = useState('');

  const handleCopyDeadlines = async () => {
    if (!copySourceId || !copyTargetName || !copyTargetStart || !copyTargetEnd) {
      toast.error('全ての項目を入力してください');
      return;
    }
    const sourceDeadline = shiftDeadlines.find(d => d.id === copySourceId);
    if (!sourceDeadline) {
      toast.error('コピー元が見つかりません');
      return;
    }
    const sourceName = sourceDeadline.deadline_name || format(new Date(sourceDeadline.target_month_start), 'yyyy年MM月');
    if (!window.confirm(`「${sourceName}」の期限設定を「${copyTargetName}」としてコピーしますか？`)) return;

    try {
      const sourceDate = new Date(sourceDeadline.target_month_start);
      const targetDate = new Date(copyTargetStart);
      const daysDiff = Math.floor((targetDate - sourceDate) / (1000 * 60 * 60 * 24));
      const sourceSubmissionDate = sourceDeadline.submission_deadline_date || sourceDeadline.deadline_date;
      if (!sourceSubmissionDate) {
        toast.error('コピー元に提出締切日が設定されていません');
        return;
      }
      const newSubmissionDate = new Date(sourceSubmissionDate);
      newSubmissionDate.setDate(newSubmissionDate.getDate() + daysDiff);
      const newData = {
        store_id: store.id,
        deadline_name: copyTargetName,
        target_month_start: copyTargetStart,
        target_month_end: copyTargetEnd,
        submission_deadline_date: format(newSubmissionDate, 'yyyy-MM-dd'),
        deadline_date: format(newSubmissionDate, 'yyyy-MM-dd'),
        description: sourceDeadline.description || ''
      };
      if (sourceDeadline.creation_deadline_date) {
        const d = new Date(sourceDeadline.creation_deadline_date);
        d.setDate(d.getDate() + daysDiff);
        newData.creation_deadline_date = format(d, 'yyyy-MM-dd');
      }
      if (sourceDeadline.confirmation_deadline_date) {
        const d = new Date(sourceDeadline.confirmation_deadline_date);
        d.setDate(d.getDate() + daysDiff);
        newData.confirmation_deadline_date = format(d, 'yyyy-MM-dd');
      }
      await createDeadlineMutation.mutateAsync(newData);
      setShowCopyDialog(false);
      setCopySourceId('');
      setCopyTargetName('');
      setCopyTargetStart('');
      setCopyTargetEnd('');
      toast.success('期限設定をコピーしました');
    } catch (err) {
      toast.error('コピーに失敗しました');
    }
  };

  const storeDeadlines = shiftDeadlines.filter(d => d.store_id === store.id);

  return (
    <div className="space-y-6">
      {/* Copy Settings */}
      <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Copy className="w-4 h-4 text-indigo-600" />
              期限設定をコピー
            </h4>
            <p className="text-xs text-slate-600 mt-1">他の期間の締切設定をコピーできます</p>
          </div>
          <Button onClick={() => setShowCopyDialog(true)} variant="outline" size="sm" className="bg-white border-indigo-300 hover:bg-indigo-50">
            <Copy className="w-4 h-4 mr-2" />
            コピー設定
          </Button>
        </div>
      </div>

      {/* Existing Deadlines */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">詳細設定</h3>
          <p className="text-sm text-slate-600">各月ごとに締切タイプ別の期限を設定できます</p>
        </div>

        <div className="space-y-4">
          {storeDeadlines.map((deadline) => {
            const isPast = new Date(deadline.target_month_start) < new Date();
            return (
              <form key={deadline.id} onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const submissionDate = fd.get('submission_deadline_date');
                const data = {
                  store_id: store.id,
                  deadline_name: fd.get('deadline_name'),
                  target_month_start: fd.get('target_month_start'),
                  target_month_end: fd.get('target_month_end'),
                  submission_deadline_date: submissionDate,
                  deadline_date: submissionDate,
                  description: fd.get('description') || ''
                };
                const creationDate = fd.get('creation_deadline_date');
                if (creationDate) data.creation_deadline_date = creationDate;
                const confirmationDate = fd.get('confirmation_deadline_date');
                if (confirmationDate) data.confirmation_deadline_date = confirmationDate;
                await updateDeadlineMutation.mutateAsync({ id: deadline.id, data });
              }} className={`rounded-xl border-2 shadow-sm overflow-hidden ${isPast ? 'border-slate-200 opacity-60' : 'border-blue-200 hover:border-blue-300'} transition-all`}>
                {/* ヘッダー：締切名とステータス */}
                <div className={`px-4 py-3 flex items-center justify-between ${isPast ? 'bg-slate-100' : 'bg-gradient-to-r from-blue-50 to-indigo-50'}`}>
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-3 h-3 rounded-full ${isPast ? 'bg-slate-400' : 'bg-blue-500'}`}></div>
                    <Input type="text" name="deadline_name" defaultValue={deadline.deadline_name} className="h-9 text-base font-bold border-0 bg-transparent shadow-none focus-visible:ring-1 focus-visible:ring-blue-300 px-2" required />
                  </div>
                  <div className="flex items-center gap-2">
                    {isPast && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">過去</span>}
                    <Button type="button" variant="ghost" size="sm" onClick={async () => {
                      if (confirm('この期限設定を削除しますか？')) {
                        await deleteDeadlineMutation.mutateAsync(deadline.id);
                      }
                    }} className="h-8 w-8 p-0 hover:bg-red-50">
                      <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                    </Button>
                  </div>
                </div>

                <div className="p-4 space-y-4 bg-white">
                  {/* 対象期間 */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1">
                        <Label className="text-[10px] text-slate-500 mb-0.5 block">開始</Label>
                        <Input type="date" name="target_month_start" defaultValue={deadline.target_month_start} className="h-9 text-sm" required />
                      </div>
                      <span className="text-slate-400 mt-4">〜</span>
                      <div className="flex-1">
                        <Label className="text-[10px] text-slate-500 mb-0.5 block">終了</Label>
                        <Input type="date" name="target_month_end" defaultValue={deadline.target_month_end} className="h-9 text-sm" required />
                      </div>
                    </div>
                  </div>

                  {/* 締切日グリッド */}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">1</span>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs font-semibold text-blue-800 mb-1 block">シフト希望提出締切日 *</Label>
                        <Input type="date" name="submission_deadline_date" defaultValue={deadline.submission_deadline_date || deadline.deadline_date} className="h-9 bg-white" required />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">2</span>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs font-semibold text-green-800 mb-1 block">シフト作成締切日（任意）</Label>
                        <Input type="date" name="creation_deadline_date" defaultValue={deadline.creation_deadline_date || ''} className="h-9 bg-white" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">3</span>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs font-semibold text-purple-800 mb-1 block">シフト確定日（任意）</Label>
                        <Input type="date" name="confirmation_deadline_date" defaultValue={deadline.confirmation_deadline_date || ''} className="h-9 bg-white" />
                      </div>
                    </div>
                  </div>

                  {/* 説明 */}
                  <div>
                    <Label className="text-xs text-slate-500 mb-1 block">メモ（任意）</Label>
                    <Input type="text" name="description" defaultValue={deadline.description || ''} placeholder="例: 3月分のシフト" className="h-9" />
                  </div>

                  {/* 保存ボタン */}
                  <Button type="submit" size="sm" className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-sm font-semibold" disabled={updateDeadlineMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {updateDeadlineMutation.isPending ? '更新中...' : 'この期間の設定を保存'}
                  </Button>
                </div>
              </form>
            );
          })}

          {/* New deadline form */}
          <form onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const submissionDate = fd.get('submission_deadline_date');
            const data = {
              store_id: store.id,
              deadline_name: fd.get('deadline_name'),
              target_month_start: fd.get('target_month_start'),
              target_month_end: fd.get('target_month_end'),
              submission_deadline_date: submissionDate,
              deadline_date: submissionDate,
              description: fd.get('description') || ''
            };
            const creationDate = fd.get('creation_deadline_date');
            if (creationDate) data.creation_deadline_date = creationDate;
            const confirmationDate = fd.get('confirmation_deadline_date');
            if (confirmationDate) data.confirmation_deadline_date = confirmationDate;
            if (!data.deadline_name || !data.target_month_start || !data.target_month_end || !data.submission_deadline_date) {
              toast.error('全ての必須項目を入力してください');
              return;
            }
            await createDeadlineMutation.mutateAsync(data);
            e.target.reset();
          }} className="rounded-xl border-2 border-dashed border-indigo-300 overflow-hidden">
            {/* ヘッダー */}
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-100 to-blue-100">
              <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                新しい期間の締切を追加
              </h4>
            </div>

            <div className="p-4 space-y-4 bg-white">
              {/* 締切名 */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1 block">締切名 *</Label>
                <Input type="text" name="deadline_name" placeholder="例: 2026年3月分" className="h-10 bg-white text-base" required />
              </div>

              {/* 対象期間 */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex-1">
                    <Label className="text-[10px] text-slate-500 mb-0.5 block">開始</Label>
                    <Input type="date" name="target_month_start" className="h-9 text-sm bg-white" required />
                  </div>
                  <span className="text-slate-400 mt-4">〜</span>
                  <div className="flex-1">
                    <Label className="text-[10px] text-slate-500 mb-0.5 block">終了</Label>
                    <Input type="date" name="target_month_end" className="h-9 text-sm bg-white" required />
                  </div>
                </div>
              </div>

              {/* 締切日グリッド */}
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">1</span>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs font-semibold text-blue-800 mb-1 block">シフト希望提出締切日 *</Label>
                    <Input type="date" name="submission_deadline_date" className="h-9 bg-white" required />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">2</span>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs font-semibold text-green-800 mb-1 block">シフト作成締切日（任意）</Label>
                    <Input type="date" name="creation_deadline_date" className="h-9 bg-white" />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">3</span>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs font-semibold text-purple-800 mb-1 block">シフト確定日（任意）</Label>
                    <Input type="date" name="confirmation_deadline_date" className="h-9 bg-white" />
                  </div>
                </div>
              </div>

              {/* メモ */}
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">メモ（任意）</Label>
                <Input type="text" name="description" placeholder="例: 3月分のシフト" className="h-9" />
              </div>

              {/* 追加ボタン */}
              <Button type="submit" size="sm" className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold" disabled={createDeadlineMutation.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                {createDeadlineMutation.isPending ? '追加中...' : '期限を追加'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Simple Deadline Settings */}
      <div className="border-t border-slate-200 pt-4">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">シンプルな期限設定</h3>
          <p className="text-sm text-slate-600">従業員向けのシンプルな期限表示</p>
          {(() => {
            const storeSetting = appSettings.find(s =>
              s.setting_key === 'submission_deadline' &&
              s.store_id === store.id
            );
            return (
              <form onSubmit={(e) => {
                e.preventDefault();
                const input = e.target.elements['deadline'];
                if (!input.value.trim()) {
                  toast.error('提出期限を入力してください');
                  return;
                }
                if (storeSetting) {
                  updateSettingMutation.mutate({
                    id: storeSetting.id,
                    data: {
                      setting_key: 'submission_deadline',
                      setting_value: input.value,
                      description: 'シフト希望の提出期限',
                      store_id: store.id
                    }
                  });
                } else {
                  createSettingMutation.mutate({
                    setting_key: 'submission_deadline',
                    setting_value: input.value,
                    description: 'シフト希望の提出期限',
                    store_id: store.id
                  });
                }
              }} className="space-y-3">
                <Input
                  name="deadline"
                  type="text"
                  defaultValue={storeSetting?.setting_value || ''}
                  placeholder="例: 毎月20日、翌月5日まで"
                  className="h-10"
                />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={createSettingMutation.isPending || updateSettingMutation.isPending}>
                  <Save className="w-4 h-4 mr-2" />
                  {(createSettingMutation.isPending || updateSettingMutation.isPending) ? '保存中...' : '保存'}
                </Button>
              </form>
            );
          })()}
        </div>
      </div>

      {/* Copy Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="max-w-lg" aria-describedby="copy-dialog-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5" />
              期限設定のコピー
            </DialogTitle>
            <DialogDescription id="copy-dialog-desc" className="sr-only">
              他の期間の締切設定をコピーします
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">コピー元の締切</Label>
              <Select value={copySourceId} onValueChange={setCopySourceId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="コピー元を選択" />
                </SelectTrigger>
                <SelectContent>
                  {storeDeadlines.map(deadline => (
                    <SelectItem key={deadline.id} value={deadline.id}>
                      {deadline.deadline_name || format(new Date(deadline.target_month_start), 'yyyy年MM月')}
                      ({format(new Date(deadline.target_month_start), 'yyyy/MM/dd')} - {format(new Date(deadline.target_month_end), 'yyyy/MM/dd')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-4">
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">コピー先の設定</Label>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-slate-600 mb-1 block">新しい締切名 *</Label>
                  <Input type="text" value={copyTargetName} onChange={(e) => setCopyTargetName(e.target.value)} placeholder="例: 2026年4月分" className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">対象期間開始 *</Label>
                    <Input type="date" value={copyTargetStart} onChange={(e) => setCopyTargetStart(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">対象期間終了 *</Label>
                    <Input type="date" value={copyTargetEnd} onChange={(e) => setCopyTargetEnd(e.target.value)} className="h-9" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCopyDeadlines} className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={!copySourceId || !copyTargetName || !copyTargetStart || !copyTargetEnd}>
                <Copy className="w-4 h-4 mr-2" />
                コピー実行
              </Button>
              <Button variant="outline" onClick={() => {
                setShowCopyDialog(false);
                setCopySourceId('');
                setCopyTargetName('');
                setCopyTargetStart('');
                setCopyTargetEnd('');
              }}>
                キャンセル
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========== Main Component ==========
export default function StoreSettings() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState('store'); // 'store' | 'online' | 'manufacturing'
  const [showForm, setShowForm] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [activePanel, setActivePanel] = useState(null); // 'deadlines' | 'details' | 'sales'
  const [storeOrder, setStoreOrder] = useState([]);
  const [storeColors, setStoreColors] = useState({});
  const [showColorPicker, setShowColorPicker] = useState(null);
  const [formData, setFormData] = useState({
    store_name: '',
    store_code: '',
    address: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { user } = useAuth();

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const { data: allStores = [] } = await supabase.from('Store').select('*');
      // 通販・製造のstore_codeを除外して純粋な店舗のみ返す
      const storeOnly = allStores.filter(s =>
        !s.store_code?.startsWith('MFG-') && s.store_code !== 'ONLINE'
      );
      const sorted = sortStoresByOrder(storeOnly);
      if (!user || user?.user_role === 'admin' || user?.role === 'admin') {
        return sorted;
      }
      return sorted.filter(store => user?.store_ids?.includes(store.id));
    },
  });

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

  useEffect(() => {
    if (stores.length > 0) {
      const savedColors = localStorage.getItem('storeColors');

      if (savedColors) {
        try {
          setStoreColors(JSON.parse(savedColors));
        } catch (e) {
          console.error("Failed to parse storeColors:", e);
        }
      }

      // DBのsort_orderを優先して並び順を決定
      const hasDbOrder = stores.some(s => s.sort_order != null);
      if (hasDbOrder) {
        const dbSorted = [...stores].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
        const dbOrder = dbSorted.map(s => s.id);
        setStoreOrder(dbOrder);
        localStorage.setItem('storeOrder', JSON.stringify(dbOrder));
      } else {
        const savedOrder = localStorage.getItem('storeOrder');
        if (savedOrder) {
          try {
            const parsed = JSON.parse(savedOrder);
            const currentStoreIds = new Set(stores.map(s => s.id));
            const filteredOrder = parsed.filter(id => currentStoreIds.has(id));
            const newStores = stores.filter(s => !filteredOrder.includes(s.id)).map(s => s.id);
            const finalOrder = [...filteredOrder, ...newStores];
            setStoreOrder(finalOrder);
            if (newStores.length > 0) {
              localStorage.setItem('storeOrder', JSON.stringify(finalOrder));
            }
          } catch (e) {
            setStoreOrder(stores.map(s => s.id));
          }
        } else {
          const defaultOrder = stores.map(s => s.id);
          setStoreOrder(defaultOrder);
          localStorage.setItem('storeOrder', JSON.stringify(defaultOrder));
        }
      }
    }
  }, [stores]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStoreOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        localStorage.setItem('storeOrder', JSON.stringify(newOrder));
        // DBにも並び順を保存（全デバイスで共有）
        newOrder.forEach((storeId, index) => {
          updateRecord('Store', storeId, { sort_order: index }).catch(e => 
            console.error('Failed to save store order:', e)
          );
        });
        return newOrder;
      });
      // 少し待ってからキャッシュを無効化
      setTimeout(() => invalidateStoreQueries(queryClient), 500);
    }
  };

  const handleColorChange = async (storeId, color) => {
    const newColors = { ...storeColors, [storeId]: color };
    setStoreColors(newColors);
    localStorage.setItem('storeColors', JSON.stringify(newColors));
    // DBにも色を保存（全デバイスで共有）
    try {
      await updateRecord('Store', storeId, { color });
      invalidateStoreQueries(queryClient);
    } catch (e) {
      console.error('Failed to save store color:', e);
    }
    setShowColorPicker(null);
    toast.success('色を変更しました');
  };

  const createMutation = useMutation({
    mutationFn: (data) => insertRecord('Store', data),
    onSuccess: () => {
      invalidateStoreQueries(queryClient);
      toast.success('店舗を追加しました');
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('Store', id, data),
    onSuccess: () => {
      invalidateStoreQueries(queryClient);
      toast.success('店舗情報を更新しました');
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRecord('Store', id),
    onSuccess: () => {
      invalidateStoreQueries(queryClient);
      toast.success('店舗を削除しました');
    },
  });

  const createDeadlineMutation = useMutation({
    mutationFn: (data) => insertRecord('ShiftDeadline', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('期限を作成しました');
    },
  });

  const updateDeadlineMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('ShiftDeadline', id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('期限を更新しました');
    },
  });

  const deleteDeadlineMutation = useMutation({
    mutationFn: (id) => deleteRecord('ShiftDeadline', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('期限を削除しました');
    },
  });

  const createSettingMutation = useMutation({
    mutationFn: (data) => insertRecord('AppSettings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('設定を保存しました');
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('AppSettings', id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('設定を更新しました');
    },
  });

  const resetForm = () => {
    setFormData({ store_name: '', store_code: '', address: '', week_start_day: 1 });
    setEditingStore(null);
    setShowForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.store_name || !formData.store_code) {
      toast.error('店舗名と店舗コードは必須です');
      return;
    }
    if (editingStore) {
      updateMutation.mutate({ id: editingStore.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (store) => {
    setEditingStore(store);
    setFormData({
      store_name: store.store_name,
      store_code: store.store_code,
      address: store.address || '',
      week_start_day: store.week_start_day ?? 1,
    });
    setShowForm(true);
  };

  const orderedStores = storeOrder.length > 0
    ? storeOrder.map(id => stores.find(s => s.id === id)).filter(Boolean)
    : stores;

  const isAdmin = user?.user_role === 'admin' || user?.role === 'admin';

  const colorOptions = [
    { value: 'blue', label: '青' },
    { value: 'purple', label: '紫' },
    { value: 'green', label: '緑' },
    { value: 'orange', label: 'オレンジ' },
    { value: 'pink', label: 'ピンク' },
    { value: 'teal', label: 'ティール' },
  ];

  const bgColorMap = {
    blue: 'bg-blue-100', purple: 'bg-purple-100', green: 'bg-green-100',
    orange: 'bg-orange-100', pink: 'bg-pink-100', teal: 'bg-teal-100',
  };
  const iconColorMap = {
    blue: 'text-blue-600', purple: 'text-purple-600', green: 'text-green-600',
    orange: 'text-orange-600', pink: 'text-pink-600', teal: 'text-teal-600',
  };
  const borderColorMap = {
    blue: 'border-blue-400', purple: 'border-purple-400', green: 'border-green-400',
    orange: 'border-orange-400', pink: 'border-pink-400', teal: 'border-teal-400',
  };

  const handleStoreSelect = (store) => {
    if (selectedStore?.id === store.id) {
      // Toggle off
      setSelectedStore(null);
      setActivePanel(null);
    } else {
      setSelectedStore(store);
      setActivePanel(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
          <div className="flex items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-200 flex-shrink-0">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-2xl font-bold text-slate-800">所属先設定</h1>
                <p className="text-xs sm:text-sm text-slate-500">店舗・通販・製造の所属先を管理</p>
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
                  onClick={() => setMainTab(id)}
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

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* ===== 店舗タブ ===== */}
        {mainTab === 'store' && <>
        {/* Admin: Add Store Button */}
        {isAdmin && (
          <div>
            <Button
              onClick={() => setShowForm(!showForm)}
              size="lg"
              className="text-base bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              新規店舗追加
            </Button>
          </div>
        )}

        {/* Add/Edit Store Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">
                {editingStore ? '店舗情報編集' : '新規店舗登録'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-base">店舗名 *</Label>
                    <Input
                      value={formData.store_name}
                      onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                      placeholder="例: 渋谷店"
                      className="text-base h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">店舗コード *</Label>
                    <Input
                      value={formData.store_code}
                      onChange={(e) => setFormData({ ...formData, store_code: e.target.value })}
                      placeholder="例: SHIBUYA01"
                      className="text-base h-12"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-base">住所</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="例: 東京都渋谷区..."
                    className="text-base h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-base">週の開始曜日</Label>
                  <Select
                    value={formData.week_start_day?.toString() || '1'}
                    onValueChange={(value) => setFormData({ ...formData, week_start_day: parseInt(value) })}
                  >
                    <SelectTrigger className="text-base h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">日曜日</SelectItem>
                      <SelectItem value="1">月曜日</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-slate-500">シフト表やカレンダーで週が始まる曜日を設定します</p>
                </div>
                <div className="flex gap-3">
                  <Button type="submit" size="lg" className="text-base">
                    {editingStore ? '更新' : '登録'}
                  </Button>
                  <Button type="button" variant="outline" size="lg" onClick={resetForm} className="text-base">
                    キャンセル
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Store Grid */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedStores.map(s => s.id)} strategy={rectSortingStrategy}>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
              {orderedStores.map((store) => (
                <SortableStoreCard
                  key={store.id}
                  id={store.id}
                  store={store}
                  color={storeColors[store.id] || 'blue'}
                  isSelected={selectedStore?.id === store.id}
                  onSelect={() => handleStoreSelect(store)}
                  onEdit={isAdmin ? handleEdit : null}
                  onDelete={isAdmin ? (id, name) => {
                    if (window.confirm(`${name}を削除しますか？`)) {
                      deleteMutation.mutate(id);
                    }
                  } : null}
                  onColorChange={handleColorChange}
                  showColorPicker={showColorPicker}
                  setShowColorPicker={setShowColorPicker}
                  canEdit={isAdmin}
                  canDelete={isAdmin}
                  colorOptions={colorOptions}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {stores.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-xl text-slate-400">まだ店舗が登録されていません</p>
            <p className="text-base text-slate-400 mt-2">「新規店舗追加」から店舗を登録してください</p>
          </div>
        )}

        {/* Selected Store Sub-Menu */}
        {selectedStore && (
          <div className="animate-in slide-in-from-top-2 duration-300">
            <Card className={`border-2 ${borderColorMap[storeColors[selectedStore.id] || 'blue']}`}>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <div className={`w-10 h-10 rounded-lg ${bgColorMap[storeColors[selectedStore.id] || 'blue']} flex items-center justify-center`}>
                      <StoreIcon className={`w-6 h-6 ${iconColorMap[storeColors[selectedStore.id] || 'blue']}`} />
                    </div>
                    <span className="font-bold text-slate-800">{selectedStore.store_name}</span>
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedStore(null); setActivePanel(null); }}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    閉じる
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 3 Sub-Menu Icons */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setActivePanel(activePanel === 'deadlines' ? null : 'deadlines')}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      activePanel === 'deadlines'
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-2 transition-colors ${
                      activePanel === 'deadlines' ? 'bg-blue-200' : 'bg-blue-100'
                    }`}>
                      <Clock className={`w-7 h-7 ${activePanel === 'deadlines' ? 'text-blue-700' : 'text-blue-600'}`} />
                    </div>
                    <p className="text-sm font-bold text-slate-800">期間設定</p>
                    <p className="text-xs text-slate-500 mt-0.5">締切・期限管理</p>
                  </button>

                  <button
                    onClick={() => setActivePanel(activePanel === 'details' ? null : 'details')}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      activePanel === 'details'
                        ? 'border-green-500 bg-green-50 shadow-md'
                        : 'border-slate-200 hover:border-green-400 hover:bg-green-50/50'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-2 transition-colors ${
                      activePanel === 'details' ? 'bg-green-200' : 'bg-green-100'
                    }`}>
                      <Settings className={`w-7 h-7 ${activePanel === 'details' ? 'text-green-700' : 'text-green-600'}`} />
                    </div>
                    <p className="text-sm font-bold text-slate-800">詳細設定</p>
                    <p className="text-xs text-slate-500 mt-0.5">営業時間・人数</p>
                  </button>

                  <button
                    onClick={() => setActivePanel(activePanel === 'sales' ? null : 'sales')}
                    className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      activePanel === 'sales'
                        ? 'border-orange-500 bg-orange-50 shadow-md'
                        : 'border-slate-200 hover:border-orange-400 hover:bg-orange-50/50'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-2 transition-colors ${
                      activePanel === 'sales' ? 'bg-orange-200' : 'bg-orange-100'
                    }`}>
                      <BarChart3 className={`w-7 h-7 ${activePanel === 'sales' ? 'text-orange-700' : 'text-orange-600'}`} />
                    </div>
                    <p className="text-sm font-bold text-slate-800">売上入力</p>
                    <p className="text-xs text-slate-500 mt-0.5">過去売上データ</p>
                  </button>
                </div>

                {/* Expanded Panel Content */}
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
                        await updateRecord('Store', selectedStore.id, data);
                        setSelectedStore(prev => prev ? { ...prev, ...data } : prev);
                        invalidateStoreQueries(queryClient);
                      }}
                    />
                  </div>
                )}

                {activePanel === 'sales' && (
                  <div className="animate-in slide-in-from-top-2 duration-200 pt-2 border-t border-slate-200">
                    <StoreSalesInput store={selectedStore} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        </> /* end store tab */}

        {/* ===== 通販タブ ===== */}
        {mainTab === 'online' && (() => {
          const onlineUsers = allUsers
            .filter(u => u.belongs_online === true && u.user_role !== 'admin' && u.role !== 'admin')
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          return (
            <div className="space-y-5">
              {/* サマリーバナー */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg">
                      <ShoppingCart className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">通販部門</p>
                      <h2 className="text-xl font-black">通販 所属スタッフ</h2>
                      <p className="text-blue-200 text-xs mt-0.5">受注処理・受電</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black">{onlineUsers.length}</p>
                    <p className="text-blue-200 text-xs">所属スタッフ</p>
                  </div>
                </div>
              </div>
              {/* 注意書き */}
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-amber-600 text-sm">⚠️</span>
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">所属先の変更</span>は「スタッフ管理」→各スタッフの「編集」から行ってください。
                </p>
              </div>
              {/* スタッフカードグリッド */}
              {onlineUsers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
                  <ShoppingCart className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-semibold">通販所属のスタッフがいません</p>
                  <p className="text-slate-400 text-xs mt-1">スタッフ編集ページから「通販所属」を設定してください</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {onlineUsers.map((u) => (
                    <div key={u.id}
                      className="relative bg-white rounded-2xl border border-blue-100 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 p-4 group overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center mx-auto mb-3 shadow-md">
                          <span className="text-lg font-black text-white">{(u.full_name || u.email || '?')[0]}</span>
                        </div>
                        <p className="font-bold text-slate-800 text-sm text-center truncate">{u.full_name || u.email}</p>
                        {u.position && <p className="text-xs text-slate-400 text-center truncate mt-0.5">{u.position}</p>}
                        <div className="flex justify-center mt-2">
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">通販</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
          const totalMfg = hokuUsers.length + kagaUsers.length;
          const MfgStaffCard = ({ u, accentFrom, accentTo, borderColor, hoverBg }) => (
            <div className={"relative bg-white rounded-2xl border " + borderColor + " shadow-sm hover:shadow-md transition-all duration-200 p-4 group overflow-hidden"}>
              <div className={"absolute inset-0 " + hoverBg + " opacity-0 group-hover:opacity-100 transition-opacity"} />
              <div className="relative">
                <div className={"w-12 h-12 rounded-2xl bg-gradient-to-br " + accentFrom + " " + accentTo + " flex items-center justify-center mx-auto mb-3 shadow-md"}>
                  <span className="text-lg font-black text-white">{(u.full_name || u.email || '?')[0]}</span>
                </div>
                <p className="font-bold text-slate-800 text-sm text-center truncate">{u.full_name || u.email}</p>
                {u.position && <p className="text-xs text-slate-400 text-center truncate mt-0.5">{u.position}</p>}
                <div className="flex justify-center gap-1 mt-2 flex-wrap">
                  {u.belongs_hokusetsu_bagging && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">袋詰め</span>}
                  {u.belongs_hokusetsu_cooking && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">炊き場</span>}
                  {u.belongs_kagaya_bagging && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">袋詰め</span>}
                  {u.belongs_kagaya_cooking && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">炊き場</span>}
                </div>
              </div>
            </div>
          );
          return (
            <div className="space-y-6">
              {/* サマリーバナー */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg">
                      <Factory className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-amber-100 text-xs font-semibold uppercase tracking-wider">製造部門</p>
                      <h2 className="text-xl font-black">製造 所属スタッフ</h2>
                      <p className="text-amber-200 text-xs mt-0.5">北摂工場・加賀屋工場</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div><p className="text-3xl font-black">{totalMfg}</p><p className="text-amber-200 text-xs">全体</p></div>
                    <div><p className="text-3xl font-black">{hokuUsers.length}</p><p className="text-amber-200 text-xs">北摂</p></div>
                    <div><p className="text-3xl font-black">{kagaUsers.length}</p><p className="text-amber-200 text-xs">加賀屋</p></div>
                  </div>
                </div>
              </div>
              {/* 注意書き */}
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-amber-600 text-sm">⚠️</span>
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">所属先の変更</span>は「スタッフ管理」→各スタッフの「編集」から行ってください。
                </p>
              </div>
              {/* 北摂工場 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md">
                    <Factory className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="font-black text-slate-800 text-base">北摂工場</h3>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{hokuUsers.length}名</span>
                </div>
                {hokuUsers.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                    <Factory className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">北摂工場所属のスタッフがいません</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {hokuUsers.map(u => (
                      <MfgStaffCard key={u.id} u={u}
                        accentFrom="from-amber-400" accentTo="to-amber-600"
                        borderColor="border-amber-100" hoverBg="bg-amber-50/60"
                      />
                    ))}
                  </div>
                )}
              </div>
              {/* 加賀屋工場 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-md">
                    <Factory className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="font-black text-slate-800 text-base">加賀屋工場</h3>
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">{kagaUsers.length}名</span>
                </div>
                {kagaUsers.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                    <Factory className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">加賀屋工場所属のスタッフがいません</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {kagaUsers.map(u => (
                      <MfgStaffCard key={u.id} u={u}
                        accentFrom="from-orange-400" accentTo="to-orange-600"
                        borderColor="border-orange-100" hoverBg="bg-orange-50/60"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
