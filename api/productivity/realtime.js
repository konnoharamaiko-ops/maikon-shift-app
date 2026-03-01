/**
 * Vercel Serverless Function: Real-time HR Productivity API
 * TempoVisor（売上）とジョブカン（勤怠）からリアルタイムデータを取得して人時生産性を計算
 * 時間帯別人時生産性：打刻時間 × 時間別売上（N3D1Servlet）で正確に算出
 */

import * as cheerio from 'cheerio';

// 部署コードと店舗名のマッピング（ジョブカン部署コード → 店舗名）
const STORE_DEPT_MAP = {
  '10110': '田辺店',
  '10400': '大正店',
  '10500': '天下茶屋店',
  '10600': '天王寺店',
  '10800': 'アベノ店',
  '10900': '心斎橋店',
  '11010': 'かがや店',
  '11200': 'エキマル',
  '12000': '北摂店',
  '12200': '堺東店',
  '12300': 'イオン松原店',
  '12400': 'イオン守口店',
  '20000': '美和堂FC店',
};

// 打刻場所名 → システム店舗名のマッピング
// ジョブカンの打刻場所名とシステム上の店舗名が異なる場合に使用
const LOCATION_TO_STORE_MAP = {
  'かがや店':           'かがや店',
  'アベノ店':           'アベノ店',
  '美和堂福島':         '美和堂FC店',
  '田辺店':             '田辺店',
  'イオンタウン松原店': 'イオン松原店',
  '北摂店':             '北摂店',
  '天王寺店':           '天王寺店',
  'イオンタウン守口店': 'イオン守口店',
  '心斎橋店':           '心斎橋店',
  '天下茶屋店':         '天下茶屋店',
  '堺東店':             '堺東店',
  '大正店':             '大正店',
  'エキマル':           'エキマル',
  'エキマルシェ':       'エキマル',
};

// TempoVisorの店舗名 → TempoVisor店舗コードのマッピング
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001',
  '大正店': '0002',
  '天下茶屋店': '0003',
  '天王寺店': '0004',
  'アベノ店': '0005',
  '心斎橋店': '0006',
  'かがや店': '0007',
  'エキマル': '0008',
  '北摂店': '0009',
  '堺東店': '0010',
  'イオン松原店': '0011',
  'イオン守口店': '0012',
  '美和堂FC店': '0013',
};

// デフォルト営業時間（Supabaseから取得できない場合のフォールバック）
// 曜日別設定は { weekday: {open, close}, sunday: {open, close}, is_closed: false } 形式
const DEFAULT_BUSINESS_HOURS = {
  '田辺店':       { open: 9,  close: 19 },
  '大正店':       { open: 10, close: 18 },
  '天下茶屋店':   { open: 10, close: 18 },
  '天王寺店':     { open: 10, close: 18 },
  'アベノ店':     { open: 10, close: 18 },
  '心斎橋店':     { open: 10, close: 18 },
  'かがや店':     { open: 10, close: 18 },
  'エキマル':     { open: 10, close: 22 },
  '北摂店':       { open: 10, close: 18 },
  '堺東店':       { open: 10, close: 20 }, // 月〜土は10-20時（日は10-19時）
  'イオン松原店': { open: 9,  close: 20 },
  'イオン守口店': { open: 9,  close: 20 },
  '美和堂FC店':   { open: 10, close: 18 }, // 日曜休み
};

// 全13店舗リスト
const ALL_STORES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', 'エキマル', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂FC店'
];

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
    const tempovisorUser = process.env.TEMPOVISOR_USERNAME || 'manu';
    const tempovisorPass = process.env.TEMPOVISOR_PASSWORD || 'manus';
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';

    // 並行してデータ取得（Supabase店舗設定も取得）
    const [salesResult, attendanceResult, storeSettingsResult] = await Promise.allSettled([
      fetchTempoVisorAllData(tempovisorUser, tempovisorPass),
      fetchJobcanAttendance(jobcanCompany, jobcanUser, jobcanPass),
      fetchStoreSettings(),
    ]);

    const salesData = salesResult.status === 'fulfilled' ? salesResult.value : { stores: [], hourly: {} };
    const attendance = attendanceResult.status === 'fulfilled' ? attendanceResult.value : { stores: {}, employees: [] };
    const storeSettings = storeSettingsResult.status === 'fulfilled' ? storeSettingsResult.value : {};

    // 店舗ごとに統合（時間帯別人時生産性を含む）
    const storeData = mergeStoreData(salesData.stores, salesData.hourly, attendance.stores, storeSettings);
    const employees = attendance.employees || [];

    return res.status(200).json({
      success: true,
      data: storeData,
      employees: employees,
      timestamp: new Date().toISOString(),
      sources: {
        tempovisor: salesResult.status === 'fulfilled' ? 'live' : `error: ${salesResult.reason?.message}`,
        jobcan: attendanceResult.status === 'fulfilled' ? 'live' : `error: ${attendanceResult.reason?.message}`,
        store_settings: storeSettingsResult.status === 'fulfilled' ? 'live' : 'default',
      }
    });

  } catch (error) {
    console.error('Realtime API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch realtime data',
      message: error.message,
    });
  }
}

/**
 * SupabaseからStoresテーブルの店舗設定（営業時間・休業日）を取得
 */
async function fetchStoreSettings() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[StoreSettings] Supabase credentials not found, using defaults');
    return {};
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/Stores?select=store_name,business_hours,temporary_closures`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('[StoreSettings] Supabase fetch failed:', response.status);
      return {};
    }

    const stores = await response.json();
    const settingsMap = {};
    stores.forEach(store => {
      if (store.store_name) {
        settingsMap[store.store_name] = {
          business_hours: store.business_hours || null,
          temporary_closures: store.temporary_closures || [],
        };
      }
    });
    return settingsMap;
  } catch (err) {
    console.warn('[StoreSettings] Error fetching store settings:', err.message);
    return {};
  }
}

/**
 * 現在の日本時間（JST）に基づいて店舗の営業時間を取得
 * Supabaseの設定がある場合はそちらを優先、なければデフォルト値を使用
 */
function getBusinessHoursForToday(storeName, storeSettings, jstDayOfWeek) {
  // 曜日マッピング（0=日曜, 1=月曜, ..., 6=土曜）
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayKeys[jstDayOfWeek];

  const settings = storeSettings[storeName];

  if (settings && settings.business_hours) {
    const bh = settings.business_hours;
    // 曜日別設定がある場合
    const dayHours = bh[dayKey];
    if (dayHours) {
      if (dayHours.is_closed) {
        return { open: 0, close: 0, is_closed: true };
      }
      const open = dayHours.open ? parseInt(dayHours.open.split(':')[0]) : 10;
      const close = dayHours.close ? parseInt(dayHours.close.split(':')[0]) : 18;
      return { open, close, is_closed: false };
    }
    // 曜日別設定がない場合は全日共通設定を探す
    if (bh.open !== undefined) {
      return { open: bh.open, close: bh.close, is_closed: false };
    }
  }

  // Supabase設定なし → デフォルト値を使用
  const defaultHours = DEFAULT_BUSINESS_HOURS[storeName] || { open: 10, close: 18 };

  // デフォルト値での曜日別処理
  if (storeName === '美和堂FC店' && jstDayOfWeek === 0) {
    return { open: 0, close: 0, is_closed: true }; // 日曜休み
  }
  if (storeName === '堺東店' && jstDayOfWeek === 0) {
    return { open: 10, close: 19, is_closed: false }; // 日曜は10-19時
  }

  return { ...defaultHours, is_closed: false };
}

/**
 * 臨時休業日かどうかを確認
 */
function isTemporaryClosure(storeName, storeSettings, jstDateStr) {
  const settings = storeSettings[storeName];
  if (!settings || !settings.temporary_closures) return false;

  return settings.temporary_closures.some(tc => {
    if (tc.date === jstDateStr) return true;
    if (tc.start_date && tc.end_date) {
      return jstDateStr >= tc.start_date && jstDateStr <= tc.end_date;
    }
    return false;
  });
}

/**
 * TempoVisorにログインしてCookieを取得
 */
async function loginTempoVisor(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
  const baseUrl = 'https://www.tenpovisor.jp/alioth/servlet/';

  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });

  const initialCookies = extractCookies(getRes);

  const loginBody = new URLSearchParams({
    userId: username,
    password: password,
    loginType: '1',
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

  return { cookies: allCookies, baseUrl };
}

/**
 * TempoVisorから全店舗の売上データと時間別売上を取得
 */
async function fetchTempoVisorAllData(username, password) {
  const { cookies, baseUrl } = await loginTempoVisor(username, password);

  // 全店舗の日次売上を取得
  const salesUrl = `${baseUrl}N3D1Servlet?mode=1&type=0`;
  const salesRes = await fetch(salesUrl, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': baseUrl,
    },
  });

  const salesHtml = await salesRes.text();
  const $sales = cheerio.load(salesHtml);

  const stores = [];

  $sales('table tr').each((i, row) => {
    if (i === 0) return; // ヘッダーをスキップ
    const cells = $sales(row).find('td').toArray();
    if (cells.length < 5) return;

    const storeName = $sales(cells[0]).text().trim();
    if (!storeName || !TEMPOVISOR_STORE_CODES[storeName]) return;

    const salesText = $sales(cells[1]).text().trim().replace(/,/g, '');
    const todaySales = parseInt(salesText) || 0;

    const updateTime = $sales(cells[cells.length - 1]).text().trim();

    stores.push({
      store_name: storeName,
      store_code: TEMPOVISOR_STORE_CODES[storeName],
      today_sales: todaySales,
      monthly_sales: 0,
      update_time: updateTime,
    });
  });

  // 時間別売上を取得
  const hourlyData = await fetchAllStoresHourlySales(cookies, baseUrl);

  return { stores, hourly: hourlyData };
}

/**
 * 全店舗の時間別売上を取得（N3D1Servlet）
 */
async function fetchAllStoresHourlySales(cookies, baseUrl) {
  const hourlyUrl = `${baseUrl}N3D1Servlet?mode=2&type=0`;
  const hourlyRes = await fetch(hourlyUrl, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': baseUrl,
    },
  });

  const hourlyHtml = await hourlyRes.text();
  const $hourly = cheerio.load(hourlyHtml);

  const storeHourly = {};

  // 各店舗の時間別売上テーブルを解析
  $hourly('table').each((tableIdx, table) => {
    const rows = $hourly(table).find('tr').toArray();
    if (rows.length < 2) return;

    // ヘッダー行から店舗名を取得
    const headerCells = $hourly(rows[0]).find('td,th').toArray();
    if (headerCells.length === 0) return;

    const firstCellText = $hourly(headerCells[0]).text().trim();

    // 店舗名を特定
    let rowStoreName = null;
    for (const storeName of Object.keys(TEMPOVISOR_STORE_CODES)) {
      if (firstCellText.includes(storeName)) {
        rowStoreName = storeName;
        break;
      }
    }
    if (!rowStoreName) return;

    // 時間別売上データを解析
    const hourly = {};
    for (let r = 1; r < rows.length; r++) {
      const cells = $hourly(rows[r]).find('td').toArray();
      if (cells.length < 2) continue;

      const hourText = $hourly(cells[0]).text().trim();
      const hourMatch = hourText.match(/^(\d{1,2})/);
      if (!hourMatch) continue;

      const hour = parseInt(hourMatch[1]);
      const salesText = $hourly(cells[1]).text().trim().replace(/,/g, '');
      const sales = parseInt(salesText) || 0;

      hourly[hour] = sales;
    }

    if (Object.keys(hourly).length > 0) {
      storeHourly[rowStoreName] = hourly;
    } else {
      storeHourly[rowStoreName] = {};
    }
  });

  return storeHourly;
}

/**
 * ジョブカンから本日の勤務状況を取得
 * 
 * テーブル列構造（12列）：
 * [0] スタッフ名 + 部署コード + 打刻場所（例: 冨永 純隆 11010 店1018->かがや店）
 * [1] リンク（出入詳細・月次出勤簿）
 * [2] 出勤状況（勤務中/退勤済み/休憩中/未出勤）
 * [3] シフト時間
 * [4] 出勤時刻（シフト形式）
 * [5] 直近退室
 * [6] 出勤打刻時刻（例: 08:48 (08:48)）
 * [7] 退勤打刻時刻（退勤済みの場合）
 * [8] 労働時間（例: 5時間20分）
 * [9] 休憩時間（例: 30分）
 * [10] 概算給与
 * [11] エラー
 */
async function fetchJobcanAttendance(companyId, loginId, password) {
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

  const workUrl = 'https://ssl.jobcan.jp/client/work-state/show/?submit_type=today&searching=1&list_type=normal&number_par_page=300&retirement=work';
  const workRes = await fetch(workUrl, {
    headers: {
      'Cookie': allCookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssl.jobcan.jp/client/',
    },
    redirect: 'follow',
  });

  const workHtml = await workRes.text();
  const $work = cheerio.load(workHtml);

  const storeAttendance = {};
  const employees = [];

  let targetTable = null;
  $work('table').each((i, table) => {
    const headerRow = $work(table).find('tr').first();
    const headerText = headerRow.text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    throw new Error('Jobcan: Work state table not found');
  }

  const rows = $work(targetTable).find('tr').toArray();

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    // 12列のデータ行のみ処理（2列のシフト詳細行はスキップ）
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim().replace(/\s+/g, ' ');
    if (!staffCell) continue;

    // 部署コードを取得
    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const deptCode = deptMatch[1];
    const deptStoreName = STORE_DEPT_MAP[deptCode]; // 所属店舗
    if (!deptStoreName) continue;

    // スタッフ名を取得
    const nameMatch = staffCell.match(/^(.+?)\s*\d{5}/);
    const staffName = nameMatch ? nameMatch[1].replace(/\xa0/g, ' ').trim() : staffCell.split(/\d{5}/)[0].trim();

    // 打刻場所を取得（例: 店1018->かがや店 → かがや店）
    const locationMatch = staffCell.match(/店\d+->(.+)$/);
    const rawLocation = locationMatch ? locationMatch[1].trim() : null;
    const clockLocation = rawLocation ? (LOCATION_TO_STORE_MAP[rawLocation] || null) : null;

    // 出勤状況
    const status = $work(cells[2]).text().trim();

    // 出勤打刻時刻：cells[6]の形式は "08:48 (08:48)" → 括弧内が実際の打刻時刻
    const clockInRaw = $work(cells[6]).text().trim().replace(/\s+/g, ' ');
    const clockInBracket = clockInRaw.match(/\((\d{1,2}:\d{2})\)/);
    const clockIn = clockInBracket ? clockInBracket[1] : clockInRaw.match(/^(\d{1,2}:\d{2})/) ? clockInRaw.match(/^(\d{1,2}:\d{2})/)[1] : null;

    // 退勤打刻時刻：cells[7]の形式は "14:08 (14:08)" → 括弧内が実際の打刻時刻
    const clockOutRaw = $work(cells[7]).text().trim().replace(/\s+/g, ' ');
    const clockOutBracket = clockOutRaw.match(/\((\d{1,2}:\d{2})\)/);
    const clockOut = clockOutBracket ? clockOutBracket[1] : clockOutRaw.match(/^(\d{1,2}:\d{2})/) ? clockOutRaw.match(/^(\d{1,2}:\d{2})/)[1] : null;

    // 労働時間・休憩時間
    const workTimeText = $work(cells[8]).text().trim();
    const breakTimeText = $work(cells[9]).text().trim();

    const workMinutes = parseJapaneseTime(workTimeText);
    const breakMinutes = parseJapaneseTime(breakTimeText);
    const netMinutes = Math.max(0, workMinutes - breakMinutes);
    const netHours = parseFloat((netMinutes / 60).toFixed(2));

    // 打刻時間をパース（分単位）
    const clockInMinutes = parseTimeToMinutes(clockIn);
    const clockOutMinutes = parseTimeToMinutes(clockOut);

    // 休憩開始時刻の推定（退勤時刻から労働時間を引いた時点）
    // 休憩中の場合：出勤時刻から現在まで働いているが、休憩時間帯は除外
    // ジョブカンは休憩時間の合計のみ提供するため、休憩は出勤時刻から連続して計算
    // 実際には休憩開始・終了時刻は取得できないため、
    // 休憩中ステータスの場合は「出勤してから現在まで」を人時として扱う
    // （休憩時間帯の除外は難しいため、休憩中も勤務中と同様に扱う）

    // 振り分け先の店舗を決定
    // - 勤務中・休憩中：打刻場所の店舗に振り分け（掛け持ち対応）
    // - 退勤済み・未出勤：所属店舗に振り分け
    let assignedStore = deptStoreName;
    if ((status === '勤務中' || status === '休憩中') && clockLocation) {
      assignedStore = clockLocation;
    }

    const employee = {
      name: staffName,
      dept_code: deptCode,
      dept_store_name: deptStoreName,   // 所属店舗
      store_name: assignedStore,         // 振り分け先店舗（打刻場所優先）
      clock_location: clockLocation,     // 打刻場所
      status: status,
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      clock_in_minutes: clockInMinutes,   // 分単位（例: 10:30 → 630）
      clock_out_minutes: clockOutMinutes, // 分単位（退勤済みの場合）
      work_hours: netHours,
      break_minutes: breakMinutes,        // 休憩時間（分）
      work_time_text: workTimeText,
      break_time_text: breakTimeText,
    };

    employees.push(employee);

    // 振り分け先店舗に集計
    if (!storeAttendance[assignedStore]) {
      storeAttendance[assignedStore] = {
        store_name: assignedStore,
        total_employees: 0,
        attended_employees: 0,
        working_employees: 0,
        break_employees: 0,
        total_hours: 0,
        employees: [],
      };
    }

    const store = storeAttendance[assignedStore];
    store.total_employees++;

    if (status === '勤務中' || status === '退勤済み' || status === '休憩中') {
      store.attended_employees++;
      store.total_hours += netHours;
    }
    if (status === '勤務中') {
      store.working_employees++;
    }
    if (status === '休憩中') {
      store.break_employees++;
    }

    store.employees.push(employee);
  }

  Object.values(storeAttendance).forEach(store => {
    store.total_hours = parseFloat(store.total_hours.toFixed(1));
  });

  return { stores: storeAttendance, employees };
}

/**
 * 売上データ・時間別売上・勤怠データを統合
 * 時間帯別人時生産性を計算して返す
 */
function mergeStoreData(sales, hourlyData, attendance, storeSettings = {}) {
  // 現在の日本時間（Vercel環境はUTCなのでgetUTCHours/getUTCMinutesを使用）
  const now = new Date();
  // UTC時刻に9時間を加算してJST時刻を表すDateオブジェクトを作成
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentHour = jstNow.getUTCHours();
  const currentMinutes = jstNow.getUTCHours() * 60 + jstNow.getUTCMinutes();
  const jstDayOfWeek = jstNow.getUTCDay(); // 0=日曜, 1=月曜, ..., 6=土曜
  const jstDateStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;

  return ALL_STORES.map(storeName => {
    const salesInfo = sales.find(s => s.store_name === storeName) || {
      store_code: TEMPOVISOR_STORE_CODES[storeName] || '',
      store_name: storeName,
      today_sales: 0,
      monthly_sales: 0,
      update_time: '',
    };

    const attendInfo = attendance[storeName] || {
      store_name: storeName,
      total_employees: 0,
      working_employees: 0,
      break_employees: 0,
      attended_employees: 0,
      total_hours: 0,
      employees: [],
    };

    const storeEmployees = attendInfo.employees || [];

    // 本日の営業時間を取得（Supabase設定優先、なければデフォルト）
    const businessHours = getBusinessHoursForToday(storeName, storeSettings, jstDayOfWeek);

    // 臨時休業日チェック
    const isClosed = businessHours.is_closed || isTemporaryClosure(storeName, storeSettings, jstDateStr);

    const hourly = hourlyData[storeName] || {};

    // 時間帯別人時生産性を計算
    const hourlyProductivity = isClosed ? [] : calculateHourlyProductivity(
      storeEmployees,
      hourly,
      businessHours,
      currentHour,
      currentMinutes
    );

    const totalHours = attendInfo.total_hours || 0;
    const todaySales = salesInfo.today_sales || 0;
    const productivity = totalHours > 0 ? Math.round(todaySales / totalHours) : 0;

    return {
      tenpo_name: storeName,
      code: salesInfo.store_code || TEMPOVISOR_STORE_CODES[storeName] || '',
      kingaku: todaySales.toString(),
      monthly_sales: salesInfo.monthly_sales || 0,
      wk_cnt: attendInfo.attended_employees || attendInfo.working_employees || 0,
      working_now: attendInfo.working_employees || 0,
      break_now: attendInfo.break_employees || 0,
      total_employees: attendInfo.total_employees,
      wk_tm: totalHours,
      spd: productivity.toString(),
      update_time: salesInfo.update_time || '',
      employees: storeEmployees,
      hourly_productivity: hourlyProductivity,  // 時間帯別人時生産性
      business_hours: businessHours,
      is_closed: isClosed,
    };
  });
}

/**
 * 時間帯別人時生産性を計算
 * 
 * 休憩中スタッフの扱い：
 * - 休憩中ステータスは「勤務中」と同様に扱う
 * - 休憩時間帯は人時から除外（ただし休憩開始・終了時刻が不明なため、
 *   現状は休憩中も含めて計算し、break_minutesを按分して除外）
 * 
 * @param {Array} employees - スタッフ一覧（打刻時間付き）
 * @param {Object} hourly - 時間別売上 { '10': 36756, '11': 48108, ... }
 * @param {Object} businessHours - 営業時間 { open: 10, close: 18 }
 * @param {number} currentHour - 現在時刻（時）
 * @param {number} currentMinutes - 現在時刻（分単位）
 * @returns {Array} 時間帯別データ配列
 */
function calculateHourlyProductivity(employees, hourly, businessHours, currentHour, currentMinutes) {
  const result = [];

  // 対象時間帯を決定：営業時間 + 売上がある時間帯（動的拡張）
  const salesHours = Object.keys(hourly).map(h => parseInt(h)).filter(h => !isNaN(h) && hourly[h] > 0);
  const minHour = Math.min(businessHours.open, ...salesHours);
  const maxHour = Math.max(businessHours.close - 1, ...salesHours);

  // salesHoursが空の場合（salesHoursが[]）、スプレッドで Infinity/-Infinity になるため修正
  const safeMinHour = isFinite(minHour) ? minHour : businessHours.open;
  const safeMaxHour = isFinite(maxHour) ? maxHour : businessHours.close - 1;

  for (let hour = safeMinHour; hour <= safeMaxHour; hour++) {
    // この時間帯が営業時間内かどうか
    const isBusinessHour = hour >= businessHours.open && hour < businessHours.close;

    // 営業時間外かつ売上もない時間帯はスキップ
    if (!isBusinessHour && (hourly[hour] === undefined || hourly[hour] === 0)) {
      continue;
    }

    // この時間帯（hour:00 〜 hour+1:00）に在籍していた人時数を計算
    const slotStartMinutes = hour * 60;
    const slotEndMinutes = (hour + 1) * 60;

    // 現在時刻より未来の時間帯は、売上データがなければスキップ
    const isFutureSlot = slotStartMinutes >= currentMinutes;
    if (isFutureSlot && (hourly[hour] === undefined || hourly[hour] === 0)) {
      continue;
    }

    let personHours = 0;

    employees.forEach(emp => {
      // 勤務中・退勤済み・休憩中のスタッフを対象とする
      if (emp.status !== '勤務中' && emp.status !== '退勤済み' && emp.status !== '休憩中') return;
      if (emp.clock_in_minutes === null || emp.clock_in_minutes === undefined) return;

      const empStart = emp.clock_in_minutes;

      // 終了時刻の決定
      // - 退勤済み：退勤打刻時刻
      // - 勤務中・休憩中：現在時刻（未来スロットの場合はスロット終了時刻）
      const effectiveCurrentMinutes = isFutureSlot ? slotEndMinutes : currentMinutes;
      const empEnd = (emp.status === '退勤済み') && emp.clock_out_minutes
        ? emp.clock_out_minutes
        : effectiveCurrentMinutes;

      // この時間帯との重複時間（分）を計算
      const overlapStart = Math.max(empStart, slotStartMinutes);
      const overlapEnd = Math.min(empEnd, slotEndMinutes);
      const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

      if (overlapMinutes <= 0) return;

      // 休憩時間の按分除外
      // 総勤務時間に対する休憩時間の割合を、この時間帯の重複時間に按分
      let adjustedOverlapMinutes = overlapMinutes;
      if (emp.break_minutes > 0 && empEnd > empStart) {
        const totalWorkSpan = empEnd - empStart; // 出勤〜退勤の総時間（分）
        const breakRatio = Math.min(1, emp.break_minutes / totalWorkSpan);
        adjustedOverlapMinutes = overlapMinutes * (1 - breakRatio);
      }

      personHours += adjustedOverlapMinutes / 60;
    });

    const hourlySales = hourly[hour] !== undefined ? hourly[hour] : 0;
    const hourlyProductivityValue = personHours > 0 ? Math.round(hourlySales / personHours) : 0;

    result.push({
      hour,
      label: `${hour}:00〜${hour + 1}:00`,
      sales: hourlySales,
      person_hours: parseFloat(personHours.toFixed(2)),
      productivity: hourlyProductivityValue,
      is_business_hour: isBusinessHour,
    });
  }

  return result;
}

/**
 * 時刻文字列（HH:MM）を分単位に変換
 * @param {string} timeStr - "10:30" 形式
 * @returns {number|null} 分単位（例: 630）、解析できない場合はnull
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '') return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/**
 * レスポンスからSet-CookieヘッダーをCookie文字列として抽出
 */
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
    if (cookiePart.includes('=')) {
      cookies.push(cookiePart);
    }
  });

  return cookies.join('; ');
}

/**
 * 既存のCookieと新しいCookieをマージ
 */
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

/**
 * 日本語の時間表記（例: "9時間0分"）を分に変換
 */
function parseJapaneseTime(timeText) {
  if (!timeText || timeText === '-') return 0;

  const hoursMatch = timeText.match(/(\d+)時間/);
  const minutesMatch = timeText.match(/(\d+)分/);

  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;

  if (!hoursMatch && !minutesMatch) {
    const colonMatch = timeText.match(/(\d+):(\d+)/);
    if (colonMatch) {
      return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
    }
  }

  return hours * 60 + minutes;
}

export const config = {
  maxDuration: 60,
};
