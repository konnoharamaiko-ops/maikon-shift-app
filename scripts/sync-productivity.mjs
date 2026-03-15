#!/usr/bin/env node
/**
 * 生産性データ同期バッチスクリプト
 * GitHub Actionsから毎日実行され、TempoVisor（売上・客数）とジョブカン（勤怠）から
 * データを1日ずつ順次取得し、SupabaseのDailyProductivityテーブルに保存する。
 *
 * 使用方法:
 *   node scripts/sync-productivity.mjs                    # 当日分を同期
 *   node scripts/sync-productivity.mjs --date 2025-03-01  # 指定日を同期
 *   node scripts/sync-productivity.mjs --range 2025-03-01 2025-03-14  # 範囲同期（バックフィル）
 *
 * 環境変数:
 *   JOBCAN_COMPANY_ID, JOBCAN_LOGIN_ID, JOBCAN_PASSWORD
 *   TEMPOVISOR_USERNAME, TEMPOVISOR_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// ============================================================
// 定数
// ============================================================

const STORE_DEPT_MAP = {
  '10110': '田辺店', '10400': '大正店', '10500': '天下茶屋店',
  '10600': '天王寺店', '10800': 'アベノ店', '10900': '心斎橋店',
  '11010': 'かがや店', '11200': '駅丸', '12000': '北摂店',
  '12200': '堺東店', '12300': 'イオン松原店', '12400': 'イオン守口店',
  '20000': '美和堂福島店',
  '11021': '企画部', '11022': '通販部', '11025': '特販部',
  '11012': 'かがや工場', '12010': '北摂工場', '11700': '都島工場', '11900': '鶴橋工房',
};

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

const DEPT_CATEGORIES = {
  '企画部': 'planning', '通販部': 'online', '特販部': 'online',
  'かがや工場': 'manufacturing', '北摂工場': 'manufacturing',
  '都島工場': 'manufacturing', '鶴橋工房': 'manufacturing',
};

// ============================================================
// メイン処理
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  let dates = [];

  if (args.includes('--range') && args.length >= 3) {
    const rangeIdx = args.indexOf('--range');
    const startDate = args[rangeIdx + 1];
    const endDate = args[rangeIdx + 2];
    dates = getDateRange(startDate, endDate);
    console.log(`[Sync] バックフィルモード: ${startDate} ～ ${endDate} (${dates.length}日間)`);
  } else if (args.includes('--date') && args.length >= 2) {
    const dateIdx = args.indexOf('--date');
    dates = [args[dateIdx + 1]];
    console.log(`[Sync] 指定日モード: ${dates[0]}`);
  } else {
    // デフォルト: JST今日
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jst.toISOString().split('T')[0];
    dates = [today];
    console.log(`[Sync] 当日モード: ${today}`);
  }

  // 環境変数チェック
  const config = {
    jobcanCompany: process.env.JOBCAN_COMPANY_ID,
    jobcanUser: process.env.JOBCAN_LOGIN_ID,
    jobcanPass: process.env.JOBCAN_PASSWORD,
    tvUser: process.env.TEMPOVISOR_USERNAME,
    tvPass: process.env.TEMPOVISOR_PASSWORD,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error(`[Sync] 環境変数が不足: ${missing.join(', ')}`);
    process.exit(1);
  }

  // ログイン（1回だけ）
  console.log('[Sync] ジョブカンにログイン中...');
  const jcCookies = await loginJobcan(config.jobcanCompany, config.jobcanUser, config.jobcanPass);
  console.log('[Sync] ジョブカンログイン成功');

  console.log('[Sync] TempoVisorにログイン中...');
  const tvSession = await loginTempoVisor(config.tvUser, config.tvPass);
  console.log('[Sync] TempoVisorログイン成功');

  // 各日付を順次処理
  let successCount = 0;
  let errorCount = 0;

  for (const date of dates) {
    try {
      console.log(`\n[Sync] === ${date} のデータ取得開始 ===`);

      // ジョブカン勤怠データ取得
      console.log(`[Sync] ジョブカン勤怠取得中... (${date})`);
      const attendance = await fetchJobcanAttendance(jcCookies, date);

      // TempoVisor売上データ取得（売上 + 客数を順次）
      const tvDate = date.replace(/-/g, '/');
      console.log(`[Sync] TempoVisor売上取得中... (${date})`);
      const salesData = await fetchTempoVisorData(tvSession.cookies, tvSession.repBaseUrl, tvDate, '1');

      console.log(`[Sync] TempoVisor客数取得中... (${date})`);
      const customersData = await fetchTempoVisorData(tvSession.cookies, tvSession.repBaseUrl, tvDate, '2');

      // 店舗別データを構築
      const storeRecords = [];
      for (const storeName of ALL_STORES) {
        const sales = salesData[storeName] || 0;
        const customers = customersData[storeName] || 0;
        const attInfo = attendance.stores[storeName] || { hours: 0, employees: 0 };
        const workHours = attInfo.hours;
        const attendedEmployees = attInfo.employees;
        const productivity = workHours > 0 ? Math.round(sales / workHours) : 0;
        const unitPrice = customers > 0 ? Math.round(sales / customers) : 0;

        storeRecords.push({
          work_date: date,
          store_name: storeName,
          sales,
          customers,
          work_hours: Math.round(workHours * 100) / 100,
          attended_employees: attendedEmployees,
          productivity,
          unit_price: unitPrice,
          data_source: 'batch',
        });
      }

      // 部署別データを構築
      const deptRecords = [];
      for (const [deptName, category] of Object.entries(DEPT_CATEGORIES)) {
        const attInfo = attendance.departments[deptName] || { hours: 0, employees: 0 };
        deptRecords.push({
          work_date: date,
          dept_name: deptName,
          dept_category: category,
          work_hours: Math.round(attInfo.hours * 100) / 100,
          attended_employees: attInfo.employees,
        });
      }

      // Supabaseに保存
      console.log(`[Sync] Supabaseに保存中... (店舗: ${storeRecords.length}件, 部署: ${deptRecords.length}件)`);
      await upsertToSupabase(config.supabaseUrl, config.supabaseKey, 'DailyProductivity', storeRecords);
      await upsertToSupabase(config.supabaseUrl, config.supabaseKey, 'DailyDeptProductivity', deptRecords);

      // サマリー出力
      const totalSales = storeRecords.reduce((s, r) => s + r.sales, 0);
      const totalCustomers = storeRecords.reduce((s, r) => s + r.customers, 0);
      const totalHours = storeRecords.reduce((s, r) => s + r.work_hours, 0);
      console.log(`[Sync] ${date} 完了: 売上¥${totalSales.toLocaleString()}, 客数${totalCustomers}人, 稼働${totalHours.toFixed(1)}h`);
      successCount++;

      // レート制限対策: 日付間に少し待つ
      if (dates.length > 1) {
        await sleep(1000);
      }
    } catch (err) {
      console.error(`[Sync] ${date} エラー: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n[Sync] === 同期完了 === 成功: ${successCount}件, エラー: ${errorCount}件`);
  if (errorCount > 0) {
    process.exit(1);
  }
}

// ============================================================
// TempoVisor関連
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
// ジョブカン関連
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
  const allCookies = mergeCookies(initialCookies, loginCookies);

  const location = loginRes.headers.get('location') || '';
  if (location.includes('error')) {
    throw new Error(`Jobcan login failed: ${location}`);
  }

  return allCookies;
}

async function fetchJobcanAttendance(cookies, date) {
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

  const stores = {};
  const departments = {};

  let targetTable = null;
  $work('table').each((i, table) => {
    const headerText = $work(table).find('tr').first().text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    console.warn(`[Sync] ジョブカン: 勤務状況テーブルが見つかりません (${date})`);
    return { stores, departments };
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
    const name = STORE_DEPT_MAP[deptCode];
    if (!name) continue;

    const status = $work(cells[2]).text().trim();
    const workTimeText = $work(cells[8]).text().trim();
    const breakTimeText = $work(cells[9]).text().trim();

    const workMinutes = parseJapaneseTime(workTimeText);
    const breakMinutes = parseJapaneseTime(breakTimeText);
    const netHours = Math.max(0, (workMinutes - breakMinutes)) / 60;

    if (status === '勤務中' || status === '退勤済み') {
      // 店舗に分類
      if (TEMPOVISOR_STORE_CODES[name]) {
        if (!stores[name]) stores[name] = { hours: 0, employees: 0 };
        stores[name].hours += netHours;
        stores[name].employees++;
      }
      // 部署に分類
      if (DEPT_CATEGORIES[name]) {
        if (!departments[name]) departments[name] = { hours: 0, employees: 0 };
        departments[name].hours += netHours;
        departments[name].employees++;
      }
    }
  }

  // 小数点2桁に丸める
  for (const store of Object.values(stores)) {
    store.hours = Math.round(store.hours * 100) / 100;
  }
  for (const dept of Object.values(departments)) {
    dept.hours = Math.round(dept.hours * 100) / 100;
  }

  return { stores, departments };
}

// ============================================================
// Supabase関連
// ============================================================

async function upsertToSupabase(supabaseUrl, supabaseKey, tableName, records) {
  if (records.length === 0) return;

  const resp = await fetch(`${supabaseUrl}/rest/v1/${tableName}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(records),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Supabase upsert failed for ${tableName}: ${resp.status} ${errText}`);
  }

  console.log(`[Sync] ${tableName} に ${records.length}件 保存完了`);
}

// ============================================================
// ユーティリティ
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

function parseJapaneseTime(timeText) {
  if (!timeText || timeText === '-') return 0;
  const hoursMatch = timeText.match(/(\d+)時間/);
  const minutesMatch = timeText.match(/(\d+)分/);
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  if (!hoursMatch && !minutesMatch) {
    const colonMatch = timeText.match(/(\d+):(\d+)/);
    if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 実行
main().catch(err => {
  console.error('[Sync] 致命的エラー:', err);
  process.exit(1);
});
