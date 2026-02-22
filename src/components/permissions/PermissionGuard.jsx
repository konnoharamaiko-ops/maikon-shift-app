import React from 'react';
import { Shield, Lock } from 'lucide-react';
import { usePermissions } from './usePermissions';
import { useAuth } from '@/lib/AuthContext';

/**
 * Component to guard content based on permissions
 * Shows fallback UI when user doesn't have permission
 */
export function PermissionGuard({ 
  children, 
  requireFeature,
  requireStoreAction,
  storeId,
  fallback,
  showLockIcon = true
}) {
  const { user } = useAuth();
  const { canAccessFeature, canAccessStore } = usePermissions(user);

  let hasPermission = true;

  if (requireFeature) {
    hasPermission = canAccessFeature(requireFeature);
  } else if (requireStoreAction && storeId) {
    hasPermission = canAccessStore(storeId, requireStoreAction);
  }

  if (!hasPermission) {
    if (fallback) {
      return fallback;
    }

    if (!showLockIcon) {
      return null;
    }

    return (
      <div className="flex items-center justify-center p-8 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-sm text-slate-600 font-medium">この機能にアクセスする権限がありません</p>
          <p className="text-xs text-slate-400 mt-1">管理者に権限の付与を依頼してください</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Component to show/hide UI elements based on permissions
 */
export function PermissionVisible({ 
  children, 
  requireFeature,
  requireStoreAction,
  storeId
}) {
  const { user } = useAuth();
  const { canAccessFeature, canAccessStore } = usePermissions(user);

  let hasPermission = true;

  if (requireFeature) {
    hasPermission = canAccessFeature(requireFeature);
  } else if (requireStoreAction && storeId) {
    hasPermission = canAccessStore(storeId, requireStoreAction);
  }

  if (!hasPermission) {
    return null;
  }

  return <>{children}</>;
}
