import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Shield, Plus, Trash2, Edit, Save, X, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { format, parseISO, isPast, isFuture, isToday, differenceInDays } from 'date-fns';
import { ja } from 'date-fns/locale';
import { fetchAll, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';

export default function ShiftDeadlineManagement() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    target_month_start: '',
    target_month_end: '',
    deadline_date: '',
    description: '',
    store_id: ''
  });

  const { user } = useAuth();

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: () => fetchAll('Store'),
  });

  const { data: deadlines = [], isLoading } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => insertRecord('ShiftDeadline', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('提出期限を追加しました');
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRecord('ShiftDeadline', id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('提出期限を更新しました');
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRecord('ShiftDeadline', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('提出期限を削除しました');
    },
  });

  const resetForm = () => {
    setFormData({
      target_month_start: '',
      target_month_end: '',
      deadline_date: '',
      description: '',
      store_id: user?.store_ids?.[0] || ''
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.target_month_start || !formData.target_month_end || !formData.deadline_date) {
      toast.error('すべての日付を入力してください');
      return;
    }

    // バリデーション: 開始日 <= 終了日
    if (formData.target_month_start > formData.target_month_end) {
      toast.error('対象期間の開始日は終了日より前である必要があります');
      return;
    }

    // バリデーション: 提出期限は対象期間の開始日より前
    if (formData.deadline_date >= formData.target_month_start) {
      toast.error('提出期限は対象期間の開始日より前に設定してください');
      return;
    }

    const dataToSubmit = {
      ...formData,
      store_id: formData.store_id || user?.store_ids?.[0]
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const handleEdit = (deadline) => {
    setFormData({
      target_month_start: deadline.target_month_start,
      target_month_end: deadline.target_month_end,
      deadline_date: deadline.deadline_date,
      description: deadline.description || '',
      store_id: deadline.store_id
    });
    setEditingId(deadline.id);
    setIsAdding(true);
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const isAdminOrManager = !user ? true : (user?.role === 'admin' || user?.user_role === 'admin' || user?.role === 'manager' || user?.user_role === 'manager');

  if (!isAdminOrManager) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">アクセス権限がありません</h2>
          <p className="text-base text-slate-500">このページは管理者またはマネージャーのみアクセスできます</p>
        </div>
      </div>
    );
  }

  // 期限のステータスを判定
  const getDeadlineStatus = (deadline) => {
    const deadlineDate = parseISO(deadline.deadline_date);
    const today = new Date();
    
    if (isPast(deadlineDate) && !isToday(deadlineDate)) {
      return { status: 'expired', label: '期限切れ', color: 'red', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700' };
    } else if (isToday(deadlineDate)) {
      return { status: 'today', label: '本日締切', color: 'orange', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-700' };
    } else {
      const daysLeft = differenceInDays(deadlineDate, today);
      if (daysLeft <= 3) {
        return { status: 'urgent', label: `残り${daysLeft}日`, color: 'yellow', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', textColor: 'text-yellow-700' };
      } else if (daysLeft <= 7) {
        return { status: 'upcoming', label: `残り${daysLeft}日`, color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-700' };
      } else {
        return { status: 'future', label: `残り${daysLeft}日`, color: 'green', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700' };
      }
    }
  };

  // 期限でソート（近い順）
  const sortedDeadlines = [...deadlines].sort((a, b) => {
    return a.deadline_date.localeCompare(b.deadline_date);
  });

  // ステータス別にグループ化
  const activeDeadlines = sortedDeadlines.filter(d => {
    const status = getDeadlineStatus(d);
    return status.status !== 'expired';
  });

  const expiredDeadlines = sortedDeadlines.filter(d => {
    const status = getDeadlineStatus(d);
    return status.status === 'expired';
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shadow-rose-200">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800">シフト提出期限管理</h1>
                <p className="text-sm text-slate-500">期間ごとの提出期限を設定・管理</p>
              </div>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setIsAdding(!isAdding);
              }}
              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              新しい期限を追加
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* 統計サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">有効な期限</p>
                  <p className="text-3xl font-bold text-blue-700">{activeDeadlines.length}</p>
                </div>
                <Clock className="w-10 h-10 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">本日締切</p>
                  <p className="text-3xl font-bold text-orange-700">
                    {activeDeadlines.filter(d => getDeadlineStatus(d).status === 'today').length}
                  </p>
                </div>
                <AlertCircle className="w-10 h-10 text-orange-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">期限切れ</p>
                  <p className="text-3xl font-bold text-green-700">{expiredDeadlines.length}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* フォーム */}
        {isAdding && (
          <Card className="mb-6 border-2 border-purple-200 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">{editingId ? '期限を編集' : '新しい期限を追加'}</CardTitle>
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <CardDescription>
                シフト希望の対象期間と提出期限を設定します
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {stores.length > 1 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      対象店舗
                    </Label>
                    <select
                      value={formData.store_id}
                      onChange={(e) => setFormData({...formData, store_id: e.target.value})}
                      className="w-full h-11 rounded-lg border-2 border-slate-200 px-4 focus:border-purple-500 focus:outline-none transition-colors"
                    >
                      {stores.map(store => (
                        <option key={store.id} value={store.id}>
                          {store.store_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      対象期間（開始日）
                    </Label>
                    <Input
                      type="date"
                      value={formData.target_month_start}
                      onChange={(e) => setFormData({...formData, target_month_start: e.target.value})}
                      className="h-11 border-2 focus:border-purple-500"
                      required
                    />
                    <p className="text-xs text-slate-500">シフト希望の対象期間の開始日</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-green-500" />
                      対象期間（終了日）
                    </Label>
                    <Input
                      type="date"
                      value={formData.target_month_end}
                      onChange={(e) => setFormData({...formData, target_month_end: e.target.value})}
                      className="h-11 border-2 focus:border-purple-500"
                      required
                    />
                    <p className="text-xs text-slate-500">シフト希望の対象期間の終了日</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-red-500" />
                    提出期限日
                  </Label>
                  <Input
                    type="date"
                    value={formData.deadline_date}
                    onChange={(e) => setFormData({...formData, deadline_date: e.target.value})}
                    className="h-11 border-2 focus:border-purple-500"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    シフト希望の提出期限（対象期間の開始日より前に設定してください）
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">説明（任意）</Label>
                  <Input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="例: 3月分のシフト希望提出"
                    className="h-11 border-2 focus:border-purple-500"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 h-11 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
                  >
                    <Save className="w-5 h-5 mr-2" />
                    {editingId ? '更新' : '保存'}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm} className="h-11">
                    キャンセル
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* 有効な期限リスト */}
        {activeDeadlines.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              有効な提出期限
            </h2>
            <div className="space-y-3">
              {activeDeadlines.map(deadline => {
                const store = stores.find(s => s.id === deadline.store_id);
                const status = getDeadlineStatus(deadline);
                return (
                  <Card key={deadline.id} className={`border-2 ${status.borderColor} ${status.bgColor} hover:shadow-lg transition-shadow`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.textColor} bg-white/80`}>
                              {status.label}
                            </span>
                            {store && (
                              <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                                {store.store_name}
                              </span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                            <div>
                              <p className="text-xs text-slate-500 mb-1">対象期間</p>
                              <p className="text-sm font-bold text-slate-800">
                                {format(parseISO(deadline.target_month_start), 'M月d日', { locale: ja })}
                                {' 〜 '}
                                {format(parseISO(deadline.target_month_end), 'M月d日', { locale: ja })}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 mb-1">提出期限</p>
                              <p className="text-lg font-bold text-red-600">
                                {format(parseISO(deadline.deadline_date), 'M月d日(E)', { locale: ja })}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 mb-1">期間</p>
                              <p className="text-sm font-medium text-slate-700">
                                {differenceInDays(parseISO(deadline.target_month_end), parseISO(deadline.target_month_start)) + 1}日間
                              </p>
                            </div>
                          </div>

                          {deadline.description && (
                            <p className="text-sm text-slate-600 mt-2 p-2 bg-white/50 rounded">
                              {deadline.description}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(deadline)}
                            className="h-9 w-9 p-0"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (confirm('この期限を削除しますか？')) {
                                deleteMutation.mutate(deadline.id);
                              }
                            }}
                            className="h-9 w-9 p-0 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* 期限切れリスト */}
        {expiredDeadlines.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              期限切れ
            </h2>
            <div className="space-y-3">
              {expiredDeadlines.map(deadline => {
                const store = stores.find(s => s.id === deadline.store_id);
                return (
                  <Card key={deadline.id} className="border border-slate-200 bg-slate-50 opacity-75">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-bold text-slate-600">
                              {format(parseISO(deadline.target_month_start), 'M月d日', { locale: ja })}
                              {' 〜 '}
                              {format(parseISO(deadline.target_month_end), 'M月d日', { locale: ja })}
                            </span>
                            {store && (
                              <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs font-medium rounded">
                                {store.store_name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            提出期限: {format(parseISO(deadline.deadline_date), 'M月d日', { locale: ja })}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('この期限を削除しますか？')) {
                              deleteMutation.mutate(deadline.id);
                            }
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* 空状態 */}
        {deadlines.length === 0 && !isAdding && (
          <Card className="border-2 border-dashed border-slate-200">
            <CardContent className="p-12 text-center">
              <Calendar className="w-20 h-20 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-600 mb-2">まだ提出期限が設定されていません</h3>
              <p className="text-sm text-slate-400 mb-6">「新しい期限を追加」ボタンから設定してください</p>
              <Button
                onClick={() => setIsAdding(true)}
                className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                最初の期限を追加
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
