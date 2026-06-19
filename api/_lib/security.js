/**
 * 共有セキュリティヘルパ（CORS / サーバ側認証）
 * 注: Vercel は "_" 始まりのパスをサーバレス関数として公開しないため、ここは共有モジュール。
 */

const DEFAULT_ALLOWED_ORIGINS = ['https://maikon-shift-app.vercel.app'];

function getAllowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS;
  if (env && env.trim()) {
    return env.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

/**
 * 許可Originのみに限定したCORSを適用する。
 * プリフライト(OPTIONS)を処理した場合 true を返す（呼び出し側は即 return すること）。
 */
export function applyCors(req, res, { methods = 'GET,POST,OPTIONS' } = {}) {
  const origin = req.headers.origin;
  if (origin && getAllowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With, Accept');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  // service_role はサーバ専用名を優先（クライアントへ漏らさないため非VITE名を推奨）
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceKey };
}

function getBearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

/**
 * 呼び出し元のSupabaseセッションを検証。認証済みなら user、未認証なら null。
 */
export async function getAuthedUser(req) {
  const token = getBearer(req);
  const { url, anonKey } = getSupabaseConfig();
  if (!token || !url || !anonKey) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

/**
 * 認証必須。未認証なら 401 を送って null を返す。
 */
export async function requireAuth(req, res) {
  const user = await getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

/**
 * 管理者必須。User.user_role==='admin' を検証。失敗時は 401/403/500 を送って null。
 */
export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  const { url, serviceKey, anonKey } = getSupabaseConfig();
  const key = serviceKey || anonKey;
  if (!url || !key) {
    res.status(500).json({ error: 'Server is not configured' });
    return null;
  }
  try {
    const r = await fetch(
      `${url}/rest/v1/User?email=eq.${encodeURIComponent(user.email)}&select=user_role&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const rows = r.ok ? await r.json() : [];
    if (!Array.isArray(rows) || rows[0]?.user_role !== 'admin') {
      res.status(403).json({ error: 'Admin privileges required' });
      return null;
    }
    return user;
  } catch {
    res.status(500).json({ error: 'Authorization check failed' });
    return null;
  }
}
