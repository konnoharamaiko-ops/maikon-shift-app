/**
 * Vercel Serverless Function: Real-time HR Productivity API
 * TempoVisor（売上）とジョブカン（勤怠）からリアルタイムデータを取得して人時生産性を計算
 */

import * as cheerio from 'cheerio';

// 店舗コードマッピング（ジョブカン部署コード → 店舗名）
const STORE_DEPT_MAP = {
  '10110': { name: '田辺店', tempovisor: '田辺店' },
  '10120': { name: '大正店', tempovisor: '大正店' },
  '10130': { name: '天下茶屋店', tempovisor: '天下茶屋店' },
  '10140': { name: '天王寺店', tempovisor: '天王寺店' },
  '10800': { name: 'アベノ店', tempovisor: 'アベノ店' },
  '10150': { name: '心斎橋店', tempovisor: '心斎橋店' },
  '11010': { name: 'かがや店', tempovisor: 'かがや店' },
  '10170': { name: 'エキマル', tempovisor: 'エキマル' },
  '12010': { name: '北摂店', tempovisor: '北摂店' },
  '10190': { name: '堺東店', tempovisor: '堺東店' },
  '12300': { name: 'イオン松原店', tempovisor: 'イオン松原店' },
  '10210': { name: 'イオン守口店', tempovisor: 'イオン守口店' },
  '20000': { name: '美和堂FC店', tempovisor: '美和堂FC店' },
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

// 全13店舗リスト（データがなくても表示する）
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
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';

    // 並行してデータ取得
    const [salesResult, attendanceResult] = await Promise.allSettled([
      fetchTempoVisorSales(tempovisorUser, tempovisorPass),
      fetchJobcanAttendance(jobcanCompany, jobcanUser, jobcanPass),
    ]);

    const sales = salesResult.status === 'fulfilled' ? salesResult.value : [];
    const attendance = attendanceResult.status === 'fulfilled' ? attendanceResult.value : { stores: {}, employees: [] };

    // 店舗ごとに統合（全13店舗を必ず含める）
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
 * TempoVisorから本日の売上データを取得（Shift_JIS対応）
 */
async function fetchTempoVisorSales(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet?legacy=true';

  // Step1: まずGETでログインページを取得してCookieを得る
  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'manual',
  });

  const initialCookies = extractCookiesFromResponse(getRes);

  // Step2: POSTでログイン
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
    },
    body: `loginId=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&submit=%83%8D%83O%83C%83%93`,
    redirect: 'manual',
  });

  const loginCookies = extractCookiesFromResponse(loginRes);
  const allCookies = mergeCookies(initialCookies, loginCookies);

  // リダイレクト先を取得
  let nextUrl = loginRes.headers.get('location');
  if (!nextUrl) {
    nextUrl = 'https://www.tenpovisor.jp/alioth/board/topmenu';
  } else if (!nextUrl.startsWith('http')) {
    nextUrl = 'https://www.tenpovisor.jp' + nextUrl;
  }

  // Step3: トップメニューページを取得
  const topRes = await fetch(nextUrl, {
    headers: {
      'Cookie': allCookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'follow',
  });

  // Shift_JISデコード
  const buffer = await topRes.arrayBuffer();
  const html = decodeShiftJIS(buffer);

  const $ = cheerio.load(html);
  const stores = [];

  // sales_Listテーブルから店舗別売上を取得
  let tableFound = false;
  
  // テーブルを探す（IDまたはクラスで）
  $('table').each((tableIdx, table) => {
    const tableId = $(table).attr('id') || '';
    const tableClass = $(table).attr('class') || '';
    
    if (tableId === 'sales_List' || tableClass.includes('sales')) {
      tableFound = true;
      $(table).find('tr').each((i, row) => {
        if (i === 0) return; // ヘッダー行スキップ
        
        const cells = $(row).find('td');
        if (cells.length < 6) return;

        const storeName = $(cells[0]).text().trim();
        if (!storeName || storeName === '合計' || storeName === '店舗名') return;
        if (storeName === '千林店') return;

        const storeCode = TEMPOVISOR_STORE_CODES[storeName];
        if (!storeCode) return;

        const todaySalesText = $(cells[6] || cells[cells.length - 1]).text().trim().replace(/[¥,￥\s]/g, '');
        const prevDaySalesText = $(cells[5]).text().trim().replace(/[¥,￥\s]/g, '');
        const monthlySalesText = $(cells[1]).text().trim().replace(/[¥,￥\s]/g, '');
        const customersText = cells.length > 7 ? $(cells[7]).text().trim().replace(/[人,\s]/g, '') : '0';
        const updateTime = cells.length > 9 ? $(cells[9]).text().trim() : '';

        stores.push({
          store_code: storeCode,
          store_name: storeName,
          today_sales: parseInt(todaySalesText) || 0,
          prev_day_sales: parseInt(prevDaySalesText) || 0,
          monthly_sales: parseInt(monthlySalesText) || 0,
          customers: parseInt(customersText) || 0,
          update_time: updateTime,
        });
      });
    }
  });

  // sales_Listが見つからない場合、全テーブルを探す
  if (!tableFound || stores.length === 0) {
    $('tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;
      
      const firstCell = $(cells[0]).text().trim();
      if (TEMPOVISOR_STORE_CODES[firstCell]) {
        const storeName = firstCell;
        if (storeName === '千林店') return;
        
        const storeCode = TEMPOVISOR_STORE_CODES[storeName];
        const todaySalesText = $(cells[Math.min(6, cells.length - 1)]).text().trim().replace(/[¥,￥\s]/g, '');
        
        stores.push({
          store_code: storeCode,
          store_name: storeName,
          today_sales: parseInt(todaySalesText) || 0,
          prev_day_sales: 0,
          monthly_sales: 0,
          customers: 0,
          update_time: '',
        });
      }
    });
  }

  return stores;
}

/**
 * ジョブカンから本日の勤務状況を取得（CSRFトークン対応）
 */
async function fetchJobcanAttendance(companyId, loginId, password) {
  const loginPageUrl = 'https://ssl.jobcan.jp/login/client/';

  // Step1: GETでログインページを取得してCSRFトークンとCookieを得る
  const getRes = await fetch(loginPageUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const initialCookies = extractCookiesFromResponse(getRes);
  const loginHtml = await getRes.text();
  
  // CSRFトークンを取得
  const $ = cheerio.load(loginHtml);
  const csrfToken = $('input[name="_token"]').val() || 
                    $('meta[name="csrf-token"]').attr('content') || '';

  // Step2: POSTでログイン
  const loginRes = await fetch(loginPageUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
      'Referer': loginPageUrl,
    },
    body: `client_login_id=${encodeURIComponent(loginId)}&client_login_password=${encodeURIComponent(password)}&client_company_id=${encodeURIComponent(companyId)}&_token=${encodeURIComponent(csrfToken)}&login_type=client`,
    redirect: 'manual',
  });

  const loginCookies = extractCookiesFromResponse(loginRes);
  const allCookies = mergeCookies(initialCookies, loginCookies);
  
  const location = loginRes.headers.get('location') || '';
  
  // ログイン失敗チェック
  if (location.includes('error') || location.includes('login')) {
    throw new Error(`Jobcan login failed: redirected to ${location}`);
  }

  // Step3: 勤務状況ページを取得
  const workStateUrl = 'https://ssl.jobcan.jp/client/work-state/show/?submit_type=today&searching=1&list_type=normal&number_par_page=300&sort_order=&tags=&group_where_type=both&adit_group_id=0&retirement=work&employee_id=&work_kind%5B0%5D=0&group_id=0';

  const workRes = await fetch(workStateUrl, {
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

  // noteクラスのテーブルから勤務状況を取得
  $work('table.note tr, table tr').each((i, row) => {
    if (i === 0) return;
    
    const cells = $work(row).find('td');
    if (cells.length < 4) return;

    const staffCell = $work(cells[0]);
    const staffName = staffCell.find('a').first().text().trim();
    if (!staffName) return;
    
    const cellText = staffCell.text().trim();
    
    // 部署コードを抽出（例: "10110 店1018->田辺店"）
    const deptMatch = cellText.match(/(\d{5})/);
    if (!deptMatch) return;
    
    const deptCode = deptMatch[1];
    const storeInfo = STORE_DEPT_MAP[deptCode];
    if (!storeInfo) return;

    const status = $work(cells[2]).text().trim();
    const startTime = cells.length > 4 ? $work(cells[4]).text().trim() : '-';
    const endTime = cells.length > 5 ? $work(cells[5]).text().trim() : '-';
    const workTimeText = cells.length > 6 ? $work(cells[6]).text().trim() : '-';
    const breakTimeText = cells.length > 7 ? $work(cells[7]).text().trim() : '-';

    const workMinutes = parseWorkTime(workTimeText);
    const breakMinutes = parseWorkTime(breakTimeText);
    const netWorkMinutes = Math.max(0, workMinutes - breakMinutes);
    const netWorkHours = netWorkMinutes / 60;

    const employee = {
      name: staffName,
      dept_code: deptCode,
      store_name: storeInfo.name,
      status: status,
      start_time: startTime === '-' ? null : startTime,
      end_time: endTime === '-' ? null : endTime,
      work_hours: parseFloat(netWorkHours.toFixed(2)),
      work_time_text: workTimeText,
    };

    employees.push(employee);

    if (!storeAttendance[storeInfo.name]) {
      storeAttendance[storeInfo.name] = {
        store_name: storeInfo.name,
        total_employees: 0,
        working_employees: 0,
        total_hours: 0,
        employees: [],
      };
    }

    const store = storeAttendance[storeInfo.name];
    store.total_employees++;
    
    if (status === '勤務中' || status === '退勤済み') {
      store.working_employees++;
      store.total_hours += netWorkHours;
    }
    
    store.employees.push(employee);
  });

  return { stores: storeAttendance, employees };
}

/**
 * 売上データと勤怠データを統合（全13店舗を必ず含める）
 */
function mergeStoreData(sales, attendance) {
  const result = [];

  ALL_STORES.forEach(storeName => {
    const salesInfo = sales.find(s => s.store_name === storeName) || {
      store_code: TEMPOVISOR_STORE_CODES[storeName] || '',
      store_name: storeName,
      today_sales: 0,
      customers: 0,
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

    result.push({
      tenpo_name: storeName,
      code: salesInfo.store_code || TEMPOVISOR_STORE_CODES[storeName] || '',
      kingaku: todaySales.toString(),
      wk_cnt: attendInfo.working_employees,
      total_employees: attendInfo.total_employees,
      wk_tm: parseFloat(totalHours.toFixed(1)),
      spd: productivity.toString(),
      customers: salesInfo.customers || 0,
      update_time: salesInfo.update_time || '',
      employees: attendInfo.employees || [],
    });
  });

  return result;
}

/**
 * ArrayBufferをShift_JISからUTF-8にデコード
 */
function decodeShiftJIS(buffer) {
  try {
    const decoder = new TextDecoder('shift_jis');
    return decoder.decode(buffer);
  } catch (e) {
    // フォールバック: UTF-8として読む
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }
}

/**
 * レスポンスからCookieを抽出
 */
function extractCookiesFromResponse(response) {
  const setCookieHeader = response.headers.get('set-cookie') || '';
  if (!setCookieHeader) return '';
  
  // 複数のSet-Cookieヘッダーを処理
  const cookies = setCookieHeader.split(/,(?=[^;]+=[^;]+)/).map(c => {
    return c.trim().split(';')[0].trim();
  }).filter(c => c.includes('='));
  
  return cookies.join('; ');
}

/**
 * 既存のCookieと新しいCookieをマージ
 */
function mergeCookies(existing, newCookies) {
  if (!existing) return newCookies;
  if (!newCookies) return existing;
  
  const cookieMap = {};
  
  // 既存のCookieを解析
  existing.split(';').forEach(c => {
    const [key, ...vals] = c.trim().split('=');
    if (key) cookieMap[key.trim()] = vals.join('=');
  });
  
  // 新しいCookieで上書き
  newCookies.split(';').forEach(c => {
    const [key, ...vals] = c.trim().split('=');
    if (key) cookieMap[key.trim()] = vals.join('=');
  });
  
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * 労働時間テキストを分に変換
 */
function parseWorkTime(timeText) {
  if (!timeText || timeText === '-') return 0;
  
  const hoursMatch = timeText.match(/(\d+)時間/);
  const minutesMatch = timeText.match(/(\d+)分/);
  
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  
  // "HH:MM" 形式にも対応
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
