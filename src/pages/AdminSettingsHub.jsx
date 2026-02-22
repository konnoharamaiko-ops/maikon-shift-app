import React from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Settings, Users, Store, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/AuthContext';

export default function AdminSettingsHub() {
  const { user } = useAuth();

  const isAdmin = !user ? true : (user?.role === 'admin' || user?.user_role === 'admin');

  // ゲストユーザーでも表示可能

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-red-50 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-center">アクセス権限がありません</CardTitle>
            <CardDescription className="text-center">
              このページは管理者のみアクセスできます
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">管理者設定</h1>
              <p className="text-sm text-slate-500">システム管理メニュー</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link to={createPageUrl('SystemSettings')}>
            <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Settings className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-xl">システム設定</CardTitle>
                <CardDescription>
                  アプリ全体の基本設定を管理
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>• 一般設定</li>
                  <li>• シフト設定</li>
                  <li>• 通知設定</li>
                  <li>• 詳細設定</li>
                </ul>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl('AdminSettings')}>
            <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Store className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-xl">店舗設定</CardTitle>
                <CardDescription>
                  店舗ごとの期限や設定を管理
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>• 提出期限設定</li>
                  <li>• 店舗別詳細設定</li>
                  <li>• 期限管理</li>
                </ul>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl('UserManagement')}>
            <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Users className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-xl">ユーザー管理</CardTitle>
                <CardDescription>
                  スタッフの招待・権限管理
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>• ユーザー招待</li>
                  <li>• 権限変更</li>
                  <li>• 店舗割り当て</li>
                  <li>• アカウント管理</li>
                </ul>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl('StoreManagement')}>
            <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer group h-full">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <CardTitle className="text-xl">店舗管理</CardTitle>
                <CardDescription>
                  店舗の追加・編集・管理
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>• 店舗情報編集</li>
                  <li>• 新規店舗追加</li>
                  <li>• 店舗の有効化/無効化</li>
                </ul>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}