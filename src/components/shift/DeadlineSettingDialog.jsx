import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Save, CalendarRange, FileText, AlertTriangle, ArrowRight, Plus, Trash2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, addMonths, differenceInDays, isPast, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAll, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';

export default function DeadlineSettingDialog({ open, onClose, onOpenChange, storeId, storeName, mode = 'submission', editingDeadlineId: editingIdProp = null, initialMode = 'add' }) {
  const queryClient = useQueryClient();
  const handleClose = (val) => {
    if (onOpenChange) onOpenChange(val);
    if (onClose && !val) onClose();
  };

  const [formData, setFormData] = useState({
    target_month_start: '',
    target_month_end: '',
    deadline_date: '',
    confirm_deadline_date: '',
    confirm_deadline_description: '',
    description: ''
  });
  const [existingDeadlineId, setExistingDeadlineId] = useState(null);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);

  const { data: deadlines = [] } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
    enabled: open,
  });

  // 現在の店舗の期限一覧（直近順）
  const storeDeadlines = useMemo(() => {
    if (!storeId) return [];
    return deadlines
      .filter(d => d.store_id === storeId)
      .sort((a, b) => {
        const dateA = a.target_month_end || a.deadline_date || '';
        const dateB = b.target_month_end || b.deadline_date || '';
        return dateB.localeCompare(dateA);
      });
  }, [deadlines, storeId]);

  // 直近の有効な期限
  const activeDeadline = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return storeDeadlines.find(d => d.target_month_end >= today);
  }, [storeDeadlines]);

  useEffect(() => {
    if (open && storeId) {
      // 編集モード：特定の期限を編集
      if (initialMode === 'edit' && editingIdProp) {
        const target = deadlines.find(d => d.id === editingIdProp);
        if (target) {
          setIsAddMode(false);
          setExistingDeadlineId(target.id);
          setFormData({
            target_month_start: target.target_month_start || '',
            target_month_end: target.target_month_end || '',
            deadline_date: target.deadline_date || target.submission_deadline_date || '',
            confirm_deadline_date: target.confirm_deadline_date || '',
            confirm_deadline_description: target.confirm_deadline_description || '',
            description: target.description || ''
          });
          return;
        }
      }
      // 追加モード：新規追加フォームを表示
      if (initialMode === 'add') {
        setIsAddMode(true);
        setExistingDeadlineId(null);
        const today = new Date();
        const nextMonth = addMonths(today, 1);
        const nextMonthYear = nextMonth.getFullYear();
        const nextMonthNum = nextMonth.getMonth() + 1;
        const firstDay = new Date(nextMonthYear, nextMonthNum - 1, 1);
        const lastDay = new Date(nextMonthYear, nextMonthNum, 0);
        setFormData({
          target_month_start: format(firstDay, 'yyyy-MM-dd'),
          target_month_end: format(lastDay, 'yyyy-MM-dd'),
          deadline_date: format(today, 'yyyy-MM-dd'),
          confirm_deadline_date: '',
          confirm_deadline_description: '',
          description: `${nextMonthNum}月分のシフト希望`
        });
        return;
      }
      // デフォルト：既存の期限を読み込み
      setIsAddMode(false);
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      const existing = deadlines.find(d => d.store_id === storeId && d.target_month_end >= todayStr);
      if (existing) {
        setExistingDeadlineId(existing.id);
        setFormData({
          target_month_start: existing.target_month_start || '',
          target_month_end: existing.target_month_end || '',
          deadline_date: existing.deadline_date || existing.submission_deadline_date || '',
          confirm_deadline_date: existing.confirm_deadline_date || '',
          confirm_deadline_description: existing.confirm_deadline_description || '',
          description: existing.description || ''
        });
      } else {
        setExistingDeadlineId(null);
        const nextMonth = addMonths(today, 1);
        const nextMonthYear = nextMonth.getFullYear();
        const nextMonthNum = nextMonth.getMonth() + 1;
        const firstDay = new Date(nextMonthYear, nextMonthNum - 1, 1);
        const lastDay = new Date(nextMonthYear, nextMonthNum, 0);
        setFormData({
          target_month_start: format(firstDay, 'yyyy-MM-dd'),
          target_month_end: format(lastDay, 'yyyy-MM-dd'),
          deadline_date: format(today, 'yyyy-MM-dd'),
          confirm_deadline_date: '',
          confirm_deadline_description: '',
          description: `${nextMonthNum}月分のシフト希望`
        });
      }
    }
  }, [open, storeId, deadlines, editingIdProp, initialMode]);

  const handleSelectDeadline = (deadline) => {
    setExistingDeadlineId(deadline.id);
    setIsAddMode(false);
    setFormData({
      target_month_start: deadline.target_month_start || '',
      target_month_end: deadline.target_month_end || '',
      deadline_date: deadline.deadline_date || deadline.submission_deadline_date || '',
      confirm_deadline_date: deadline.confirm_deadline_date || '',
      confirm_deadline_description: deadline.confirm_deadline_description || '',
      description: deadline.description || ''
    });
  };

  const handleAddNew = () => {
    setIsAddMode(true);
    setExistingDeadlineId(null);
    const today = new Date();
    const nextMonth = addMonths(today, 1);
    const nextMonthYear = nextMonth.getFullYear();
    const nextMonthNum = nextMonth.getMonth() + 1;
    const firstDay = new Date(nextMonthYear, nextMonthNum - 1, 1);
    const lastDay = new Date(nextMonthYear, nextMonthNum, 0);
    setFormData({
      target_month_start: format(firstDay, 'yyyy-MM-dd'),
      target_month_end: format(lastDay, 'yyyy-MM-dd'),
      deadline_date: format(today, 'yyyy-MM-dd'),
      confirm_deadline_date: '',
      confirm_deadline_description: '',
      description: `${nextMonthNum}月分のシフト希望`
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const saveData = {
        target_month_start: data.target_month_start,
        target_month_end: data.target_month_end,
        deadline_date: data.deadline_date,
        submission_deadline_date: data.deadline_date,
        description: data.description,
        confirm_deadline_date: data.confirm_deadline_date || null,
        confirm_deadline_description: data.confirm_deadline_description || null,
      };
      if (existingDeadlineId) {
        return updateRecord('ShiftDeadline', existingDeadlineId, saveData);
      } else {
        return insertRecord('ShiftDeadline', {
          ...saveData,
          store_id: storeId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success(existingDeadlineId ? '期限設定を更新しました' : '期限設定を追加しました');
      setIsAddMode(false);
    },
    onError: (error) => {
      toast.error('期限設定に失敗しました: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return deleteRecord('ShiftDeadline', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('期限設定を削除しました');
      setExistingDeadlineId(null);
      setIsAddMode(false);
    },
    onError: (error) => {
      toast.error('削除に失敗しました: ' + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.target_month_start || !formData.target_month_end || !formData.deadline_date) {
      toast.error('対象期間と提出期限を入力してください');
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleDelete = (id) => {
    if (window.confirm('この期限設定を削除しますか？')) {
      deleteMutation.mutate(id);
    }
  };

  const periodDays = useMemo(() => {
    if (formData.target_month_start && formData.target_month_end) {
      return differenceInDays(parseISO(formData.target_month_end), parseISO(formData.target_month_start)) + 1;
    }
    return 0;
  }, [formData.target_month_start, formData.target_month_end]);

  const daysUntilDeadline = useMemo(() => {
    if (formData.deadline_date) {
      const deadline = parseISO(formData.deadline_date);
      if (isPast(deadline) && !isToday(deadline)) return -1;
      return differenceInDays(deadline, new Date());
    }
    return null;
  }, [formData.deadline_date]);

  const daysUntilConfirmDeadline = useMemo(() => {
    if (formData.confirm_deadline_date) {
      const deadline = parseISO(formData.confirm_deadline_date);
      if (isPast(deadline) && !isToday(deadline)) return -1;
      return differenceInDays(deadline, new Date());
    }
    return null;
  }, [formData.confirm_deadline_date]);

  // 対象期間のタイトルを生成
  const getDeadlineTitle = (d) => {
    if (d.description) return d.description;
    if (d.target_month_start && d.target_month_end) {
      try {
        return `${format(parseISO(d.target_month_start), 'M月d日', { locale: ja })}〜${format(parseISO(d.target_month_end), 'M月d日', { locale: ja })}`;
      } catch { return '期限設定'; }
    }
    return '期限設定';
  };

  const titleText = mode === 'confirm' 
    ? `${storeName ? storeName + ' - ' : ''}シフト確定締切${existingDeadlineId ? 'を編集' : 'を設定'}`
    : `${storeName ? storeName + ' - ' : ''}期限設定`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              mode === 'confirm' 
                ? 'bg-gradient-to-br from-orange-500 to-red-600' 
                : 'bg-gradient-to-br from-indigo-500 to-purple-600'
            }`}>
              <Calendar className="w-4 h-4 text-white" />
            </div>
            {titleText}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            シフト希望の対象期間・提出期限・確定締切を管理します
          </DialogDescription>
        </DialogHeader>

        {/* 既存の期限一覧 */}
        {storeDeadlines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">設定済みの期限</span>
              <button
                onClick={() => setShowAllDeadlines(!showAllDeadlines)}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                {showAllDeadlines ? '閉じる' : `全${storeDeadlines.length}件を表示`}
                {showAllDeadlines ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {(showAllDeadlines ? storeDeadlines : storeDeadlines.slice(0, 2)).map((d) => {
                const isActive = existingDeadlineId === d.id && !isAddMode;
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const isExpired = d.target_month_end < todayStr;
                return (
                  <div
                    key={d.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all text-sm ${
                      isActive 
                        ? 'bg-indigo-50 border-2 border-indigo-400 shadow-sm' 
                        : isExpired
                        ? 'bg-gray-50 border border-gray-200 opacity-60 hover:opacity-80'
                        : 'bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                    onClick={() => handleSelectDeadline(d)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-slate-800 truncate">
                        {getDeadlineTitle(d)}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        提出: {d.deadline_date ? format(parseISO(d.deadline_date), 'M/d', { locale: ja }) : '-'}
                        {d.confirm_deadline_date && (
                          <>
                            <span className="mx-1">|</span>
                            <CheckCircle className="w-3 h-3 text-orange-500" />
                            確定: {format(parseISO(d.confirm_deadline_date), 'M/d', { locale: ja })}
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 新規追加ボタン */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddNew}
          className={`w-full h-9 text-xs border-dashed ${isAddMode ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'}`}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          新しい期限を追加
        </Button>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* 対象期間セクション */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
            <div className="flex items-center gap-2 mb-2.5">
              <CalendarRange className="w-4.5 h-4.5 text-blue-600" />
              <span className="text-sm font-bold text-blue-800">対象期間</span>
              {periodDays > 0 && (
                <span className="ml-auto text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  {periodDays}日間
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label className="text-xs font-medium text-blue-700 mb-1 block">開始日</Label>
                <Input
                  type="date"
                  value={formData.target_month_start}
                  onChange={(e) => setFormData({...formData, target_month_start: e.target.value})}
                  required
                  className="h-9 bg-white border-blue-200 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-blue-700 mb-1 block">終了日</Label>
                <Input
                  type="date"
                  value={formData.target_month_end}
                  onChange={(e) => setFormData({...formData, target_month_end: e.target.value})}
                  required
                  className="h-9 bg-white border-blue-200 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
            {formData.target_month_start && formData.target_month_end && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-blue-600">
                <span>{format(parseISO(formData.target_month_start), 'M月d日(E)', { locale: ja })}</span>
                <ArrowRight className="w-3 h-3" />
                <span>{format(parseISO(formData.target_month_end), 'M月d日(E)', { locale: ja })}</span>
              </div>
            )}
          </div>

          {/* 提出期限セクション */}
          <div className={`p-3.5 rounded-xl border ${
            daysUntilDeadline !== null && daysUntilDeadline < 0
              ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
              : daysUntilDeadline !== null && daysUntilDeadline <= 3
              ? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200'
              : 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200'
          }`}>
            <div className="flex items-center gap-2 mb-2.5">
              <Clock className={`w-4.5 h-4.5 ${
                daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'text-red-600' :
                daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-orange-600' : 'text-emerald-600'
              }`} />
              <span className={`text-sm font-bold ${
                daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'text-red-800' :
                daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-orange-800' : 'text-emerald-800'
              }`}>シフト提出期限</span>
              {daysUntilDeadline !== null && (
                <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                  daysUntilDeadline < 0 ? 'text-red-600 bg-red-100' :
                  daysUntilDeadline === 0 ? 'text-orange-600 bg-orange-100' :
                  daysUntilDeadline <= 3 ? 'text-yellow-700 bg-yellow-100' : 'text-emerald-600 bg-emerald-100'
                }`}>
                  {daysUntilDeadline < 0 ? '期限切れ' : daysUntilDeadline === 0 ? '本日締切' : `残り${daysUntilDeadline}日`}
                </span>
              )}
            </div>
            <div>
              <Label className={`text-xs font-medium mb-1 block ${
                daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'text-red-700' :
                daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-orange-700' : 'text-emerald-700'
              }`}>締切日</Label>
              <Input
                type="date"
                value={formData.deadline_date}
                onChange={(e) => setFormData({...formData, deadline_date: e.target.value})}
                required
                className={`h-9 bg-white text-sm ${
                  daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'border-red-200 focus:border-red-500' :
                  daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'border-orange-200 focus:border-orange-500' : 'border-emerald-200 focus:border-emerald-500'
                }`}
              />
              {formData.deadline_date && (
                <p className="text-xs text-slate-500 mt-1">
                  {format(parseISO(formData.deadline_date), 'yyyy年M月d日(E)', { locale: ja })} までに提出
                </p>
              )}
            </div>
          </div>

          {/* シフト確定締切セクション（任意） */}
          <div className={`p-3.5 rounded-xl border ${
            daysUntilConfirmDeadline !== null && daysUntilConfirmDeadline < 0
              ? 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200'
              : daysUntilConfirmDeadline !== null && daysUntilConfirmDeadline <= 3
              ? 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200'
              : 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200'
          }`}>
            <div className="flex items-center gap-2 mb-2.5">
              <CheckCircle className={`w-4.5 h-4.5 ${
                daysUntilConfirmDeadline !== null && daysUntilConfirmDeadline < 0 ? 'text-red-600' :
                daysUntilConfirmDeadline !== null && daysUntilConfirmDeadline <= 3 ? 'text-orange-600' : 'text-orange-500'
              }`} />
              <span className={`text-sm font-bold ${
                daysUntilConfirmDeadline !== null && daysUntilConfirmDeadline < 0 ? 'text-red-800' :
                daysUntilConfirmDeadline !== null && daysUntilConfirmDeadline <= 3 ? 'text-orange-800' : 'text-orange-700'
              }`}>シフト確定締切（任意）</span>
              {daysUntilConfirmDeadline !== null && (
                <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                  daysUntilConfirmDeadline < 0 ? 'text-red-600 bg-red-100' :
                  daysUntilConfirmDeadline === 0 ? 'text-orange-600 bg-orange-100' :
                  daysUntilConfirmDeadline <= 3 ? 'text-yellow-700 bg-yellow-100' : 'text-orange-600 bg-orange-100'
                }`}>
                  {daysUntilConfirmDeadline < 0 ? '期限切れ' : daysUntilConfirmDeadline === 0 ? '本日締切' : `残り${daysUntilConfirmDeadline}日`}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-medium text-orange-700 mb-1 block">確定締切日</Label>
                <Input
                  type="date"
                  value={formData.confirm_deadline_date}
                  onChange={(e) => setFormData({...formData, confirm_deadline_date: e.target.value})}
                  className="h-9 bg-white border-orange-200 focus:border-orange-500 text-sm"
                />
                {formData.confirm_deadline_date && (
                  <p className="text-xs text-slate-500 mt-1">
                    {format(parseISO(formData.confirm_deadline_date), 'yyyy年M月d日(E)', { locale: ja })} までに確定
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs font-medium text-orange-700 mb-1 block">確定締切の説明（任意）</Label>
                <Input
                  type="text"
                  value={formData.confirm_deadline_description}
                  onChange={(e) => setFormData({...formData, confirm_deadline_description: e.target.value})}
                  placeholder="例: 管理者がシフトを確定する期限"
                  className="h-9 bg-white border-orange-200 focus:border-orange-400 text-sm"
                />
              </div>
            </div>
          </div>

          {/* 説明セクション */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-50 to-gray-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-2.5">
              <FileText className="w-4.5 h-4.5 text-slate-600" />
              <span className="text-sm font-bold text-slate-700">タイトル・説明（任意）</span>
            </div>
            <Input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="例: 3月分のシフト希望"
              className="h-9 bg-white border-slate-200 focus:border-slate-400 text-sm"
            />
            <p className="text-[10px] text-slate-400 mt-1">※ アイコンに表示されるタイトルになります</p>
          </div>

          {/* 警告メッセージ */}
          {formData.deadline_date && formData.target_month_start && formData.deadline_date >= formData.target_month_start && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">提出期限は対象期間の開始日より前に設定することを推奨します</p>
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-3 pt-1">
            <Button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="flex-1 h-10 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium text-sm"
            >
              {saveMutation.isPending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saveMutation.isPending ? '保存中...' : existingDeadlineId ? '更新する' : '期限を設定'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => handleClose(false)}
              className="flex-1 h-10 text-sm"
            >
              キャンセル
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
