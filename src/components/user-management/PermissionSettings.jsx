import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Store, Settings, ChevronDown, ChevronRight, Save, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fetchAll, fetchFiltered, insertRecord, updateRecord, deleteRecord } from '@/api/supabaseHelpers';
import { sortStoresByOrder } from '@/lib/storeOrder';

const FEATURE_PERMISSIONS = [
  { id: 'shift_view', label: 'シフト閲覧', category: 'shift' },
  { id: 'shift_edit', label: 'シフト編集', category: 'shift' },
  { id: 'shift_create', label: 'シフト作成', category: 'shift' },
  { id: 'shift_delete', label: 'シフト削除', category: 'shift' },
  { id: 'request_view', label: '希望閲覧', category: 'shift' },
  { id: 'user_view', label: 'ユーザー閲覧', category: 'user' },
  { id: 'user_manage', label: 'ユーザー管理', category: 'user' },
  { id: 'store_manage', label: '店舗管理', category: 'store' },
  { id: 'settings_manage', label: 'システム設定', category: 'settings' },
];

export default function PermissionSettings({ user, currentUserEmail, onClose }) {
  const [expandedStores, setExpandedStores] = useState([]);
  const [expandedFeatures, setExpandedFeatures] = useState(false);
  const queryClient = useQueryClient();

  const { data: stores = [] } = useQuery({
    queryKey: ['stores-all'],
    queryFn: async () => {
      const allStores = await fetchAll('Store');
      return sortStoresByOrder(allStores);
    },
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions', user?.id],
    queryFn: () => fetchFiltered('Permission', { user_id: user?.id }),
  });

  const savePermissionMutation = useMutation({
    mutationFn: async ({ resourceType, resourceId, newPermissions, oldPermissions }) => {
      // 既存の権限を検索
      const existing = permissions.find(
        p => p.resource_type === resourceType && p.resource_id === resourceId
      );

      if (existing) {
        if (newPermissions.length === 0) {
          await deleteRecord('Permission', existing.id);
        } else {
          await updateRecord('Permission', existing.id, {
            permissions: newPermissions,
            granted_by: currentUserEmail
          });
        }
      } else if (newPermissions.length > 0) {
        await insertRecord('Permission', {
          user_id: user?.id,
          resource_type: resourceType,
          resource_id: resourceId,
          permissions: newPermissions,
          granted_by: currentUserEmail
        });
      }

      // 履歴を記録
      await insertRecord('PermissionHistory', {
        user_id: user?.id,
        user_email: user?.email,
        changed_by: currentUserEmail,
        change_type: existing ? 'modify' : 'grant',
        resource_type: resourceType,
        resource_id: resourceId,
        old_permissions: oldPermissions,
        new_permissions: newPermissions,
        change_description: `${resourceType === 'store' ? '店舗' : '機能'}権限を${existing ? '変更' : '付与'}しました`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      toast.success('権限を更新しました');
    },
    onError: (error) => {
      toast.error('権限の更新に失敗しました: ' + error.message);
    },
  });

  const getStorePermissions = (storeId) => {
    const perm = permissions.find(p => p.resource_type === 'store' && p.resource_id === storeId);
    return perm?.permissions || [];
  };

  const getFeaturePermissions = () => {
    const perm = permissions.find(p => p.resource_type === 'feature' && p.resource_id === 'global');
    return perm?.permissions || [];
  };

  const handleStorePermissionChange = (storeId, permissionId, checked) => {
    const current = getStorePermissions(storeId);
    const updated = checked
      ? [...current, permissionId]
      : current.filter(p => p !== permissionId);
    
    savePermissionMutation.mutate({
      resourceType: 'store',
      resourceId: storeId,
      newPermissions: updated,
      oldPermissions: current
    });
  };

  const handleFeaturePermissionChange = (permissionId, checked) => {
    const current = getFeaturePermissions();
    const updated = checked
      ? [...current, permissionId]
      : current.filter(p => p !== permissionId);
    
    savePermissionMutation.mutate({
      resourceType: 'feature',
      resourceId: 'global',
      newPermissions: updated,
      oldPermissions: current
    });
  };

  const toggleStore = (storeId) => {
    setExpandedStores(prev =>
      prev.includes(storeId)
        ? prev.filter(id => id !== storeId)
        : [...prev, storeId]
    );
  };

  const userStores = stores.filter(s => user?.store_ids?.includes(s.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">権限設定</h3>
          <p className="text-sm text-slate-500">{user?.display_name || user?.full_name || user?.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          閉じる
        </Button>
      </div>

      {/* 店舗別権限 */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-slate-800">店舗別権限</h4>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {userStores.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              所属店舗がありません
            </div>
          ) : (
            userStores.map(store => {
              const isExpanded = expandedStores.includes(store.id);
              const storePerms = getStorePermissions(store.id);
              
              return (
                <div key={store.id}>
                  <button
                    onClick={() => toggleStore(store.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="font-medium text-slate-700">{store.store_name}</span>
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                        {storePerms.length}個の権限
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-3">
                        {FEATURE_PERMISSIONS.filter(p => p.category === 'shift').map(perm => (
                          <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={storePerms.includes(perm.id)}
                              onCheckedChange={(checked) => 
                                handleStorePermissionChange(store.id, perm.id, checked)
                              }
                            />
                            <span className="text-sm text-slate-700">{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* グローバル機能権限 */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedFeatures(!expandedFeatures)}
          className="w-full bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold text-slate-800">システム機能権限</h4>
            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
              {getFeaturePermissions().length}個の権限
            </span>
          </div>
          {expandedFeatures ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>
        {expandedFeatures && (
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              {FEATURE_PERMISSIONS.filter(p => ['user', 'store', 'settings'].includes(p.category)).map(perm => (
                <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={getFeaturePermissions().includes(perm.id)}
                    onCheckedChange={(checked) => 
                      handleFeaturePermissionChange(perm.id, checked)
                    }
                  />
                  <span className="text-sm text-slate-700">{perm.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800 mb-1">権限について</p>
            <ul className="space-y-1 text-blue-700">
              <li>• 店舗別権限: 特定店舗のシフト操作権限</li>
              <li>• システム機能権限: ユーザー管理や設定などの全体機能</li>
              <li>• 管理者は全ての権限を持ちます</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}