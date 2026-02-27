import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Shield, Users, LogOut, Settings, Menu, X, Home, BarChart3, User, Eye, CalendarHeart, FileEdit, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import NotificationMonitor from '@/components/notifications/NotificationMonitor';
import { fetchAll } from '@/api/supabaseHelpers';
import { supabase } from '@/api/supabaseClient';
import { invalidateStoreQueries, invalidateUserQueries } from '@/lib/invalidateHelpers';

export default function Layout({ children, currentPageName }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Supabase Realtime: Store/Userテーブルの変更を監視してキャッシュを自動更新
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('global-data-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Store' }, () => {
        invalidateStoreQueries(queryClient);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'User' }, () => {
        invalidateUserQueries(queryClient);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isAdmin = user?.user_role === 'admin';
  const isManager = user?.user_role === 'manager';
  const isAdminOrManager = isAdmin || isManager;

  // 未承認有給申請数を取得（管理者・マネージャーのみ）
  const { data: pendingLeaveCount = 0 } = useQuery({
    queryKey: ['pendingLeaveCount'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('PaidLeaveRequest')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdminOrManager,
    staleTime: 2 * 60 * 1000, // 2分間キャッシュ
    refetchInterval: 60000, // 60秒ごとに更新（30秒→ 60秒）
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const allNavItems = [
      { name: 'Dashboard', label: 'ホーム', icon: Home, show: true, mobileBottom: true, badgeCount: isAdminOrManager ? pendingLeaveCount : 0 },
      { name: 'Home', label: 'シフト希望', icon: Calendar, show: true, mobileBottom: true, badgeCount: 0 },
      { name: 'ShiftOverview', label: 'シフト一覧表', icon: Eye, show: true, mobileBottom: true, badgeCount: 0 },
      { name: 'Analytics', label: '有給管理・勤務分析', icon: CalendarHeart, show: true, mobileBottom: true, badgeCount: 0 },
      { name: 'ProductivityDashboard', label: '人時生産性', icon: TrendingUp, show: isAdminOrManager, mobileBottom: false, badgeCount: 0 },
      { name: 'Admin', label: 'シフト提出状況', icon: Shield, show: isAdminOrManager, mobileBottom: false, badgeCount: 0 },
      { name: 'ShiftCreation', label: 'シフト作成', icon: FileEdit, show: isAdminOrManager, mobileBottom: false, badgeCount: 0 },
      { name: 'StoreSettings', label: '店舗設定', icon: Shield, show: isAdminOrManager, mobileBottom: false, badgeCount: 0 },
      { name: 'UserManagement', label: 'ユーザー', icon: Users, show: isAdmin, mobileBottom: false, badgeCount: 0 },
      { name: 'SystemSettings', label: 'システム設定', icon: Settings, show: isAdmin, mobileBottom: false, badgeCount: 0 },
      { name: 'Settings', label: '基本設定', icon: User, show: true, mobileBottom: true, badgeCount: 0 },
  ].filter(item => item.show);

  const navItems = allNavItems;
  const bottomNavItems = allNavItems.filter(item => item.mobileBottom).slice(0, 5);
  const moreNavItems = allNavItems.filter(item => !item.mobileBottom);

  const displayName = user?.display_name || user?.metadata?.display_name || user?.full_name || user?.email || 'ユーザー';
  const roleLabel = user?.user_role === 'admin' ? 'Admin' : 
                    user?.user_role === 'manager' ? 'Manager' : 'User';

  const getPath = (name) => name === 'Dashboard' ? '/' : `/${name}`;
  const isActive = (name) => currentPageName === name;

  // Badge component for nav items
  const NavBadge = ({ count }) => {
    if (!count || count <= 0) return null;
    return (
      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Background notification monitor */}
      {user && <NotificationMonitor user={user} />}

      {/* Mobile Top Header - simplified */}
      <nav className="lg:hidden bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="px-3 py-2.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center relative">
              <Shield className="w-4 h-4 text-white" />
              {isAdminOrManager && pendingLeaveCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {pendingLeaveCount > 99 ? '99+' : pendingLeaveCount}
                </span>
              )}
            </div>
            <span className="font-bold text-sm text-slate-800">シフト提出状況</span>
          </Link>
          <div className="flex items-center gap-1.5">
            {user && <NotificationCenter user={user} />}
            {moreNavItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 h-8 w-8"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            )}
          </div>
        </div>
        
        {/* Mobile Menu Dropdown - only admin/manager items */}
        {mobileMenuOpen && moreNavItems.length > 0 && (
          <div className="border-t border-slate-200 bg-white shadow-xl absolute left-0 right-0 z-50">
            <div className="px-2 py-2 space-y-1">
              {moreNavItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={getPath(item.name)}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors",
                      isActive(item.name)
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="border-t border-slate-200 my-2"></div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <p className="text-xs text-indigo-600 capitalize">{roleLabel}</p>
                  </div>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  ログアウト
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Desktop Navigation */}
      <nav className="hidden lg:block bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-1">
              <Link to="/" className="mr-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
              </Link>
              {navItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={getPath(item.name)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors text-sm relative",
                      isActive(item.name)
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <div className="relative">
                      <Icon className="w-4 h-4" />
                      <NavBadge count={item.badgeCount} />
                    </div>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              {user && <NotificationCenter user={user} />}
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-right">
                  <span className="text-sm text-slate-800 font-medium block leading-tight max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <span className="text-xs text-indigo-600 capitalize">{roleLabel}</span>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-red-600 ml-1"
                  title="ログアウト"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      
      {/* Main Content - add bottom padding for mobile bottom nav */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-20 lg:pb-6">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {bottomNavItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.name);
            return (
              <Link
                key={item.name}
                to={getPath(item.name)}
                className={cn(
                  "flex flex-col items-center justify-center py-1.5 px-2 rounded-lg min-w-0 flex-1 transition-colors",
                  active ? "text-indigo-600" : "text-slate-400 active:text-slate-600"
                )}
              >
                <div className="relative">
                  <Icon className={cn("w-5 h-5", active && "text-indigo-600")} />
                  {item.badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                      {item.badgeCount > 99 ? '99+' : item.badgeCount}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[9px] mt-0.5 font-medium truncate max-w-full",
                  active ? "text-indigo-600" : "text-slate-400"
                )}>
                  {item.label}
                </span>
                {active && (
                  <div className="w-1 h-1 rounded-full bg-indigo-600 mt-0.5" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
