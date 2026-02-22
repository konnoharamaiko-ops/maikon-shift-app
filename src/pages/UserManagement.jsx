import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, UserPlus, Mail, Trash2, Users, Building2, Edit2, Key, History, User, AlertTriangle, Calendar, ClipboardList, FileSpreadsheet, Loader2, Database, Search } from 'lucide-react';
import ExportButton from '@/components/export/ExportButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import PermissionSettings from '@/components/user-management/PermissionSettings';
import PermissionHistoryView from '@/components/user-management/PermissionHistoryView';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { fetchAll, fetchFiltered, insertRecord, updateRecord, deleteRecord, subscribeToTable } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';
import { sortStoresByOrder } from '@/lib/storeOrder';
import { invalidateUserQueries } from '@/lib/invalidateHelpers';

function SortableUserCard({ id, user, renderContent }) {
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
      {renderContent(user)}
    </div>
  );
}

export default function UserManagement() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('user');
  const [storeIds, setStoreIds] = useState([]);
  // editingUser and showEditModal are removed as editing is now handled via a separate page linked by `Link`
  const [permissionUser, setPermissionUser] = useState(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [lastInviteData, setLastInviteData] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [gmailEmailData, setGmailEmailData] = useState(null);
  const [showGmailConfirm, setShowGmailConfirm] = useState(false);
  const [userOrder, setUserOrder] = useState([]);
  const [adminOrder, setAdminOrder] = useState([]);
  const [selectedStoreFilter, setSelectedStoreFilter] = useState('all');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState(null);
  const [deleteOptions, setDeleteOptions] = useState({
    shiftRequestFuture: true,
    shiftRequestAll: false,
    workShift: true,
    userAccount: true,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeletedDataDialog, setShowDeletedDataDialog] = useState(false);
  const [deletedUserData, setDeletedUserData] = useState([]);
  const [loadingDeletedData, setLoadingDeletedData] = useState(false);
  const [selectedDeletedUser, setSelectedDeletedUser] = useState(null);
  const [deletedDataOptions, setDeletedDataOptions] = useState({
    shiftRequestFuture: false,
    shiftRequestAll: true,
    workShift: true,
  });
  const [isDeletingData, setIsDeletingData] = useState(false);
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250, // Time in ms before a drag starts
        tolerance: 5 // Pixels a pointer has to move before a drag starts
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { user: currentUser } = useAuth();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => fetchAll('User'),
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      // Admins see all stores
      if (currentUser?.user_role === 'admin' || currentUser?.role === 'admin') {
        return allStores;
      }
      // Non-admins only see their assigned stores
      return allStores.filter(store => currentUser?.store_ids?.includes(store.id));
    },
  });

  const { data: pendingInvitations = [] } = useQuery({
    queryKey: ['pendingInvitations'],
    queryFn: () => fetchAll('PendingInvitation'),
  });

  // Filter users by selected store
  const filteredUsers = users.filter(u => {
    const isRegularUser = u.user_role !== 'admin' && u.role !== 'admin';
    if (!isRegularUser) return false;
    if (selectedStoreFilter === 'all') return true;
    return u.store_ids?.includes(selectedStoreFilter);
  });

  const orderedUsers = userOrder
    .map(id => filteredUsers.find(u => u.id === id))
    .filter(Boolean);
  
  const orderedAdmins = adminOrder.map(id => users.find(u => u.id === id)).filter(Boolean);

  // Initialize user order when users data changes
  useEffect(() => {
    if (users.length > 0) {
      const regularUsers = users.filter(u => u.user_role !== 'admin' && u.role !== 'admin');
      const adminUsers = users.filter(u => u.user_role === 'admin' || u.role === 'admin');
      
      // Sort by sort_order if available
      const sortByOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
      
      setUserOrder(regularUsers.sort(sortByOrder).map(u => u.id));
      setAdminOrder(adminUsers.sort(sortByOrder).map(u => u.id));
    }
  }, [users, selectedStoreFilter]);

  const updateSortOrderMutation = useMutation({
    mutationFn: async (newOrder) => {
      // バッチ更新: 全ユーザーのソート順を並列で更新
      const updates = newOrder.map((id, i) => updateRecord('User', id, { sort_order: i }));
      await Promise.all(updates);
      return newOrder;
    },
    onSuccess: (newOrder) => {
      // キャッシュを直接更新して不要な再取得を避ける
      queryClient.setQueryData(['allUsers'], (oldUsers) => {
        if (!oldUsers) return oldUsers;
        return oldUsers.map(u => {
          const idx = newOrder.indexOf(u.id);
          if (idx !== -1) {
            return { ...u, sort_order: idx };
          }
          return u;
        });
      });
      toast.success('並び順を保存しました');
    },
    onError: (error) => {
      console.error('並び順の保存に失敗:', error);
      toast.error('並び順の保存に失敗しました');
      // エラー時はDBから最新データを再取得
      invalidateUserQueries(queryClient);
    }
  });

  const handleUserDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = userOrder.indexOf(active.id);
      const newIndex = userOrder.indexOf(over.id);
      const newOrder = arrayMove(userOrder, oldIndex, newIndex);
      setUserOrder(newOrder);
      updateSortOrderMutation.mutate(newOrder);
    }
  };

  const handleAdminDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = adminOrder.indexOf(active.id);
      const newIndex = adminOrder.indexOf(over.id);
      const newOrder = arrayMove(adminOrder, oldIndex, newIndex);
      setAdminOrder(newOrder);
      updateSortOrderMutation.mutate(newOrder);
    }
  };

  // リアルタイムでユーザー登録を監視し、招待中から削除
  useEffect(() => {
    const unsubscribe = subscribeToTable('User', async (event) => {
      if (event.type === 'create' || event.type === 'update') {
        const newUser = event.data;
        try {
          const pending = await fetchFiltered('PendingInvitation', { email: newUser.email });
          if (pending.length > 0) {
            for (const p of pending) {
              await deleteRecord('PendingInvitation', p.id);
            }
            queryClient.invalidateQueries({ queryKey: ['pendingInvitations'] });
            invalidateUserQueries(queryClient);
          }
        } catch (error) {
          console.error('Failed to delete pending invitation:', error);
        }
      }
    });

    return unsubscribe;
  }, [queryClient]);

  // 招待済みユーザーのクリーンアップ（初回マウント時のみ実行、リアルタイム監視で十分）
  useEffect(() => {
    const checkAndCleanup = async () => {
      if (pendingInvitations.length > 0 && users.length > 0) {
        const userEmails = users.map(u => u.email);
        const toDelete = pendingInvitations.filter(p => userEmails.includes(p.email));
        
        if (toDelete.length > 0) {
          try {
            for (const invitation of toDelete) {
              await deleteRecord('PendingInvitation', invitation.id);
            }
            queryClient.invalidateQueries({ queryKey: ['pendingInvitations'] });
          } catch (error) {
            console.error('Failed to cleanup invitations:', error);
          }
        }
      }
    };

    checkAndCleanup();
  }, [pendingInvitations, users, queryClient]);

  const inviteMutation = useMutation({
    mutationFn: async ({ email, fullName, role, storeIds, password }) => {
      // Check if user already exists in User table (use cached data first, then verify)
      const cachedUsers = queryClient.getQueryData(['allUsers']) || [];
      const existingUser = cachedUsers.find(u => u.email === email);
      if (existingUser) {
        throw new Error('このメールアドレスは既に登録されています');
      }

      // Step 1: Create Supabase Auth user via Admin API
      if (!supabaseAdmin) {
        throw new Error('管理者APIが設定されていません。.envファイルにVITE_SUPABASE_SERVICE_ROLE_KEYを設定してください。');
      }

      const defaultPassword = password || 'ShiftApp2025!';
      let authUserId = null;

      // First try to create a new auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (authError) {
        // If user already exists in Supabase Auth (e.g., previously deleted from app but auth remains)
        if (authError.message?.includes('already been registered') || authError.status === 422) {
          console.warn('[Invite] Auth user already exists, attempting to reuse:', authError.message);
          
          // Find the existing auth user
          try {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
            const existingAuthUser = listData?.users?.find(u => u.email === email);
            
            if (existingAuthUser) {
              // Update the existing auth user with new password and metadata
              const { data: updatedData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
                existingAuthUser.id,
                {
                  password: defaultPassword,
                  email_confirm: true,
                  user_metadata: { full_name: fullName },
                  ban_duration: 'none', // Unban if banned
                }
              );
              
              if (updateError) {
                console.error('[Invite] Failed to update existing auth user:', updateError);
                throw new Error('既存の認証ユーザーの更新に失敗しました: ' + updateError.message);
              }
              
              authUserId = existingAuthUser.id;
              console.log('[Invite] Reused existing auth user:', authUserId);
            } else {
              throw new Error('認証ユーザーが見つかりませんでした。管理者に連絡してください。');
            }
          } catch (listErr) {
            if (listErr.message?.includes('認証ユーザー')) throw listErr;
            console.error('[Invite] Failed to list auth users:', listErr);
            throw new Error('認証ユーザーの検索に失敗しました: ' + listErr.message);
          }
        } else {
          console.error('[Invite] Auth user creation failed:', authError);
          throw new Error('認証ユーザーの作成に失敗しました: ' + authError.message);
        }
      } else {
        authUserId = authData.user.id;
        console.log('[Invite] Auth user created:', authUserId);
      }

      // Step 2: Create PendingInvitation record (user stays in "招待中" until first login)
      const appUrl = window.location.origin || 'https://shift-app-liart.vercel.app';
      try {
        await insertRecord('PendingInvitation', {
          email,
          full_name: fullName,
          role,
          store_id: storeIds[0] || null,
          store_ids: storeIds,
          invited_at: new Date().toISOString(),
          invited_by: currentUser?.email || 'admin',
        });
        console.log('[Invite] PendingInvitation created for:', email);
      } catch (pendingErr) {
        console.warn('[Invite] PendingInvitation creation failed (non-critical):', pendingErr.message);
      }

      // Step 3: Generate invite link (type: 'invite' for password setup)
      let inviteLink = null;
      let supabaseEmailSent = false;
      try {
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: {
            redirectTo: appUrl + '/',
            data: { full_name: fullName }
          },
        });
        if (linkError) {
          console.warn('[Invite] generateLink failed:', linkError.message);
        } else {
          inviteLink = linkData?.properties?.action_link || linkData?.action_link;
          console.log('[Invite] Invite link generated for:', email);
          // Note: Supabase does NOT automatically send email for generateLink
          // We need to send it via Gmail API below
        }
      } catch (emailErr) {
        console.warn('[Invite] Link generation error:', emailErr.message);
      }

      // Return data for onSuccess to use
      return { email, fullName, role, storeIds, defaultPassword, appUrl, supabaseEmailSent, inviteLink };
    },
    onSuccess: (data) => {
      invalidateUserQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['pendingInvitations'] });
      
      // Store invite info for Gmail sending
      setLastInviteData(data);
      setSendingEmail(true);
      
      setEmail('');
      setFullName('');
      setRole('user');
      setStoreIds([]);
      
      const emailStatus = data.supabaseEmailSent ? 'Supabase招待メール送信済み。' : '';
      toast.success(`${data.fullName}さんを招待中に追加しました。${emailStatus}初期パスワード: ${data.defaultPassword}`);
    },
    onError: (error) => {
      toast.error('ユーザー追加に失敗しました: ' + error.message);
    },
  });

  const handleInvite = (e) => {
    e.preventDefault();
    if (!email || !fullName || storeIds.length === 0) {
      toast.error('全ての項目を入力してください');
      return;
    }
    inviteMutation.mutate({ email, fullName, role, storeIds });
  };

  const updateMutation = useMutation({
    mutationFn: async ({ userId, userData }) => {
      await updateRecord('User', userId, userData);
    },
    onSuccess: () => {
      invalidateUserQueries(queryClient);
      // setShowEditModal(false); // Removed as modal is no longer on this page
      // setEditingUser(null); // Removed as modal is no longer on this page
      toast.success('ユーザー情報を更新しました');
    },
    onError: (error) => {
      toast.error('更新に失敗しました: ' + error.message);
    },
  });

  const executeDelete = async () => {
    if (!deleteTargetUser) return;
    setIsDeleting(true);
    const { userId, email } = deleteTargetUser;
    const today = new Date().toISOString().split('T')[0];
    let deletedItems = [];

    try {
      // 1. シフト希望（今日以降）を削除
      if (deleteOptions.shiftRequestFuture && !deleteOptions.shiftRequestAll) {
        const requests = await fetchFiltered('ShiftRequest', { created_by: email });
        const futureRequests = requests.filter(r => r.date >= today);
        for (const req of futureRequests) {
          await deleteRecord('ShiftRequest', req.id);
        }
        deletedItems.push(`シフト希望（今日以降）: ${futureRequests.length}件`);
      }

      // 2. シフト希望（全日数）を削除
      if (deleteOptions.shiftRequestAll) {
        const requests = await fetchFiltered('ShiftRequest', { created_by: email });
        for (const req of requests) {
          await deleteRecord('ShiftRequest', req.id);
        }
        deletedItems.push(`シフト希望（全日数）: ${requests.length}件`);
      }

      // 3. シフト編集（確定シフト）を削除
      if (deleteOptions.workShift) {
        const userWorkShifts = await fetchFiltered('WorkShift', { user_email: email });
        for (const ws of userWorkShifts) {
          await deleteRecord('WorkShift', ws.id);
        }
        deletedItems.push(`シフト編集（確定シフト）: ${userWorkShifts.length}件`);
      }

      // 4. ユーザーアカウントを削除
      if (deleteOptions.userAccount) {
        await deleteRecord('User', userId);
        
        // Also delete from Supabase Auth if admin client available
        if (supabaseAdmin && email) {
          try {
            const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
            const authUser = authUsers?.users?.find(u => u.email === email);
            if (authUser) {
              await supabaseAdmin.auth.admin.deleteUser(authUser.id);
            }
          } catch (e) {
            console.warn('[Delete] Failed to delete auth user:', e.message);
          }
        }
        deletedItems.push('ユーザーアカウント');
      }

      invalidateUserQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      toast.success(`削除完了: ${deletedItems.join('、')}`);
    } catch (error) {
      toast.error('削除に失敗しました: ' + error.message);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setDeleteTargetUser(null);
      setDeleteOptions({
        shiftRequestFuture: true,
        shiftRequestAll: false,
        workShift: true,
        userAccount: true,
      });
    }
  };

  const deletePendingInvitationMutation = useMutation({
    mutationFn: async (invitationId) => {
      await deleteRecord('PendingInvitation', invitationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingInvitations'] });
      toast.success('招待を取り消しました');
    },
    onError: (error) => {
      toast.error('削除に失敗しました: ' + error.message);
    },
  });

  // handleEditUser and handleUpdateUser are removed as user editing is now handled via a separate page.

  // 削除済みユーザーの残データを検索
  const handleLoadDeletedUserData = async () => {
    setLoadingDeletedData(true);
    setShowDeletedDataDialog(true);
    try {
      const activeEmails = new Set(users.map(u => u.email));
      
      // ShiftRequestから削除済みユーザーのデータを検索
      const allRequests = await fetchAll('ShiftRequest');
      const allWorkShifts = await fetchAll('WorkShift');
      
      const deletedMap = {};
      
      allRequests.forEach(req => {
        if (!activeEmails.has(req.created_by)) {
          if (!deletedMap[req.created_by]) {
            deletedMap[req.created_by] = { email: req.created_by, shiftRequests: 0, workShifts: 0 };
          }
          deletedMap[req.created_by].shiftRequests++;
        }
      });
      
      allWorkShifts.forEach(ws => {
        if (!activeEmails.has(ws.user_email)) {
          if (!deletedMap[ws.user_email]) {
            deletedMap[ws.user_email] = { email: ws.user_email, shiftRequests: 0, workShifts: 0 };
          }
          deletedMap[ws.user_email].workShifts++;
        }
      });
      
      setDeletedUserData(Object.values(deletedMap));
    } catch (error) {
      toast.error('データの読み込みに失敗しました: ' + error.message);
    } finally {
      setLoadingDeletedData(false);
    }
  };

  // 削除済みユーザーの残データを削除
  const handleDeleteDeletedUserData = async () => {
    if (!selectedDeletedUser) return;
    setIsDeletingData(true);
    const email = selectedDeletedUser.email;
    const today = new Date().toISOString().split('T')[0];
    let deletedItems = [];

    try {
      if (deletedDataOptions.shiftRequestFuture && !deletedDataOptions.shiftRequestAll) {
        const requests = await fetchFiltered('ShiftRequest', { created_by: email });
        const futureRequests = requests.filter(r => r.date >= today);
        for (const req of futureRequests) {
          await deleteRecord('ShiftRequest', req.id);
        }
        deletedItems.push(`シフト希望（今日以降）: ${futureRequests.length}件`);
      }

      if (deletedDataOptions.shiftRequestAll) {
        const requests = await fetchFiltered('ShiftRequest', { created_by: email });
        for (const req of requests) {
          await deleteRecord('ShiftRequest', req.id);
        }
        deletedItems.push(`シフト希望（全日数）: ${requests.length}件`);
      }

      if (deletedDataOptions.workShift) {
        const userWS = await fetchFiltered('WorkShift', { user_email: email });
        for (const ws of userWS) {
          await deleteRecord('WorkShift', ws.id);
        }
        deletedItems.push(`シフト編集（確定シフト）: ${userWS.length}件`);
      }

      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      toast.success(`${email} のデータを削除: ${deletedItems.join('、')}`);
      
      // リストを更新
      await handleLoadDeletedUserData();
      setSelectedDeletedUser(null);
    } catch (error) {
      toast.error('削除に失敗しました: ' + error.message);
    } finally {
      setIsDeletingData(false);
    }
  };

  const handleDeleteUser = (userId, userName, userEmail) => {
    setDeleteTargetUser({ userId, userName, email: userEmail });
    setDeleteOptions({
      shiftRequestFuture: true,
      shiftRequestAll: false,
      workShift: true,
      userAccount: true,
    });
    setShowDeleteDialog(true);
  };

  const handleDeletePendingInvitation = (invitationId, invitationName) => {
    if (window.confirm(`${invitationName}への招待を取り消しますか?`)) {
      deletePendingInvitationMutation.mutate(invitationId);
    }
  };

  const isAdmin = currentUser?.user_role === 'admin' || currentUser?.role === 'admin';

  if (currentUser && !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">アクセス権限がありません</h2>
          <p className="text-slate-500">このページは管理者のみアクセスできます</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // getUserStores is kept but not directly used in the user cards anymore as it's not part of the `Link` content
  const getUserStores = (user) => {
    if (!user?.store_ids || user?.store_ids.length === 0) return [];
    return stores.filter(s => user?.store_ids.includes(s.id));
  };

  const renderUserCard = (user) => {
    const userStores = getUserStores(user);
    const roleLabel = user?.user_role === 'admin' || user?.role === 'admin' ? '管理者' : user?.user_role === 'manager' || user?.role === 'manager' ? 'マネージャー' : 'スタッフ';
    const roleColor = user?.user_role === 'admin' || user?.role === 'admin' ? 'bg-red-100 text-red-700' : user?.user_role === 'manager' || user?.role === 'manager' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
    return (
      <div className="relative group">
        <Link to={createPageUrl('UserEdit') + `?email=${encodeURIComponent(user?.email)}`}>
          <div className="w-full p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
                <span className="text-white font-bold text-sm sm:text-lg">
                  {(user?.metadata?.display_name || user?.full_name)?.charAt(0) || user?.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{user?.metadata?.display_name || user?.full_name || '名前未設定'}</p>
                <p className="text-[10px] sm:text-xs text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <span className={cn("text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-semibold", roleColor)}>
                {roleLabel}
              </span>
              {userStores.slice(0, 2).map(s => (
                <span key={s.id} className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full flex items-center gap-0.5">
                  <Building2 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />{s.store_name}
                </span>
              ))}
              {userStores.length > 2 && (
                <span className="text-[9px] sm:text-[10px] text-slate-400">+{userStores.length - 2}</span>
              )}
            </div>
          </div>
        </Link>
        {isAdmin && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDeleteUser(user?.id, user?.metadata?.display_name || user?.full_name || user?.email, user?.email);
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 hover:bg-red-100 text-slate-300 hover:text-red-600 transition-colors shadow-sm z-10 opacity-0 group-hover:opacity-100"
            title="ユーザーを削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  const renderAdminCard = (admin) => {
    const adminStores = getUserStores(admin);
    return (
    <div className="relative group">
      <Link to={createPageUrl('UserEdit') + `?email=${encodeURIComponent(admin.email)}`}>
        <div className="w-full p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-purple-200 bg-white hover:border-purple-400 hover:shadow-lg transition-all cursor-pointer">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-200">
              <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{admin.metadata?.display_name || admin.full_name || '名前未設定'}</p>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">{admin.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-semibold">
              管理者
            </span>
            {adminStores.slice(0, 2).map(s => (
              <span key={s.id} className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full flex items-center gap-0.5">
                <Building2 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />{s.store_name}
              </span>
            ))}
            {adminStores.length > 2 && (
              <span className="text-[9px] sm:text-[10px] text-slate-400">+{adminStores.length - 2}</span>
            )}
          </div>
        </div>
      </Link>
      {isAdmin && admin.email !== currentUser?.email && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDeleteUser(admin.id, admin.metadata?.display_name || admin.full_name || admin.email, admin.email);
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 hover:bg-red-100 text-slate-300 hover:text-red-600 transition-colors shadow-sm z-10 opacity-0 group-hover:opacity-100"
          title="ユーザーを削除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-2xl font-bold text-slate-800">ユーザー管理</h1>
              <p className="text-[10px] sm:text-sm text-slate-500">従業員の招待と管理</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Invite form */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-5">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold text-slate-800">新しいユーザーを招待</h2>
              <p className="text-[10px] sm:text-xs text-slate-500">メールアドレスで招待します</p>
            </div>
          </div>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <Label htmlFor="fullName" className="text-sm font-medium text-slate-700 mb-2 block">
                氏名
              </Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="山田 太郎"
                className="border-slate-200"
              />
            </div>
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-slate-700 mb-2 block">
                メールアドレス
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@example.com"
                  className="pl-10 border-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="role" className="text-sm font-medium text-slate-700 mb-2 block">
                  権限
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="border-slate-200">
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
                <Label htmlFor="stores" className="text-sm font-medium text-slate-700 mb-2 block">
                  所属店舗（複数選択可）
                </Label>
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {stores.length === 0 ? (
                    <div className="p-2 text-sm text-slate-500 text-center">
                      店舗が登録されていません
                    </div>
                  ) : (
                    sortStoresByOrder(stores).map((store) => (
                      <label key={store.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={storeIds.includes(store.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setStoreIds([...storeIds, store.id]);
                            } else {
                              setStoreIds(storeIds.filter(id => id !== store.id));
                            }
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{store.store_name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-xl"
            >
              {inviteMutation.isPending ? '追加中...' : 'ユーザーを追加'}
            </Button>
          </form>
          <p className="text-xs text-slate-400 mt-3">
            ※ 追加されたユーザーには招待メールが送信されます（Supabase自動メール + Gmailからのメール）。初期パスワードは「ShiftApp2025!」です。ログイン後、設定画面からパスワードを変更できます。
          </p>
          
          {/* Gmail招待メール送信ダイアログ */}
          {sendingEmail && lastInviteData && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-medium text-blue-800">Gmailから招待メールを送信しますか？</p>
              </div>
              <p className="text-xs text-blue-600 mb-3">
                {lastInviteData.fullName}さん（{lastInviteData.email}）へログイン情報を含む招待メールを送信します。
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={async () => {
                    try {
                      const storeName = stores.find(s => lastInviteData.storeIds?.includes(s.id))?.store_name || '店舗';
                      const emailContent = lastInviteData.inviteLink 
                        ? `${lastInviteData.fullName}さん\n\nシフト管理アプリへの招待です。\n\n以下のリンクをクリックして、パスワードを設定してください：\n\n${lastInviteData.inviteLink}\n\nメールアドレス: ${lastInviteData.email}\n\n※ リンクの有効期限は24時間です。期限切れの場合は管理者にお問い合わせください。\n\nよろしくお願いいたします。`
                        : `${lastInviteData.fullName}さん\n\nシフト管理アプリへの招待です。\n\n以下の情報でログインしてください。\n\nアプリURL: ${lastInviteData.appUrl}\nメールアドレス: ${lastInviteData.email}\n初期パスワード: ${lastInviteData.defaultPassword}\n\n※ ログイン後、設定画面からパスワードを変更してください。\n\nよろしくお願いいたします。`;
                      
                      // This will be handled by the MCP Gmail tool via the parent agent
                      // For now, store the email data and show a copy button
                      setGmailEmailData({
                        to: lastInviteData.email,
                        subject: `【シフト管理アプリ】${storeName}への招待`,
                        content: emailContent,
                      });
                      setSendingEmail(false);
                      setShowGmailConfirm(true);
                    } catch (err) {
                      toast.error('Gmailメールの準備に失敗しました');
                    }
                  }}
                >
                  Gmailで送信
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSendingEmail(false);
                    setLastInviteData(null);
                  }}
                >
                  スキップ
                </Button>
              </div>
            </div>
          )}
          
          {/* Gmailメール内容確認ダイアログ */}
          {showGmailConfirm && gmailEmailData && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-800">招待メールの内容</p>
              </div>
              <div className="bg-white p-3 rounded-lg text-xs text-slate-600 mb-3 whitespace-pre-wrap border">
                <p className="font-medium">宛先: {gmailEmailData.to}</p>
                <p className="font-medium">件名: {gmailEmailData.subject}</p>
                <hr className="my-2" />
                <p>{gmailEmailData.content}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    // Copy to clipboard for manual sending or trigger via agent
                    navigator.clipboard?.writeText(
                      `宛先: ${gmailEmailData.to}\n件名: ${gmailEmailData.subject}\n\n${gmailEmailData.content}`
                    );
                    toast.success('メール内容をコピーしました。Gmailから送信してください。');
                    setShowGmailConfirm(false);
                    setGmailEmailData(null);
                    setLastInviteData(null);
                  }}
                >
                  コピーして閉じる
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Open Gmail compose with pre-filled data
                    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(gmailEmailData.to)}&su=${encodeURIComponent(gmailEmailData.subject)}&body=${encodeURIComponent(gmailEmailData.content)}`;
                    window.open(gmailUrl, '_blank');
                    setShowGmailConfirm(false);
                    setGmailEmailData(null);
                    setLastInviteData(null);
                  }}
                >
                  Gmailで開く
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowGmailConfirm(false);
                    setGmailEmailData(null);
                    setLastInviteData(null);
                  }}
                >
                  閉じる
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Pending invitations */}
        {pendingInvitations.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden mb-6">
            <div className="p-4 border-b border-amber-100 flex items-center justify-between bg-amber-50">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-600" />
                招待中のユーザー
              </h3>
              <span className="text-sm text-amber-600">{pendingInvitations.length}名</span>
            </div>
            <div className="divide-y divide-amber-50">
              {pendingInvitations.map((invitation) => {
                const invitationStore = stores.find(s => s.id === invitation.store_id);
                return (
                  <div key={invitation.id} className="p-3 sm:p-4 flex items-center justify-between hover:bg-amber-50 transition-colors gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 text-sm sm:text-base truncate">{invitation.full_name}</p>
                        <p className="text-xs sm:text-sm text-slate-400 truncate">{invitation.email}</p>
                        {invitationStore && (
                          <div className="flex items-center gap-1 mt-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span className="text-xs text-slate-500">{invitationStore.store_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                      <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-amber-100 text-amber-700 rounded-full">
                        招待中
                      </span>
                      <span className="hidden sm:inline text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                        {invitation.role === 'admin' ? '管理者' : invitation.role === 'manager' ? 'マネージャー' : 'シフト提出者'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePendingInvitation(invitation.id, invitation.full_name)}
                        className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={deletePendingInvitationMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Users Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">登録済みユーザー</h3>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHistoryModal(true)}
                  className="gap-1 sm:gap-2 text-xs sm:text-sm h-8"
                >
                  <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">権限変更</span>履歴
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadDeletedUserData}
                  className="gap-1 sm:gap-2 text-orange-600 border-orange-200 hover:bg-orange-50 text-xs sm:text-sm h-8"
                >
                  <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">削除済み</span>データ
                </Button>
                <ExportButton
                  data={users.map(u => ({
                    ...u,
                    store_names: stores.filter(s => u.store_ids?.includes(s.id)).map(s => s.store_name)
                  }))}
                  filename="ユーザー一覧"
                  type="users"
                  size="sm"
                />
                <span className="text-xs sm:text-sm text-slate-500">{orderedUsers.length}名</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <Select value={selectedStoreFilter} onValueChange={setSelectedStoreFilter}>
                <SelectTrigger className="w-full sm:w-48 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての店舗</SelectItem>
                  {sortStoresByOrder(stores).map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : orderedUsers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-400">まだユーザーが登録されていません</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleUserDragEnd}
            >
              <SortableContext items={userOrder} strategy={verticalListSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-4">
                  {orderedUsers.map((user) => (
                    <SortableUserCard key={user?.id} id={user?.id} user={user} renderContent={renderUserCard} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Admins Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6">
          <div className="p-4 border-b border-slate-100 bg-purple-50">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              管理者一覧
            </h3>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleAdminDragEnd}
          >
            <SortableContext items={adminOrder} strategy={verticalListSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-4">
                {orderedAdmins.map((admin) => (
                  <SortableUserCard key={admin.id} id={admin.id} user={admin} renderContent={renderAdminCard} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </main>

      {/* 権限設定モーダル */}
      <Dialog open={showPermissionModal} onOpenChange={setShowPermissionModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-600" />
              権限設定
            </DialogTitle>
          </DialogHeader>
          {permissionUser && (
            <Tabs defaultValue="permissions" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="permissions">権限設定</TabsTrigger>
                <TabsTrigger value="history">変更履歴</TabsTrigger>
              </TabsList>
              <TabsContent value="permissions">
                <PermissionSettings
                  user={permissionUser}
                  currentUserEmail={currentUser.email}
                  onClose={() => {
                    setShowPermissionModal(false);
                    setPermissionUser(null);
                  }}
                />
              </TabsContent>
              <TabsContent value="history">
                <PermissionHistoryView userId={permissionUser.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* 全体権限履歴モーダル */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <History className="w-5 h-5 text-slate-600" />
              権限変更履歴（全体）
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <PermissionHistoryView />
          </div>
        </DialogContent>
      </Dialog>

      {/* 編集モーダル - Removed as editing is now handled on a separate page. */}

      {/* 削除対象選択ダイアログ */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!isDeleting) { setShowDeleteDialog(open); if (!open) setDeleteTargetUser(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              ユーザー削除
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <div className="bg-red-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800 font-medium">
                {deleteTargetUser?.userName}（{deleteTargetUser?.email}）
              </p>
              <p className="text-xs text-red-600 mt-1">
                削除するデータを選択してください。この操作は取り消せません。
              </p>
            </div>

            <div className="space-y-3">
              {/* シフト希望（今日以降） */}
              <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                <Checkbox
                  checked={deleteOptions.shiftRequestFuture}
                  onCheckedChange={(checked) => setDeleteOptions(prev => ({
                    ...prev,
                    shiftRequestFuture: !!checked,
                    shiftRequestAll: checked ? false : prev.shiftRequestAll,
                  }))}
                  disabled={deleteOptions.shiftRequestAll}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-slate-800">シフト希望（今日以降）</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 ml-6">今日以降のシフト希望データを削除</p>
                </div>
              </label>

              {/* シフト希望（全日数） */}
              <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                <Checkbox
                  checked={deleteOptions.shiftRequestAll}
                  onCheckedChange={(checked) => setDeleteOptions(prev => ({
                    ...prev,
                    shiftRequestAll: !!checked,
                    shiftRequestFuture: checked ? false : prev.shiftRequestFuture,
                  }))}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium text-slate-800">シフト希望（全日数）</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 ml-6">過去を含む全てのシフト希望データを削除</p>
                </div>
              </label>

              {/* シフト編集（確定シフト） */}
              <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                <Checkbox
                  checked={deleteOptions.workShift}
                  onCheckedChange={(checked) => setDeleteOptions(prev => ({ ...prev, workShift: !!checked }))}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium text-slate-800">シフト編集（確定シフト）</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 ml-6">シフト編集タブの確定シフトデータを削除</p>
                </div>
              </label>

              {/* ユーザーアカウント */}
              <label className="flex items-start gap-3 p-3 rounded-lg bg-red-50 cursor-pointer transition-colors">
                <Checkbox
                  checked={deleteOptions.userAccount}
                  onCheckedChange={(checked) => setDeleteOptions(prev => ({ ...prev, userAccount: !!checked }))}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-red-800">ユーザーアカウント</span>
                  </div>
                  <p className="text-xs text-red-600 mt-0.5 ml-6">ユーザーアカウントとログイン情報を削除</p>
                </div>
              </label>
            </div>

            {/* 選択なし警告 */}
            {!deleteOptions.shiftRequestFuture && !deleteOptions.shiftRequestAll && !deleteOptions.workShift && !deleteOptions.userAccount && (
              <p className="text-xs text-amber-600 mt-3 text-center">削除する項目を少なくとも1つ選択してください</p>
            )}

            <div className="flex gap-2 mt-5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowDeleteDialog(false); setDeleteTargetUser(null); }}
                disabled={isDeleting}
              >
                キャンセル
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={executeDelete}
                disabled={isDeleting || (!deleteOptions.shiftRequestFuture && !deleteOptions.shiftRequestAll && !deleteOptions.workShift && !deleteOptions.userAccount)}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    削除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    削除実行
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 削除済みユーザーデータ管理ダイアログ */}
      <Dialog open={showDeletedDataDialog} onOpenChange={(open) => { if (!isDeletingData) { setShowDeletedDataDialog(open); if (!open) setSelectedDeletedUser(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2 text-orange-600">
              <Database className="w-5 h-5" />
              削除済みユーザーのデータ管理
            </DialogTitle>
            <DialogDescription>
              アカウントが削除されたユーザーの残存データを管理します。
            </DialogDescription>
          </DialogHeader>

          {loadingDeletedData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">データを検索中...</span>
            </div>
          ) : deletedUserData.length === 0 ? (
            <div className="text-center py-8">
              <Database className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">削除済みユーザーの残存データはありません</p>
            </div>
          ) : !selectedDeletedUser ? (
            <div className="space-y-2 mt-2">
              <p className="text-sm text-slate-600 mb-3">以下の削除済みユーザーにデータが残っています。</p>
              {deletedUserData.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedDeletedUser(item);
                    setDeletedDataOptions({ shiftRequestFuture: false, shiftRequestAll: true, workShift: true });
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.email}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      シフト希望: {item.shiftRequests}件 / 確定シフト: {item.workShifts}件
                    </p>
                  </div>
                  <Trash2 className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2">
              <div className="bg-orange-50 rounded-lg p-3 mb-4">
                <p className="text-sm text-orange-800 font-medium">{selectedDeletedUser.email}</p>
                <p className="text-xs text-orange-600 mt-1">
                  シフト希望: {selectedDeletedUser.shiftRequests}件 / 確定シフト: {selectedDeletedUser.workShifts}件
                </p>
              </div>

              <p className="text-sm text-slate-600 mb-3">削除するデータを選択してください：</p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  <Checkbox
                    checked={deletedDataOptions.shiftRequestFuture}
                    onCheckedChange={(checked) => setDeletedDataOptions(prev => ({
                      ...prev,
                      shiftRequestFuture: !!checked,
                      shiftRequestAll: checked ? false : prev.shiftRequestAll,
                    }))}
                    disabled={deletedDataOptions.shiftRequestAll}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-slate-800">シフト希望（今日以降）</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 ml-6">今日以降のシフト希望データのみ削除</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  <Checkbox
                    checked={deletedDataOptions.shiftRequestAll}
                    onCheckedChange={(checked) => setDeletedDataOptions(prev => ({
                      ...prev,
                      shiftRequestAll: !!checked,
                      shiftRequestFuture: checked ? false : prev.shiftRequestFuture,
                    }))}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-slate-800">シフト希望（全日数）</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 ml-6">過去を含む全てのシフト希望データを削除</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  <Checkbox
                    checked={deletedDataOptions.workShift}
                    onCheckedChange={(checked) => setDeletedDataOptions(prev => ({ ...prev, workShift: !!checked }))}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium text-slate-800">シフト編集（確定シフト）</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 ml-6">シフト編集タブの確定シフトデータを削除</p>
                  </div>
                </label>
              </div>

              {!deletedDataOptions.shiftRequestFuture && !deletedDataOptions.shiftRequestAll && !deletedDataOptions.workShift && (
                <p className="text-xs text-amber-600 mt-3 text-center">削除する項目を少なくとも1つ選択してください</p>
              )}

              <div className="flex gap-2 mt-5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedDeletedUser(null)}
                  disabled={isDeletingData}
                >
                  戻る
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleDeleteDeletedUserData}
                  disabled={isDeletingData || (!deletedDataOptions.shiftRequestFuture && !deletedDataOptions.shiftRequestAll && !deletedDataOptions.workShift)}
                >
                  {isDeletingData ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      削除中...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      削除実行
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}