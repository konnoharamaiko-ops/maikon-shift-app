/**
 * デバッグAPI: JobCanの出入詳細ページのHTML構造を確認する
 * 田浦利季さん（empId=672）の実際の退勤打刻時刻を確認
 */
import * as cheerio from 'cheerio';

function extractCookies(response) {
  try {
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (setCookies.length > 0) {
      return setCookies.map(c => c.split(';')[0]).join('; ');
    }
    return (response.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
  } catch(e) {
    return (response.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
  }
}

function mergeCookies(existing, newCookies) {
  const cookieMap = {};
  const parseCookieStr = (str) => {
    if (!str) return;
    str.split(';').forEach(part => {
      const [key, ...vals] = part.trim().split('=');
      const val = vals.join('=');
      if (key) cookieMap[key.trim()] = val;
    });
  };
  parseCookieStr(existing);
  parseCookieStr(newCookies);
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const companyId = process.env.JOBCAN_COMPANY_ID;
  const loginId = process.env.JOBCAN_LOGIN_ID;
  const password = process.env.JOBCAN_PASSWORD;

  if (!companyId || !loginId || !password) {
    return res.status(500).json({ error: 'Missing Jobcan credentials' });
  }

  try {
    // ログイン
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

    // 今日の日付
    const today = new Date();
    const jstToday = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = `${jstToday.getUTCFullYear()}-${String(jstToday.getUTCMonth() + 1).padStart(2, '0')}-${String(jstToday.getUTCDate()).padStart(2, '0')}`;

    // 出入詳細ページを取得（田浦利季さん empId=672）
    const empId = req.query.emp_id || '672';
    const stampDetailUrl = `https://ssl.jobcan.jp/client/adit-manage/detail/?employee_id=${empId}&target_date=${todayStr}`;
    
    console.log(`[DEBUG] Fetching stamp detail: ${stampDetailUrl}`);
    
    const detailRes = await fetch(stampDetailUrl, {
      headers: {
        'Cookie': allCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://ssl.jobcan.jp/client/',
      },
      redirect: 'follow',
    });

    const detailHtml = await detailRes.text();
    const $detail = cheerio.load(detailHtml);

    // テーブル構造を確認
    const tables = [];
    $detail('table').each((i, table) => {
      const headerRow = $detail(table).find('tr').first();
      const headerText = headerRow.text().trim().replace(/\s+/g, ' ');
      const rows = $detail(table).find('tr').toArray();
      const sampleRows = [];
      for (let j = 0; j < Math.min(10, rows.length); j++) {
        const cells = $detail(rows[j]).find('td, th').toArray();
        sampleRows.push({
          row_index: j,
          cell_count: cells.length,
          cells: cells.map((c, k) => ({
            index: k,
            text: $detail(c).text().trim().replace(/\s+/g, ' ').substring(0, 100),
            class: $detail(c).attr('class') || '',
          })),
        });
      }
      tables.push({
        table_index: i,
        header_text: headerText.substring(0, 200),
        row_count: rows.length,
        sample_rows: sampleRows,
      });
    });

    // ページ全体のテキストも取得
    const pageText = $detail('body').text().replace(/\s+/g, ' ').substring(0, 2000);

    return res.status(200).json({
      today: todayStr,
      emp_id: empId,
      stamp_detail_url: stampDetailUrl,
      final_url: detailRes.url,
      html_length: detailHtml.length,
      status_code: detailRes.status,
      table_count: tables.length,
      tables: tables,
      page_text_preview: pageText,
      // HTMLの最初の1000文字
      html_preview: detailHtml.substring(0, 1000),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.substring(0, 500) });
  }
}

export const config = {
  maxDuration: 60,
};
