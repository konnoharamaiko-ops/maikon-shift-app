/**
 * Vercel Serverless Function: HR Productivity History API
 * 過去の人時生産性データを取得（ジョブカン勤怠 + TempoVisor売上）
 *
 * エンドポイント: POST /api/productivity/history
 * リクエストボディ: { date_from: "yyyy-mm-dd", date_to: "yyyy-mm-dd" }
 * レスポンス: { success: true, data: [...] }
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

// TempoVisorの店舗名からコードへのマッピング
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '10110',
  '大正店': '10120',
  '天下茶屋店': '10130',
  '天王寺店': '10140',
  'アベノ店': '10800',
  '心斎橋店': '10150',
  'かがや店': '11010',
  'エキマル': '10170',
  '北摂店': '12010',
  '堺東店': '10190',
  'イオン松原店': '12300',
  'イオン守口店': '10210',
  '美和堂FC店': '20000',
};

// 全13店舗リスト
const ALL_STORES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', 'エキマル', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂FC店'
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
    const tempovisorUser = process.env.TEMPOVISOR_USERNAME;
    const tempovisorPass = process.env.TEMPOVISOR_PASSWORD;

    if (!jobcanCompany || !jobcanUser || !jobcanPass) {
      return res.status(500).json({
        error: 'Jobcan credentials not configured',
      });
    }

    // ジョブカンにログインしてセッションを取得
    const jobcanCookies = await loginJobcan(jobcanCompany, jobcanUser, jobcanPass);

    // 日付範囲のリストを生成
    const dates = getDateRange(date_from, endDate);

    // 各日付のデータを取得
    const allData = [];

    for (const date of dates) {
      try {
        // ジョブカンから勤怠データを取得
        const attendanceResult = await fetchJobcanAttendanceForDate(jobcanCookies, date);

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

          const totalHours = attendInfo.total_hours || 0;
          const attendedEmployees = attendInfo.attended_employees || 0;

          return {
            tenpo_name: storeName,
            code: TEMPOVISOR_STORE_CODES[storeName] || '',
            wk_date: date,
            dayweek: getDayOfWeek(date),
            kingaku: '0', // 過去売上はTempoVisorから取得できないため0
            monthly_sales: 0,
            wk_cnt: attendedEmployees,
            working_now: attendInfo.working_employees || 0,
            total_employees: attendInfo.total_employees || 0,
            wk_tm: totalHours,
            spd: '0', // 売上データなしのため0
            update_time: '',
            employees: attendInfo.employees || [],
          };
        });

        allData.push(...dayData);
      } catch (dateError) {
        console.error(`Error fetching data for ${date}:`, dateError.message);
        // エラーがあっても継続（その日のデータはスキップ）
      }
    }

    return res.status(200).json({
      success: true,
      date_from,
      date_to: endDate,
      data: allData,
      timestamp: new Date().toISOString(),
      note: '売上データはリアルタイムAPIのみ対応。過去実績は勤怠データのみ表示。',
    });

  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch history data',
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

/**
 * 日付範囲のリストを生成
 */
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

/**
 * 日付間の日数差を計算
 */
function getDaysDifference(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 曜日を取得
 */
function getDayOfWeek(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const date = new Date(dateStr + 'T00:00:00+09:00');
  return days[date.getDay()];
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
