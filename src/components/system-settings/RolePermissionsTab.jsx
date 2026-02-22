import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Users, Lock, Save, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { insertRecord, updateRecord } from '@/api/supabaseHelpers';

const PERMISSION_CATEGORIES = {
  shift: {
    label: 'シフト管理',
    permissions: [
      { id: 'shift_view', label: 'シフト閲覧' },
      { id: 'shift_edit', label: 'シフト編集' },
      { id: 'shift_create', label: 'シフト作成' },
      { id: 'shift_delete', label: 'シフト削除' },
      { id: 'request_view', label: 'シフト希望閲覧' },
    ]
  },
  user: {
    label: 'ユーザー管理',
    permissions: [
      { id: 'user_view', label: 'ユーザー閲覧' },
      { id: 'user_manage', label: 'ユーザー管理（招待・編集・削除）' },
    ]
  },
  store: {
    label: '店舗管理',
    permissions: [
      { id: 'store_manage', label: '店舗管理（作成・編集・削除）' },
    ]
  },
  settings: {
    label: 'システム設定',
    permissions: [
      { id: 'settings_manage', label: 'システム設定管理' },
    ]
  }
};

const DEFAULT_PERMISSIONS = {
  admin: ['shift_view', 'shift_edit', 'shift_create', 'shift_delete', 'request_view', 'user_view', 'user_manage', 'store_manage', 'settings_manage'],
  manager: ['shift_view', 'shift_edit', 'shift_create', 'shift_delete', 'request_view', 'user_view'],
  user: []
};

export default function RolePermissionsTab() {
  const queryClient = useQueryClient();
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_PERMISSIONS);

  const { data: roleSettings = [] } = useQuery({
    queryKey: ['roleSettings'],
    queryFn: () => supabase.from('AppSettings').select('*').eq('setting_key', 'role_permissions').then(res => res.data || []),
  });

  React.useEffect(() => {
    if (roleSettings.length > 0) {
      try {
        const settings = {};
        roleSettings.forEach(setting => {
          if (setting.store_id && setting.store_id.startsWith('role_')) {
            const role = setting.store_id.replace('role_', '');
            settings[role] = JSON.parse(setting.setting_value);
          }
        });
        if (Object.keys(settings).length > 0) {
          // Merge with defaults to ensure all roles exist
          setRolePermissions(prev => ({
            ...DEFAULT_PERMISSIONS,
            ...prev,
            ...settings
          }));
        }
      } catch (e) {
        console.error('Failed to parse role permissions:', e);
      }
    }
  }, [roleSettings]);

  const saveMutation = useMutation({
    mutationFn: async (role) => {
      const permissions = rolePermissions[role] || [];
      const settingKey = 'role_permissions';
      const storeId = `role_${role}`;
      
      const existing = roleSettings.find(s => s.store_id === storeId);
      
      if (existing) {
        await updateRecord('AppSettings', existing.id, {
          setting_key: settingKey,
          setting_value: JSON.stringify(permissions),
          store_id: storeId,
          description: `${role}ロールのデフォルト権限`
        });
      } else {
        await insertRecord('AppSettings', {
          setting_key: settingKey,
          setting_value: JSON.stringify(permissions),
          store_id: storeId,
          description: `${role}ロールのデフォルト権限`
        });
      }
    },
    onSuccess: (_, role) => {
      queryClient.invalidateQueries({ queryKey: ['roleSettings'] });
      toast.success(`${role === 'admin' ? '管理者' : role === 'manager' ? 'マネージャー' : 'ユーザー'}の権限を保存しました`);
    },
    onError: () => {
      toast.error('保存に失敗しました');
    }
  });

  const handlePermissionChange = (role, permissionId, checked) => {
    setRolePermissions(prev => {
      const currentPerms = prev[role] || [];
      return {
        ...prev,
        [role]: checked
          ? [...currentPerms, permissionId]
          : currentPerms.filter(p => p !== permissionId)
      };
    });
  };

  const resetToDefault = (role) => {
    if (window.confirm(`${role === 'admin' ? '管理者' : role === 'manager' ? 'マネージャー' : 'ユーザー'}の権限をデフォルトに戻しますか？`)) {
      setRolePermissions(prev => ({
        ...prev,
        [role]: DEFAULT_PERMISSIONS[role] || []
      }));
    }
  };

  const renderRoleCard = (role, roleLabel, description) => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {role === 'admin' && <Shield className="w-5 h-5 text-purple-600" />}
              {role === 'manager' && <Users className="w-5 h-5 text-blue-600" />}
              {role === 'user' && <Lock className="w-5 h-5 text-slate-600" />}
              {roleLabel}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetToDefault(role)}
              disabled={role === 'admin'}
            >
              リセット
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(role)}
              disabled={saveMutation.isPending || role === 'admin'}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(PERMISSION_CATEGORIES).map(([categoryKey, category]) => (
            <div key={categoryKey}>
              <h4 className="font-semibold text-slate-700 mb-3">{category.label}</h4>
              <div className="space-y-2">
                {category.permissions.map(permission => {
                  const perms = rolePermissions[role] || [];
                  return (
                    <label key={permission.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                      <Checkbox
                        checked={perms.includes(permission.id)}
                        onCheckedChange={(checked) => handlePermissionChange(role, permission.id, checked)}
                        disabled={role === 'admin'}
                      />
                      <span className="text-sm text-slate-700">{permission.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">ロール権限について</p>
            <ul className="space-y-1 text-blue-700">
              <li>• <strong>管理者</strong>: 全ての機能にアクセス可能（変更不可）</li>
              <li>• <strong>マネージャー</strong>: シフト管理とユーザー閲覧が可能</li>
              <li>• <strong>ユーザー</strong>: 自分のシフト希望のみ編集可能</li>
              <li>• ここで設定した権限は、新規ユーザーのデフォルト権限になります</li>
              <li>• 個別のユーザーには、ユーザー管理画面で追加の権限を付与できます</li>
            </ul>
          </div>
        </div>
      </div>

      <Tabs defaultValue="user" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="admin">管理者</TabsTrigger>
          <TabsTrigger value="manager">マネージャー</TabsTrigger>
          <TabsTrigger value="user">ユーザー</TabsTrigger>
        </TabsList>

        <TabsContent value="admin">
          {renderRoleCard('admin', '管理者権限', '全ての機能にアクセス可能（変更不可）')}
        </TabsContent>

        <TabsContent value="manager">
          {renderRoleCard('manager', 'マネージャー権限', 'シフト管理とチーム管理が可能')}
        </TabsContent>

        <TabsContent value="user">
          {renderRoleCard('user', 'ユーザー権限', '基本的なシフト提出が可能')}
        </TabsContent>
      </Tabs>
    </div>
  );
}
