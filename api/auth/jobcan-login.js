/**
 * Vercel Serverless Function: ジョブカンコードログインAPI
 * ジョブカンコード（employee_id）＋パスワードでSupabaseにログインする
 *
 * エンドポイント: POST /api/auth/jobcan-login
 * リクエストボディ: { jobcan_code: "113", password: "..." }
 * レスポンス: { access_token, refresh_token, user, profile }
 *
 * 仕組み:
 * 1. SupabaseのUserテーブルからjobcan_codeが一致するユーザーのメールアドレスを取得
 * 2. そのメールアドレス＋パスワードでSupabase Authにサインイン
 * 3. トークンとプロフィールを返す
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobcan_code, password } = req.body;

    if (!jobcan_code || !password) {
      return res.status(400).json({ error: 'ジョブカンコードとパスワードを入力してください' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase設定が不正です' });
    }

    // 1. ジョブカンコードからメールアドレスを検索（Service Roleキーを使用）
    const lookupKey = supabaseServiceKey || supabaseAnonKey;
    const userLookupRes = await fetch(
      `${supabaseUrl}/rest/v1/User?jobcan_code=eq.${encodeURIComponent(jobcan_code)}&select=id,email,full_name,is_active,jobcan_code&limit=1`,
      {
        headers: {
          'apikey': lookupKey,
          'Authorization': `Bearer ${lookupKey}`,
        },
      }
    );

    if (!userLookupRes.ok) {
      console.error('[JobcanLogin] User lookup failed:', userLookupRes.status);
      return res.status(500).json({ error: 'ユーザー検索に失敗しました' });
    }

    const users = await userLookupRes.json();

    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'このジョブカンコードは登録されていません。\n管理者にお問い合わせください。' });
    }

    const userRecord = users[0];

    // アカウントが無効化されている場合
    if (userRecord.is_active === false) {
      return res.status(401).json({ error: 'このアカウントは無効化されています。\n管理者にお問い合わせください。' });
    }

    if (!userRecord.email) {
      return res.status(401).json({ error: 'このジョブカンコードにはメールアドレスが設定されていません。\n管理者にお問い合わせください。' });
    }

    // 2. メールアドレス＋パスワードでSupabase Authにサインイン
    const signInRes = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userRecord.email,
          password: password,
        }),
      }
    );

    const signInData = await signInRes.json();

    if (!signInRes.ok) {
      const errMsg = signInData.error_description || signInData.msg || signInData.error || '';
      console.error('[JobcanLogin] SignIn failed:', signInRes.status, errMsg);

      if (errMsg.includes('Invalid login credentials') || signInRes.status === 400) {
        return res.status(401).json({ error: 'パスワードが違います。' });
      } else if (errMsg.includes('Email not confirmed')) {
        return res.status(401).json({ error: 'メールアドレスの確認が完了していません。' });
      } else if (errMsg.includes('too many requests') || errMsg.includes('rate limit')) {
        return res.status(429).json({ error: 'ログイン試行回数が上限に達しました。\nしばらく待ってから再度お試しください。' });
      } else {
        return res.status(401).json({ error: `ログインに失敗しました: ${errMsg}` });
      }
    }

    // 3. 成功：トークンとプロフィール情報を返す
    return res.status(200).json({
      success: true,
      access_token: signInData.access_token,
      refresh_token: signInData.refresh_token,
      expires_in: signInData.expires_in,
      token_type: signInData.token_type,
      user: signInData.user,
      profile: {
        id: userRecord.id,
        email: userRecord.email,
        full_name: userRecord.full_name,
        jobcan_code: userRecord.jobcan_code,
      },
    });

  } catch (error) {
    console.error('[JobcanLogin] Error:', error);
    return res.status(500).json({ error: 'サーバーエラーが発生しました', message: error.message });
  }
}
