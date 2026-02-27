import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, Clock, Save, CheckCircle, AlertTriangle, ArrowRight, Plus, Trash2, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, addMonths, differenceInDays, isPast, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { cn } from '@/lib/utils';

// インライン編集フォーム（1つの期限を編集）
function DeadlineEditForm({ deadline, storeId, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const isNew = !deadline;

  const [formData, setFormData] = useState(() => {
    if (deadline) {
      return {
        target_month_start: deadline.target_month_start || '',
        target_month_end: deadline.target_month_end || '',
        deadline_date: deadline.deadline_date || deadline.submission_deadline_date || '',
        confirm_deadline_date: deadline.confirm_deadline_date || '',
        description: deadline.description || ''
      };
    }
    // 新規追加のデフォルト値
    const today = new Date();
    const nextMonth = addMonths(today, 1);
    const firstDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
    return {
      target_month_start: format(firstDay, 'yyyy-MM-dd'),
      target_month_end: format(lastDay, 'yyyy-MM-dd'),
      deadline_date: format(today, 'yyyy-MM-dd'),
      confirm_deadline_date: '',
      description: `${nextMonth.getMonth() + 1}月分のシフト希望`
    };
  });

  const periodDays = useMemo(() => {
    if (formData.target_month_start && formData.target_month_end) {
      return differenceInDays(parseISO(formData.target_month_end), parseISO(formData.target_month_start)) + 1;
    }
    return 0;
  }, [formData.target_month_start, formData.target_month_end]);

  const daysUntilDeadline = useMemo(() => {
    if (formData.deadline_date) {
      const dl = parseISO(formData.deadline_date);
      if (isPast(dl) && !isToday(dl)) return -1;
      return differenceInDays(dl, new Date());
    }
    return null;
  }, [formData.deadline_date]);

  const daysUntilConfirm = useMemo(() => {
    if (formData.confirm_deadline_date) {
      const dl = parseISO(formData.confirm_deadline_date);
      if (isPast(dl) && !isToday(dl)) return -1;
      return differenceInDays(dl, new Date());
    }
    return null;
  }, [formData.confirm_deadline_date]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const saveData = {
        target_month_start: formData.target_month_start,
        target_month_end: formData.target_month_end,
        deadline_date: formData.deadline_date,
        submission_deadline_date: formData.deadline_date,
        description: formData.description,
        confirm_deadline_date: formData.confirm_deadline_date || null,
      };
      if (deadline?.id) {
        return updateRecord('ShiftDeadline', deadline.id, saveData);
      } else {
        return insertRecord('ShiftDeadline', { ...saveData, store_id: storeId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success(deadline?.id ? '期限を更新しました' : '期限を追加しました');
      if (onSaved) onSaved();
    },
    onError: (err) => {
      toast.error('保存に失敗しました: ' + err.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRecord('ShiftDeadline', deadline.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('期限を削除しました');
      if (onClose) onClose();
    },
    onError: (err) => {
      toast.error('削除に失敗しました: ' + err.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.target_month_start || !formData.target_month_end || !formData.deadline_date) {
      toast.error('対象期間と提出期限は必須です');
      return;
    }
    saveMutation.mutate();
  };

  const handleDelete = () => {
    if (window.confirm('この期限設定を削除しますか？')) {
      deleteMutation.mutate();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-white rounded-xl border-2 border-indigo-200 shadow-sm">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          {isNew ? '新しい期限を追加' : '期限を編集'}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 対象期間 */}
      <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
        <div className="flex items-center gap-1.5 mb-2">
          <Calendar className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-bold text-blue-700">対象期間</span>
          {periodDays > 0 && (
            <span className="ml-auto text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
              {periodDays}日間
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium text-blue-600 mb-0.5 block">開始日</label>
            <Input
              type="date"
              value={formData.target_month_start}
              onChange={(e) => setFormData({...formData, target_month_start: e.target.value})}
              required
              className="h-8 text-xs bg-white border-blue-200 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-blue-600 mb-0.5 block">終了日</label>
            <Input
              type="date"
              value={formData.target_month_end}
              onChange={(e) => setFormData({...formData, target_month_end: e.target.value})}
              required
              className="h-8 text-xs bg-white border-blue-200 focus:border-blue-400"
            />
          </div>
        </div>
        {formData.target_month_start && formData.target_month_end && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600">
            <span>{format(parseISO(formData.target_month_start), 'M月d日(E)', { locale: ja })}</span>
            <ArrowRight className="w-2.5 h-2.5" />
            <span>{format(parseISO(formData.target_month_end), 'M月d日(E)', { locale: ja })}</span>
          </div>
        )}
      </div>

      {/* 提出期限 */}
      <div className={cn(
        "p-2.5 rounded-lg border",
        daysUntilDeadline !== null && daysUntilDeadline < 0
          ? "bg-red-50 border-red-200"
          : daysUntilDeadline !== null && daysUntilDeadline <= 3
          ? "bg-orange-50 border-orange-200"
          : "bg-emerald-50 border-emerald-200"
      )}>
        <div className="flex items-center gap-1.5 mb-2">
          <Clock className={cn("w-3.5 h-3.5",
            daysUntilDeadline !== null && daysUntilDeadline < 0 ? "text-red-600" :
            daysUntilDeadline !== null && daysUntilDeadline <= 3 ? "text-orange-600" : "text-emerald-600"
          )} />
          <span className={cn("text-xs font-bold",
            daysUntilDeadline !== null && daysUntilDeadline < 0 ? "text-red-700" :
            daysUntilDeadline !== null && daysUntilDeadline <= 3 ? "text-orange-700" : "text-emerald-700"
          )}>シフト提出期限</span>
          {daysUntilDeadline !== null && (
            <span className={cn("ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              daysUntilDeadline < 0 ? "text-red-600 bg-red-100" :
              daysUntilDeadline === 0 ? "text-orange-600 bg-orange-100" :
              daysUntilDeadline <= 3 ? "text-yellow-700 bg-yellow-100" : "text-emerald-600 bg-emerald-100"
            )}>
              {daysUntilDeadline < 0 ? '期限切れ' : daysUntilDeadline === 0 ? '本日' : `残り${daysUntilDeadline}日`}
            </span>
          )}
        </div>
        <Input
          type="date"
          value={formData.deadline_date}
          onChange={(e) => setFormData({...formData, deadline_date: e.target.value})}
          required
          className="h-8 text-xs bg-white border-slate-200 focus:border-indigo-400"
        />
        {formData.deadline_date && (
          <p className="text-[10px] text-slate-500 mt-1">
            {format(parseISO(formData.deadline_date), 'yyyy年M月d日(E)', { locale: ja })} までに提出
          </p>
        )}
      </div>

      {/* シフト確定締切 */}
      <div className={cn(
        "p-2.5 rounded-lg border",
        daysUntilConfirm !== null && daysUntilConfirm < 0
          ? "bg-red-50 border-red-200"
          : daysUntilConfirm !== null && daysUntilConfirm <= 3
          ? "bg-orange-50 border-orange-200"
          : "bg-amber-50 border-amber-200"
      )}>
        <div className="flex items-center gap-1.5 mb-2">
          <CheckCircle className={cn("w-3.5 h-3.5",
            daysUntilConfirm !== null && daysUntilConfirm < 0 ? "text-red-600" :
            daysUntilConfirm !== null && daysUntilConfirm <= 3 ? "text-orange-600" : "text-amber-500"
          )} />
          <span className={cn("text-xs font-bold",
            daysUntilConfirm !== null && daysUntilConfirm < 0 ? "text-red-700" :
            daysUntilConfirm !== null && daysUntilConfirm <= 3 ? "text-orange-700" : "text-amber-700"
          )}>シフト確定締切（任意）</span>
          {daysUntilConfirm !== null && (
            <span className={cn("ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full",
              daysUntilConfirm < 0 ? "text-red-600 bg-red-100" :
              daysUntilConfirm === 0 ? "text-orange-600 bg-orange-100" :
              daysUntilConfirm <= 3 ? "text-yellow-700 bg-yellow-100" : "text-amber-600 bg-amber-100"
            )}>
              {daysUntilConfirm < 0 ? '期限切れ' : daysUntilConfirm === 0 ? '本日' : `残り${daysUntilConfirm}日`}
            </span>
          )}
        </div>
        <Input
          type="date"
          value={formData.confirm_deadline_date}
          onChange={(e) => setFormData({...formData, confirm_deadline_date: e.target.value})}
          className="h-8 text-xs bg-white border-slate-200 focus:border-amber-400"
        />
        {formData.confirm_deadline_date && (
          <p className="text-[10px] text-slate-500 mt-1">
            {format(parseISO(formData.confirm_deadline_date), 'yyyy年M月d日(E)', { locale: ja })} までに確定
          </p>
        )}
      </div>

      {/* タイトル */}
      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-1.5 mb-2">
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-bold text-slate-600">タイトル（任意）</span>
        </div>
        <Input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="例: 3月分のシフト希望"
          className="h-8 text-xs bg-white border-slate-200 focus:border-slate-400"
        />
      </div>

      {/* 警告 */}
      {formData.deadline_date && formData.target_month_start && formData.deadline_date >= formData.target_month_start && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <p className="text-[10px] text-amber-700">提出期限は対象期間の開始日より前に設定することを推奨します</p>
        </div>
      )}

      {/* ボタン */}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          size="sm"
          className="flex-1 h-8 text-xs bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
        >
          {saveMutation.isPending ? (
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent mr-1.5" />
          ) : (
            <Save className="w-3 h-3 mr-1.5" />
          )}
          {saveMutation.isPending ? '保存中...' : isNew ? '追加する' : '更新する'}
        </Button>
        {!isNew && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="h-8 text-xs text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            削除
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 text-xs text-slate-500"
        >
          閉じる
        </Button>
      </div>
    </form>
  );
}

// メインコンポーネント：期限一覧 + インライン編集
export default function InlineDeadlineEditor({ deadlines, storeId, storeName, type = 'submission', isAdmin = false }) {
  const [expandedId, setExpandedId] = useState(null); // 展開中の期限ID
  const [showAddForm, setShowAddForm] = useState(false);
  const queryClient = useQueryClient();

  // 選択中の店舗の期限一覧
  const storeDeadlines = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return (deadlines || [])
      .filter(d => d.store_id === storeId && d.target_month_end >= todayStr)
      .sort((a, b) => (a.deadline_date || '').localeCompare(b.deadline_date || ''));
  }, [deadlines, storeId]);

  const handleToggle = (id) => {
    if (!isAdmin) return;
    setExpandedId(expandedId === id ? null : id);
    setShowAddForm(false);
  };

  const handleShowAdd = () => {
    setShowAddForm(true);
    setExpandedId(null);
  };

  return (
    <div className="w-full">
      {/* ヘッダー */}
      <div className="p-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          {type === 'confirm' ? (
            <CheckCircle className="w-4 h-4 text-orange-500" />
          ) : (
            <Calendar className="w-4 h-4 text-indigo-500" />
          )}
          {type === 'confirm' ? 'シフト確定締切一覧' : 'シフト提出期限一覧'}
        </h3>
        {storeName && (
          <p className="text-[10px] text-slate-400 mt-0.5">{storeName}</p>
        )}
      </div>

      {/* 期限一覧 */}
      <div className="max-h-[60vh] overflow-y-auto">
        {storeDeadlines.length > 0 ? (
          <div className="p-2 space-y-2">
            {storeDeadlines.map((d) => {
              const isExpanded = expandedId === d.id;
              const deadlineDateStr = type === 'confirm' && d.confirm_deadline_date
                ? d.confirm_deadline_date
                : d.deadline_date;
              const dDate = deadlineDateStr ? parseISO(deadlineDateStr) : null;
              const dLeft = dDate ? differenceInDays(dDate, new Date()) : null;
              const expired = dDate && isPast(dDate) && !isToday(dDate);
              const urgent = dLeft !== null && dLeft <= 3 && !expired;
              const todayDl = dDate && isToday(dDate);

              // 対象期間テキスト
              const periodText = d.target_month_start && d.target_month_end
                ? `${format(parseISO(d.target_month_start), 'M/d(E)', { locale: ja })}〜${format(parseISO(d.target_month_end), 'M/d(E)', { locale: ja })}`
                : d.description || '';

              return (
                <div key={d.id}>
                  {/* 期限カード（クリックで展開） */}
                  <div
                    onClick={() => handleToggle(d.id)}
                    className={cn(
                      "rounded-xl text-sm transition-all",
                      isAdmin && "cursor-pointer",
                      isExpanded
                        ? "ring-2 ring-indigo-300"
                        : expired
                        ? "opacity-60"
                        : ""
                    )}
                  >
                    <div className={cn(
                      "p-3 rounded-xl border",
                      isExpanded
                        ? "bg-indigo-50 border-indigo-200"
                        : expired
                        ? "bg-gray-50 border-gray-200"
                        : todayDl
                        ? "bg-red-50 border-red-200"
                        : urgent
                        ? "bg-orange-50 border-orange-200"
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                    )}>
                      {/* 上段：対象期間 */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-700">{periodText}</span>
                        <div className="flex items-center gap-1.5">
                          {dLeft !== null && (
                            <span className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                              expired ? "text-gray-500 bg-gray-100" :
                              todayDl ? "text-red-600 bg-red-100 animate-pulse" :
                              urgent ? "text-orange-600 bg-orange-100" :
                              "text-emerald-600 bg-emerald-100"
                            )}>
                              {expired ? '期限切れ' : todayDl ? '本日！' : `残り${dLeft}日`}
                            </span>
                          )}
                          {isAdmin && (
                            <span className="text-[10px] text-slate-400">
                              {isExpanded ? '▲ 閉じる' : '▼ 編集'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 下段：提出期限・確定締切 */}
                      <div className="flex items-center gap-3 text-[11px]">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-500" />
                          <span className="text-slate-500">提出:</span>
                          <span className="font-semibold text-slate-700">
                            {d.deadline_date ? format(parseISO(d.deadline_date), 'M/d(E)', { locale: ja }) : '未設定'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-orange-500" />
                          <span className="text-slate-500">確定:</span>
                          <span className="font-semibold text-slate-700">
                            {d.confirm_deadline_date ? format(parseISO(d.confirm_deadline_date), 'M/d(E)', { locale: ja }) : '未設定'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 展開時のインライン編集フォーム */}
                  {isExpanded && isAdmin && (
                    <div className="mt-1.5">
                      <DeadlineEditForm
                        deadline={d}
                        storeId={storeId}
                        onClose={() => setExpandedId(null)}
                        onSaved={() => setExpandedId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">設定された期限はありません</p>
            {isAdmin && (
              <p className="text-[10px] text-slate-400 mt-1">下のボタンから追加できます</p>
            )}
          </div>
        )}

        {/* 追加フォーム */}
        {showAddForm && isAdmin && (
          <div className="px-2 pb-2">
            <DeadlineEditForm
              deadline={null}
              storeId={storeId}
              onClose={() => setShowAddForm(false)}
              onSaved={() => setShowAddForm(false)}
            />
          </div>
        )}
      </div>

      {/* 追加ボタン */}
      {isAdmin && !showAddForm && (
        <div className="p-2 border-t border-slate-100">
          <button
            onClick={handleShowAdd}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 p-2.5 rounded-xl text-xs font-semibold transition-all",
              "text-indigo-600 hover:bg-indigo-50 border-2 border-dashed border-indigo-200 hover:border-indigo-300"
            )}
          >
            <Plus className="w-4 h-4" />
            期限を追加
          </button>
        </div>
      )}
    </div>
  );
}
