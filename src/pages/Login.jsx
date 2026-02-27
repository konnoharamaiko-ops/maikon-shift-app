import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Shield, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const { isInviteFlow, authError: contextAuthError, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('login');
  const [resetSent, setResetSent] = useState(false);

  // Show context auth errors
  useEffect(() => {
    if (contextAuthError) {
      setError(contextAuthError);
    }
  }, [contextAuthError]);

  // Detect invite flow - show processing message briefly
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const hasAuthToken = hashParams.has('access_token') || queryParams.has('code') || queryParams.has('token_hash');
    
    if (hasAuthToken || isInviteFlow) {
      setIsProcessingInvite(true);
      const timer = setTimeout(() => setIsProcessingInvite(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [isInviteFlow]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // まずUserテーブルでメールアドレスの存在を確認
      const trimmedEmail = email.trim();
      const { data: userRecord } = await supabase
        .from('User')
        .select('id')
        .eq('email', trimmedEmail)
        .maybeSingle();

      const emailExists = !!userRecord;

      try {
        await login(trimmedEmail, password);
        // AuthContext handles the rest via onAuthStateChange
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('Invalid login credentials')) {
          if (emailExists) {
            // メールアドレスは存在するのでパスワードが違う
            setError('パスワードが違います。');
          } else {
            // メールアドレスが存在しない
            setError('このメールアドレスは登録されていません。');
          }
        } else if (msg.includes('Email not confirmed')) {
          setError('メールアドレスの確認が完了していません。\n受信トレイをご確認ください。');
        } else if (msg.includes('User not found') || msg.includes('user not found')) {
          setError('このメールアドレスは登録されていません。');
        } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
          setError('ログイン試行回数が上限に達しました。\nしばらく待ってから再度お試しください。');
        } else if (msg.includes('network') || msg.includes('fetch')) {
          setError('ネットワークエラーが発生しました。\nインターネット接続を確認してください。');
        } else {
          setError(`ログインに失敗しました。\n理由: ${msg || '不明なエラー'}`);
        }
      }
    } catch (outerErr) {
      setError('ネットワークエラーが発生しました。\nインターネット接続を確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setResetSent(true);
    } catch {
      setError('パスワードリセットメールの送信に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  // Show processing screen when handling invite link
  if (isProcessingInvite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800 mb-2">招待を処理中...</h1>
              <p className="text-sm text-slate-500 mb-6">
                アカウントの設定を行っています。しばらくお待ちください。
              </p>
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'reset') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">パスワードリセット</h1>
              <p className="text-sm text-slate-500 mt-2">
                登録済みのメールアドレスにリセットリンクを送信します
              </p>
            </div>

            {resetSent ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-slate-700 font-medium mb-2">メールを送信しました</p>
                <p className="text-sm text-slate-500 mb-6">
                  {email} にパスワードリセットリンクを送信しました。<br />
                  メールをご確認ください。
                </p>
                <Button
                  onClick={() => { setMode('login'); setResetSent(false); setError(null); }}
                  variant="outline"
                  className="w-full"
                >
                  ログイン画面に戻る
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-5">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-sm font-medium text-slate-700">
                    メールアドレス
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="example@email.com"
                      className="pl-10 h-12"
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'リセットリンクを送信'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="w-full text-center text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  ログイン画面に戻る
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">シフト提出アプリ</h1>
            <p className="text-sm text-slate-500 mt-2">
              アカウントにログインしてください
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap">{error}</span>
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                メールアドレス
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="pl-10 h-12"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                パスワード
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  className="pl-10 pr-10 h-12"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            <div className="text-right">
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(null); }}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                パスワードをお忘れですか？
              </button>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-indigo-200 transition-all"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ログイン'}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-400">
              ログインに問題がある場合は管理者にお問い合わせください
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
