/**
 * Vercel Serverless Function: ジョブカンスタッフ同期API
 * ジョブカンのスタッフ一覧・詳細からスタッフ種別を取得してSupabaseにキャッシュする
 * 初回セットアップ時または「スタッフ情報を同期」ボタン押下時に実行
 */

import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    // ジョブカンにログイン
    const cookies = await loginJobcan(jobcanCompany, jobcanUser, jobcanPass);

    // スタッフ一覧を取得（部署コード・スタッフID・スタッフ名を取得）
    const staffList = await fetchStaffList(cookies);
    console.log(`[SyncStaff] Found ${staffList.length} staff members`);

    // 各スタッフの詳細を並列取得（スタッフ種別を取得）
    const BATCH_SIZE = 5; // 同時接続数を制限
    const staffDetails = [];

    for (let i = 0; i < staffList.length; i += BATCH_SIZE) {
      const batch = staffList.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(staff => fetchStaffDetail(cookies, staff))
      );
      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          staffDetails.push(result.value);
        } else {
          console.warn(`[SyncStaff] Failed to fetch detail for ${batch[idx].name}:`, result.reason?.message);
          // 詳細取得失敗でも基本情報は保存
          staffDetails.push({ ...batch[idx], staff_type: '不明' });
        }
      });
    }

    console.log(`[SyncStaff] Fetched details for ${staffDetails.length} staff members`);

    // Supabaseに保存（upsert）
    const upsertResult = await upsertStaffToSupabase(supabaseUrl, supabaseKey, staffDetails);

    return res.status(200).json({
      success: true,
      synced: staffDetails.length,
      staff: staffDetails.map(s => ({
        name: s.name,
        dept_code: s.dept_code,
        store_name: s.store_name,
        staff_type: s.staff_type,
      })),
      message: `${staffDetails.length}名のスタッフ情報を同期しました`,
    });

  } catch (error) {
    console.error('[SyncStaff] Error:', error);
    return res.status(500).json({
      error: 'スタッフ同期に失敗しました',
      message: error.message,
    });
  }
}

/**
 * ジョブカンにログインしてCookieを返す
 */
async function loginJobcan(companyId, loginId, password) {
  const loginUrl = 'https://ssl.jobcan.jp/login/client/';

  const getRes = await fetch(loginUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });

  const initialCookies = extractCookies(getRes);
  const loginHtml = await getRes.text();
  const $login = cheerio.load(loginHtml);
  const csrfToken = $login('input[name="token"]').val() || '';

  const loginBody = new URLSearchParams({
    token: csrfToken,
    client_login_id: companyId,
    client_manager_login_id: loginId,
    client_login_password: password,
    url: '/client',
    login_type: '2',
  }).toString();

  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
      'Referer': loginUrl,
    },
    body: loginBody,
    redirect: 'manual',
  });

  const loginCookies = extractCookies(loginRes);
  const allCookies = mergeCookies(initialCookies, loginCookies);

  const location = loginRes.headers.get('location') || '';
  if (location.includes('error')) {
    throw new Error(`Jobcan login failed: ${location}`);
  }

  return allCookies;
}

/**
 * ジョブカンのスタッフ一覧ページからスタッフ基本情報を取得
 * URL: https://ssl.jobcan.jp/client/staff/
 */
async function fetchStaffList(cookies) {
  const staffListUrl = 'https://ssl.jobcan.jp/client/staff/?number_par_page=200&retirement=work';

  const res = await fetch(staffListUrl, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssl.jobcan.jp/client/',
    },
    redirect: 'follow',
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  const staffList = [];

  // スタッフ一覧テーブルを解析
  $('table').each((i, table) => {
    const headerText = $(table).find('tr').first().text();
    if (!headerText.includes('スタッフ') && !headerText.includes('コード')) return;

    $(table).find('tr').each((rowIdx, row) => {
      if (rowIdx === 0) return; // ヘッダー行スキップ
      const cells = $(row).find('td').toArray();
      if (cells.length < 3) return;

      // スタッフ詳細ページへのリンクを取得（スタッフIDを含む）
      const linkEl = $(row).find('a[href*="/client/staff/"]').first();
      const href = linkEl.attr('href') || '';
      const staffIdMatch = href.match(/\/client\/staff\/(\d+)/);
      if (!staffIdMatch) return;

      const staffId = staffIdMatch[1];
      const staffName = $(cells[0]).text().trim().replace(/\s+/g, ' ');
      if (!staffName) return;

      // 部署コード（スタッフコード）を取得
      let deptCode = '';
      let storeName = '';
      cells.forEach(cell => {
        const text = $(cell).text().trim();
        // 5桁数字 = 部署コード
        if (/^\d{5}$/.test(text)) deptCode = text;
        // 店舗名を含むセル
        if (text.includes('店') || text.includes('駅丸') || text.includes('エキマル')) storeName = text;
      });

      staffList.push({
        staff_id: staffId,
        name: staffName,
        dept_code: deptCode,
        store_name: storeName,
      });
    });
  });

  // テーブルから取得できない場合、リンクから直接取得
  if (staffList.length === 0) {
    $('a[href*="/client/staff/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const staffIdMatch = href.match(/\/client\/staff\/(\d+)/);
      if (!staffIdMatch) return;

      const staffId = staffIdMatch[1];
      const staffName = $(el).text().trim();
      if (!staffName || staffName.length < 2) return;

      // 重複チェック
      if (staffList.find(s => s.staff_id === staffId)) return;

      staffList.push({
        staff_id: staffId,
        name: staffName,
        dept_code: '',
        store_name: '',
      });
    });
  }

  console.log(`[SyncStaff] Staff list: ${staffList.length} members found`);
  return staffList;
}

/**
 * ジョブカンのスタッフ詳細ページからスタッフ種別を取得
 * URL: https://ssl.jobcan.jp/client/staff/{staffId}
 */
async function fetchStaffDetail(cookies, staff) {
  const detailUrl = `https://ssl.jobcan.jp/client/staff/${staff.staff_id}`;

  const res = await fetch(detailUrl, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssl.jobcan.jp/client/staff/',
    },
    redirect: 'follow',
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  let staffType = 'パート';  // デフォルト
  let deptCode = staff.dept_code;
  let storeName = staff.store_name;
  let staffCode = '';

  // 「スタッフ種別」フィールドを探す
  $('tr, .form-group, dl dt, label').each((i, el) => {
    const labelText = $(el).text().trim();
    if (labelText.includes('スタッフ種別') || labelText.includes('スタッフ区分')) {
      // 隣接するselect/inputの値を取得
      const nextEl = $(el).next();
      const selectVal = nextEl.find('select option:selected').text().trim() ||
                        nextEl.find('input[type="text"]').val() ||
                        nextEl.text().trim();
      if (selectVal) staffType = selectVal;
    }
    if (labelText.includes('スタッフコード')) {
      const nextEl = $(el).next();
      staffCode = nextEl.find('input').val() || nextEl.text().trim();
    }
  });

  // select要素から直接取得（スタッフ種別のselect）
  $('select').each((i, el) => {
    const name = $(el).attr('name') || $(el).attr('id') || '';
    if (name.includes('type') || name.includes('kind') || name.includes('staff_type')) {
      const selectedOption = $(el).find('option:selected').text().trim();
      if (selectedOption) staffType = selectedOption;
    }
  });

  // ページ内の「社員」テキストを検索（スタッフ種別フィールドの値として）
  const pageText = $('body').text();
  const typeMatch = pageText.match(/スタッフ種別[^\n]*?(社員|パート|アルバイト|契約社員|嘱託|役員)/);
  if (typeMatch) staffType = typeMatch[1];

  // スタッフコードから部署コードを推定（5桁数字）
  if (!deptCode && staffCode && /^\d{5}$/.test(staffCode)) {
    deptCode = staffCode;
  }

  console.log(`[SyncStaff] ${staff.name}: staffType=${staffType}, deptCode=${deptCode}`);

  return {
    ...staff,
    dept_code: deptCode,
    store_name: storeName,
    staff_type: staffType,
    staff_code: staffCode,
  };
}

/**
 * スタッフ情報をSupabaseにupsert
 */
async function upsertStaffToSupabase(supabaseUrl, supabaseKey, staffList) {
  const records = staffList.map(staff => ({
    id: `jc_${staff.staff_id || staff.name.replace(/\s/g, '_')}`,
    staff_name: staff.name,
    staff_id: staff.staff_id || null,
    dept_code: staff.dept_code || null,
    store_name: staff.store_name || null,
    staff_type: staff.staff_type || 'パート',
    synced_at: new Date().toISOString(),
    // 接客時間帯設定はデフォルトnull（ユーザーが後から設定）
  }));

  const response = await fetch(
    `${supabaseUrl}/rest/v1/StaffMaster?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(records),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SyncStaff] Supabase upsert error:', response.status, errorText);
    throw new Error(`Supabase upsert failed: ${response.status} ${errorText}`);
  }

  return true;
}

function extractCookies(response) {
  try {
    if (response.headers.getSetCookie) {
      const setCookies = response.headers.getSetCookie();
      if (setCookies && setCookies.length > 0) {
        return setCookies.map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ');
      }
    }
  } catch (e) {}
  const raw = response.headers.get('set-cookie') || '';
  if (!raw) return '';
  const cookies = [];
  const parts = raw.split(/,(?=[^;]+=)/);
  parts.forEach(part => {
    const cookiePart = part.trim().split(';')[0].trim();
    if (cookiePart.includes('=')) cookies.push(cookiePart);
  });
  return cookies.join('; ');
}

function mergeCookies(existing, newCookies) {
  if (!existing && !newCookies) return '';
  if (!existing) return newCookies;
  if (!newCookies) return existing;
  const cookieMap = {};
  const parseCookieStr = (str) => {
    str.split(';').forEach(c => {
      const idx = c.indexOf('=');
      if (idx > 0) {
        const key = c.substring(0, idx).trim();
        const val = c.substring(idx + 1).trim();
        if (key) cookieMap[key] = val;
      }
    });
  };
  parseCookieStr(existing);
  parseCookieStr(newCookies);
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

export const config = {
  maxDuration: 60,
};
