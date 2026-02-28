/**
 * Debug API for checking Jobcan cell structure in Vercel environment
 */
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';

    const loginUrl = 'https://ssl.jobcan.jp/login/client/';

    // Step1: GETでCSRFトークンを取得
    const getRes = await fetch(loginUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    
    // Cookieを取得（getAll対応）
    let initialCookieStr = '';
    try {
      const setCookies = getRes.headers.getSetCookie ? getRes.headers.getSetCookie() : [];
      if (setCookies.length > 0) {
        initialCookieStr = setCookies.map(c => c.split(';')[0]).join('; ');
      } else {
        initialCookieStr = (getRes.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
      }
    } catch(e) {
      initialCookieStr = (getRes.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
    }

    const loginHtml = await getRes.text();
    const $login = cheerio.load(loginHtml);
    const csrfToken = $login('input[name="token"]').val() || '';

    // Step2: POSTでログイン
    const loginBody = new URLSearchParams({
      token: csrfToken,
      client_login_id: jobcanCompany,
      client_manager_login_id: jobcanUser,
      client_login_password: jobcanPass,
      url: '/client',
      login_type: '2',
    }).toString();

    const loginRes = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': initialCookieStr,
        'Referer': loginUrl,
      },
      body: loginBody,
      redirect: 'manual',
    });

    let loginCookieStr = '';
    try {
      const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
      if (setCookies.length > 0) {
        loginCookieStr = setCookies.map(c => c.split(';')[0]).join('; ');
      } else {
        loginCookieStr = (loginRes.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
      }
    } catch(e) {
      loginCookieStr = (loginRes.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).join('; ');
    }

    // Cookieをマージ
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
    parseCookieStr(initialCookieStr);
    parseCookieStr(loginCookieStr);
    const allCookies = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');

    const loginLocation = loginRes.headers.get('location') || '';

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

    // テーブルを探す
    let targetTable = null;
    $work('table').each((i, table) => {
      const headerRow = $work(table).find('tr').first();
      const headerText = headerRow.text();
      if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
        targetTable = table;
      }
    });

    if (!targetTable) {
      return res.status(200).json({
        error: 'Table not found',
        login_location: loginLocation,
        work_url: workRes.url,
        html_length: workHtml.length,
        tables_count: $work('table').length,
        initial_cookies: initialCookieStr.substring(0, 100),
        login_cookies: loginCookieStr.substring(0, 100),
        all_cookies: allCookies.substring(0, 100),
        csrf_token: csrfToken.substring(0, 20),
      });
    }

    const rows = $work(targetTable).find('tr').toArray();
    
    // ヘッダー行
    const headerCells = $work(rows[0]).find('td, th').toArray();
    const headers = headerCells.map(c => $work(c).text().trim());

    // 最初の3データ行
    const sampleRows = [];
    for (let i = 1; i <= Math.min(3, rows.length - 1); i++) {
      const cells = $work(rows[i]).find('td').toArray();
      sampleRows.push({
        row_index: i,
        cell_count: cells.length,
        cells: cells.map((c, k) => ({ index: k, text: $work(c).text().trim().substring(0, 60) })),
      });
    }

    return res.status(200).json({
      success: true,
      login_location: loginLocation,
      work_html_length: workHtml.length,
      total_rows: rows.length,
      headers,
      sample_rows: sampleRows,
      all_cookies_length: allCookies.length,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack?.substring(0, 500) });
  }
}

export const config = {
  maxDuration: 60,
};
