import iconv from 'iconv-lite';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const TV_USER = '113';
const TV_PASS = '90514';
const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
const repBaseUrl = 'https://www.tenpovisor.jp/alioth/rep/';

function extractCookies(res) {
  const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return setCookieHeaders.map(c => c.split(';')[0]).join('; ');
}

function mergeCookies(c1, c2) {
  if (!c1) return c2;
  if (!c2) return c1;
  const map = {};
  [c1, c2].forEach(cs => cs.split('; ').forEach(pair => {
    const [k, ...v] = pair.split('=');
    if (k) map[k.trim()] = v.join('=');
  }));
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function main() {
  // Step 1: GETでセッションCookieを取得
  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });
  const initialCookies = extractCookies(getRes);

  // Step 2: ログイン
  const loginBody = new URLSearchParams({ id: TV_USER, pass: TV_PASS }).toString();
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
  console.log('Login status:', loginRes.status);

  // Step 3: N341にPOSTリクエスト（chkcsv: 'false' を追加）
  const dateStr = '2026/03/02';
  const body = new URLSearchParams({
    chkcsv: 'false',           // ← これが重要！検索実行フラグ
    slipDetailNo: '',
    slipDetailDate: '',
    slipDetailShopCode: '',
    yyyymmdd1: dateStr,
    yyyymmdd2: dateStr,
    scode1: '0001',
    areasearch: 'off',
    group: '1',
    syutsuryoku: '2',
    ssbetsu: 'HANBAI',
    henpin: 'off',
    ido_from: '0000',
    ido_to: '9999',
    out_method: '2',
    zeinuki: '1',
    keykind: 'nasi',
    searchkey1: '',
    searchkey2: '',
    pan2_flag: '1',
    useZikantai: '2',
    zikantai1: '00:00',
    zikantai2: '24:00',
    useCcode: '2',
    ccode1: '0000000000',
    ccode2: '9999999999',
    useDcode: '2',
    dcode1: '0000000',
    dcode2: '9999999',
  });

  console.log('\nPOSTing to N341Servlet with chkcsv=false...');
  const n341Res = await fetch(`${repBaseUrl}N341Servlet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': allCookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': `${repBaseUrl}N341Servlet`,
    },
    body: body.toString(),
  });
  console.log('N341 status:', n341Res.status);
  
  const buffer = await n341Res.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'cp932');
  console.log('HTML length:', html.length);
  
  // HTMLをファイルに保存
  writeFileSync('/home/ubuntu/n341_debug_v2.html', html, 'utf8');
  console.log('HTML saved to /home/ubuntu/n341_debug_v2.html');
  
  // cheerioでパース
  const $ = cheerio.load(html);
  console.log('\nTotal tables:', $('table').length);
  
  // データ行を探す
  const dataLines = html.split('\n').filter(l => l.includes('2026/03/02') || l.includes('2026/03/01'));
  console.log('\nLines with date 2026/03/02 or 2026/03/01 (first 10):');
  dataLines.slice(0, 10).forEach(l => console.log(l.trim().substring(0, 200)));
  
  // テーブル構造を確認
  console.log('\nTable structures:');
  $('table').each((tIdx, tbl) => {
    const rows = $(tbl).find('tr').toArray();
    if (rows.length === 0) return;
    const firstRowCells = $(rows[0]).find('td,th').toArray();
    const cellTexts = firstRowCells.slice(0, 4).map(c => `"${$(c).text().trim().substring(0, 20)}"`).join(', ');
    console.log(`Table ${tIdx}: rows=${rows.length}, first4cells=[${cellTexts}]`);
  });
  
  // 最初の伝票時刻を取得
  let firstHour = null;
  let firstTimeStr = null;
  let firstMinutes = null;
  $('table').each((_, table) => {
    if (firstHour !== null) return;
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;
    const firstRow = $(rows[0]).find('td,th').toArray();
    if (firstRow.length < 3) return;
    const cell0 = $(firstRow[0]).text().trim();
    const cell1 = $(firstRow[1]).text().trim();
    if (!cell0.match(/^\d{4}\/\d{2}\/\d{2}$/) || !cell1.match(/^\d{1,2}:\d{2}$/)) return;
    
    console.log(`\nFound data table! First row: date=${cell0}, time=${cell1}`);
    rows.forEach(row => {
      const cells = $(row).find('td,th').toArray();
      if (cells.length < 3) return;
      const c0 = $(cells[0]).text().trim();
      const c1 = $(cells[1]).text().trim();
      if (c0.match(/^\d{4}\/\d{2}\/\d{2}$/) && c1.match(/^\d{1,2}:\d{2}$/)) {
        const timeMatch = c1.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
          const h = parseInt(timeMatch[1]);
          const m = parseInt(timeMatch[2]);
          const totalMinutes = h * 60 + m;
          if (firstMinutes === null || totalMinutes < firstMinutes) {
            firstMinutes = totalMinutes;
            firstHour = h;
            firstTimeStr = c1;
          }
          console.log(`  Row: date=${c0}, time=${c1}`);
        }
      }
    });
  });
  
  if (firstHour !== null) {
    console.log(`\n最初の伝票時刻: ${firstTimeStr} (${firstHour}時台)`);
  } else {
    console.log('\nデータなし');
  }
}

main().catch(console.error);
