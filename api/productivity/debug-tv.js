/**
 * Debug API for checking TempoVisor MainMenuServlet structure
 */
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const username = process.env.TEMPOVISOR_USERNAME || 'manu';
    const password = process.env.TEMPOVISOR_PASSWORD || 'manus';

    // ログイン
    const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
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

    // MainMenuServletを取得
    const menuUrl = 'https://www.tenpovisor.jp/alioth/servlet/MainMenuServlet';
    const menuRes = await fetch(menuUrl, {
      headers: {
        'Cookie': allCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const menuBuffer = await menuRes.arrayBuffer();
    const menuHtml = iconv.decode(Buffer.from(menuBuffer), 'cp932');
    const $menu = cheerio.load(menuHtml);

    // テーブル構造を調査
    const tableInfo = [];
    $menu('table').each((ti, table) => {
      const rows = $menu(table).find('tr').toArray();
      if (rows.length < 3) return;

      // 各行の最初のセルに店舗名が含まれるか確認
      let hasStoreName = false;
      rows.forEach(row => {
        const cells = $menu(row).find('td,th').toArray();
        if (cells.length > 0) {
          const firstText = $menu(cells[0]).text().trim();
          if (TEMPOVISOR_STORE_CODES[firstText]) hasStoreName = true;
        }
      });

      if (!hasStoreName) return;

      // 店舗名を含む行の詳細を取得
      const storeRows = [];
      rows.forEach((row, ri) => {
        const cells = $menu(row).find('td,th').toArray();
        const firstText = cells.length > 0 ? $menu(cells[0]).text().trim() : '';
        if (TEMPOVISOR_STORE_CODES[firstText] || firstText === '田辺店') {
          storeRows.push({
            row_index: ri,
            cell_count: cells.length,
            cells: cells.map((c, ci) => ({
              index: ci,
              text: $menu(c).text().trim().replace(/\s+/g, ' ').substring(0, 30),
            })),
          });
        }
      });

      tableInfo.push({
        table_index: ti,
        row_count: rows.length,
        store_rows: storeRows.slice(0, 3),
      });
    });

    // fetchStoreUpdateTimesと同じロジックで更新時刻を取得
    const updateTimes = {};
    $menu('table tr').each((i, row) => {
      const cells = $menu(row).find('td,th').toArray();
      if (cells.length < 9) return;
      const storeName = $menu(cells[0]).text().trim().replace(/[\\\[\]]/g, '');
      if (!TEMPOVISOR_STORE_CODES[storeName]) return;
      const lastCell = $menu(cells[cells.length - 1]).text().trim();
      const secondLastCell = $menu(cells[cells.length - 2]).text().trim();
      const timePattern = /\d{2}\/\d{2}\s+\d{2}:\d{2}/;
      if (timePattern.test(lastCell)) {
        updateTimes[storeName] = lastCell;
      } else if (timePattern.test(secondLastCell)) {
        updateTimes[storeName] = secondLastCell;
      }
    });

    return res.status(200).json({
      success: true,
      html_length: menuHtml.length,
      update_times: updateTimes,
      table_info: tableInfo,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack?.substring(0, 500) });
  }
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
    if (cookiePart.includes('=')) cookies.push(cookiePart);
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
