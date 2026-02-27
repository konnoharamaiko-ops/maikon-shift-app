import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Calendar, User as UserIcon, RotateCcw, Key, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import DefaultShiftSettings from '@/components/settings/DefaultShiftSettings';
import ShiftRequestEditor from '@/components/user-edit/ShiftRequestEditor';
import { fetchAll, fetchFiltered, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { invalidateUserQueries } from '@/lib/invalidateHelpers';
import { sortStoresByOrder } from '@/lib/storeOrder';

export default function UserEdit() {
  const [searchParams] = useSearchParams();
  const userEmail = searchParams.get('email');
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editedUser, setEditedUser] = useState(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const { user: currentUser } = useAuth();

  const { data: targetUser, isLoading } = useQuery({
    queryKey: ['targetUser', userEmail],
    queryFn: async () => {
      const users = await fetchFiltered('User', { email: userEmail });
      return users?.[0] || null;
    },
    enabled: !!userEmail,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      return sortStoresByOrder(allStores);
    },
  });

  useEffect(() => {
    if (targetUser) {
      const meta = targetUser.metadata || {};
      setEditedUser({
        full_name: targetUser.full_name || '',
        display_name: meta.display_name || targetUser.full_name || '',
        user_role: targetUser.user_role || 'user',
        store_ids: targetUser.store_ids || [],
        employment_type: meta.employment_type || 'part_time',
        hourly_wage: meta.hourly_wage || 0,
        max_work_days_per_week: meta.max_work_days_per_week || 0,
        max_work_hours_per_week: meta.max_work_hours_per_week || 0,
        dependent_income_limit: meta.dependent_income_limit || 0,
        line_user_id: meta.line_user_id || '',
        default_start_time: meta.default_start_time || '',
        default_end_time: meta.default_end_time || '',
        weekly_days_normal: targetUser.weekly_days_normal || '',
        weekly_days_slow: targetUser.weekly_days_slow || '',
        daily_hours_min: targetUser.daily_hours_min || '',
        daily_hours_max: targetUser.daily_hours_max || '',
        admin_memo: targetUser.admin_memo || '',
      });
    }
  }, [targetUser]);

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      await updateRecord('User', targetUser.id, data);
    },
    onSuccess: () => {
      invalidateUserQueries(queryClient);
      setEditMode(false);
      toast.success('ユーザー情報を更新しました');
    },
    onError: (error) => {
      toast.error('更新に失敗しました: ' + error.message);
    },
  });

  const handleSave = () => {
    if (!editedUser.full_name || !editedUser.store_ids || editedUser.store_ids.length === 0) {
      toast.error('氏名と所属店舗は必須です');
      return;
    }
    // Store all user info in metadata JSON to match Supabase schema
    const currentMetadata = targetUser.metadata || {};
    const finalDisplayName = editedUser.display_name || editedUser.full_name;
    const saveData = {
      full_name: editedUser.full_name,
      user_role: editedUser.user_role,
      store_ids: editedUser.store_ids,
      weekly_days_normal: editedUser.weekly_days_normal ? parseInt(editedUser.weekly_days_normal) : null,
      weekly_days_slow: editedUser.weekly_days_slow ? parseInt(editedUser.weekly_days_slow) : null,
      daily_hours_min: editedUser.daily_hours_min ? parseFloat(editedUser.daily_hours_min) : null,
      daily_hours_max: editedUser.daily_hours_max ? parseFloat(editedUser.daily_hours_max) : null,
      admin_memo: editedUser.admin_memo || null,
      metadata: {
        ...currentMetadata,
        display_name: finalDisplayName,
        employment_type: editedUser.employment_type,
        hourly_wage: editedUser.hourly_wage,
        max_work_days_per_week: editedUser.max_work_days_per_week,
        max_work_hours_per_week: editedUser.max_work_hours_per_week,
        dependent_income_limit: editedUser.dependent_income_limit,
        default_start_time: editedUser.default_start_time || null,
        default_end_time: editedUser.default_end_time || null,
        line_user_id: editedUser.line_user_id || null,
      },
    };
    console.log('[UserEdit] Saving user data:', saveData);
    updateUserMutation.mutate(saveData);
  };

  const handleResetUser = async () => {
    if (!window.confirm(
      `${targetUser.metadata?.display_name || targetUser.full_name || targetUser.email}のデータをリセットしますか？\n\n以下のデータが削除されます：\n・全てのシフト希望\n・基本シフト設定\n\nこの操作は元に戻せません。`
    )) {
      return;
    }

    try {
      // Delete all shift requests
      const shiftRequests = await fetchFiltered('ShiftRequest', {
        created_by: targetUser.email
      });
      
      for (const shift of shiftRequests) {
        await deleteRecord('ShiftRequest', shift.id);
      }

      // Reset default shift settings
      await updateRecord('User', targetUser.id, {
        default_shift_settings: null
      });

      queryClient.invalidateQueries({ queryKey: ['targetUser'] });
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      toast.success(`${shiftRequests.length}件のシフト希望と基本設定をリセットしました`);
    } catch (error) {
      console.error('Reset failed:', error);
      toast.error('リセットに失敗しました');
    }
  };

  const handlePasswordReset = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('新しいパスワードは6文字以上で入力してください');
      return;
    }

    if (!supabaseAdmin) {
      toast.error('管理者APIが設定されていません');
      return;
    }

    setIsResettingPassword(true);
    try {
      // Find the auth user by email
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.email === targetUser.email);

      if (!authUser) {
        toast.error('認証ユーザーが見つかりません');
        setIsResettingPassword(false);
        return;
      }

      // Reset the password
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      toast.success(`${targetUser.metadata?.display_name || targetUser.full_name || targetUser.email}のパスワードをリセットしました`);
      setNewPassword('');
      setShowPasswordReset(false);
      setShowNewPassword(false);
    } catch (error) {
      console.error('Password reset failed:', error);
      toast.error('パスワードリセットに失敗しました: ' + (error.message || '不明なエラー'));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const isAdmin = currentUser?.user_role === 'admin' || currentUser?.role === 'admin';
  const isManager = currentUser?.user_role === 'manager' || currentUser?.role === 'manager';

  if (currentUser && !isAdmin && !isManager) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">アクセス権限がありません</p>
            <Link to={createPageUrl('UserManagement')} className="block mt-4">
              <Button className="w-full">戻る</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !targetUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to={createPageUrl('UserManagement')}>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </Link>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
              <UserIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-2xl font-bold text-slate-800 truncate">ユーザー編集</h1>
              <p className="text-xs sm:text-sm text-slate-500 truncate">
                {targetUser.metadata?.display_name || targetUser.full_name || targetUser.email}
              </p>
            </div>
            {isAdmin && (
              <Button
                onClick={handleResetUser}
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50 text-xs sm:text-sm flex-shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">データを</span>リセット
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5" />
                  ユーザー情報
                </CardTitle>
                {!editMode ? (
                  <Button onClick={() => setEditMode(true)} variant="outline" size="sm">
                    編集
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleSave} 
                      size="sm"
                      disabled={updateUserMutation.isPending}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      保存
                    </Button>
                    <Button onClick={() => setEditMode(false)} variant="outline" size="sm">
                      キャンセル
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!editMode ? (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500">メールアドレス</p>
                    <p className="font-medium">{targetUser.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">氏名</p>
                    <p className="font-medium">{targetUser.full_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">表示名</p>
                    <p className="font-medium">{targetUser.metadata?.display_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">権限</p>
                    <p className="font-medium">
                      {(targetUser.user_role || targetUser.role) === 'admin' ? '管理者' : (targetUser.user_role || targetUser.role) === 'manager' ? 'マネージャー' : 'シフト提出者'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">所属店舗</p>
                    <p className="font-medium">
                      {targetUser.store_ids?.length > 0 
                        ? stores.filter(s => targetUser.store_ids.includes(s.id)).map(s => s.store_name).join(', ')
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">雇用形態</p>
                    <p className="font-medium">
                      {(targetUser.metadata?.employment_type || 'part_time') === 'full_time' ? '正社員' : (targetUser.metadata?.employment_type || 'part_time') === 'contract' ? '契約社員' : 'パート・アルバイト'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">時給</p>
                    <p className="font-medium">{targetUser.metadata?.hourly_wage || 0}円</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">週の最大勤務日数</p>
                    <p className="font-medium">{targetUser.metadata?.max_work_days_per_week || 0}日</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">週の最大勤務時間</p>
                    <p className="font-medium">{targetUser.metadata?.max_work_hours_per_week || 0}時間</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">扶養内の収入上限</p>
                    <p className="font-medium">{targetUser.metadata?.dependent_income_limit ? `${targetUser.metadata.dependent_income_limit.toLocaleString()}円/年` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">LINE User ID</p>
                    <p className="font-medium">{targetUser.metadata?.line_user_id || '-'}</p>
                  </div>
                </div>

                {/* シフト管理設定 */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    シフト管理設定
                  </h4>
                  {/* 基本勤務時間 */}
                  <div className="mb-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                    <p className="text-xs font-semibold text-indigo-600 mb-1">基本勤務時間</p>
                    <p className="font-medium text-indigo-800">
                      {targetUser.metadata?.default_start_time && targetUser.metadata?.default_end_time
                        ? `${targetUser.metadata.default_start_time} 〜 ${targetUser.metadata.default_end_time}`
                        : '未設定'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">通常期 週何日</p>
                      <p className="font-medium">{targetUser.weekly_days_normal ? `${targetUser.weekly_days_normal}日` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">閑散期 週何日</p>
                      <p className="font-medium">{targetUser.weekly_days_slow ? `${targetUser.weekly_days_slow}日` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">1日最低時間</p>
                      <p className="font-medium">{targetUser.daily_hours_min ? `${targetUser.daily_hours_min}時間` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">1日最大時間</p>
                      <p className="font-medium">{targetUser.daily_hours_max ? `${targetUser.daily_hours_max}時間` : '-'}</p>
                    </div>
                  </div>
                  {targetUser.admin_memo && (
                    <div className="mt-3">
                      <p className="text-sm text-slate-500">管理者メモ</p>
                      <p className="font-medium text-sm whitespace-pre-wrap bg-slate-50 rounded p-2 mt-1">{targetUser.admin_memo}</p>
                    </div>
                  )}
                </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">氏名 *</Label>
                      <Input
                        value={editedUser?.full_name || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, full_name: e.target.value })}
                        placeholder="山田 太郎"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">表示名</Label>
                      <Input
                        value={editedUser?.display_name || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, display_name: e.target.value })}
                        placeholder="やまだ"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2 block">メールアドレス</Label>
                    <Input value={targetUser.email} disabled className="bg-slate-50" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">権限</Label>
                      <Select 
                        value={editedUser?.user_role || 'user'} 
                        onValueChange={(value) => setEditedUser({ ...editedUser, user_role: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">シフト提出者</SelectItem>
                          <SelectItem value="manager">マネージャー</SelectItem>
                          <SelectItem value="admin">管理者</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">雇用形態</Label>
                      <Select 
                        value={editedUser?.employment_type || 'part_time'} 
                        onValueChange={(value) => setEditedUser({ ...editedUser, employment_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">正社員</SelectItem>
                          <SelectItem value="part_time">パート・アルバイト</SelectItem>
                          <SelectItem value="contract">契約社員</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2 block">所属店舗 *</Label>
                    <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {stores.map((store) => (
                        <label key={store.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={editedUser?.store_ids?.includes(store.id) || false}
                            onChange={(e) => {
                              const currentStoreIds = editedUser?.store_ids || [];
                              if (e.target.checked) {
                                setEditedUser({ ...editedUser, store_ids: [...currentStoreIds, store.id] });
                              } else {
                                setEditedUser({ ...editedUser, store_ids: currentStoreIds.filter(id => id !== store.id) });
                              }
                            }}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{store.store_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">時給（円）</Label>
                      <Input
                        type="number"
                        value={editedUser?.hourly_wage || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, hourly_wage: parseFloat(e.target.value) || 0 })}
                        placeholder="1500"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">週の最大勤務日数</Label>
                      <Input
                        type="number"
                        value={editedUser?.max_work_days_per_week || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, max_work_days_per_week: parseFloat(e.target.value) || 0 })}
                        placeholder="5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">週の最大勤務時間</Label>
                      <Input
                        type="number"
                        value={editedUser?.max_work_hours_per_week || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, max_work_hours_per_week: parseFloat(e.target.value) || 0 })}
                        placeholder="40"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">扶養内の収入上限（円/年）</Label>
                      <Input
                        type="number"
                        value={editedUser?.dependent_income_limit || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, dependent_income_limit: parseFloat(e.target.value) || 0 })}
                        placeholder="1030000"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2 block">LINE User ID</Label>
                    <Input
                      value={editedUser?.line_user_id || ''}
                      onChange={(e) => setEditedUser({ ...editedUser, line_user_id: e.target.value })}
                      placeholder="U1234567890abcdef1234567890abcdef"
                    />
                    <p className="text-xs text-slate-500 mt-1">LINE通知を受け取るためのLINE User IDを入力してください</p>
                  </div>

                  {/* シフト管理設定 */}
                  <div className="mt-2 pt-4 border-t border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      シフト管理設定
                    </h4>
                    {/* 基本勤務時間 */}
                    <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                      <Label className="text-xs font-semibold text-indigo-600 mb-2 block">基本勤務時間</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={editedUser?.default_start_time || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, default_start_time: e.target.value })}
                          className="flex-1 bg-white"
                        />
                        <span className="text-sm font-medium text-indigo-600">〜</span>
                        <Input
                          type="time"
                          value={editedUser?.default_end_time || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, default_end_time: e.target.value })}
                          className="flex-1 bg-white"
                        />
                      </div>
                      <p className="text-[10px] text-indigo-500 mt-1">このユーザーの基本的な勤務時間帯を設定します</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-slate-700 mb-2 block">通常期 週何日</Label>
                        <Input
                          type="number"
                          value={editedUser?.weekly_days_normal || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, weekly_days_normal: e.target.value })}
                          placeholder="5"
                          min="0"
                          max="7"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-slate-700 mb-2 block">閑散期 週何日</Label>
                        <Input
                          type="number"
                          value={editedUser?.weekly_days_slow || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, weekly_days_slow: e.target.value })}
                          placeholder="3"
                          min="0"
                          max="7"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <Label className="text-sm font-medium text-slate-700 mb-2 block">1日最低時間</Label>
                        <Input
                          type="number"
                          value={editedUser?.daily_hours_min || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, daily_hours_min: e.target.value })}
                          placeholder="4"
                          min="0"
                          max="24"
                          step="0.5"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-slate-700 mb-2 block">1日最大時間</Label>
                        <Input
                          type="number"
                          value={editedUser?.daily_hours_max || ''}
                          onChange={(e) => setEditedUser({ ...editedUser, daily_hours_max: e.target.value })}
                          placeholder="8"
                          min="0"
                          max="24"
                          step="0.5"
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">管理者メモ</Label>
                      <textarea
                        value={editedUser?.admin_memo || ''}
                        onChange={(e) => setEditedUser({ ...editedUser, admin_memo: e.target.value })}
                        placeholder="シフト作成時の参考情報を入力..."
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px] resize-y"
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Password Reset - Admin Only */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    パスワードリセット
                  </CardTitle>
                  {!showPasswordReset && (
                    <Button
                      onClick={() => setShowPasswordReset(true)}
                      variant="outline"
                      size="sm"
                      className="text-amber-600 border-amber-200 hover:bg-amber-50"
                    >
                      <Key className="w-4 h-4 mr-2" />
                      パスワードをリセット
                    </Button>
                  )}
                </div>
              </CardHeader>
              {showPasswordReset && (
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-800">
                        <strong>{targetUser.metadata?.display_name || targetUser.full_name || targetUser.email}</strong> のパスワードを新しいパスワードにリセットします。
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-slate-700 mb-2 block">新しいパスワード</Label>
                      <div className="relative">
                        <Input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="6文字以上で入力"
                          className="pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">6文字以上で入力してください</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handlePasswordReset}
                        disabled={isResettingPassword || !newPassword || newPassword.length < 6}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        {isResettingPassword ? 'リセット中...' : 'パスワードをリセット'}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowPasswordReset(false);
                          setNewPassword('');
                          setShowNewPassword(false);
                        }}
                        variant="outline"
                      >
                        キャンセル
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Default Shift Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                基本シフト設定
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DefaultShiftSettings user={targetUser} isAdminEdit={true} />
            </CardContent>
          </Card>

          {/* Shift Request Editor */}
          <ShiftRequestEditor 
            targetUser={targetUser} 
            stores={stores}
            isAdmin={isAdmin}
          />
        </div>
      </main>
    </div>
  );
}