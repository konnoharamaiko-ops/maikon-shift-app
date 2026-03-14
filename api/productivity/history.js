/**
 * Vercel Serverless Function: HR Productivity History API
 * 過去の人時生産性データを取得（ジョブカン勤怠 + TempoVisor売上）
 *
 * エンドポイント: POST /api/productivity/history
 * リクエストボディ: { date_from: "yyyy-mm-dd", date_to: "yyyy-mm-dd" }
 * レスポンス: { success: true, data: [...] }
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// 部署コードと店舗名/部署名のマッピング（ジョブカン部署コード → 名前）
const STORE_DEPT_MAP = {
  // ===== 店舗 =====
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
  // ===== 通販・企画・特販 =====
  '11021': '企画部',
  '11022': '通販部',
  '11025': '特販部',
  // ===== 工房・工場 =====
  '11012': 'かがや工場',
  '12010': '北摂工場',
  '11700': '都島工場',
  '11900': '鶴橋工房',
};

// 部署カテゴリ分類
const DEPT_CATEGORIES = {
  '通販部': 'online',
  '企画部': 'planning',
  '特販部': 'online',
  'かがや工場': 'manufacturing',
  '北摂工場': 'manufacturing',
  '都島工場': 'manufacturing',
  '鶴橋工房': 'manufacturing',
};

// TempoVisorの店舗名からコードへのマッピング
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001',
  '大正店': '0002',
  '天下茶屋店': '0003',
  '天王寺店': '0004',
  'アベノ店': '0005',
  '心斎橋店': '0006',
  'かがや店': '0007',
  '駅丸': '0008',
  '北摂店': '0009',
  '堺東店': '0010',
  'イオン松原店': '0011',
  'イオン守口店': '0012',
  '美和堂福島店': '0013',
};

// TempoVisorのHTML上の店舗名 → システム内店舗名のマッピング
const TEMPOVISOR_NAME_MAP = {
  '美和堂FC店': '美和堂福島店',
  'エキマルシェ新大阪': '駅丸',
  'エキマルシェ': '駅丸',
  '駅マルシェ新大阪': '駅丸',
  'エキマル新大阪': '駅丸',
  'エキマル': '駅丸',
};

// 全13店舗リスト
const ALL_STORES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', '駅丸', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂福島店'
];

export const config = {
  maxDuration: 60,
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { date_from, date_to } = req.body;

    if (!date_from) {
      return res.status(400).json({ error: 'date_from is required' });
    }

    const endDate = date_to || date_from;

    // 日付範囲の検証（最大31日）
    const daysDiff = getDaysDifference(date_from, endDate);
    if (daysDiff > 31) {
      return res.status(400).json({
        error: 'Date range exceeds maximum of 31 days',
        days: daysDiff,
      });
    }

    const jobcanCompany = process.env.JOBCAN_COMPANY_ID;
    const jobcanUser = process.env.JOBCAN_LOGIN_ID;
    const jobcanPass = process.env.JOBCAN_PASSWORD;
    const tempovisorUser = process.env.TEMPOVISOR_USERNAME || 'manu';
    const tempovisorPass = process.env.TEMPOVISOR_PASSWORD || 'manus';

    if (!jobcanCompany || !jobcanUser || !jobcanPass) {
      return res.status(500).json({
        error: 'Jobcan credentials not configured',
      });
    }

    // 日付範囲のリストを生成
    const dates = getDateRange(date_from, endDate);

    // ジョブカンログインとTempoVisorログインを並行実行
    const [jobcanCookies, tempoVisorSession] = await Promise.all([
      loginJobcan(jobcanCompany, jobcanUser, jobcanPass),
      loginTempoVisor(tempovisorUser, tempovisorPass),
    ]);

    // 各日付のデータを並列取得（ジョブカン勤怠 + TempoVisor売上）
    // TempoVisorは1日ずつ取得（N3D1Servletは日付指定でPOST）
    const dateResults = await Promise.allSettled(
      dates.map(async (date) => {
        const [attendanceResult, salesResult] = await Promise.all([
          fetchJobcanAttendanceForDate(jobcanCookies, date),
          fetchTempoVisorSalesForDate(tempoVisorSession.cookies, tempoVisorSession.repBaseUrl, date),
        ]);
        return { date, attendanceResult, salesResult };
      })
    );

    const allData = [];
    const departmentData = {};

    for (const result of dateResults) {
      if (result.status === 'rejected') {
        console.error(`Error fetching data:`, result.reason?.message);
        continue;
      }
      const { date, attendanceResult, salesResult } = result.value;

      // 全店舗のデータを生成
      const dayData = ALL_STORES.map(storeName => {
        const attendInfo = attendanceResult[storeName] || {
          store_name: storeName,
          total_employees: 0,
          attended_employees: 0,
          working_employees: 0,
          total_hours: 0,
          employees: [],
        };

        const salesInfo = salesResult[storeName] || { today_sales: 0 };
        const totalHours = attendInfo.total_hours || 0;
        const attendedEmployees = attendInfo.attended_employees || 0;
        const sales = salesInfo.today_sales || 0;
        const productivity = totalHours > 0 ? Math.round(sales / totalHours) : 0;

        return {
          tenpo_name: storeName,
          code: TEMPOVISOR_STORE_CODES[storeName] || '',
          wk_date: date,
          dayweek: getDayOfWeek(date),
          kingaku: String(sales),
          monthly_sales: 0,
          wk_cnt: attendedEmployees,
          working_now: attendInfo.working_employees || 0,
          total_employees: attendInfo.total_employees || 0,
          wk_tm: totalHours,
          spd: String(productivity),
          update_time: '',
          employees: attendInfo.employees || [],
        };
      });

      allData.push(...dayData);

      // 通販部・企画部・製造部のデータを生成
      const deptNames = Object.keys(DEPT_CATEGORIES);
      deptNames.forEach(deptName => {
        const attendInfo = attendanceResult[deptName];
        if (!attendInfo) return;
        const totalHours = attendInfo.total_hours || 0;
        const attendedEmployees = attendInfo.attended_employees || 0;

        if (!departmentData[deptName]) {
          departmentData[deptName] = {
            name: deptName,
            category: DEPT_CATEGORIES[deptName],
            dates: {},
          };
        }
        departmentData[deptName].dates[date] = {
          wk_date: date,
          dayweek: getDayOfWeek(date),
          total_hours: totalHours,
          attended_employees: attendedEmployees,
          employees: attendInfo.employees || [],
        };
      });
    }

    return res.status(200).json({
      success: true,
      date_from,
      date_to: endDate,
      data: allData,
      department_data: departmentData,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch history data',
      message: error.message,
    });
  }
}

// ============================================================
// TempoVisor関連
// ============================================================

/**
 * TempoVisorにログインしてセッションCookieを取得
 */
async function loginTempoVisor(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
  const repBaseUrl = 'https://www.tenpovisor.jp/alioth/rep/';

  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });

  const initialCookies = extractCookies(getRes);

  const loginBody = new URLSearchParams({
    id: username,
    pass: password,
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

  return { cookies: allCookies, repBaseUrl };
}

/**
 * 指定日付のTempoVisor売上データを取得（N3D1Servlet）
 */
async function fetchTempoVisorSalesForDate(cookies, repBaseUrl, dateStr) {
  // dateStr: "yyyy-mm-dd" → "yyyy/mm/dd" に変換
  const tvDate = dateStr.replace(/-/g, '/');

  const postBody = new URLSearchParams({
    chkcsv: 'false',
    chkcustom: '',
    shopcode: '',
    searched_time_slot1: '8',
    searched_time_slot2: '23',
    searched_yyyymmdd1: tvDate,
    searched_yyyymmdd2: tvDate,
    time_slot1_val: '8',
    time_slot2_val: '23',
    interval: '1',
    yyyymmdd1: tvDate,
    yyyymmdd2: tvDate,
    scode1: '0001',
    scode2: '2000',
    which_time_type: '1',
    time_type: '1',
    which_tani: '1',
    tani: '1',
    time_slot1: '8',
    time_slot2: '23',
    which_zeinuki: '1',
    zeinuki: '1',
    pan2_flag: '1',
    which1: '1',
    radio1: '1',
  });

  const hourlyUrl = `${repBaseUrl}N3D1Servlet`;

  const hourlyRes = await fetch(hourlyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': repBaseUrl,
    },
    body: postBody.toString(),
  });

  // TempoVisorのHTMLはShift-JIS（cp932）エンコーディング
  const buffer = await hourlyRes.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'cp932');

  const $ = cheerio.load(html);
  const storeSales = {};

  $('table').each((tableIdx, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;

    const headerCells = $(rows[0]).find('td,th').toArray();
    if (headerCells.length < 3) return;

    const firstHeaderText = $(headerCells[0]).text().trim();
    const secondHeaderText = headerCells.length > 1 ? $(headerCells[1]).text().trim() : '';

    // 店舗名ヘッダーを持つテーブルのみ処理
    const isHourlyTable = firstHeaderText === '店舗名' ||
      (firstHeaderText.length > 0 && firstHeaderText !== '合計' && secondHeaderText.match(/\d{1,2}:00/));

    if (!isHourlyTable) return;

    // ヘッダーから合計列を特定
    let totalColIndex = -1;
    const hourColumns = [];
    headerCells.forEach((cell, idx) => {
      if (idx === 0) return;
      const cellText = $(cell).text().trim();
      const hourMatch = cellText.match(/^(\d{1,2})[:：]/);
      if (hourMatch) {
        hourColumns.push({ colIndex: idx, hour: parseInt(hourMatch[1]) });
      } else if (cellText === '合計' || cellText === '計') {
        totalColIndex = idx;
      }
    });

    if (hourColumns.length === 0) return;

    // データ行を解析
    for (let r = 1; r < rows.length; r++) {
      const cells = $(rows[r]).find('td,th').toArray();
      if (cells.length < 2) continue;

      let storeName = $(cells[0]).text().trim();
      if (TEMPOVISOR_NAME_MAP[storeName]) storeName = TEMPOVISOR_NAME_MAP[storeName];
      if (!storeName || !TEMPOVISOR_STORE_CODES[storeName]) continue;

      // 合計（日次売上）を取得
      let todaySales = 0;
      if (totalColIndex >= 0 && totalColIndex < cells.length) {
        const totalText = $(cells[totalColIndex]).text().trim()
          .replace(/[\\¥,]/g, '')
          .replace(/[^\d-]/g, '');
        todaySales = Math.max(0, parseInt(totalText) || 0);
      } else {
        // 合計列がない場合は時間別売上の合計を計算
        hourColumns.forEach(({ colIndex }) => {
          if (colIndex >= cells.length) return;
          const salesText = $(cells[colIndex]).text().trim()
            .replace(/[\\¥,]/g, '')
            .replace(/[^\d-]/g, '');
          todaySales += Math.max(0, parseInt(salesText) || 0);
        });
      }

      storeSales[storeName] = { today_sales: todaySales };
    }
  });

  return storeSales;
}

// ============================================================
// ジョブカン関連
// ============================================================

/**
 * ジョブカンにログインしてCookieを取得
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
 * 指定日付のジョブカン勤務状況を取得
 */
async function fetchJobcanAttendanceForDate(cookies, date) {
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

  const storeAttendance = {};

  let targetTable = null;
  $work('table').each((i, table) => {
    const headerRow = $work(table).find('tr').first();
    const headerText = headerRow.text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    console.warn(`Jobcan: Work state table not found for date ${date}`);
    return storeAttendance;
  }

  const rows = $work(targetTable).find('tr').toArray();

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim();
    if (!staffCell) continue;

    // 部署コードを抽出
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

    store.employees.push({
      name: staffName,
      dept_code: deptCode,
      store_name: storeName,
      status,
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      work_hours: netHours,
    });
  }

  // total_hoursを小数点1桁に丸める
  Object.values(storeAttendance).forEach(store => {
    store.total_hours = parseFloat(store.total_hours.toFixed(1));
  });

  return storeAttendance;
}

// ============================================================
// ユーティリティ関数
// ============================================================

function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate + 'T00:00:00+09:00');
  const end = new Date(endDate + 'T00:00:00+09:00');

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function getDaysDifference(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getDayOfWeek(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const date = new Date(dateStr + 'T00:00:00+09:00');
  return days[date.getDay()];
}

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
