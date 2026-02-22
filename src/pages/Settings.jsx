import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Calendar, Bell, Shield, Save, ChevronDown, Lock, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import DefaultShiftSettings from '@/components/settings/DefaultShiftSettings';
import NotificationSettings from '@/components/notifications/NotificationSettings';
import NotificationPreferences from '@/components/notifications/NotificationPreferences';
import { useAuth } from '@/lib/AuthContext';

export default function Settings() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [lineUserId, setLineUserId] = useState('');
  const [profileOpen, setProfileOpen] = useState(true);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { user, isLoadingAuth: isLoading, refreshProfile } = useAuth();

  const updateUserMutation = useMutation({
    mutationFn: async ({ fullName, displayName, lineUserId }) => {
      // Update full_name directly, and display_name inside metadata JSON
      const currentMetadata = user?.metadata || {};
      const finalDisplayName = displayName || fullName;
      const updatedMetadata = {
        ...currentMetadata,
        display_name: finalDisplayName,
      };

      const updateData = {
        full_name: fullName,
        display_name: finalDisplayName,
        metadata: updatedMetadata,
      };

      // LINE User IDが入力されている場合のみ更新
      if (lineUserId !== undefined) {
        updateData.line_user_id = lineUserId || null;
      }

      const { data, error } = await supabase
        .from('User')
        .update(updateData)
        .eq('id', user?.id)
        .select();

      if (error) throw error;
      return data?.[0] || null;
    },
    onSuccess: async () => {
      await refreshProfile();
      toast.success('プロフィールを更新しました');
    },
    onError: (error) => {
      console.error('Profile update error:', error);
      toast.error('プロフィールの更新に失敗しました: ' + (error.message || '不明なエラー'));
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }) => {
      // First verify the current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error('現在のパスワードが正しくありません');
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw new Error('パスワードの変更に失敗しました: ' + updateError.message);
      }
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('パスワードを変更しました');
    },
    onError: (error) => {
      console.error('Password change error:', error);
      toast.error(error.message || 'パスワードの変更に失敗しました');
    },
  });

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('名前を入力してください');
      return;
    }
    updateUserMutation.mutate({ fullName: fullName.trim(), displayName: displayName.trim(), lineUserId: lineUserId.trim() });
  };

  const handleChangePassword = (e) => {
    e.preventDefault();
    
    if (!currentPassword) {
      toast.error('現在のパスワードを入力してください');
      return;
    }
    if (!newPassword) {
      toast.error('新しいパスワードを入力してください');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('新しいパスワードは6文字以上で入力してください');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('新しいパスワードが一致しません');
      return;
    }
    if (currentPassword === newPassword) {
      toast.error('新しいパスワードは現在のパスワードと異なるものにしてください');
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  React.useEffect(() => {
    if (user) {
      setFullName(user?.full_name || '');
      setDisplayName(user?.display_name || user?.metadata?.display_name || '');
      setLineUserId(user?.line_user_id || '');
    }
  }, [user]);

  const isAdmin = user?.user_role === 'admin';
  const roleLabel = user?.user_role === 'admin' ? '管理者' : 
                    user?.user_role === 'manager' ? 'マネージャー' : 'シフト提出者';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-slate-600 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-800">設定</h1>
              <p className="text-xs sm:text-lg text-slate-400">プロフィールと通知の設定</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="space-y-4">
          {/* Profile Settings - Collapsible */}
          <Collapsible open={profileOpen} onOpenChange={setProfileOpen}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 sm:p-6 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-base sm:text-xl font-bold text-slate-800">プロフィール設定</h2>
                      <p className="text-xs sm:text-sm text-slate-500">基本情報を管理</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 sm:px-6 pb-4 sm:pb-6 border-t border-slate-100">
                  <form onSubmit={handleSaveProfile} className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
                    <div className="space-y-3">
                      <Label htmlFor="fullName" className="text-base font-medium">
                        氏名
                      </Label>
                      <Input
                        id="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="田浦利季"
                        className="text-base h-12"
                      />
                      <p className="text-sm text-slate-500">正式な氏名です</p>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="displayName" className="text-base font-medium">
                        表示名
                      </Label>
                      <Input
                        id="displayName"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="りき"
                        className="text-base h-12"
                      />
                      <p className="text-sm text-slate-500">アプリ内で表示される名前です（任意・空欄の場合は氏名が使用されます）</p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-base font-medium">メールアドレス</Label>
                      <Input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="text-base h-12 bg-slate-50"
                      />
                      <p className="text-sm text-slate-500">メールアドレスは変更できません</p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-base font-medium">アカウント種別</Label>
                      <Input
                        value={roleLabel}
                        disabled
                        className="text-base h-12 bg-slate-50"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="lineUserId" className="text-base font-medium flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-green-500" />
                        LINE User ID
                      </Label>
                      <Input
                        id="lineUserId"
                        type="text"
                        value={lineUserId}
                        onChange={(e) => setLineUserId(e.target.value)}
                        placeholder="U1234567890abcdef..."
                        className="text-base h-12"
                      />
                      <p className="text-sm text-slate-500">
                        LINE通知を受け取るためのUser IDです。LINE公式アカウント「舞昆のこうはら シフト管理」を友だち追加後、トーク画面で「ID」と送信すると確認できます。
                      </p>
                    </div>

                    <Button 
                      type="submit" 
                      size="lg"
                      className="w-full text-base"
                      disabled={updateUserMutation.isPending}
                    >
                      <Save className="w-5 h-5 mr-2" />
                      {updateUserMutation.isPending ? '保存中...' : '変更を保存'}
                    </Button>
                  </form>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Password Change - Collapsible */}
          <Collapsible open={passwordOpen} onOpenChange={setPasswordOpen}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 sm:p-6 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                      <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-base sm:text-xl font-bold text-slate-800">パスワード変更</h2>
                      <p className="text-xs sm:text-sm text-slate-500">ログインパスワードを変更</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${passwordOpen ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 sm:px-6 pb-4 sm:pb-6 border-t border-slate-100">
                  <form onSubmit={handleChangePassword} className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
                    <div className="space-y-3">
                      <Label htmlFor="currentPassword" className="text-base font-medium">
                        現在のパスワード
                      </Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="現在のパスワードを入力"
                          className="text-base h-12 pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="newPassword" className="text-base font-medium">
                        新しいパスワード
                      </Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="新しいパスワードを入力"
                          className="text-base h-12 pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <p className="text-sm text-slate-500">6文字以上で入力してください</p>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="confirmPassword" className="text-base font-medium">
                        新しいパスワード（確認）
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="新しいパスワードを再入力"
                          className="text-base h-12 pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {confirmPassword && newPassword !== confirmPassword && (
                        <p className="text-sm text-red-500">パスワードが一致しません</p>
                      )}
                      {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
                        <p className="text-sm text-green-600">パスワードが一致しています</p>
                      )}
                    </div>

                    <Button 
                      type="submit" 
                      size="lg"
                      className="w-full text-base bg-amber-600 hover:bg-amber-700"
                      disabled={changePasswordMutation.isPending}
                    >
                      <Lock className="w-5 h-5 mr-2" />
                      {changePasswordMutation.isPending ? '変更中...' : 'パスワードを変更'}
                    </Button>
                  </form>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Default Shift Settings - Collapsible */}
          <Collapsible open={shiftOpen} onOpenChange={setShiftOpen}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 sm:p-6 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-base sm:text-xl font-bold text-slate-800">基本シフト設定</h2>
                      <p className="text-xs sm:text-sm text-slate-500">デフォルトのシフト時間を管理</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${shiftOpen ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 sm:px-6 pb-4 sm:pb-6 border-t border-slate-100 mt-0">
                  <div className="mt-4 sm:mt-6">
                    <DefaultShiftSettings user={user} />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* Notification Settings - Collapsible */}
          <Collapsible open={notificationOpen} onOpenChange={setNotificationOpen}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 sm:p-6 hover:bg-slate-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center flex-shrink-0">
                      <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-base sm:text-xl font-bold text-slate-800">通知設定</h2>
                      <p className="text-xs sm:text-sm text-slate-500">通知の受け取り方を管理</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${notificationOpen ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 sm:px-6 pb-4 sm:pb-6 border-t border-slate-100 mt-0">
                  <div className="mt-4 sm:mt-6 space-y-4 sm:space-y-6">
                    <NotificationSettings user={user} />
                    <NotificationPreferences user={user} />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </div>
      </main>
    </div>
  );
}
