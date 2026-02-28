/**
 * Debug endpoint to check TempoVisor and Jobcan HTML structure
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const tempovisorUser = process.env.TEMPOVISOR_USERNAME || 'manu';
    const tempovisorPass = process.env.TEMPOVISOR_PASSWORD || 'manus';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';

    const debugInfo = {};

    // TempoVisorのデバッグ
    try {
      const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet?legacy=true';
      
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `loginId=${encodeURIComponent(tempovisorUser)}&password=${encodeURIComponent(tempovisorPass)}&submit=ログイン`,
        redirect: 'manual',
      });

      debugInfo.tempovisor_login_status = loginRes.status;
      debugInfo.tempovisor_location = loginRes.headers.get('location');
      
      const rawCookies = loginRes.headers.raw ? loginRes.headers.raw()['set-cookie'] : [];
      const setCookieStr = loginRes.headers.get('set-cookie') || '';
      debugInfo.tempovisor_cookies_raw = setCookieStr.substring(0, 200);

      // Cookieを正しく抽出
      let cookies = '';
      if (rawCookies && rawCookies.length > 0) {
        cookies = rawCookies.map(c => c.split(';')[0]).join('; ');
      } else if (setCookieStr) {
        cookies = setCookieStr.split(',').map(c => c.trim().split(';')[0]).join('; ');
      }
      debugInfo.tempovisor_cookies_parsed = cookies.substring(0, 200);

      let location = loginRes.headers.get('location') || 'https://www.tenpovisor.jp/alioth/board/topmenu';
      if (!location.startsWith('http')) {
        location = 'https://www.tenpovisor.jp' + location;
      }

      const topRes = await fetch(location, {
        headers: { 'Cookie': cookies },
        redirect: 'follow',
      });

      debugInfo.tempovisor_top_status = topRes.status;
      debugInfo.tempovisor_top_url = topRes.url;
      
      const html = await topRes.text();
      debugInfo.tempovisor_html_length = html.length;
      debugInfo.tempovisor_html_snippet = html.substring(0, 500);
      
      // sales_Listテーブルを探す
      const salesListMatch = html.match(/id="sales_List"/);
      debugInfo.tempovisor_has_sales_list = !!salesListMatch;
      
      // テーブルの行数を確認
      const trMatches = html.match(/<tr/g);
      debugInfo.tempovisor_tr_count = trMatches ? trMatches.length : 0;
      
      // 田辺店が含まれているか確認
      debugInfo.tempovisor_has_tanabe = html.includes('田辺店');
      
    } catch (e) {
      debugInfo.tempovisor_error = e.message;
    }

    // ジョブカンのデバッグ
    try {
      const loginUrl = 'https://ssl.jobcan.jp/login/client/';
      
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_login_id=${encodeURIComponent(jobcanUser)}&client_login_password=${encodeURIComponent(jobcanPass)}&client_company_id=${encodeURIComponent(jobcanCompany)}&_token=&login_type=client`,
        redirect: 'manual',
      });

      debugInfo.jobcan_login_status = loginRes.status;
      debugInfo.jobcan_location = loginRes.headers.get('location');
      
      const setCookieStr = loginRes.headers.get('set-cookie') || '';
      const cookies = setCookieStr.split(',').map(c => c.trim().split(';')[0]).join('; ');
      debugInfo.jobcan_cookies = cookies.substring(0, 200);

      const workStateUrl = 'https://ssl.jobcan.jp/client/work-state/show/?submit_type=today&searching=1&list_type=normal&number_par_page=300&retirement=work';
      
      const workRes = await fetch(workStateUrl, {
        headers: { 'Cookie': cookies },
        redirect: 'follow',
      });

      debugInfo.jobcan_work_status = workRes.status;
      debugInfo.jobcan_work_url = workRes.url;
      
      const html = await workRes.text();
      debugInfo.jobcan_html_length = html.length;
      debugInfo.jobcan_html_snippet = html.substring(0, 500);
      debugInfo.jobcan_has_note_table = html.includes('class="note"') || html.includes("class='note'");
      debugInfo.jobcan_has_10110 = html.includes('10110');
      
    } catch (e) {
      debugInfo.jobcan_error = e.message;
    }

    return res.status(200).json(debugInfo);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export const config = {
  maxDuration: 60,
};
