import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Save, CalendarRange, FileText, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, addMonths, differenceInDays, isPast, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAll, insertRecord, updateRecord } from '@/api/supabaseHelpers';

export default function DeadlineSettingDialog({ open, onClose, onOpenChange, storeId, storeName }) {
  const queryClient = useQueryClient();
  const handleClose = (val) => {
    if (onOpenChange) onOpenChange(val);
    if (onClose && !val) onClose();
  };

  const [formData, setFormData] = useState({
    target_month_start: '',
    target_month_end: '',
    deadline_date: '',
    description: ''
  });
  const [existingDeadlineId, setExistingDeadlineId] = useState(null);

  const { data: deadlines = [] } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
    enabled: open,
  });

  useEffect(() => {
    if (open && storeId) {
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      const existing = deadlines.find(d => d.store_id === storeId && d.target_month_end >= todayStr);
      if (existing) {
        setExistingDeadlineId(existing.id);
        setFormData({
          target_month_start: existing.target_month_start || '',
          target_month_end: existing.target_month_end || '',
          deadline_date: existing.deadline_date || existing.submission_deadline_date || '',
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
          description: `${nextMonthNum}月分のシフト希望`
        });
      }
    }
  }, [open, storeId, deadlines]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existingDeadlineId) {
        return updateRecord('ShiftDeadline', existingDeadlineId, {
          target_month_start: data.target_month_start,
          target_month_end: data.target_month_end,
          deadline_date: data.deadline_date,
          submission_deadline_date: data.deadline_date,
          description: data.description,
        });
      } else {
        return insertRecord('ShiftDeadline', {
          ...data,
          submission_deadline_date: data.deadline_date,
          store_id: storeId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success(existingDeadlineId ? '提出期限を更新しました' : '提出期限を設定しました');
      handleClose(false);
      setFormData({ target_month_start: '', target_month_end: '', deadline_date: '', description: '' });
      setExistingDeadlineId(null);
    },
    onError: (error) => {
      toast.error('期限設定に失敗しました: ' + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.target_month_start || !formData.target_month_end || !formData.deadline_date) {
      toast.error('すべての日付を入力してください');
      return;
    }
    saveMutation.mutate(formData);
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

  const titleText = storeName 
    ? `${storeName} - 提出期限${existingDeadlineId ? 'を編集' : 'を設定'}`
    : `シフト提出期限${existingDeadlineId ? 'を編集' : 'を設定'}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            {titleText}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            シフト希望の対象期間と提出期限を設定します
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* 対象期間セクション */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <CalendarRange className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold text-blue-800">対象期間</span>
              {periodDays > 0 && (
                <span className="ml-auto text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  {periodDays}日間
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-blue-700 mb-1 block">開始日</Label>
                <Input
                  type="date"
                  value={formData.target_month_start}
                  onChange={(e) => setFormData({...formData, target_month_start: e.target.value})}
                  required
                  className="h-10 bg-white border-blue-200 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-blue-700 mb-1 block">終了日</Label>
                <Input
                  type="date"
                  value={formData.target_month_end}
                  onChange={(e) => setFormData({...formData, target_month_end: e.target.value})}
                  required
                  className="h-10 bg-white border-blue-200 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
            {formData.target_month_start && formData.target_month_end && (
              <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                <span>{format(parseISO(formData.target_month_start), 'M月d日(E)', { locale: ja })}</span>
                <ArrowRight className="w-3 h-3" />
                <span>{format(parseISO(formData.target_month_end), 'M月d日(E)', { locale: ja })}</span>
              </div>
            )}
          </div>

          {/* 提出期限セクション */}
          <div className={`p-4 rounded-xl border ${
            daysUntilDeadline !== null && daysUntilDeadline < 0
              ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'
              : daysUntilDeadline !== null && daysUntilDeadline <= 3
              ? 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200'
              : 'bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className={`w-5 h-5 ${
                daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'text-red-600' :
                daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-orange-600' : 'text-emerald-600'
              }`} />
              <span className={`text-sm font-bold ${
                daysUntilDeadline !== null && daysUntilDeadline < 0 ? 'text-red-800' :
                daysUntilDeadline !== null && daysUntilDeadline <= 3 ? 'text-orange-800' : 'text-emerald-800'
              }`}>提出期限</span>
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
                className={`h-10 bg-white text-sm ${
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

          {/* 説明セクション */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 to-gray-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-slate-600" />
              <span className="text-sm font-bold text-slate-700">説明（任意）</span>
            </div>
            <Input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="例: 3月分のシフト希望"
              className="h-10 bg-white border-slate-200 focus:border-slate-400 text-sm"
            />
          </div>

          {/* 警告メッセージ */}
          {formData.deadline_date && formData.target_month_start && formData.deadline_date >= formData.target_month_start && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">提出期限は対象期間の開始日より前に設定することを推奨します</p>
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-3 pt-2">
            <Button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="flex-1 h-11 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium"
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
              className="flex-1 h-11"
            >
              キャンセル
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
