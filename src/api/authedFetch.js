import { supabase } from './supabaseClient';

/**
 * 現在のSupabaseセッションの access_token を Authorization ヘッダに付与して fetch する。
 * 生産性API等のサーバ側認証(requireAuth/requireAdmin)に対応するための共通ヘルパ。
 * 未ログイン時はトークンを付けずに送る（サーバ側で401となる）。
 */
export async function authedFetch(input, init = {}) {
  let token = '';
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token || '';
  } catch {
    token = '';
  }
  const headers = { ...(init.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(input, { ...init, headers });
}
