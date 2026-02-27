import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Calendar, Shield, Save, Plus, Trash2, Store as StoreIcon, Copy, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DetailedStoreSettings from '@/components/store-settings/DetailedStoreSettings';
import { fetchAll, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { invalidateStoreQueries } from '@/lib/invalidateHelpers';
import { sortStoresByOrder } from '@/lib/storeOrder';

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [selectedStoreForSimple, setSelectedStoreForSimple] = useState('');
  const [selectedStoreForDetails, setSelectedStoreForDetails] = useState('');

  const { user } = useAuth();

  const { data: appSettings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => fetchAll('AppSettings'),
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      return sortStoresByOrder(allStores);
    },
  });

  // Initialize selectedStoreForDetails when stores load
  React.useEffect(() => {
    if (stores.length > 0 && !selectedStoreForDetails) {
      setSelectedStoreForDetails(stores[0].id);
    }
  }, [stores, selectedStoreForDetails]);

  const { data: shiftDeadlines = [], isLoading: deadlinesLoading } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: () => fetchAll('ShiftDeadline'),
  });

  const isLoading = settingsLoading || deadlinesLoading;



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

  const handleCopyDeadlines = async (fromStoreId, toStoreId) => {
    if (!window.confirm(`${stores.find(s => s.id === fromStoreId)?.store_name}の期限設定を${stores.find(s => s.id === toStoreId)?.store_name}にコピーしますか？`)) {
      return;
    }
    try {
      const fromDeadlines = shiftDeadlines.filter(d => d.store_id === fromStoreId);
      for (const deadline of fromDeadlines) {
        await insertRecord('ShiftDeadline', {
          store_id: toStoreId,
          target_month_start: deadline.target_month_start,
          target_month_end: deadline.target_month_end,
          deadline_date: deadline.deadline_date,
          description: deadline.description
        });
      }
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('期限設定をコピーしました');
    } catch (error) {
      toast.error('コピーに失敗しました');
    }
  };

  const handleResetDeadlines = async (storeId) => {
    if (!window.confirm(`${stores.find(s => s.id === storeId)?.store_name}の全ての期限設定を削除しますか？`)) {
      return;
    }
    try {
      const storeDeadlines = shiftDeadlines.filter(d => d.store_id === storeId);
      for (const deadline of storeDeadlines) {
        await deleteRecord('ShiftDeadline', deadline.id);
      }
      queryClient.invalidateQueries({ queryKey: ['shiftDeadlines'] });
      toast.success('期限設定をリセットしました');
    } catch (error) {
      toast.error('リセットに失敗しました');
    }
  };

  const handleCopyStoreSettings = async (fromStoreId, toStoreId) => {
    if (!window.confirm(`${stores.find(s => s.id === fromStoreId)?.store_name}の詳細設定を${stores.find(s => s.id === toStoreId)?.store_name}にコピーしますか？`)) {
      return;
    }
    try {
      const fromStore = stores.find(s => s.id === fromStoreId);
      const toStore = stores.find(s => s.id === toStoreId);
      await updateRecord('Store', toStoreId, {
        business_hours: fromStore.business_hours,
        staff_requirements: fromStore.staff_requirements,
        temporary_closures: fromStore.temporary_closures,
        holiday_exceptions: fromStore.holiday_exceptions,
        shift_policies: fromStore.shift_policies
      });
      invalidateStoreQueries(queryClient);
      toast.success('店舗設定をコピーしました');
    } catch (error) {
      toast.error('コピーに失敗しました');
    }
  };



  if (!user || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (user && user?.user_role !== 'admin' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">アクセス権限がありません</h2>
          <p className="text-base text-slate-500">このページは管理者のみアクセスできます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shadow-lg shadow-rose-200">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">管理者設定</h1>
              <p className="text-sm text-slate-500">システム全体の設定を管理</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Tabs defaultValue="deadlines" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deadlines">期限設定</TabsTrigger>
            <TabsTrigger value="store-details">店舗詳細設定</TabsTrigger>
          </TabsList>

          <TabsContent value="deadlines" className="space-y-6">
          {/* Detailed Deadline Settings - Store List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Calendar className="w-5 h-5" />
                シフト提出期限の詳細設定
              </CardTitle>
              <CardDescription className="text-base">
                各店舗ごとに「何月何日から何月何日のシフトは何日まで」と詳細に期限を設定できます
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stores.map(store => {
                  const storeDeadlines = shiftDeadlines.filter(d => d.store_id === store.id);
                  return (
                    <div key={store.id} className="border-2 border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <StoreIcon className="w-5 h-5 text-slate-500" />
                          <Label className="text-lg font-semibold text-slate-800">
                            {store.store_name}
                          </Label>
                        </div>
                        <div className="flex gap-2">
                          {stores.length > 1 && (
                            <Select onValueChange={(toStoreId) => handleCopyDeadlines(store.id, toStoreId)}>
                              <SelectTrigger className="w-[180px] h-8">
                                <SelectValue placeholder="コピー先" />
                              </SelectTrigger>
                              <SelectContent>
                                {stores.filter(s => s.id !== store.id).map(s => (
                                  <SelectItem key={s.id} value={s.id}>
                                    <Copy className="w-3 h-3 inline mr-2" />
                                    {s.store_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResetDeadlines(store.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {storeDeadlines.map((deadline) => (
                          <form key={deadline.id} onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            const data = {
                              store_id: store.id,
                              target_month_start: formData.get('target_month_start'),
                              target_month_end: formData.get('target_month_end'),
                              deadline_date: formData.get('deadline_date'),
                              description: formData.get('description') || ''
                            };
                            
                            if (!data.target_month_start || !data.target_month_end || !data.deadline_date) {
                              toast.error('全ての必須項目を入力してください');
                              return;
                            }
                            
                            await updateDeadlineMutation.mutateAsync({ id: deadline.id, data });
                          }} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-slate-600 mb-1 block">対象期間開始</Label>
                                <Input
                                  type="date"
                                  name="target_month_start"
                                  defaultValue={deadline.target_month_start}
                                  className="h-9"
                                  required
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-600 mb-1 block">対象期間終了</Label>
                                <Input
                                  type="date"
                                  name="target_month_end"
                                  defaultValue={deadline.target_month_end}
                                  className="h-9"
                                  required
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-slate-600 mb-1 block">提出期限日</Label>
                              <Input
                                type="date"
                                name="deadline_date"
                                defaultValue={deadline.deadline_date}
                                className="h-9"
                                required
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-slate-600 mb-1 block">説明（任意）</Label>
                              <Input
                                type="text"
                                name="description"
                                defaultValue={deadline.description || ''}
                                placeholder="例: 3月分のシフト希望"
                                className="h-9"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                type="submit" 
                                size="sm"
                                className="flex-1 bg-purple-600 hover:bg-purple-700"
                                disabled={updateDeadlineMutation.isPending}
                              >
                                <Save className="w-4 h-4 mr-2" />
                                {updateDeadlineMutation.isPending ? '更新中...' : '更新'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  if (confirm('この期限設定を削除しますか？')) {
                                    await deleteDeadlineMutation.mutateAsync(deadline.id);
                                  }
                                }}
                                className="px-3"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </form>
                        ))}
                        
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const formData = new FormData(e.target);
                          const data = {
                            store_id: store.id,
                            target_month_start: formData.get('target_month_start'),
                            target_month_end: formData.get('target_month_end'),
                            deadline_date: formData.get('deadline_date'),
                            description: formData.get('description') || ''
                          };
                          
                          if (!data.target_month_start || !data.target_month_end || !data.deadline_date) {
                            toast.error('全ての必須項目を入力してください');
                            return;
                          }
                          
                          await createDeadlineMutation.mutateAsync(data);
                          e.target.reset();
                        }} className="space-y-3 p-3 bg-white rounded-lg border-2 border-dashed border-slate-300">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-slate-600 mb-1 block">対象期間開始</Label>
                              <Input
                                type="date"
                                name="target_month_start"
                                className="h-9"
                                required
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-slate-600 mb-1 block">対象期間終了</Label>
                              <Input
                                type="date"
                                name="target_month_end"
                                className="h-9"
                                required
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">提出期限日</Label>
                            <Input
                              type="date"
                              name="deadline_date"
                              className="h-9"
                              required
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">説明（任意）</Label>
                            <Input
                              type="text"
                              name="description"
                              placeholder="例: 3月分のシフト希望"
                              className="h-9"
                            />
                          </div>
                          <Button 
                            type="submit" 
                            size="sm"
                            className="w-full bg-purple-600 hover:bg-purple-700"
                            disabled={createDeadlineMutation.isPending}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            {createDeadlineMutation.isPending ? '追加中...' : '期限を追加'}
                          </Button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Simple Deadline Settings - Store List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Calendar className="w-5 h-5" />
                シンプルな期限設定（参考表示用）
              </CardTitle>
              <CardDescription className="text-base">
                従業員向けのシンプルな期限表示を各店舗ごとに設定します
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stores.map(store => {
                  const storeSetting = appSettings.find(s => 
                    s.setting_key === 'submission_deadline' && 
                    s.store_id === store.id
                  );
                  return (
                    <div key={store.id} className="p-4 border-2 border-slate-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <StoreIcon className="w-4 h-4 text-slate-500" />
                        <Label className="text-base font-semibold text-slate-700">
                          {store.store_name}
                        </Label>
                      </div>
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.target.elements[`deadline-${store.id}`];
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
                          id={`deadline-${store.id}`}
                          name={`deadline-${store.id}`}
                          type="text"
                          defaultValue={storeSetting?.setting_value || ''}
                          placeholder="例: 毎月20日、翌月5日まで"
                          className="h-10"
                        />
                        <Button 
                          type="submit" 
                          size="sm"
                          className="w-full bg-purple-600 hover:bg-purple-700"
                          disabled={createSettingMutation.isPending || updateSettingMutation.isPending}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {(createSettingMutation.isPending || updateSettingMutation.isPending) ? '保存中...' : '保存'}
                        </Button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="border-purple-200 bg-purple-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-purple-600 mt-1" />
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-2">管理者専用機能</h3>
                  <p className="text-base text-slate-600">
                    ここで設定した内容は、全ての従業員の設定画面で確認できます。
                    シフト提出のルールを明確にすることで、スムーズな運用が可能になります。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="store-details" className="space-y-6">
            <div className="mb-6">
              <Label className="text-lg font-semibold mb-3 block">店舗を選択</Label>
              <Select 
                value={selectedStoreForDetails || stores[0]?.id || ''} 
                onValueChange={(storeId) => {
                  setSelectedStoreForDetails(storeId);
                  const element = document.getElementById(`store-${storeId}`);
                  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <SelectTrigger className="w-full h-12 text-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id} className="text-lg">
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {stores.map(store => (
              <Card key={store.id} id={`store-${store.id}`} className="scroll-mt-6">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 text-3xl">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                        <StoreIcon className="w-7 h-7 text-white" />
                      </div>
                      <span className="font-bold text-slate-800">{store.store_name}</span>
                    </CardTitle>
                    {stores.length > 1 && (
                      <Select onValueChange={(toStoreId) => handleCopyStoreSettings(store.id, toStoreId)}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="設定をコピー" />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.filter(s => s.id !== store.id).map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <Copy className="w-4 h-4 inline mr-2" />
                              {s.store_name}へ
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <CardDescription className="text-lg mt-2">
                    営業時間、必要人数、シフトポリシーなどの詳細設定
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <DetailedStoreSettings
                    store={store}
                    onUpdate={async (data) => {
                      await supabase.from('Store').update(data).eq('id', store.id);
                      invalidateStoreQueries(queryClient);
                    }}
                  />
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}