/**
 * Vercel Serverless Function: TempoVisor Sales Data API
 * テンポバイザーのN221Servlet（日別・月別売上）から売上データを取得
 *
 * エンドポイント:
 *   GET /api/productivity/sales?year=2025&month=1&store_name=田辺店&mode=monthly
 *     → 月報: { success, year_month, store_name, total_sales, monthly_list: [{year_month, sales}] }
 *   GET /api/productivity/sales?year=2025&month=12&store_name=田辺店&mode=daily
 *     → 日報: { success, year_month, store_name, total_sales, daily_list: [{date, day_of_week, sales}] }
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// TempoVisor店舗コードマッピング（0001〜0013）
const TEMPOVISOR_STORE_CODES = {
  '田辺店':       '0001',
  '大正店':       '0002',
  '天下茶屋店':   '0003',
  '天王寺店':     '0004',
  'アベノ店':     '0005',
  '心斎橋店':     '0006',
  'かがや店':     '0007',
  '駅丸':     '0008',
  '北摂店':       '0009',
  '堺東店':       '0010',
  'イオン松原店': '0011',
  'イオン守口店': '0012',
  '美和堂福島店':   '0013',
};

function extractCookies(response) {
  const setCookieHeaders = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : [];
  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    const rawHeader = response.headers.get('set-cookie');
    if (!rawHeader) return '';
    return rawHeader.split(',').map(c => c.split(';')[0].trim()).join('; ');
  }
  return setCookieHeaders.map(c => c.split(';')[0].trim()).join('; ');
}

function mergeCookies(existing, newCookies) {
  if (!existing) return newCookies;
  if (!newCookies) return existing;
  const map = {};
  [...existing.split('; '), ...newCookies.split('; ')].forEach(pair => {
    const [k, v] = pair.split('=');
    if (k && k.trim()) map[k.trim()] = v || '';
  });
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
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

  const loginBody = new URLSearchParams({ id: username, pass: password }).toString();
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
  console.log('[Sales] Login done, cookies length:', allCookies.length);
  return { cookies: allCookies, repBaseUrl };
}

/**
 * 金額テキストを数値に変換（¥7,539,669 → 7539669）
 */
function parseSalesAmount(text) {
  if (!text) return 0;
  const cleaned = text.replace(/[¥￥,\s]/g, '').trim();
  const num = parseInt(cleaned);
  return isNaN(num) || num < 0 ? 0 : num;
}

/**
 * N221Servletから売上データを取得
 * @param {string} username
 * @param {string} password
 * @param {number} year
 * @param {number} month
 * @param {string} storeName
 * @param {'monthly'|'daily'} mode - monthly=月報, daily=日報
 */
async function fetchSalesFromN221(username, password, year, month, storeName, mode = 'monthly') {
  const { cookies, repBaseUrl } = await loginTempoVisor(username, password);

  const storeCode = TEMPOVISOR_STORE_CODES[storeName];
  if (!storeCode) {
    throw new Error(`Unknown store: ${storeName}`);
  }

  let startDate, endDate;
  if (mode === 'monthly') {
    // 月報: 年間全月を取得
    startDate = `${year}/01/01`;
    endDate   = `${year}/12/31`;
  } else {
    // 日報: 指定月の全日を取得
    const lastDay = new Date(year, month, 0).getDate();
    startDate = `${year}/${String(month).padStart(2, '0')}/01`;
    endDate   = `${year}/${String(month).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;
  }

  // 注意: 金額方式（値引前/値引後）はログインユーザーの基本設定に依存
  // monthlymode: 'off'=日報, 'on'=月報
  const monthlyMode = mode === 'monthly' ? 'on' : 'off';

  const body = new URLSearchParams({
    chkcsv: 'false',
    panSI_flag: '2',
    yyyymmdd1: startDate,
    yyyymmdd2: endDate,
    scode1: storeCode,
    scode2: storeCode,
    area1IsBottom: 'true',
    areasearch: 'off',
    monthlymode: monthlyMode,
    consignAddFlagValue: 'off',
    deleteCookie: 'on',
  });

  console.log(`[Sales] N221Servlet mode=${mode} store=${storeName}(${storeCode}) ${startDate}〜${endDate}`);

  const res = await fetch(`${repBaseUrl}N221Servlet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': repBaseUrl,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`N221Servlet HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'cp932');
  console.log(`[Sales] N221 HTML length: ${html.length}`);

  const $ = cheerio.load(html);

  // ===== テーブル解析 =====
  // 月報テーブル構造: 年月 | 人数 | 販売数 | 売上 | 粗利 | 粗利率 | ...
  // 日報テーブル構造: 日付 | 人数 | 販売数 | 売上 | 粗利 | 粗利率 | ...

  let totalSales = 0;
  const monthlyList = []; // { year_month: "2025年01月", sales: 7539669 }
  const dailyList   = []; // { date: "2025/12/01", day_of_week: "月", sales: 561382, customers: 108, gross_profit_rate: "49.5" }

  // 列インデックスを特定するヘルパー
  function findColumnIndex(headerTexts, keywords, excludeKeywords = []) {
    for (let i = 0; i < headerTexts.length; i++) {
      const h = headerTexts[i];
      if (keywords.some(k => h.includes(k)) && !excludeKeywords.some(k => h.includes(k))) {
        return i;
      }
    }
    return -1;
  }

  $('table').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 3) return; // ヘッダー + 合計 + データ行が必要

    const headerRow = $(rows[0]).find('td,th').toArray();
    if (headerRow.length < 3) return;

    const headerTexts = headerRow.map(c =>
      $(c).text().trim().replace(/\s+/g, '')
    );

    // 「売上」列を含むテーブルのみ対象
    const hasSales = headerTexts.some(h => h.includes('売上'));
    if (!hasSales) return;

    // 各列のインデックスを特定
    const salesColIdx    = findColumnIndex(headerTexts, ['売上'], ['粗利', '率', 'セール']);
    const customersColIdx = findColumnIndex(headerTexts, ['人数', '客数']);
    const grossRateColIdx = findColumnIndex(headerTexts, ['粗利率']);

    if (salesColIdx < 0) return;
    console.log(`[Sales] Table headers: ${JSON.stringify(headerTexts)}, salesCol: ${salesColIdx}, customersCol: ${customersColIdx}, grossRateCol: ${grossRateColIdx}`);

    rows.forEach((row, rowIdx) => {
      if (rowIdx === 0) return; // ヘッダー行スキップ

      const cells = $(row).find('td,th').toArray();
      if (cells.length < 2) return;

      const firstCellText = $(cells[0]).text().trim().replace(/\s+/g, '');
      if (!firstCellText) return;

      const salesText = salesColIdx < cells.length ? $(cells[salesColIdx]).text().trim() : '';
      const salesAmount = parseSalesAmount(salesText);

      const customersText = customersColIdx >= 0 && customersColIdx < cells.length
        ? $(cells[customersColIdx]).text().trim().replace(/[,\s]/g, '')
        : '';
      const customersCount = parseInt(customersText) || 0;

      const grossRateText = grossRateColIdx >= 0 && grossRateColIdx < cells.length
        ? $(cells[grossRateColIdx]).text().trim().replace('%', '').trim()
        : '';
      const grossProfitRate = parseFloat(grossRateText) || null;

      if (mode === 'monthly') {
        // 月報: "2025年01月" のような行を収集
        if (firstCellText.includes('合計') || firstCellText.includes('平均')) {
          if (firstCellText.includes('合計') && salesAmount > 0) {
            totalSales = salesAmount;
          }
          return;
        }
        // "YYYY年MM月" パターン
        if (/\d{4}年\d{2}月/.test(firstCellText) && salesAmount > 0) {
          monthlyList.push({
            year_month: firstCellText,
            sales: salesAmount,
            customers: customersCount,
            gross_profit_rate: grossProfitRate,
          });
          // 指定月の売上を抽出
          const targetMonthStr = `${year}年${String(month).padStart(2, '0')}月`;
          if (firstCellText.includes(targetMonthStr)) {
            totalSales = salesAmount;
          }
        }
      } else {
        // 日報: "2025/12/01（月）" のような行を収集
        if (firstCellText.includes('合計') || firstCellText.includes('平均')) {
          if (firstCellText.includes('合計') && salesAmount > 0) {
            totalSales = salesAmount;
          }
          return;
        }
        // "YYYY/MM/DD" パターン（曜日付きも対応）
        const dateMatch = firstCellText.match(/(\d{4}\/\d{2}\/\d{2})/);
        const dowMatch  = firstCellText.match(/[（(]([月火水木金土日])[）)]/);
        if (dateMatch && salesAmount >= 0) {
          dailyList.push({
            date: dateMatch[1],
            day_of_week: dowMatch ? dowMatch[1] : '',
            sales: salesAmount,
            customers: customersCount,
            gross_profit_rate: grossProfitRate,
          });
          totalSales += salesAmount;
        }
      }
    });
  });

  // 合計が0の場合はリストから再計算
  if (totalSales === 0) {
    if (mode === 'monthly' && monthlyList.length > 0) {
      const targetMonthStr = `${year}年${String(month).padStart(2, '0')}月`;
      const found = monthlyList.find(m => m.year_month.includes(targetMonthStr));
      if (found) totalSales = found.sales;
    } else if (mode === 'daily' && dailyList.length > 0) {
      totalSales = dailyList.reduce((sum, d) => sum + d.sales, 0);
    }
  }

  console.log(`[Sales] mode=${mode} totalSales=${totalSales}, monthlyList=${monthlyList.length}, dailyList=${dailyList.length}`);

  return { totalSales, monthlyList, dailyList };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const username = process.env.TEMPOVISOR_USERNAME;
  const password = process.env.TEMPOVISOR_PASSWORD;
  if (!username || !password) {
    return res.status(500).json({
      error: 'TempoVisor credentials not configured',
      message: 'Please set TEMPOVISOR_USERNAME and TEMPOVISOR_PASSWORD environment variables',
    });
  }

  try {
    const { year, month, store_name, mode = 'monthly' } = req.query;

    if (!year || !month || !store_name) {
      return res.status(400).json({ error: 'year, month, store_name are required' });
    }

    const yearNum  = parseInt(year);
    const monthNum = parseInt(month);
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const decodedStoreName = decodeURIComponent(store_name);
    const fetchMode = mode === 'daily' ? 'daily' : 'monthly';
    console.log(`[MonthlySales] ${yearNum}/${monthNum} ${decodedStoreName} mode=${fetchMode}`);

    const { totalSales, monthlyList, dailyList } = await fetchSalesFromN221(
      username, password, yearNum, monthNum, decodedStoreName, fetchMode
    );

    const yearMonth = `${yearNum}-${String(monthNum).padStart(2, '0')}`;

    return res.status(200).json({
      success: true,
      year_month: yearMonth,
      store_name: decodedStoreName,
      total_sales: totalSales,
      monthly_list: monthlyList,  // 月報モード時: 年間12ヶ月分
      daily_list: dailyList,      // 日報モード時: 月内日別
      mode: fetchMode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[MonthlySales] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch sales',
      message: error.message,
    });
  }
}

export const config = {
  maxDuration: 60,
};
