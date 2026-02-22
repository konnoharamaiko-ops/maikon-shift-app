import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';

/**
 * Custom hook for checking user permissions
 * Provides granular permission checking for stores and features
 */
export function usePermissions(user) {
  const { data: permissions = [] } = useQuery({
    queryKey: ['permissions', user?.id],
    queryFn: () => supabase.from('Permission').select('*').eq('user_id', user?.id).then(res => res.data || []),
    enabled: !!user?.id,
  });

  const isAdmin = user?.user_role === 'admin' || user?.role === 'admin';
  const isManager = user?.user_role === 'manager';

  /**
   * Check if user can perform an action on a specific store
   */
  const canAccessStore = (storeId, action) => {
    // Admins have full access
    if (isAdmin) return true;

    // Check if user belongs to the store
    if (!user?.store_ids?.includes(storeId)) return false;

    // Managers have full access to their stores
    if (isManager) return true;

    // Check specific permission
    const storePermission = permissions.find(
      p => p.resource_type === 'store' && p.resource_id === storeId
    );

    return storePermission?.permissions?.includes(action) || false;
  };

  /**
   * Check if user can access a global feature
   */
  const canAccessFeature = (feature) => {
    // Admins have full access
    if (isAdmin) return true;

    const featurePermission = permissions.find(
      p => p.resource_type === 'feature' && p.resource_id === 'global'
    );

    return featurePermission?.permissions?.includes(feature) || false;
  };

  /**
   * Get all stores user can access with a specific permission
   */
  const getAccessibleStores = (action) => {
    if (isAdmin) return user?.store_ids || [];
    if (isManager) return user?.store_ids || [];

    return (user?.store_ids || []).filter(storeId => {
      const storePermission = permissions.find(
        p => p.resource_type === 'store' && p.resource_id === storeId
      );
      return storePermission?.permissions?.includes(action);
    });
  };

  /**
   * Check if user can manage users
   */
  const canManageUsers = () => {
    return isAdmin || canAccessFeature('user_manage');
  };

  /**
   * Check if user can view users
   */
  const canViewUsers = () => {
    return isAdmin || isManager || canAccessFeature('user_view');
  };

  /**
   * Check if user can manage stores
   */
  const canManageStores = () => {
    return isAdmin || canAccessFeature('store_manage');
  };

  /**
   * Check if user can manage settings
   */
  const canManageSettings = () => {
    return isAdmin || canAccessFeature('settings_manage');
  };

  /**
   * Check if user can create shifts for a store
   */
  const canCreateShifts = (storeId) => {
    return canAccessStore(storeId, 'shift_create');
  };

  /**
   * Check if user can edit shifts for a store
   */
  const canEditShifts = (storeId) => {
    return canAccessStore(storeId, 'shift_edit');
  };

  /**
   * Check if user can delete shifts for a store
   */
  const canDeleteShifts = (storeId) => {
    return canAccessStore(storeId, 'shift_delete');
  };

  /**
   * Check if user can view shifts for a store
   */
  const canViewShifts = (storeId) => {
    return canAccessStore(storeId, 'shift_view');
  };

  /**
   * Check if user can view shift requests for a store
   */
  const canViewRequests = (storeId) => {
    return canAccessStore(storeId, 'request_view');
  };

  return {
    isAdmin,
    isManager,
    permissions,
    canAccessStore,
    canAccessFeature,
    getAccessibleStores,
    canManageUsers,
    canViewUsers,
    canManageStores,
    canManageSettings,
    canCreateShifts,
    canEditShifts,
    canDeleteShifts,
    canViewShifts,
    canViewRequests,
  };
}