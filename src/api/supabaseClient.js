import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,  // Automatically detect and handle auth tokens in URL (for invite/magic links)
  },
});

// セキュリティ: service_role キーはブラウザに同梱しない（VITE_ プレフィックスでビルドに焼き込まれるため）。
// 管理者操作はサーバAPI (/api/admin/users) 経由で実行する。
// 下の supabaseAdmin は旧クライアントと同じ呼び出し形状（.from().update().eq(), .auth.admin.*）と
// Supabase ネイティブの { data, error } 戻り値を保つ薄いシムで、呼び出し側は無改修で動作する。
async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || '';
}

async function adminRequest(action, payload = {}) {
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });
    let json = {};
    try { json = await res.json(); } catch { json = {}; }
    if (!res.ok) {
      return { data: null, error: { message: json.error || `Request failed (${res.status})`, status: res.status } };
    }
    return { data: json.data ?? null, error: json.error ?? null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}

export const supabaseAdmin = {
  from(table) {
    return {
      update(data) {
        return {
          eq(column, value) {
            return adminRequest('update_row', { table, data, match: { column, value } });
          },
        };
      },
    };
  },
  auth: {
    admin: {
      listUsers: () => adminRequest('list_users'),
      createUser: (attrs) => adminRequest('create_user', { attrs }),
      updateUserById: (id, attrs) => adminRequest('update_user', { id, attrs }),
      generateLink: (opts) => adminRequest('generate_link', { opts }),
      deleteUser: (id) => adminRequest('delete_user', { id }),
    },
  },
};
