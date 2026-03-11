/**
 * Vercel Cron Function: 過去実績自動保存API
 * 毎日22:00 JST（13:00 UTC）に実行
 * ジョブカンから当日の勤怠データを取得してSupabaseのWorkHistoryテーブルに保存
 *
 * エンドポイント: GET /api/productivity/save-history
 * Cronスケジュール: 0 13 * * * (UTC 13:00 = JST 22:00)
 */

import * as cheerio from 'cheerio';

// 部署コードと店舗名のマッピング
const STORE_DEPT_MAP = {
  '10110': '田辺店',
  '10400': '大正店',
  '10500': '天下茶屋店',
  '10600': '天王寺店',
  '10800': 'アベノ店',
  '10900': '心斎橋店',
  '11010': 'かがや店',
  '11200': '駅丸',
  '12000': '北摂店',
  '12200': '堺東店',
  '12300': 'イオン松原店',
  '12400': 'イオン守口店',
  '20000': '美和堂福島店',
};

// 店舗名 → Supabase store_id のマッピング（Supabaseから動的取得も可能）
// 事前にSupabaseのStoreテーブルから取得した値を使用
const STORE_NAME_TO_ID_MAP = {
  '田辺店':       'tanabe',
  '大正店':       'taisho',
  '天下茶屋店':   'tengachaya',
  '天王寺店':     'tennoji',
  'アベノ店':     'abeno',
  '心斎橋店':     'shinsaibashi',
  'かがや店':     'kagaya',
  '駅丸':     'ekimaru',
  '北摂店':       'hokusetsu',
  '堺東店':       'sakaikita',
  'イオン松原店': 'aeon_matsubara',
  'イオン守口店': 'aeon_moriguchi',
  '美和堂福島店':   'miwado_fc',
};

export const config = {
  maxDuration: 300, // 5分タイムアウト（全スタッフの出入詳細取得に時間がかかるため）
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Cron認証チェック（Vercel Cronからのリクエストのみ許可）
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // 手動実行（管理者）の場合はクエリパラメータでも認証可能
    const manualKey = req.query.key;
    if (manualKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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

    // 対象日付を決定（クエリパラメータで指定可能、デフォルトは今日のJST日付）
    let targetDate = req.query.date;
    if (!targetDate) {
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      targetDate = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;
    }

    console.log(`[SaveHistory] 対象日付: ${targetDate}`);

    // ジョブカンにログイン
    const cookies = await loginJobcan(jobcanCompany, jobcanUser, jobcanPass);
    console.log('[SaveHistory] ジョブカンログイン成功');

    // 当日の勤怠データを取得（出入詳細ページから打刻場所も取得）
    const attendanceData = await fetchAttendanceWithLocation(cookies, targetDate);
    console.log(`[SaveHistory] 勤怠データ取得: ${attendanceData.length}件`);

    if (attendanceData.length === 0) {
      return res.status(200).json({
        success: true,
        date: targetDate,
        message: '勤怠データなし（休業日または未出勤）',
        saved: 0,
      });
    }

    // SupabaseのUserテーブルからjobcan_codeとuser_idのマッピングを取得
    const userMap = await fetchUserJobcanMap(supabaseUrl, supabaseKey);
    console.log(`[SaveHistory] ユーザーマップ取得: ${Object.keys(userMap).length}件`);

    // SupabaseのStoreテーブルからstore_idマッピングを取得
    const storeMap = await fetchStoreMap(supabaseUrl, supabaseKey);
    console.log(`[SaveHistory] 店舗マップ取得: ${Object.keys(storeMap).length}件`);

    // WorkHistoryテーブルに保存するデータを構築
    const historyRecords = [];
    for (const emp of attendanceData) {
      // 出勤していないスタッフはスキップ
      if (!emp.clock_in) continue;

      // store_idを決定（打刻場所優先）
      const storeName = emp.assigned_store || emp.dept_store_name;
      const storeId = storeMap[storeName] || STORE_NAME_TO_ID_MAP[storeName] || null;

      if (!storeId) {
        console.warn(`[SaveHistory] 店舗IDが見つかりません: ${storeName} (${emp.name})`);
        continue;
      }

      // user_idを決定（jobcan_codeからマッピング）
      const userId = emp.jobcan_code ? userMap[emp.jobcan_code] : null;

      historyRecords.push({
        user_id: userId || `jobcan_${emp.jobcan_code || emp.name}`,
        store_id: storeId,
        work_date: targetDate,
        clock_in: emp.clock_in || null,
        clock_out: emp.clock_out || null,
        break_minutes: emp.break_minutes || 0,
        work_minutes: emp.work_minutes || null,
        jobcan_code: emp.jobcan_code || null,
        staff_name: emp.name,
        dept_store_name: emp.dept_store_name,
        assigned_store: storeName,
        status: emp.status,
      });
    }

    console.log(`[SaveHistory] 保存対象レコード: ${historyRecords.length}件`);

    // Supabaseにupsert（同じwork_date + jobcan_codeのレコードは更新）
    const savedCount = await saveToSupabase(supabaseUrl, supabaseKey, historyRecords);

    return res.status(200).json({
      success: true,
      date: targetDate,
      total_attendance: attendanceData.length,
      saved: savedCount,
      records: historyRecords.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[SaveHistory] エラー:', error);
    return res.status(500).json({
      error: 'Failed to save history',
      message: error.message,
    });
  }
}

/**
 * ジョブカンにログインしてCookieを取得
 */
async function loginJobcan(companyId, loginId, password) {
  const loginUrl = 'https://ssl.jobcan.jp/login/client/';

  const getRes = await fetch(loginUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'follow',
  });
  const loginHtml = await getRes.text();
  const $login = cheerio.load(loginHtml);
  const csrfToken = $login('input[name="token"]').val() || '';
  const initialCookies = extractCookies(getRes);

  const loginBody = new URLSearchParams({
    'token': csrfToken,
    'client_login_id': companyId,
    'client_manager_login_id': loginId,
    'client_login_password': password,
    'login_type': '2',
  });

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
 * 指定日付の勤怠データを打刻場所付きで取得
 */
async function fetchAttendanceWithLocation(cookies, date) {
  const workUrl = `https://ssl.jobcan.jp/client/work-state/show/?submit_type=day&searching=1&list_type=normal&number_par_page=300&retirement=work&search_date=${date}`;

  const workRes = await fetch(workUrl, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssl.jobcan.jp/client/',
    },
    redirect: 'follow',
  });
  const workHtml = await workRes.text();
  const $work = cheerio.load(workHtml);

  // 勤務状況テーブルを検索
  let targetTable = null;
  $work('table').each((i, table) => {
    const headerText = $work(table).find('tr').first().text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    console.warn(`[SaveHistory] 勤務状況テーブルが見つかりません (date: ${date})`);
    return [];
  }

  const rows = $work(targetTable).find('tr').toArray();

  // スタッフIDリストを収集（出入詳細ページ取得用）
  const staffIdList = [];
  const staffBasicInfo = {};

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim().replace(/\s+/g, ' ');
    if (!staffCell) continue;

    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    const staffId = staffIdMatch ? staffIdMatch[1] : null;

    if (staffId) {
      staffIdList.push(staffId);
      staffBasicInfo[staffId] = {
        staffCell,
        deptCode: deptMatch[1],
        rowIndex: i,
      };
    }
  }

  // 出入詳細ページから打刻場所を並列取得
  const [year, month, day] = date.split('-');
  const stampDetailMap = {};

  const fetchWithTimeout = (url, options, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  const allStampResults = await Promise.allSettled(
    staffIdList.map(async (empId) => {
      const aditUrl = `https://ssl.jobcan.jp/client/adit?employee_id=${empId}&year=${year}&month=${parseInt(month)}&day=${parseInt(day)}`;
      const aditRes = await fetchWithTimeout(aditUrl, {
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://ssl.jobcan.jp/client/',
        },
        redirect: 'follow',
      }, 8000);

      const aditHtml = await aditRes.text();
      const $adit = cheerio.load(aditHtml);

      let clockInCode = null, clockOutCode = null, breakStartCode = null, breakEndCode = null;
      let hasAutoClockOut = false;
      let realClockInTime = null, realClockOutTime = null;

      // 打刻テーブルを解析
      const stampRows = [];
      $adit('table').each((ti, tbl) => {
        const hdr = $adit(tbl).find('tr').first().text();
        if (hdr.includes('打刻区分') && hdr.includes('打刻方法')) {
          $adit(tbl).find('tr').each((ri, row) => {
            if (ri === 0) return;
            const tds = $adit(row).find('td');
            if (tds.length < 4) return;
            const typeEl = $adit(tds[0]).find('select option[selected]');
            const stampType = typeEl.length > 0 ? typeEl.text().trim() : $adit(tds[0]).text().trim();
            const stampTime = $adit(tds[1]).text().trim();
            const stampMethod = $adit(tds[2]).text().trim();
            const placeEl = $adit(tds[3]).find('select option[selected]');
            const placeText = placeEl.length > 0 ? placeEl.text().trim() : $adit(tds[3]).text().trim();
            const codeMatch = placeText.match(/^(\d{5})/);
            const placeCode = codeMatch ? codeMatch[1] : null;
            const isAutoClockOut = stampMethod.includes('自動退出');
            stampRows.push({ stampType, stampTime, placeCode, isAutoClockOut });
          });
        }
      });

      if (stampRows.length > 0) {
        stampRows.forEach(({ stampType, stampTime, placeCode, isAutoClockOut }, rowIdx) => {
          if (!stampType) return;
          if (isAutoClockOut) { hasAutoClockOut = true; return; }
          if (stampType === '出勤' || stampType === '1') {
            if (placeCode) clockInCode = placeCode;
            if (stampTime) realClockInTime = stampTime;
          } else if (stampType === '休憩開始' || stampType === '3') {
            if (placeCode) breakStartCode = placeCode;
          } else if (stampType === '休憩終了' || stampType === '4') {
            if (placeCode) breakEndCode = placeCode;
          } else if (stampType === '退勤' || stampType === '退室' || stampType === '2' ||
                     stampType.startsWith('- ') || stampType === '-退勤') {
            if (!isAutoClockOut) {
              if (placeCode) clockOutCode = placeCode;
              if (stampTime) realClockOutTime = stampTime;
            }
          } else if (stampType.includes('(自動判別)')) {
            if (rowIdx === 0) {
              if (placeCode) clockInCode = placeCode;
              if (stampTime) realClockInTime = stampTime;
            } else {
              if (placeCode) clockOutCode = placeCode;
              if (stampTime) realClockOutTime = stampTime;
            }
          }
        });
      }

      return { empId, clockInCode, clockOutCode, breakStartCode, breakEndCode, hasAutoClockOut, realClockInTime, realClockOutTime };
    })
  );

  for (const result of allStampResults) {
    if (result.status === 'fulfilled') {
      const { empId, ...detail } = result.value;
      stampDetailMap[empId] = detail;
    }
  }

  // 勤怠データを構築
  const attendanceList = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim().replace(/\s+/g, ' ');
    if (!staffCell) continue;

    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const deptCode = deptMatch[1];
    const deptStoreName = STORE_DEPT_MAP[deptCode];
    if (!deptStoreName) continue;

    const nameMatch = staffCell.match(/^(.+?)\s*\d{5}/);
    const staffName = nameMatch ? nameMatch[1].replace(/\xa0/g, ' ').trim() : staffCell.split(/\d{5}/)[0].trim();

    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    const staffId = staffIdMatch ? staffIdMatch[1] : null;

    // ジョブカンスタッフコード（employee_id）
    const jobcanCode = staffId;

    let status = $work(cells[2]).text().trim();

    // 出勤打刻時刻
    const clockInRaw = $work(cells[6]).text().trim().replace(/\s+/g, ' ');
    const clockInBracket = clockInRaw.match(/\((\d{1,2}:\d{2})\)/);
    const clockIn = clockInBracket ? clockInBracket[1] : (clockInRaw.match(/^(\d{1,2}:\d{2})/) ? clockInRaw.match(/^(\d{1,2}:\d{2})/)[1] : null);

    // 退勤打刻時刻
    const clockOutRaw = $work(cells[7]).text().trim().replace(/\s+/g, ' ');
    const clockOutBracket = clockOutRaw.match(/\((\d{1,2}:\d{2})\)/);
    let clockOut = clockOutBracket ? clockOutBracket[1] : (clockOutRaw.match(/^(\d{1,2}:\d{2})/) ? clockOutRaw.match(/^(\d{1,2}:\d{2})/)[1] : null);

    // 自動退出の除外
    const empDetail = staffId ? stampDetailMap[staffId] : null;
    if (empDetail?.hasAutoClockOut && status === '退勤済み') {
      status = '勤務中';
      clockOut = null;
    } else if (empDetail?.realClockOutTime && status === '退勤済み') {
      clockOut = empDetail.realClockOutTime;
    }
    if (empDetail?.realClockInTime && clockIn) {
      // 出入詳細から取得した出勤時刻を優先
    }

    // 休憩時間
    const breakTimeText = $work(cells[9]).text().trim();
    const breakMinutes = parseJapaneseTime(breakTimeText);

    // 労働時間
    const workTimeText = $work(cells[8]).text().trim();
    const workMinutesRaw = parseJapaneseTime(workTimeText);
    const workMinutes = Math.max(0, workMinutesRaw - breakMinutes);

    // 振り分け先の店舗を決定（退勤後も出勤打刻場所を維持）
    const clockInStoreName = empDetail?.clockInCode ? STORE_DEPT_MAP[empDetail.clockInCode] : null;
    const clockOutStoreName = empDetail?.clockOutCode ? STORE_DEPT_MAP[empDetail.clockOutCode] : null;
    let assignedStore;
    if (status === '退勤済み') {
      assignedStore = clockInStoreName || clockOutStoreName || deptStoreName;
    } else {
      assignedStore = clockInStoreName || deptStoreName;
    }

    attendanceList.push({
      name: staffName,
      jobcan_code: jobcanCode,
      dept_code: deptCode,
      dept_store_name: deptStoreName,
      assigned_store: assignedStore,
      status,
      clock_in: clockIn,
      clock_out: clockOut,
      break_minutes: breakMinutes,
      work_minutes: workMinutes,
    });
  }

  return attendanceList;
}

/**
 * SupabaseのUserテーブルからjobcan_code → user_idのマッピングを取得
 */
async function fetchUserJobcanMap(supabaseUrl, supabaseKey) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/User?select=id,jobcan_code&jobcan_code=not.is.null`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!resp.ok) return {};
    const users = await resp.json();
    const map = {};
    users.forEach(u => {
      if (u.jobcan_code) map[u.jobcan_code] = u.id;
    });
    return map;
  } catch (e) {
    console.warn('[SaveHistory] User map fetch error:', e.message);
    return {};
  }
}

/**
 * SupabaseのStoreテーブルからstore_nameとidのマッピングを取得
 */
async function fetchStoreMap(supabaseUrl, supabaseKey) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/Store?select=id,name`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!resp.ok) return {};
    const stores = await resp.json();
    const map = {};
    stores.forEach(s => {
      if (s.name) map[s.name] = s.id;
    });
    return map;
  } catch (e) {
    console.warn('[SaveHistory] Store map fetch error:', e.message);
    return {};
  }
}

/**
 * WorkHistoryテーブルにデータをupsert
 */
async function saveToSupabase(supabaseUrl, supabaseKey, records) {
  if (records.length === 0) return 0;

  // WorkHistoryテーブルに対応したカラム名にマッピング
  const supabaseRecords = records.map(r => ({
    user_id: r.user_id,
    store_id: r.store_id,
    work_date: r.work_date,
    clock_in: r.clock_in,
    clock_out: r.clock_out,
    break_minutes: r.break_minutes || 0,
    work_minutes: r.work_minutes || null,
    jobcan_code: r.jobcan_code,
  }));

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/WorkHistory`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(supabaseRecords),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Supabase upsert failed: ${resp.status} ${errText}`);
  }

  console.log(`[SaveHistory] Supabase保存完了: ${records.length}件`);
  return records.length;
}

/**
 * 日本語時間テキストを分単位に変換（例: "7時間30分" → 450）
 */
function parseJapaneseTime(text) {
  if (!text) return 0;
  const hoursMatch = text.match(/(\d+)\s*時間/);
  const minutesMatch = text.match(/(\d+)\s*分/);
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  return hours * 60 + minutes;
}

/**
 * レスポンスヘッダーからCookieを抽出
 */
function extractCookies(response) {
  const cookies = [];
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    setCookieHeader.split(',').forEach(cookie => {
      const parts = cookie.trim().split(';');
      if (parts[0]) cookies.push(parts[0].trim());
    });
  }
  return cookies.join('; ');
}

/**
 * 既存のCookieと新しいCookieをマージ
 */
function mergeCookies(existing, newCookies) {
  if (!existing) return newCookies;
  if (!newCookies) return existing;
  const cookieMap = {};
  [existing, newCookies].forEach(cookieStr => {
    cookieStr.split(';').forEach(c => {
      const [key, ...vals] = c.trim().split('=');
      if (key) cookieMap[key.trim()] = vals.join('=');
    });
  });
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}
