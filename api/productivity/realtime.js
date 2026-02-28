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

// 各店舗の営業時間（開始時間・終了時間）
// 営業時間外の時間帯は計算から除外（ただし売上がある場合は動的に含める）
const STORE_BUSINESS_HOURS = {
  '田辺店':       { open: 9,  close: 19 },
  '大正店':       { open: 10, close: 18 },
  '天下茶屋店':   { open: 10, close: 18 },
  '天王寺店':     { open: 10, close: 18 },
  'アベノ店':     { open: 10, close: 18 },
  '心斎橋店':     { open: 10, close: 18 },
  'かがや店':     { open: 10, close: 18 },
  'エキマル':     { open: 10, close: 22 },
  '北摂店':       { open: 10, close: 18 },
  '堺東店':       { open: 10, close: 18 },
  'イオン松原店': { open: 9,  close: 20 },
  'イオン守口店': { open: 9,  close: 20 },
  '美和堂FC店':   { open: 10, close: 18 },
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

    // 並行してデータ取得
    const [salesResult, attendanceResult] = await Promise.allSettled([
      fetchTempoVisorAllData(tempovisorUser, tempovisorPass),
      fetchJobcanAttendance(jobcanCompany, jobcanUser, jobcanPass),
    ]);

    const salesData = salesResult.status === 'fulfilled' ? salesResult.value : { stores: [], hourly: {} };
    const attendance = attendanceResult.status === 'fulfilled' ? attendanceResult.value : { stores: {}, employees: [] };

    // 店舗ごとに統合（時間帯別人時生産性を含む）
    const storeData = mergeStoreData(salesData.stores, salesData.hourly, attendance.stores);
    const employees = attendance.employees || [];

    return res.status(200).json({
      success: true,
      data: storeData,
      employees: employees,
      timestamp: new Date().toISOString(),
      sources: {
        tempovisor: salesResult.status === 'fulfilled' ? 'live' : `error: ${salesResult.reason?.message}`,
        jobcan: attendanceResult.status === 'fulfilled' ? 'live' : `error: ${attendanceResult.reason?.message}`,
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

  const loginBody = `id=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}&submit=%E3%80%80%E3%83%AD%E3%82%B0%E3%82%A4%E3%83%B3%E3%80%80`;
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
    },
    body: loginBody,
    redirect: 'manual',
  });

  const loginCookies = extractCookies(loginRes);
  const allCookies = mergeCookies(initialCookies, loginCookies);

  const location = loginRes.headers.get('location') || 'MainMenuServlet';
  let nextUrl;
  if (location.startsWith('http')) nextUrl = location;
  else if (location.startsWith('/')) nextUrl = 'https://www.tenpovisor.jp' + location;
  else nextUrl = baseUrl + location;

  // メインメニューを取得してセッションを確立
  const mainRes = await fetch(nextUrl, {
    headers: { 'Cookie': allCookies, 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  });

  return { cookies: allCookies, mainRes };
}

/**
 * TempoVisorから本日の売上データ（総売上）と時間別売上を取得
 */
async function fetchTempoVisorAllData(username, password) {
  const { cookies, mainRes } = await loginTempoVisor(username, password);

  // メインメニューから総売上データを取得
  const buffer = await mainRes.arrayBuffer();
  const html = new TextDecoder('shift_jis').decode(buffer);
  const $ = cheerio.load(html);
  const stores = [];

  // 田辺店を含む最後のテーブルを探す（店舗別売上テーブル）
  let targetTable = null;
  $('table').each((i, table) => {
    const text = $(table).text();
    if (text.includes('田辺店') && text.includes('大正店')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    throw new Error('TempoVisor: Sales table not found');
  }

  $(targetTable).find('tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const storeName = $(cells[0]).text().trim();
    if (!storeName || storeName === '店舗＼合計' || storeName === '合計') return;
    if (storeName === '千林店') return;
    if (!TEMPOVISOR_STORE_CODES[storeName]) return;

    const todaySalesText = $(cells[7]).text().trim().replace(/[\\¥,￥\s]/g, '');
    const prevDaySalesText = $(cells[6]).text().trim().replace(/[\\¥,￥\s]/g, '');
    const monthlySalesText = $(cells[4]).text().trim().replace(/[\\¥,￥\s]/g, '');
    const updateTime = cells.length > 8 ? $(cells[8]).text().trim() : '';

    stores.push({
      store_code: TEMPOVISOR_STORE_CODES[storeName],
      store_name: storeName,
      today_sales: parseInt(todaySalesText) || 0,
      prev_day_sales: parseInt(prevDaySalesText) || 0,
      monthly_sales: parseInt(monthlySalesText) || 0,
      update_time: updateTime,
    });
  });

  // 時間別売上を全店舗分並列取得
  const today = new Date();
  // 日本時間に変換
  const jstOffset = 9 * 60;
  const jstDate = new Date(today.getTime() + (jstOffset - today.getTimezoneOffset()) * 60000);
  const dateStr = `${jstDate.getFullYear()}/${String(jstDate.getMonth()+1).padStart(2,'0')}/${String(jstDate.getDate()).padStart(2,'0')}`;

  const hourlyResults = await Promise.allSettled(
    ALL_STORES.map(storeName => {
      const storeCode = TEMPOVISOR_STORE_CODES[storeName];
      if (!storeCode) return Promise.resolve({ storeName, hourly: {} });
      return fetchHourlySalesForStore(cookies, storeCode, storeName, dateStr);
    })
  );

  const hourlyData = {};
  hourlyResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      hourlyData[result.value.storeName] = result.value.hourly;
    } else {
      hourlyData[ALL_STORES[i]] = {};
    }
  });

  return { stores, hourly: hourlyData };
}

/**
 * 特定店舗の時間別売上をN3D1Servletから取得
 * @returns { storeName, hourly: { '10': 36756, '11': 48108, ... } }
 */
async function fetchHourlySalesForStore(cookies, storeCode, storeName, dateStr) {
  const url = `https://www.tenpovisor.jp/alioth/rep/N3D1Servlet?chkcsv=false&scode1=${storeCode}&scode2=${storeCode}&time_type=1&interval=1&tani=1&yyyymmdd1=${dateStr}&yyyymmdd2=${dateStr}&pscode=${storeCode}`;

  const res = await fetch(url, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.tenpovisor.jp/alioth/servlet/MainMenuServlet',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    return { storeName, hourly: {} };
  }

  const buffer = await res.arrayBuffer();
  const html = new TextDecoder('shift_jis').decode(buffer);
  const $ = cheerio.load(html);

  const hourly = {};

  // Table 20（店舗名 | 10:00～ | 11:00～ | ... | 合計）を探す
  $('table').each((i, table) => {
    const headerRow = $(table).find('tr').first();
    const headerText = headerRow.text();
    // 時間帯ヘッダーを含むテーブルを特定
    if (!headerText.includes('店舗名') && !headerText.includes('合計')) return;
    if (!headerText.match(/\d+:\d+～/)) return;

    // ヘッダー行から時間帯を抽出
    const headers = [];
    headerRow.find('td, th').each((j, cell) => {
      headers.push($(cell).text().trim());
    });

    // データ行（店舗名が含まれる行）を解析
    $(table).find('tr').each((rowIdx, row) => {
      if (rowIdx === 0) return; // ヘッダー行スキップ
      const cells = $(row).find('td');
      const rowStoreName = $(cells[0]).text().trim();
      if (!rowStoreName || rowStoreName === '合計') return;

      cells.each((cellIdx, cell) => {
        if (cellIdx === 0) return; // 店舗名列スキップ
        const header = headers[cellIdx] || '';
        const timeMatch = header.match(/(\d+):\d+～/);
        if (!timeMatch) return;

        const hour = parseInt(timeMatch[1]);
        const salesText = $(cell).text().trim().replace(/[\\¥,￥\s]/g, '');
        const sales = parseInt(salesText) || 0;

        // 同じ時間帯が複数あれば加算
        if (hourly[hour] === undefined) {
          hourly[hour] = sales;
        } else {
          hourly[hour] += sales;
        }
      });
    });
  });

  return { storeName, hourly };
}

/**
 * ジョブカンから本日の勤務状況を取得
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
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim();
    if (!staffCell) continue;

    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const deptCode = deptMatch[1];
    const storeName = STORE_DEPT_MAP[deptCode];
    if (!storeName) continue;

    const nameMatch = staffCell.match(/^(.+?)\s*\d{5}/);
    const staffName = nameMatch ? nameMatch[1].replace(/\xa0/g, ' ').trim() : staffCell.split(/\d{5}/)[0].trim();

    const status = $work(cells[2]).text().trim();
    const clockIn = $work(cells[6]).text().trim().replace(/\s+/g, '').replace(/\(.*?\)/g, '');
    const clockOut = $work(cells[7]).text().trim().replace(/\s+/g, '').replace(/\(.*?\)/g, '');
    const workTimeText = $work(cells[8]).text().trim();
    const breakTimeText = $work(cells[9]).text().trim();

    const workMinutes = parseJapaneseTime(workTimeText);
    const breakMinutes = parseJapaneseTime(breakTimeText);
    const netMinutes = Math.max(0, workMinutes - breakMinutes);
    const netHours = parseFloat((netMinutes / 60).toFixed(2));

    // 打刻時間をパース（HH:MM形式）
    const clockInMinutes = parseTimeToMinutes(clockIn);
    const clockOutMinutes = parseTimeToMinutes(clockOut);

    const employee = {
      name: staffName,
      dept_code: deptCode,
      store_name: storeName,
      status: status,
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      clock_in_minutes: clockInMinutes,   // 分単位（例: 10:30 → 630）
      clock_out_minutes: clockOutMinutes, // 分単位（退勤済みの場合）
      work_hours: netHours,
      work_time_text: workTimeText,
      break_time_text: breakTimeText,
    };

    employees.push(employee);

    if (!storeAttendance[storeName]) {
      storeAttendance[storeName] = {
        store_name: storeName,
        total_employees: 0,
        attended_employees: 0,
        working_employees: 0,
        total_hours: 0,
        employees: [],
      };
    }

    const store = storeAttendance[storeName];
    store.total_employees++;

    if (status === '勤務中' || status === '退勤済み') {
      store.attended_employees++;
      store.total_hours += netHours;
    }
    if (status === '勤務中') {
      store.working_employees++;
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
function mergeStoreData(sales, hourlyData, attendance) {
  // 現在の日本時間
  const now = new Date();
  const jstNow = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);
  const currentHour = jstNow.getHours();
  const currentMinutes = jstNow.getHours() * 60 + jstNow.getMinutes();

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
      attended_employees: 0,
      total_hours: 0,
      employees: [],
    };

    const storeEmployees = attendInfo.employees || [];
    const hourly = hourlyData[storeName] || {};
    const businessHours = STORE_BUSINESS_HOURS[storeName] || { open: 10, close: 18 };

    // 時間帯別人時生産性を計算
    const hourlyProductivity = calculateHourlyProductivity(
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
      total_employees: attendInfo.total_employees,
      wk_tm: totalHours,
      spd: productivity.toString(),
      update_time: salesInfo.update_time || '',
      employees: storeEmployees,
      hourly_productivity: hourlyProductivity,  // 時間帯別人時生産性
      business_hours: businessHours,
    };
  });
}

/**
 * 時間帯別人時生産性を計算
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
  const salesHours = Object.keys(hourly).map(h => parseInt(h)).filter(h => hourly[h] > 0);
  const minHour = Math.min(businessHours.open, ...salesHours.filter(h => !isNaN(h)));
  const maxHour = Math.max(businessHours.close - 1, ...salesHours.filter(h => !isNaN(h)));

  for (let hour = minHour; hour <= maxHour; hour++) {
    // この時間帯が営業時間内かどうか
    const isBusinessHour = hour >= businessHours.open && hour < businessHours.close;

    // 営業時間外かつ売上もない時間帯はスキップ
    if (!isBusinessHour && (hourly[hour] === undefined || hourly[hour] === 0)) {
      continue;
    }

    // この時間帯（hour:00 〜 hour+1:00）に在籍していた人時数を計算
    const slotStartMinutes = hour * 60;
    const slotEndMinutes = (hour + 1) * 60;

    // 現在時刻より未来の時間帯はスキップ
    if (slotStartMinutes >= currentMinutes) {
      break;
    }

    let personHours = 0;

    employees.forEach(emp => {
      if (emp.status !== '勤務中' && emp.status !== '退勤済み') return;
      if (emp.clock_in_minutes === null || emp.clock_in_minutes === undefined) return;

      const empStart = emp.clock_in_minutes;
      // 退勤済みは退勤時間、勤務中は現在時刻を終了とする
      const empEnd = emp.status === '退勤済み' && emp.clock_out_minutes
        ? emp.clock_out_minutes
        : currentMinutes;

      // この時間帯との重複時間（分）を計算
      const overlapStart = Math.max(empStart, slotStartMinutes);
      const overlapEnd = Math.min(empEnd, slotEndMinutes);
      const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

      personHours += overlapMinutes / 60;
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
