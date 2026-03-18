/**
 * Vercel Serverless Function: HR Productivity History API
 * SupabaseのDailyProductivityテーブルからキャッシュ済みデータを読み取り
 * 当日分はデータが0の場合、リアルタイムAPIにフォールバックする
 *
 * エンドポイント: POST /api/productivity/history
 * リクエストボディ: { date_from: "yyyy-mm-dd", date_to: "yyyy-mm-dd" }
 * レスポンス: { success: true, data: [...], department_data: {...} }
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// TempoVisorの店舗コード
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001', '大正店': '0002', '天下茶屋店': '0003',
  '天王寺店': '0004', 'アベノ店': '0005', '心斎橋店': '0006',
  'かがや店': '0007', '駅丸': '0008', '北摂店': '0009',
  '堺東店': '0010', 'イオン松原店': '0011', 'イオン守口店': '0012',
  '美和堂福島店': '0013',
};

const TEMPOVISOR_NAME_MAP = {
  '美和堂FC店': '美和堂福島店',
  'エキマルシェ新大阪': '駅丸', 'エキマルシェ': '駅丸',
  '駅マルシェ新大阪': '駅丸', 'エキマル新大阪': '駅丸', 'エキマル': '駅丸',
};

const ALL_STORES = Object.keys(TEMPOVISOR_STORE_CODES);

const STORE_DEPT_MAP = {
  '10110': '田辺店', '10400': '大正店', '10500': '天下茶屋店',
  '10600': '天王寺店', '10800': 'アベノ店', '10900': '心斎橋店',
  '11010': 'かがや店', '11200': '駅丸', '12000': '北摂店',
  '12200': '堺東店', '12300': 'イオン松原店', '12400': 'イオン守口店',
  '20000': '美和堂福島店',
  '11021': '企画部', '11022': '通販部', '11025': '特販部',
  '11012': 'かがや工場', '12010': '北摂工場', '10210': '南田辺工房',
};

const DEPT_CATEGORIES = {
  '通販部': 'online',
  '企画部': 'planning',
  '特販部': 'online',
  'かがや工場': 'manufacturing',
  '北摂工場': 'manufacturing',
  '南田辺工房': 'manufacturing',
};

// 日本語部署名 → リアルタイムAPIと同じ英語キー
const DEPT_NAME_TO_KEY = {
  '通販部': 'online',
  '企画部': 'planning',
  '特販部': 'tokuhan',
  'かがや工場': 'manufacturing_kagaya',
  '北摂工場': 'manufacturing_hokusetsu',
  '南田辺工房': 'manufacturing_minamitanabe',
};

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

    const daysDiff = getDaysDifference(date_from, endDate);
    if (daysDiff > 31) {
      return res.status(400).json({
        error: 'Date range exceeds maximum of 31 days',
        days: daysDiff,
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    // DailyProductivityテーブルから店舗データを取得
    const storeData = await fetchFromSupabase(
      supabaseUrl, supabaseKey,
      'DailyProductivity',
      `work_date=gte.${date_from}&work_date=lte.${endDate}&order=work_date.asc,store_name.asc`
    );

    // DailyDeptProductivityテーブルから部署データを取得
    const deptData = await fetchFromSupabase(
      supabaseUrl, supabaseKey,
      'DailyDeptProductivity',
      `work_date=gte.${date_from}&work_date=lte.${endDate}&order=work_date.asc`
    );

    // DailyStaffHoursテーブルからスタッフ個別データを取得
    let staffData = [];
    try {
      staffData = await fetchFromSupabase(
        supabaseUrl, supabaseKey,
        'DailyStaffHours',
        `work_date=gte.${date_from}&work_date=lte.${endDate}&order=work_date.asc,assigned_store.asc`
      );
    } catch (staffErr) {
      console.log(`[History] DailyStaffHours取得スキップ: ${staffErr.message}`);
    }

    // 日付範囲のリストを生成
    const dates = getDateRange(date_from, endDate);

    // 店舗データをマップに変換
    const storeMap = {};
    for (const record of storeData) {
      const key = `${record.work_date}_${record.store_name}`;
      storeMap[key] = record;
    }

    // 当日（JST）を判定
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayJST = jst.toISOString().split('T')[0];

    // 当日のデータがSupabaseに存在するか、かつ売上が全て0かチェック
    let realtimeData = null;
    let realtimeDeptData = null;
    const todayInRange = dates.includes(todayJST);

    if (todayInRange) {
      const todayRecords = storeData.filter(r => r.work_date === todayJST);
      const todayTotalSales = todayRecords.reduce((s, r) => s + (r.sales || 0), 0);
      const todayTotalHours = todayRecords.reduce((s, r) => s + (parseFloat(r.work_hours) || 0), 0);

      // 当日のキャッシュデータが空、または稼働時間が0の場合、リアルタイム取得
      if (todayRecords.length === 0 || todayTotalHours === 0) {
        console.log(`[History] 当日(${todayJST})のキャッシュが空のため、リアルタイム取得を試行`);
        try {
          realtimeData = await fetchRealtimeData(todayJST);
          realtimeDeptData = realtimeData.departments || {};
        } catch (rtErr) {
          console.error(`[History] リアルタイム取得エラー: ${rtErr.message}`);
        }
      }
    }

    // レスポンスデータを構築
    const allData = [];

    for (const date of dates) {
      for (const storeName of ALL_STORES) {
        const key = `${date}_${storeName}`;
        const record = storeMap[key];

        // 当日かつリアルタイムデータがある場合、キャッシュ売上とリアルタイム稼働時間をマージ
        if (date === todayJST && realtimeData) {
          const rt = realtimeData.stores[storeName] || {};
          // キャッシュに売上データがあればそちらを優先、なければリアルタイムを使用
          const cacheSales = record?.sales || 0;
          const cacheCustomers = record?.customers || 0;
          const finalSales = cacheSales > 0 ? cacheSales : (rt.sales || 0);
          const finalCustomers = cacheCustomers > 0 ? cacheCustomers : (rt.customers || 0);
          const finalHours = rt.workHours || (record ? parseFloat(record.work_hours) : 0) || 0;
          const finalProductivity = finalHours > 0 ? Math.round(finalSales / finalHours) : 0;
          allData.push({
            tenpo_name: storeName,
            code: TEMPOVISOR_STORE_CODES[storeName] || '',
            wk_date: date,
            dayweek: getDayOfWeek(date),
            kingaku: String(finalSales),
            customers: finalCustomers,
            monthly_sales: 0,
            wk_cnt: rt.employees || (record?.attended_employees || 0),
            working_now: 0,
            total_employees: 0,
            wk_tm: finalHours,
            spd: String(finalProductivity),
            update_time: new Date().toISOString(),
            employees: [],
            source: 'realtime+cache',
          });
        } else {
          allData.push({
            tenpo_name: storeName,
            code: TEMPOVISOR_STORE_CODES[storeName] || '',
            wk_date: date,
            dayweek: getDayOfWeek(date),
            kingaku: String(record?.sales || 0),
            customers: record?.customers || 0,
            monthly_sales: 0,
            wk_cnt: record?.attended_employees || 0,
            working_now: 0,
            total_employees: 0,
            wk_tm: record ? parseFloat(record.work_hours) : 0,
            spd: String(record?.productivity || 0),
            update_time: record?.updated_at || '',
            employees: [],
            source: 'cache',
          });
        }
      }
    }

    // 部署データを構築（英語キーで統一 - リアルタイムAPIと同じキー構造）
    const departmentData = {};
    for (const record of deptData) {
      if (record.work_date === todayJST && realtimeDeptData) continue;
      const deptName = record.dept_name;
      const deptKey = DEPT_NAME_TO_KEY[deptName] || deptName;
      if (!departmentData[deptKey]) {
        departmentData[deptKey] = {
          key: deptKey,
          name: deptName,
          category: DEPT_CATEGORIES[deptName] || 'other',
          dates: {},
        };
      }
      // 同じキーに複数の部署がマッピングされる場合は時間を合算
      const existingDate = departmentData[deptKey].dates[record.work_date];
      if (existingDate) {
        existingDate.total_hours += parseFloat(record.work_hours);
        existingDate.attended_employees += record.attended_employees;
      } else {
        departmentData[deptKey].dates[record.work_date] = {
          wk_date: record.work_date,
          dayweek: getDayOfWeek(record.work_date),
          total_hours: parseFloat(record.work_hours),
          attended_employees: record.attended_employees,
          employees: [],
        };
      }
    }

    // リアルタイム部署データを追加（既に英語キーで来る）
    if (realtimeDeptData) {
      for (const [deptKey, deptInfo] of Object.entries(realtimeDeptData)) {
        if (!departmentData[deptKey]) {
          departmentData[deptKey] = {
            key: deptKey,
            name: deptInfo.name || deptKey,
            category: deptInfo.type || 'other',
            dates: {},
          };
        }
        departmentData[deptKey].dates[todayJST] = {
          wk_date: todayJST,
          dayweek: getDayOfWeek(todayJST),
          total_hours: deptInfo.hours || deptInfo.total_hours || 0,
          attended_employees: deptInfo.employees || deptInfo.attended_employees || 0,
          employees: [],
        };
      }
    }

    // スタッフ個別データを店舗/部署別にグループ化
    const staffByStore = {};
    for (const s of staffData) {
      const key = s.assigned_store;
      if (!staffByStore[key]) staffByStore[key] = [];
      staffByStore[key].push({
        employee_id: s.employee_id,
        staff_name: s.staff_name,
        work_date: s.work_date,
        work_hours: parseFloat(s.work_hours) || 0,
        dept_code: s.dept_code,
        clock_in_place: s.clock_in_place,
      });
    }

    return res.status(200).json({
      success: true,
      date_from,
      date_to: endDate,
      data: allData,
      department_data: departmentData,
      staff_data: staffByStore,
      source: realtimeData ? 'supabase_cache+realtime' : 'supabase_cache',
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
// リアルタイムデータ取得（当日フォールバック用）
// ============================================================

async function fetchRealtimeData(date) {
  const tvUser = process.env.TEMPOVISOR_USERNAME;
  const tvPass = process.env.TEMPOVISOR_PASSWORD;
  const jcCompany = process.env.JOBCAN_COMPANY_ID;
  const jcUser = process.env.JOBCAN_LOGIN_ID;
  const jcPass = process.env.JOBCAN_PASSWORD;

  const stores = {};
  const departments = {};

  // TempoVisor売上・客数取得
  if (tvUser && tvPass) {
    try {
      const tvSession = await loginTempoVisor(tvUser, tvPass);
      const tvDate = date.replace(/-/g, '/');
      const salesData = await fetchTempoVisorData(tvSession.cookies, tvSession.repBaseUrl, tvDate, '1');
      const customersData = await fetchTempoVisorData(tvSession.cookies, tvSession.repBaseUrl, tvDate, '2');

      for (const storeName of ALL_STORES) {
        stores[storeName] = {
          sales: salesData[storeName] || 0,
          customers: customersData[storeName] || 0,
          workHours: 0,
          employees: 0,
          productivity: 0,
        };
      }
    } catch (e) {
      console.error('[Realtime] TempoVisor error:', e.message);
    }
  }

  // ジョブカン勤怠取得（勤務状況ページ - 当日のみ正確）
  if (jcCompany && jcUser && jcPass) {
    try {
      const jcCookies = await loginJobcan(jcCompany, jcUser, jcPass);
      const workUrl = `https://ssl.jobcan.jp/client/work-state/show/?submit_type=today&searching=1&list_type=normal&number_par_page=300&retirement=work`;

      const workRes = await fetch(workUrl, {
        headers: {
          'Cookie': jcCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://ssl.jobcan.jp/client/',
        },
        redirect: 'follow',
      });

      const workHtml = await workRes.text();
      const $work = cheerio.load(workHtml);

      let targetTable = null;
      $work('table').each((i, table) => {
        const headerText = $work(table).find('tr').first().text();
        if (headerText.includes('スタッフ') && headerText.includes('出勤状況')) {
          targetTable = table;
        }
      });

      if (targetTable) {
        const rows = $work(targetTable).find('tr').toArray();
        for (let i = 1; i < rows.length; i++) {
          const cells = $work(rows[i]).find('td').toArray();
          if (cells.length < 10) continue;

          const staffCell = $work(cells[0]).text().trim();
          const deptMatch = staffCell.match(/(\d{5})\s/);
          if (!deptMatch) continue;

          const deptCode = deptMatch[1];
          const name = STORE_DEPT_MAP[deptCode];
          if (!name) continue;

          const status = $work(cells[2]).text().trim();
          if (status !== '勤務中' && status !== '退勤済み') continue;

          // 出勤・退勤時刻から実労働時間を計算
          const clockIn = $work(cells[3]).text().trim();
          const clockOut = $work(cells[4]).text().trim();
          let netHours = 0;

          if (clockIn) {
            const inMinutes = parseTimeToMinutes(clockIn);
            let outMinutes;
            if (clockOut && clockOut !== '-') {
              outMinutes = parseTimeToMinutes(clockOut);
            } else {
              // 勤務中の場合は現在時刻まで
              const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
              outMinutes = nowJST.getUTCHours() * 60 + nowJST.getUTCMinutes();
            }
            const totalMinutes = Math.max(0, outMinutes - inMinutes);
            // 6時間以上なら45分休憩、8時間以上なら60分休憩を自動控除
            const breakMinutes = totalMinutes >= 480 ? 60 : (totalMinutes >= 360 ? 45 : 0);
            netHours = Math.max(0, (totalMinutes - breakMinutes)) / 60;
          }

          if (TEMPOVISOR_STORE_CODES[name]) {
            if (!stores[name]) stores[name] = { sales: 0, customers: 0, workHours: 0, employees: 0, productivity: 0 };
            stores[name].workHours += netHours;
            stores[name].employees++;
          }
          if (DEPT_CATEGORIES[name]) {
            if (!departments[name]) departments[name] = { hours: 0, employees: 0 };
            departments[name].hours += netHours;
            departments[name].employees++;
          }
        }

        // 人時生産性を計算
        for (const storeName of ALL_STORES) {
          if (stores[storeName]) {
            stores[storeName].workHours = Math.round(stores[storeName].workHours * 100) / 100;
            if (stores[storeName].workHours > 0) {
              stores[storeName].productivity = Math.round(stores[storeName].sales / stores[storeName].workHours);
            }
          }
        }
      }
    } catch (e) {
      console.error('[Realtime] Jobcan error:', e.message);
    }
  }

  return { stores, departments };
}

// ============================================================
// TempoVisor関連（リアルタイム用）
// ============================================================

async function loginTempoVisor(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
  const repBaseUrl = 'https://www.tenpovisor.jp/alioth/rep/';

  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });
  const initialCookies = extractCookies(getRes);

  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
      'Referer': loginUrl,
    },
    body: new URLSearchParams({ id: username, pass: password }).toString(),
    redirect: 'manual',
  });

  const loginCookies = extractCookies(loginRes);
  const cookies = mergeCookies(initialCookies, loginCookies);
  return { cookies, repBaseUrl };
}

async function fetchTempoVisorData(cookies, repBaseUrl, dateStr, taniValue) {
  const postBody = new URLSearchParams({
    chkcsv: 'false', chkcustom: '', shopcode: '',
    searched_time_slot1: '8', searched_time_slot2: '23',
    searched_yyyymmdd1: dateStr, searched_yyyymmdd2: dateStr,
    time_slot1_val: '8', time_slot2_val: '23',
    interval: '1', yyyymmdd1: dateStr, yyyymmdd2: dateStr,
    scode1: '0001', scode2: '2000',
    which_time_type: '1', time_type: '1',
    which_tani: '1', tani: taniValue,
    time_slot1: '8', time_slot2: '23',
    which_zeinuki: '1', zeinuki: '1',
    pan2_flag: '1', which1: '1', radio1: '1',
  });

  const res = await fetch(`${repBaseUrl}N3D1Servlet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': repBaseUrl,
    },
    body: postBody.toString(),
  });

  const buffer = await res.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'cp932');
  return parseN3D1Table(html);
}

function parseN3D1Table(html) {
  const $ = cheerio.load(html);
  const result = {};

  $('table').each((tableIdx, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;

    const headerCells = $(rows[0]).find('td,th').toArray();
    if (headerCells.length < 3) return;

    const firstHeaderText = $(headerCells[0]).text().trim();
    const secondHeaderText = headerCells.length > 1 ? $(headerCells[1]).text().trim() : '';

    const isHourlyTable = firstHeaderText === '店舗名' ||
      (firstHeaderText.length > 0 && firstHeaderText !== '合計' && secondHeaderText.match(/\d{1,2}:00/));
    if (!isHourlyTable) return;

    let totalColIndex = -1;
    const hourColumns = [];
    headerCells.forEach((cell, idx) => {
      if (idx === 0) return;
      const cellText = $(cell).text().trim();
      const hourMatch = cellText.match(/^(\d{1,2})[::：]/);
      if (hourMatch) {
        hourColumns.push({ colIndex: idx, hour: parseInt(hourMatch[1]) });
      } else if (cellText === '合計' || cellText === '計') {
        totalColIndex = idx;
      }
    });
    if (hourColumns.length === 0) return;

    for (let r = 1; r < rows.length; r++) {
      const cells = $(rows[r]).find('td,th').toArray();
      if (cells.length < 2) continue;

      let storeName = $(cells[0]).text().trim();
      if (TEMPOVISOR_NAME_MAP[storeName]) storeName = TEMPOVISOR_NAME_MAP[storeName];
      if (!storeName || !TEMPOVISOR_STORE_CODES[storeName]) continue;

      let total = 0;
      if (totalColIndex >= 0 && totalColIndex < cells.length) {
        const totalText = $(cells[totalColIndex]).text().trim()
          .replace(/[\\¥,]/g, '').replace(/[^\d-]/g, '');
        total = Math.max(0, parseInt(totalText) || 0);
      } else {
        hourColumns.forEach(({ colIndex }) => {
          if (colIndex >= cells.length) return;
          const text = $(cells[colIndex]).text().trim()
            .replace(/[\\¥,]/g, '').replace(/[^\d-]/g, '');
          total += Math.max(0, parseInt(text) || 0);
        });
      }

      result[storeName] = (result[storeName] || 0) + total;
    }
  });

  return result;
}

// ============================================================
// ジョブカン関連（リアルタイム用）
// ============================================================

async function loginJobcan(companyId, loginId, password) {
  const loginUrl = 'https://ssl.jobcan.jp/login/client/';

  const getRes = await fetch(loginUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const initialCookies = extractCookies(getRes);
  const loginHtml = await getRes.text();

  const $login = cheerio.load(loginHtml);
  const csrfToken = $login('input[name="token"]').val() || '';

  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
      'Referer': loginUrl,
    },
    body: new URLSearchParams({
      token: csrfToken,
      client_login_id: companyId,
      client_manager_login_id: loginId,
      client_login_password: password,
      url: '/client',
      login_type: '2',
    }).toString(),
    redirect: 'manual',
  });

  const loginCookies = extractCookies(loginRes);
  return mergeCookies(initialCookies, loginCookies);
}

// ============================================================
// Supabase読み取り
// ============================================================

async function fetchFromSupabase(supabaseUrl, supabaseKey, tableName, query) {
  const url = `${supabaseUrl}/rest/v1/${tableName}?${query}`;
  const resp = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Supabase fetch failed for ${tableName}: ${resp.status} ${errText}`);
  }

  return resp.json();
}

// ============================================================
// ユーティリティ関数
// ============================================================

function getDateRange(startDate, endDate) {
  const dates = [];
  let [y, m, d] = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  const endVal = endParts[0] * 10000 + endParts[1] * 100 + endParts[2];

  while (y * 10000 + m * 100 + d <= endVal) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
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
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return days[date.getUTCDay()];
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || timeStr === '-') return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  return 0;
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
  raw.split(/,(?=[^;]+=)/).forEach(part => {
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
  const parse = (str) => {
    str.split(';').forEach(c => {
      const idx = c.indexOf('=');
      if (idx > 0) {
        const key = c.substring(0, idx).trim();
        const val = c.substring(idx + 1).trim();
        if (key) cookieMap[key] = val;
      }
    });
  };
  parse(existing);
  parse(newCookies);
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}
