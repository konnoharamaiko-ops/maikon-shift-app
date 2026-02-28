/**
 * Vercel Serverless Function: Real-time HR Productivity API
 * TempoVisor（売上）とジョブカン（勤怠）からリアルタイムデータを取得して人時生産性を計算
 * 
 * エンドポイント: GET /api/productivity/realtime
 * レスポンス: { success: true, data: [...], employees: [...] }
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
  '10160': { name: 'かがや店', tempovisor: 'かがや店' },
  '10170': { name: 'エキマル', tempovisor: 'エキマル' },
  '10180': { name: '北摂店', tempovisor: '北摂店' },
  '10190': { name: '堺東店', tempovisor: '堺東店' },
  '10200': { name: 'イオン松原店', tempovisor: 'イオン松原店' },
  '12300': { name: 'イオン松原店', tempovisor: 'イオン松原店' },
  '10210': { name: 'イオン守口店', tempovisor: 'イオン守口店' },
  '20000': { name: '美和堂FC店', tempovisor: '美和堂FC店' },
  '10220': { name: '美和堂FC店', tempovisor: '美和堂FC店' },
};

// TempoVisorの店舗名からコードへのマッピング
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '10110',
  '大正店': '10120',
  '天下茶屋店': '10130',
  '天王寺店': '10140',
  'アベノ店': '10800',
  '心斎橋店': '10150',
  'かがや店': '10160',
  'エキマル': '10170',
  '北摂店': '10180',
  '堺東店': '10190',
  'イオン松原店': '10200',
  'イオン守口店': '10210',
  '美和堂FC店': '10220',
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

  try {
    const tempovisorUser = process.env.TEMPOVISOR_USERNAME || 'manu';
    const tempovisorPass = process.env.TEMPOVISOR_PASSWORD || 'manus';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';

    // 並行してデータ取得
    const [salesData, attendanceData] = await Promise.allSettled([
      fetchTempoVisorSales(tempovisorUser, tempovisorPass),
      fetchJobcanAttendance(jobcanCompany, jobcanUser, jobcanPass),
    ]);

    const sales = salesData.status === 'fulfilled' ? salesData.value : [];
    const attendance = attendanceData.status === 'fulfilled' ? attendanceData.value : { stores: {}, employees: [] };

    // 店舗ごとに統合
    const storeData = mergeStoreData(sales, attendance.stores);
    const employees = attendance.employees || [];

    return res.status(200).json({
      success: true,
      data: storeData,
      employees: employees,
      timestamp: new Date().toISOString(),
      sources: {
        tempovisor: salesData.status === 'fulfilled' ? 'live' : 'error',
        jobcan: attendanceData.status === 'fulfilled' ? 'live' : 'error',
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
 */
async function fetchTempoVisorSales(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet?legacy=true';
  const topUrl = 'https://www.tenpovisor.jp/alioth/board/topmenu';

  // ログイン
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `loginId=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&submit=ログイン`,
    redirect: 'manual',
  });

  // セッションCookieを取得
  const setCookieHeader = loginRes.headers.get('set-cookie') || '';
  const cookies = extractCookies(setCookieHeader);

  // リダイレクト先を取得
  let location = loginRes.headers.get('location') || topUrl;
  if (!location.startsWith('http')) {
    location = 'https://www.tenpovisor.jp' + location;
  }

  // トップメニューページを取得
  const topRes = await fetch(location, {
    headers: { 'Cookie': cookies },
    redirect: 'follow',
  });

  const html = await topRes.text();
  const $ = cheerio.load(html);

  const stores = [];
  
  // sales_Listテーブルから店舗別売上を取得
  $('#sales_List tr').each((i, row) => {
    if (i === 0) return; // ヘッダー行スキップ
    
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const storeName = $(cells[0]).text().trim();
    if (!storeName || storeName.startsWith('(') || storeName === '合計') return;
    
    // 千林店は除外
    if (storeName === '千林店') return;

    const storeCode = TEMPOVISOR_STORE_CODES[storeName];
    if (!storeCode) return;

    // セル[5]が前日売上、セル[6]が当日売上
    const todaySalesText = $(cells[6]).text().trim().replace(/[¥,]/g, '');
    const prevDaySalesText = $(cells[5]).text().trim().replace(/[¥,]/g, '');
    const monthlySalesText = $(cells[1]).text().trim().replace(/[¥,]/g, '');
    const customersText = $(cells[7]).text().trim().replace(/[人,]/g, '');
    const updateTime = $(cells[9]).text().trim();

    const todaySales = parseInt(todaySalesText) || 0;
    const prevDaySales = parseInt(prevDaySalesText) || 0;
    const monthlySales = parseInt(monthlySalesText) || 0;
    const customers = parseInt(customersText) || 0;

    stores.push({
      store_code: storeCode,
      store_name: storeName,
      today_sales: todaySales,
      prev_day_sales: prevDaySales,
      monthly_sales: monthlySales,
      customers: customers,
      update_time: updateTime,
    });
  });

  return stores;
}

/**
 * ジョブカンから本日の勤務状況を取得
 */
async function fetchJobcanAttendance(companyId, loginId, password) {
  const loginUrl = 'https://ssl.jobcan.jp/login/client/';
  
  // ログイン
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_login_id=${encodeURIComponent(loginId)}&client_login_password=${encodeURIComponent(password)}&client_company_id=${encodeURIComponent(companyId)}&_token=&login_type=client`,
    redirect: 'manual',
  });

  const setCookieHeader = loginRes.headers.get('set-cookie') || '';
  const cookies = extractCookies(setCookieHeader);

  // 勤務状況ページを取得（全スタッフ、本日）
  const workStateUrl = 'https://ssl.jobcan.jp/client/work-state/show/?submit_type=today&searching=1&list_type=normal&number_par_page=300&sort_order=&tags=&group_where_type=both&adit_group_id=0&retirement=work&employee_id=&work_kind%5B0%5D=0&group_id=0';
  
  const workRes = await fetch(workStateUrl, {
    headers: { 'Cookie': cookies },
    redirect: 'follow',
  });

  const html = await workRes.text();
  const $ = cheerio.load(html);

  const storeAttendance = {};
  const employees = [];

  // noteクラスのテーブルから勤務状況を取得
  $('table.note tr').each((i, row) => {
    if (i === 0) return; // ヘッダー行スキップ
    
    const cells = $(row).find('td');
    if (cells.length < 5) return;

    const staffCell = $(cells[0]);
    const staffName = staffCell.find('a').first().text().trim();
    const deptText = staffCell.text().trim().replace(staffName, '').trim();
    
    // 部署コードを抽出（例: "10110 店1018->田辺店"）
    const deptMatch = deptText.match(/^(\d{5})/);
    if (!deptMatch) return;
    
    const deptCode = deptMatch[1];
    const storeInfo = STORE_DEPT_MAP[deptCode];
    if (!storeInfo) return; // 店舗以外（工場、通販部など）はスキップ

    const status = $(cells[2]).text().trim();
    const shift = $(cells[3]).text().trim().replace(/\t.*/,'').trim();
    const startTime = $(cells[4]).text().trim();
    const endTime = $(cells[5]).text().trim();
    const workTimeText = $(cells[6]).text().trim();
    const breakTimeText = $(cells[7]).text().trim();

    // 労働時間を分に変換
    const workMinutes = parseWorkTime(workTimeText);
    const breakMinutes = parseWorkTime(breakTimeText);
    const netWorkMinutes = Math.max(0, workMinutes - breakMinutes);
    const netWorkHours = netWorkMinutes / 60;

    const employee = {
      name: staffName,
      dept_code: deptCode,
      store_name: storeInfo.name,
      status: status,
      shift: shift,
      start_time: startTime === '-' ? null : startTime,
      end_time: endTime === '-' ? null : endTime,
      work_hours: parseFloat(netWorkHours.toFixed(2)),
      work_time_text: workTimeText,
    };

    employees.push(employee);

    // 店舗別集計
    if (!storeAttendance[storeInfo.name]) {
      storeAttendance[storeInfo.name] = {
        store_code: Object.keys(STORE_DEPT_MAP).find(k => STORE_DEPT_MAP[k].name === storeInfo.name),
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
 * 売上データと勤怠データを統合
 */
function mergeStoreData(sales, attendance) {
  const allStoreNames = new Set([
    ...sales.map(s => s.store_name),
    ...Object.keys(attendance),
  ]);

  const result = [];

  allStoreNames.forEach(storeName => {
    const salesInfo = sales.find(s => s.store_name === storeName) || {
      store_code: TEMPOVISOR_STORE_CODES[storeName] || '',
      store_name: storeName,
      today_sales: 0,
      customers: 0,
    };

    const attendInfo = attendance[storeName] || {
      store_code: TEMPOVISOR_STORE_CODES[storeName] || '',
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
      code: salesInfo.store_code || attendInfo.store_code,
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

  // 店舗コード順にソート
  result.sort((a, b) => {
    const codeA = parseInt(a.code) || 99999;
    const codeB = parseInt(b.code) || 99999;
    return codeA - codeB;
  });

  return result;
}

/**
 * 労働時間テキストを分に変換（例: "8時間30分" → 510）
 */
function parseWorkTime(timeText) {
  if (!timeText || timeText === '-') return 0;
  
  const hoursMatch = timeText.match(/(\d+)時間/);
  const minutesMatch = timeText.match(/(\d+)分/);
  
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  
  return hours * 60 + minutes;
}

/**
 * Set-Cookieヘッダーからcookie文字列を抽出
 */
function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  
  const cookies = setCookieHeader.split(',').map(c => {
    const parts = c.trim().split(';');
    return parts[0].trim();
  });
  
  return cookies.join('; ');
}

export const config = {
  maxDuration: 60,
};
