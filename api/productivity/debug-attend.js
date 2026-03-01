/**
 * デバッグAPI: 出勤簿ページのselect要素のHTML構造を確認する
 */
import * as cheerio from 'cheerio';

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
    const initialCookies = getRes.headers.get('set-cookie') || '';
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

    const loginCookies = loginRes.headers.get('set-cookie') || '';
    const allCookies = [initialCookies, loginCookies].filter(Boolean).join('; ');

    // 出勤簿ページ4ページ目を取得（佐藤美咲さんがいるページ）
    const today = new Date();
    const jstToday = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = `${jstToday.getUTCFullYear()}-${String(jstToday.getUTCMonth() + 1).padStart(2, '0')}-${String(jstToday.getUTCDate()).padStart(2, '0')}`;

    const attendUrl = `https://ssl.jobcan.jp/client/adit-manage/?search_type=day&target_date=${todayStr}&number_par_page=30&page=4`;
    const attendRes = await fetch(attendUrl, {
      headers: {
        'Cookie': allCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://ssl.jobcan.jp/client/',
      },
      redirect: 'follow',
    });

    const attendHtml = await attendRes.text();
    const $attend = cheerio.load(attendHtml);

    // select#group_701_... を探す
    const result = [];
    $attend('select[id^="group_"]').each((_, sel) => {
      const selId = $attend(sel).attr('id') || '';
      if (!selId.startsWith('group_701') && !selId.startsWith('group_698')) return;

      const selectedOption = $attend(sel).find('option[selected]');
      const firstOption = $attend(sel).find('option').first();
      const allOptions = $attend(sel).find('option').map((i, o) => ({
        index: i,
        value: $attend(o).attr('value'),
        text: $attend(o).text().trim(),
        selected: $attend(o).attr('selected') !== undefined,
      })).get();

      result.push({
        id: selId,
        selected_option_text: selectedOption.text().trim(),
        selected_option_count: selectedOption.length,
        first_option_text: firstOption.text().trim(),
        all_options: allOptions,
        // HTMLの一部
        html_snippet: $attend(sel).html()?.substring(0, 500),
      });
    });

    return res.status(200).json({
      today: todayStr,
      page: 4,
      select_count: result.length,
      selects: result,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
