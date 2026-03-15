/**
 * 過去実績比較API
 * TempoVisorから月別売上データ、ジョブカンから月間勤務時間を取得し、
 * 店舗別の売上・客数・客単価・稼働時間・人時生産性を比較可能な形式で返す
 * 
 * Query params:
 *   month1: 比較月1 (YYYY-MM形式, 必須)
 *   month2: 比較月2 (YYYY-MM形式, 任意 - 前年同月など)
 *   action: 'comparison' の場合、昨対比較データを返す（month1のみ指定で自動的に前年同月を比較）
 */
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// ===== 定数 =====
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001', '大正店': '0002', '天下茶屋店': '0003',
  '天王寺店': '0004', 'アベノ店': '0005', '心斎橋店': '0006',
  'かがや店': '0007', '駅丸': '0008', '北摂店': '0009',
  '堺東店': '0010', 'イオン松原店': '0011', 'イオン守口店': '0012',
  '美和堂福島店': '0013',
};

const TEMPOVISOR_NAME_MAP = {
  '美和堂FC店': '美和堂福島店',
  'エキマルシェ新大阪': '駅丸',
  'エキマルシェ': '駅丸',
  '駅マルシェ新大阪': '駅丸',
  'エキマル新大阪': '駅丸',
  'エキマル': '駅丸',
};

// ジョブカングループ名 → 店舗名マッピング
const JOBCAN_GROUP_MAP = {
  '田辺': '田辺店', '大正': '大正店', '天下茶屋': '天下茶屋店',
  '天王寺': '天王寺店', 'アベノ': 'アベノ店', '心斎橋': '心斎橋店',
  'かがや店': 'かがや店', '駅丸': '駅丸', 'エキマル': '駅丸',
  'エキマルシェ': '駅丸', '北摂店': '北摂店',
  '堺東': '堺東店', 'イオン松原': 'イオン松原店',
  'イオン守口': 'イオン守口店', '美和堂': '美和堂福島店',
};

// ジョブカングループ名 → 部署名マッピング（店舗以外）
const JOBCAN_DEPT_MAP = {
  '通販': '通販部',
  '企画': '企画部',
  '特販': '特販部',
  'かがや工場': 'かがや工場',
  '北摂工場': '北摂工場',
  '鶴橋': '鶴橋工房',
  '都島': '都島工場',
  '工房': '製造部',
};

// 部署カテゴリ（比較分析用）
const DEPT_CATEGORIES = {
  '通販部': { label: '通販部', type: 'department' },
  '企画部': { label: '企画部', type: 'department' },
  '特販部': { label: '特販部', type: 'department' },
  'かがや工場': { label: 'かがや工場', type: 'factory' },
  '北摂工場': { label: '北摂工場', type: 'factory' },
  '鶴橋工房': { label: '鶴橋工房', type: 'factory' },
  '都島工場': { label: '都島工場', type: 'factory' },
};

// ===== キャッシュ =====
let historicalCache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10分

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { month1, month2, action } = req.query;
    if (!month1) {
      return res.status(400).json({ error: 'month1 is required (YYYY-MM format)' });
    }

    // action=comparison の場合、自動的に前年同月を比較対象にする
    const months = [month1];
    if (action === 'comparison') {
      const [y, m] = month1.split('-').map(Number);
      const lastYearMonth = `${y - 1}-${String(m).padStart(2, '0')}`;
      if (!month2) {
        months.push(lastYearMonth);
      } else {
        months.push(month2);
      }
    } else if (month2) {
      months.push(month2);
    }

    const tempovisorUser = process.env.TEMPOVISOR_USERNAME || 'manu';
    const tempovisorPass = process.env.TEMPOVISOR_PASSWORD || 'manus';
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';

    // 各月のデータを取得（全月分を並行取得）
    const comparison = [];
    const _debugInfo = [];
    
    // キャッシュ確認と未キャッシュ月の特定
    const uncachedMonths = [];
    for (const month of months) {
      const cacheKey = `historical_v2_${month}`;
      const cached = historicalCache[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Historical] Using cache for ${month}`);
        comparison.push(cached.data);
      } else {
        uncachedMonths.push(month);
      }
    }

    // 未キャッシュ月を全て並行取得
    if (uncachedMonths.length > 0) {
      // ジョブカンは1回ログインして全月分のcookiesを共有
      const jobcanCookies = await loginJobcan(jobcanCompany, jobcanUser, jobcanPass);
      
      const fetchPromises = uncachedMonths.map(async (month) => {
        const [year, monthNum] = month.split('-').map(Number);
        const [salesResult, hoursResult] = await Promise.allSettled([
          fetchTempoVisorMonthly(tempovisorUser, tempovisorPass, year, monthNum),
          fetchJobcanMonthlyHoursWithCookies(jobcanCookies, year, monthNum),
        ]);
        return { month, salesResult, hoursResult };
      });

      const results = await Promise.allSettled(fetchPromises);
      
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const { month, salesResult, hoursResult } = result.value;

      const salesData = salesResult.status === 'fulfilled' ? salesResult.value : {};
      const hoursResultData = hoursResult.status === 'fulfilled' ? hoursResult.value : { stores: {}, departments: {} };

      console.log(`[Historical] TempoVisor: ${salesResult.status}, Jobcan: ${hoursResult.status}`);

      const storeHoursData = hoursResultData.stores || {};
      const deptHoursData = hoursResultData.departments || {};
      
      // _tableDebugをsalesDataから除外（店舗データのみ使用）
      const tableDebugData = salesData._tableDebug;
      delete salesData._tableDebug;

      // 店舗別データを構築
      const stores = {};
      let totalCustomers = 0;
      let totalSales = 0;
      let totalHours = 0;

      for (const storeName of Object.keys(TEMPOVISOR_STORE_CODES)) {
        const sd = salesData[storeName] || {};
        const sales = sd.sales || 0;
        const customers = sd.customers || 0;
        const unitPrice = customers > 0 ? Math.round(sales / customers) : 0;
        const workHours = storeHoursData[storeName] || 0;
        const productivity = workHours > 0 ? Math.round(sales / workHours) : 0;

        stores[storeName] = {
          sales,
          customers,
          unit_price: unitPrice,
          work_hours: Math.round(workHours * 10) / 10,
          productivity,
        };

        totalSales += sales;
        totalCustomers += customers;
        totalHours += workHours;
      }

      const total = {
        sales: totalSales,
        customers: totalCustomers,
        unit_price: totalCustomers > 0 ? Math.round(totalSales / totalCustomers) : 0,
        work_hours: Math.round(totalHours * 10) / 10,
        productivity: totalHours > 0 ? Math.round(totalSales / totalHours) : 0,
      };

      // 部署別データを構築
      const departments = {};
      for (const [deptName, info] of Object.entries(DEPT_CATEGORIES)) {
        const workHours = deptHoursData[deptName] || 0;
        departments[deptName] = {
          label: info.label,
          type: info.type,
          work_hours: Math.round(workHours * 10) / 10,
          // 売上は手入力対応（TempoVisorには通販・企画・製造の売上データなし）
          sales: 0,
          customers: 0,
          productivity: 0,
        };
      }

      const monthData = { month, stores, total, departments };
      comparison.push(monthData);
      _debugInfo.push({
        month,
        salesStatus: salesResult.status,
        salesError: salesResult.status === 'rejected' ? salesResult.reason?.message : null,
        salesSample: Object.entries(salesData).filter(([k]) => k !== '_tableDebug').slice(0, 2).map(([k, v]) => ({ store: k, ...(typeof v === 'object' ? v : {}) })),
        tableDebug: tableDebugData || [],
        hoursStatus: hoursResult.status,
        hoursError: hoursResult.status === 'rejected' ? hoursResult.reason?.message : null,
        storeHoursSample: Object.entries(storeHoursData).slice(0, 3).map(([k, v]) => ({ store: k, hours: v })),
        deptHoursSample: Object.entries(deptHoursData).slice(0, 3).map(([k, v]) => ({ dept: k, hours: v })),
      });

      // キャッシュに保存
      const cacheKey = `historical_v2_${month}`;
      historicalCache[cacheKey] = { data: monthData, timestamp: Date.now() };
      }
    }

    return res.status(200).json({
      comparison,
      action: action || 'default',
      timestamp: new Date().toISOString(),
      cached: false,
      _debug: _debugInfo,
    });
  } catch (err) {
    console.error('[Historical] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ===== TempoVisor月別売上データ取得 =====
async function fetchTempoVisorMonthly(username, password, year, month) {
  const { cookies, repBaseUrl } = await loginTempoVisor(username, password);

  const monthStr = String(month).padStart(2, '0');
  const dateFrom = `${year}/${monthStr}/01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}/${monthStr}/${String(lastDay).padStart(2, '0')}`;

  console.log(`[Historical TV] Fetching monthly data: ${dateFrom} - ${dateTo}`);

  const monthlyUrl = `${repBaseUrl}N3M1Servlet`;
  const formBody = new URLSearchParams({
    chkcsv: 'false',
    chkcustom: '',
    shopcode: '',
    searched_yyyymmdd1: dateFrom,
    searched_yyyymmdd2: dateTo,
    yyyymmdd1: dateFrom,
    yyyymmdd2: dateTo,
    scode1: '0001',
    scode2: '2000',
    which_tani: '1',
    tani: '1',
    which_zeinuki: '1',
    zeinuki: '1',
    pan2_flag: '1',
    which1: '1',
    radio1: '1',
  }).toString();

  const monthlyRes = await fetch(monthlyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': cookies,
      'Referer': repBaseUrl,
    },
    body: formBody,
  });

  // TempoVisorのHTMLはShift-JIS（cp932）エンコーディング
  const monthlyBuffer = await monthlyRes.arrayBuffer();
  const monthlyHtml = iconv.decode(Buffer.from(monthlyBuffer), 'cp932');
  const $ = cheerio.load(monthlyHtml);

  const storeData = {};
  const _tableDebug = [];

  // デバッグ: 全テーブルのヘッダーを出力
  const allTables = $('table').toArray();
  console.log(`[Historical TV] Found ${allTables.length} tables in N3M1 response`);
  allTables.forEach((table, idx) => {
    const firstRow = $(table).find('tr').first();
    const cells = firstRow.find('td,th').toArray().map(c => $(c).text().trim());
    const rows = $(table).find('tr').toArray();
    const tableInfo = { idx, headers: cells, rowCount: rows.length, rows: [] };
    for (let r = 1; r < Math.min(rows.length, 4); r++) {
      const rowCells = $(rows[r]).find('td,th').toArray().map(c => $(c).text().trim());
      tableInfo.rows.push(rowCells);
    }
    _tableDebug.push(tableInfo);
    console.log(`[Historical TV] Table ${idx} headers: ${cells.join(' | ')}`);
  });

  $('table').each((tableIdx, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;

    const headerCells = $(rows[0]).find('td,th').toArray();
    if (headerCells.length < 3) return;

    const firstHeaderText = $(headerCells[0]).text().trim();
    
    if (!firstHeaderText.includes('店舗') && firstHeaderText !== '店舗名') {
      let isStoreTable = false;
      for (let r = 1; r < Math.min(rows.length, 3); r++) {
        const cells = $(rows[r]).find('td,th').toArray();
        if (cells.length < 3) continue;
        const cellText = $(cells[0]).text().trim();
        for (const name of Object.keys(TEMPOVISOR_STORE_CODES)) {
          if (cellText.includes(name) || Object.keys(TEMPOVISOR_NAME_MAP).some(k => cellText.includes(k))) {
            isStoreTable = true;
            break;
          }
        }
        if (isStoreTable) break;
      }
      if (!isStoreTable) return;
    }

    let salesColIdx = -1;
    let customersColIdx = -1;
    for (let c = 0; c < headerCells.length; c++) {
      const text = $(headerCells[c]).text().trim();
      if (text.includes('売上') || text.includes('金額') || text.includes('合計')) {
        if (salesColIdx === -1) salesColIdx = c;
      }
      if (text.includes('客数') || text.includes('人数') || text.includes('件数')) {
        customersColIdx = c;
      }
    }

    if (salesColIdx === -1 && headerCells.length >= 3) {
      salesColIdx = headerCells.length - 1;
    }

    for (let r = 1; r < rows.length; r++) {
      const cells = $(rows[r]).find('td,th').toArray();
      if (cells.length < 2) continue;

      let storeName = $(cells[0]).text().trim();
      if (!storeName || storeName === '合計' || storeName === '全店') continue;

      if (TEMPOVISOR_NAME_MAP[storeName]) storeName = TEMPOVISOR_NAME_MAP[storeName];
      if (!TEMPOVISOR_STORE_CODES[storeName]) {
        let matched = false;
        for (const [key, mappedName] of Object.entries(TEMPOVISOR_NAME_MAP)) {
          if (storeName.includes(key)) {
            storeName = mappedName;
            matched = true;
            break;
          }
        }
        if (!matched) {
          for (const name of Object.keys(TEMPOVISOR_STORE_CODES)) {
            if (storeName.includes(name) || name.includes(storeName)) {
              storeName = name;
              matched = true;
              break;
            }
          }
        }
        if (!matched) continue;
      }

      const parseCurrency = (text) => {
        if (!text) return 0;
        return parseInt(text.replace(/[¥\\,\s円]/g, '').replace(/[^\d-]/g, '')) || 0;
      };

      const sales = salesColIdx >= 0 && salesColIdx < cells.length
        ? parseCurrency($(cells[salesColIdx]).text())
        : 0;
      const customers = customersColIdx >= 0 && customersColIdx < cells.length
        ? parseInt($(cells[customersColIdx]).text().replace(/[,\s]/g, '')) || 0
        : 0;

      if (!storeData[storeName]) {
        storeData[storeName] = { sales: 0, customers: 0 };
      }
      storeData[storeName].sales += sales;
      storeData[storeName].customers += customers;

      console.log(`[Historical TV] ${storeName}: sales=${sales}, customers=${customers}`);
    }
  });

  // N3M1が空の場合、N3D1Servletで日別に取得して合算するフォールバック
  if (Object.keys(storeData).length === 0 || !Object.values(storeData).some(v => typeof v === 'object')) {
    console.log('[Historical TV] N3M1 empty, trying daily aggregation via N3D1');
    return await fetchTempoVisorDailyAggregation(cookies, repBaseUrl, year, month);
  }

  storeData._tableDebug = _tableDebug;
  return storeData;
}

// N3D1Servletで日別データを取得して月間合算するフォールバック
async function fetchTempoVisorDailyAggregation(cookies, repBaseUrl, year, month) {
  const storeData = {};
  const lastDay = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, '0');

  for (let dayStart = 1; dayStart <= lastDay; dayStart += 5) {
    const dayEnd = Math.min(dayStart + 4, lastDay);
    const dayPromises = [];

    for (let day = dayStart; day <= dayEnd; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}/${monthStr}/${dayStr}`;
      dayPromises.push(fetchSingleDayData(cookies, repBaseUrl, dateStr));
    }

    const results = await Promise.allSettled(dayPromises);
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const [storeName, data] of Object.entries(result.value)) {
        if (!storeData[storeName]) {
          storeData[storeName] = { sales: 0, customers: 0 };
        }
        storeData[storeName].sales += data.sales || 0;
        storeData[storeName].customers += data.customers || 0;
      }
    }
  }

  return storeData;
}

async function fetchSingleDayData(cookies, repBaseUrl, dateStr) {
  const hourlyUrl = `${repBaseUrl}N3D1Servlet`;
  const formBody = new URLSearchParams({
    chkcsv: 'false',
    chkcustom: '',
    shopcode: '',
    searched_time_slot1: '8',
    searched_time_slot2: '23',
    searched_yyyymmdd1: dateStr,
    searched_yyyymmdd2: dateStr,
    time_slot1_val: '8',
    time_slot2_val: '23',
    interval: '1',
    yyyymmdd1: dateStr,
    yyyymmdd2: dateStr,
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
  }).toString();

  const res = await fetch(hourlyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': cookies,
      'Referer': repBaseUrl,
    },
    body: formBody,
  });

  // TempoVisorのHTMLはShift-JIS（cp932）エンコーディング
  const buffer = await res.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'cp932');
  const $ = cheerio.load(html);
  const dayData = {};

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
      const hourMatch = cellText.match(/^(\d{1,2})[::：]/);
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

      if (!dayData[storeName]) {
        dayData[storeName] = { sales: 0, customers: 0 };
      }
      dayData[storeName].sales += todaySales;
    }
  });

  return dayData;
}

// ===== ジョブカン月間勤務時間取得（店舗＋部署） =====
// history.jsと同じ日別勤務状況ページ方式を使用
async function fetchJobcanMonthlyHoursAll(companyId, loginId, password, year, month) {
  const cookies = await loginJobcan(companyId, loginId, password);
  return fetchJobcanMonthlyHoursWithCookies(cookies, year, month);
}

// cookiesを直接受け取る版（複数月分のcookies共有用）
async function fetchJobcanMonthlyHoursWithCookies(cookies, year, month) {

  const monthStr = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  
  // 今日の日付を取得（未来の日付は取得しない）
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  console.log(`[Historical JC] Fetching daily work hours: ${year}/${monthStr} (${lastDay} days)`);

  const storeHours = {};
  const deptHours = {};

  // 部署コードマッピング（history.jsと同じ）
  const STORE_DEPT_MAP = {
    '10110': '田辺店', '10400': '大正店', '10500': '天下茶屋店',
    '10600': '天王寺店', '10800': 'アベノ店', '10900': '心斎橋店',
    '11010': 'かがや店', '11200': '駅丸', '12000': '北摂店',
    '12200': '堺東店', '12300': 'イオン松原店', '12400': 'イオン守口店',
    '20000': '美和堂福島店',
    '11021': '企画部', '11022': '通販部', '11025': '特販部',
    '11012': 'かがや工場', '12010': '北摂工場', '11700': '都島工場', '11900': '鶴橋工房',
  };

  // 15日ずつ並行取得（高速化）
  for (let dayStart = 1; dayStart <= lastDay; dayStart += 15) {
    const dayEnd = Math.min(dayStart + 14, lastDay);
    const dayPromises = [];

    for (let day = dayStart; day <= dayEnd; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      
      // 未来の日付はスキップ
      if (dateStr > todayStr) continue;
      
      dayPromises.push(fetchJobcanDailyHours(cookies, dateStr, STORE_DEPT_MAP));
    }

    const results = await Promise.allSettled(dayPromises);
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { stores: dayStores, departments: dayDepts } = result.value;
      
      for (const [name, hours] of Object.entries(dayStores)) {
        if (!storeHours[name]) storeHours[name] = 0;
        storeHours[name] += hours;
      }
      for (const [name, hours] of Object.entries(dayDepts)) {
        if (!deptHours[name]) deptHours[name] = 0;
        deptHours[name] += hours;
      }
    }
  }

  console.log(`[Historical JC] Store hours:`, JSON.stringify(storeHours));
  console.log(`[Historical JC] Dept hours:`, JSON.stringify(deptHours));
  return { stores: storeHours, departments: deptHours };
}

// ジョブカンログイン
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

// 指定日のジョブカン勤務状況を取得（history.jsと同じ方式）
async function fetchJobcanDailyHours(cookies, date, storeDeptMap) {
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

  // 部署カテゴリ分類
  const DEPT_CATEGORY_MAP = {
    '企画部': '企画部', '通販部': '通販部', '特販部': '特販部',
    'かがや工場': 'かがや工場', '北摂工場': '北摂工場',
    '都島工場': '都島工場', '鶴橋工房': '鶴橋工房',
  };

  let targetTable = null;
  $work('table').each((i, table) => {
    const headerRow = $work(table).find('tr').first();
    const headerText = headerRow.text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    return { stores, departments };
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
    const storeName = storeDeptMap[deptCode];
    if (!storeName) continue;

    const status = $work(cells[2]).text().trim();
    const workTimeText = $work(cells[8]).text().trim();
    const breakTimeText = $work(cells[9]).text().trim();

    const workMinutes = parseJapaneseTime(workTimeText);
    const breakMinutes = parseJapaneseTime(breakTimeText);
    const netMinutes = Math.max(0, workMinutes - breakMinutes);
    const netHours = parseFloat((netMinutes / 60).toFixed(2));

    if (status === '勤務中' || status === '退勤済み') {
      // 店舗に分類
      if (TEMPOVISOR_STORE_CODES[storeName]) {
        if (!stores[storeName]) stores[storeName] = 0;
        stores[storeName] += netHours;
      }
      // 部署に分類
      if (DEPT_CATEGORY_MAP[storeName]) {
        if (!departments[storeName]) departments[storeName] = 0;
        departments[storeName] += netHours;
      }
    }
  }

  return { stores, departments };
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

// ===== ユーティリティ =====
function mapJobcanGroupToStore(groupName) {
  if (!groupName) return null;
  for (const [key, storeName] of Object.entries(JOBCAN_GROUP_MAP)) {
    if (groupName.includes(key)) return storeName;
  }
  return null;
}

function mapJobcanGroupToDept(groupName) {
  if (!groupName) return null;
  for (const [key, deptName] of Object.entries(JOBCAN_DEPT_MAP)) {
    if (groupName.includes(key)) return deptName;
  }
  return null;
}

function parseWorkTime(timeText) {
  if (!timeText || timeText === '-') return 0;
  const match = timeText.match(/(\d+):(\d+)/);
  if (match) {
    return parseInt(match[1]) + parseInt(match[2]) / 60;
  }
  const hoursMatch = timeText.match(/(\d+)時間/);
  const minutesMatch = timeText.match(/(\d+)分/);
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  return hours + minutes / 60;
}

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

export const config = {
  maxDuration: 60,
};
