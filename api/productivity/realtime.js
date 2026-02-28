/**
 * Vercel Serverless Function: Real-time HR Productivity API
 * TempoVisor（売上）とジョブカン（勤怠）からリアルタイムデータを取得して人時生産性を計算
 */

import * as cheerio from 'cheerio';

// 部署コードと店舗名のマッピング（ジョブカン部署コード → 店舗名）
const STORE_DEPT_MAP = {
  '10110': '田辺店',
  '10120': '大正店',
  '10130': '天下茶屋店',
  '10140': '天王寺店',
  '10800': 'アベノ店',
  '10150': '心斎橋店',
  '11010': 'かがや店',
  '10170': 'エキマル',
  '12010': '北摂店',
  '10190': '堺東店',
  '12300': 'イオン松原店',
  '10210': 'イオン守口店',
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
      fetchTempoVisorSales(tempovisorUser, tempovisorPass),
      fetchJobcanAttendance(jobcanCompany, jobcanUser, jobcanPass),
    ]);

    const sales = salesResult.status === 'fulfilled' ? salesResult.value : [];
    const attendance = attendanceResult.status === 'fulfilled' ? attendanceResult.value : { stores: {}, employees: [] };

    // 店舗ごとに統合
    const storeData = mergeStoreData(sales, attendance.stores);
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
 * TempoVisorから本日の売上データを取得
 * フォームフィールド: id / pass
 * リダイレクト先: MainMenuServlet
 * テーブル: 田辺店を含む最後のテーブル（Table 64相当）
 */
async function fetchTempoVisorSales(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet?legacy=true';
  const baseUrl = 'https://www.tenpovisor.jp/alioth/servlet/';

  // Step1: GETでCookieを取得
  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });
  const initialCookies = extractCookies(getRes);

  // Step2: POSTでログイン（フィールド名: id / pass）
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

  // Step3: リダイレクト先（MainMenuServlet）を取得
  let location = loginRes.headers.get('location') || 'MainMenuServlet';
  let nextUrl;
  if (location.startsWith('http')) {
    nextUrl = location;
  } else if (location.startsWith('/')) {
    nextUrl = 'https://www.tenpovisor.jp' + location;
  } else {
    nextUrl = baseUrl + location;
  }

  const mainRes = await fetch(nextUrl, {
    headers: {
      'Cookie': allCookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'follow',
  });

  // Shift_JISデコード
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

  // テーブルの行を解析
  $(targetTable).find('tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const storeName = $(cells[0]).text().trim();
    if (!storeName || storeName === '店舗＼合計' || storeName === '合計') return;
    if (storeName === '千林店') return;
    if (!TEMPOVISOR_STORE_CODES[storeName]) return;

    // 列インデックス: 0=店舗名, 1=前年売上, 2=予算, 3=前月売上, 4=今月売上, 5=達成率, 6=前日売上, 7=当日売上, 8=更新時刻
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

  return stores;
}

/**
 * ジョブカンから本日の勤務状況を取得
 * フォームフィールド: token / client_login_id(会社ID) / client_manager_login_id(ログインID) / client_login_password
 */
async function fetchJobcanAttendance(companyId, loginId, password) {
  const loginUrl = 'https://ssl.jobcan.jp/login/client/';

  // Step1: GETでCSRFトークンを取得
  const getRes = await fetch(loginUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const initialCookies = extractCookies(getRes);
  const loginHtml = await getRes.text();

  const $login = cheerio.load(loginHtml);
  const csrfToken = $login('input[name="token"]').val() || '';

  // Step2: POSTでログイン
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

  // Step3: 勤務状況ページを取得
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

  // テーブルを探す（スタッフ/リンク/出勤状況/シフト/出勤/直近退室/労働時間/休憩時間 のヘッダーを持つテーブル）
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

  // 各行を解析（奇数行がデータ行、偶数行はシフト詳細）
  const rows = $work(targetTable).find('tr').toArray();
  
  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 8) continue;

    const staffCell = $work(cells[0]).text().trim();
    if (!staffCell) continue;

    // 部署コードを抽出（例: "志築 淳一12010 工房0918->北摂工場"）
    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const deptCode = deptMatch[1];
    const storeName = STORE_DEPT_MAP[deptCode];
    if (!storeName) continue; // 店舗以外（工場、通販部など）はスキップ

    // スタッフ名（部署コードより前の部分）
    const nameMatch = staffCell.match(/^(.+?)\s*\d{5}/);
    const staffName = nameMatch ? nameMatch[1].replace(/\xa0/g, ' ').trim() : staffCell.split(/\d{5}/)[0].trim();

    const status = $work(cells[2]).text().trim();
    const clockIn = $work(cells[4]).text().trim().replace(/\s+/g, '');
    const clockOut = $work(cells[5]).text().trim().replace(/\s+/g, '');
    const workTimeText = $work(cells[6]).text().trim();
    const breakTimeText = $work(cells[7]).text().trim();

    const workMinutes = parseJapaneseTime(workTimeText);
    const breakMinutes = parseJapaneseTime(breakTimeText);
    const netMinutes = Math.max(0, workMinutes - breakMinutes);
    const netHours = parseFloat((netMinutes / 60).toFixed(2));

    const employee = {
      name: staffName,
      dept_code: deptCode,
      store_name: storeName,
      status: status,
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      work_hours: netHours,
      work_time_text: workTimeText,
      break_time_text: breakTimeText,
    };

    employees.push(employee);

    if (!storeAttendance[storeName]) {
      storeAttendance[storeName] = {
        store_name: storeName,
        total_employees: 0,
        working_employees: 0,
        total_hours: 0,
        employees: [],
      };
    }

    const store = storeAttendance[storeName];
    store.total_employees++;

    if (status === '勤務中' || status === '退勤済み') {
      store.working_employees++;
      store.total_hours += netHours;
    }

    store.employees.push(employee);
  }

  // total_hoursを小数点1桁に丸める
  Object.values(storeAttendance).forEach(store => {
    store.total_hours = parseFloat(store.total_hours.toFixed(1));
  });

  return { stores: storeAttendance, employees };
}

/**
 * 売上データと勤怠データを統合（全13店舗を必ず含める）
 */
function mergeStoreData(sales, attendance) {
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
      total_hours: 0,
      employees: [],
    };

    const totalHours = attendInfo.total_hours || 0;
    const todaySales = salesInfo.today_sales || 0;
    const productivity = totalHours > 0 ? Math.round(todaySales / totalHours) : 0;

    return {
      tenpo_name: storeName,
      code: salesInfo.store_code || TEMPOVISOR_STORE_CODES[storeName] || '',
      kingaku: todaySales.toString(),
      monthly_sales: salesInfo.monthly_sales || 0,
      wk_cnt: attendInfo.working_employees,
      total_employees: attendInfo.total_employees,
      wk_tm: totalHours,
      spd: productivity.toString(),
      update_time: salesInfo.update_time || '',
      employees: attendInfo.employees || [],
    };
  });
}

/**
 * レスポンスからSet-CookieヘッダーをCookie文字列として抽出
 */
function extractCookies(response) {
  // Node.js fetch APIではset-cookieヘッダーの取得方法が異なる
  const raw = response.headers.get('set-cookie') || '';
  if (!raw) return '';
  
  // カンマ区切りの複数Cookieを処理
  const cookies = [];
  const parts = raw.split(/,(?=\s*[^;]+=[^;]+)/);
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
    // HH:MM形式
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
