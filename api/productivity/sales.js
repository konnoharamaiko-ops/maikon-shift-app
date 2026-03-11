/**
 * Vercel Serverless Function: TempoVisor Sales Data API
 * テンポバイザーから売上データを取得
 * 
 * エンドポイント:
 *   GET  /api/productivity/sales?year=2026&month=3&store_name=田辺店  → 月別売上
 *   POST /api/productivity/sales  { date: "yyyy-mm-dd" }              → 日別売上（後方互換）
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// TempoVisor店舗コードマッピング
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

function extractCookies(response) {
  const setCookieHeaders = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
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

  return { cookies: allCookies, repBaseUrl };
}

/**
 * N3D1Servletから指定年月の月間売上データを取得
 */
async function fetchMonthlySalesFromTempoVisor(username, password, year, month, storeName) {
  const { cookies, repBaseUrl } = await loginTempoVisor(username, password);

  const storeCode = TEMPOVISOR_STORE_CODES[storeName];
  if (!storeCode) {
    throw new Error(`Unknown store: ${storeName}`);
  }

  // 月の1日〜末日
  const startDate = `${year}/${String(month).padStart(2, '0')}/01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}/${String(month).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;

  // N3D1Servlet: 時間別売上（月間集計）
  const body = new URLSearchParams({
    chkcsv: 'false',
    chkcustom: '',
    shopcode: '',
    searched_time_slot1: '8',
    searched_time_slot2: '23',
    searched_yyyymmdd1: startDate,
    searched_yyyymmdd2: endDate,
    time_slot1_val: '8',
    time_slot2_val: '23',
    interval: '1',
    yyyymmdd1: startDate,
    yyyymmdd2: endDate,
    scode1: storeCode,
    scode2: storeCode,
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

  const res = await fetch(`${repBaseUrl}N3D1Servlet`, {
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

  const buffer = await res.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'cp932');
  const $ = cheerio.load(html);

  let totalSales = 0;
  let hourlySales = {};

  // テーブルから売上データを抽出
  $('table').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;

    const headerRow = $(rows[0]).find('td,th').toArray();
    if (headerRow.length < 3) return;

    const normalize = s => s.replace(/\s/g, '').replace(/[\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

    const headerTexts = headerRow.map(c => normalize($(c).text().trim()));

    const hasStoreName = headerTexts.some(h => h.includes('店舗') || h.includes('店名'));
    const hasTotal = headerTexts.some(h => h.includes('合計') || h.includes('計'));

    if (!hasStoreName && !hasTotal) return;

    const totalColIndex = headerTexts.findIndex(h => h.includes('合計') || h === '計');

    rows.slice(1).forEach(row => {
      const cells = $(row).find('td,th').toArray();
      if (cells.length < 2) return;

      const cellTexts = cells.map(c => $(c).text().trim());
      const firstCell = normalize(cellTexts[0]);

      if (firstCell.includes(storeName) || storeName.includes(firstCell)) {
        if (totalColIndex >= 0 && cells.length > totalColIndex) {
          const amountText = cellTexts[totalColIndex].replace(/[¥,\s]/g, '');
          const amount = parseInt(amountText) || 0;
          if (amount > 0) totalSales = amount;
        } else {
          const lastCell = cellTexts[cellTexts.length - 1].replace(/[¥,\s]/g, '');
          const amount = parseInt(lastCell) || 0;
          if (amount > 0) totalSales = amount;
        }

        headerTexts.forEach((h, i) => {
          const timeMatch = h.match(/^(\d{1,2}):?(\d{0,2})/);
          if (timeMatch && i < cells.length) {
            const hour = parseInt(timeMatch[1]);
            const amountText = cellTexts[i].replace(/[¥,\s]/g, '');
            const amount = parseInt(amountText) || 0;
            hourlySales[`${String(hour).padStart(2, '0')}:00`] = amount;
          }
        });
      }
    });
  });

  if (totalSales === 0) {
    const allText = $('body').text();
    const matches = allText.match(/合計[^\d]*([0-9,]+)/g);
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const numStr = lastMatch.replace(/[^0-9]/g, '');
      totalSales = parseInt(numStr) || 0;
    }
  }

  return { totalSales, hourlySales };
}

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const username = process.env.TEMPOVISOR_USERNAME;
  const password = process.env.TEMPOVISOR_PASSWORD;

  if (!username || !password) {
    return res.status(500).json({
      error: 'TempoVisor credentials not configured',
      message: 'Please set TEMPOVISOR_USERNAME and TEMPOVISOR_PASSWORD environment variables'
    });
  }

  // GETリクエスト: 月別売上取得
  if (req.method === 'GET') {
    try {
      const { year, month, store_name } = req.query;

      if (!year || !month || !store_name) {
        return res.status(400).json({ error: 'year, month, store_name are required' });
      }

      const yearNum = parseInt(year);
      const monthNum = parseInt(month);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: 'Invalid year or month' });
      }

      const decodedStoreName = decodeURIComponent(store_name);
      console.log(`[MonthlySales] Fetching ${yearNum}/${monthNum} for ${decodedStoreName}`);

      const { totalSales, hourlySales } = await fetchMonthlySalesFromTempoVisor(
        username, password, yearNum, monthNum, decodedStoreName
      );

      const yearMonth = `${yearNum}-${String(monthNum).padStart(2, '0')}`;

      return res.status(200).json({
        success: true,
        year_month: yearMonth,
        store_name: decodedStoreName,
        total_sales: totalSales,
        hourly_sales: hourlySales,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('[MonthlySales] Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch monthly sales',
        message: error.message,
      });
    }
  }

  // POSTリクエスト: 後方互換（旧実装）
  if (req.method === 'POST') {
    return res.status(200).json({
      success: false,
      message: 'POST method is deprecated. Use GET with year, month, store_name parameters.',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export const config = {
  maxDuration: 60,
};
