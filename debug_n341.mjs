/**
 * N341デバッグスクリプト - 今日の田辺店N341を取得してパース問題を特定
 */
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import fs from 'fs';

// 実際の認証情報（realtime.jsのデフォルト値と同じ）
const TV_USER = process.env.TEMPOVISOR_USERNAME || 'manu';
const TV_PASS = process.env.TEMPOVISOR_PASSWORD || 'manus';
const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
const repBaseUrl = 'https://www.tenpovisor.jp/alioth/rep/';

function extractCookies(res) {
  const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (setCookieHeaders.length > 0) {
    return setCookieHeaders.map(c => c.split(';')[0].trim()).join('; ');
  }
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

function mergeCookies(a, b) {
  const map = {};
  [a, b].forEach(s => {
    if (!s) return;
    s.split(';').forEach(c => {
      const [k, v] = c.trim().split('=');
      if (k) map[k.trim()] = v ? v.trim() : '';
    });
  });
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function main() {
  // ログイン
  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });
  const initialCookies = extractCookies(getRes);
  console.log('Initial cookies:', initialCookies.substring(0, 80));

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
  console.log('Login status:', loginRes.status, '→', loginRes.headers.get('location') || '');

  // 今日の日付（JST）
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jstNow.getUTCFullYear();
  const mm = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jstNow.getUTCDate()).padStart(2, '0');
  const todayStr = `${yyyy}/${mm}/${dd}`;
  console.log('\n今日:', todayStr);

  // 田辺店（0001）の今日N341を取得
  const body = new URLSearchParams({
    chkcsv: 'false',
    slipDetailNo: '',
    slipDetailDate: '',
    slipDetailShopCode: '',
    yyyymmdd1: todayStr,
    yyyymmdd2: todayStr,
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

  const n341Res = await fetch(`${repBaseUrl}N341Servlet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': allCookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': repBaseUrl,
    },
    body: body.toString(),
  });
  console.log('N341 status:', n341Res.status);

  const buffer = await n341Res.arrayBuffer();
  const html = iconv.decode(Buffer.from(buffer), 'cp932');
  console.log('HTML length:', html.length);
  
  fs.writeFileSync('/home/ubuntu/n341_today.html', html, 'utf8');
  console.log('HTMLを /home/ubuntu/n341_today.html に保存');

  const $ = cheerio.load(html);
  console.log('\nテーブル数:', $('table').length);

  // 全テーブルのヘッダーを出力
  $('table').each((idx, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;
    const headerCells = $(rows[0]).find('td,th').toArray();
    const headerTexts = headerCells.map(c => $(c).text().trim().replace(/\s+/g, ' '));
    console.log(`\nテーブル${idx} (${rows.length}行): [${headerTexts.slice(0, 8).join(' | ')}]`);
    
    // 最初の5行のデータを出力
    for (let r = 1; r <= Math.min(5, rows.length - 1); r++) {
      const cells = $(rows[r]).find('td,th').toArray();
      const cellTexts = cells.map(c => $(c).text().trim().replace(/\s+/g, ' '));
      console.log(`  行${r}: [${cellTexts.slice(0, 8).join(' | ')}]`);
    }
  });

  // 日付・時刻パターンを持つ行を全て抽出
  console.log('\n=== 日付・時刻パターンを持つ全行 ===');
  const normalize = s => s.replace(/\s/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  
  $('table tr').each((_, row) => {
    const cells = $(row).find('td,th').toArray();
    if (cells.length < 2) return;
    const c0 = $(cells[0]).text().trim();
    const c1 = $(cells[1]).text().trim();
    if (c0.match(/^\d{4}\/\d{2}\/\d{2}$/) && c1.match(/^\d{1,2}:\d{2}$/)) {
      const cellTexts = cells.map(c => $(c).text().trim().replace(/\s+/g, ' '));
      console.log(`  [${cellTexts.slice(0, 8).join(' | ')}]`);
    }
  });

  // ヘッダー行の正規化テスト
  console.log('\n=== ヘッダー正規化テスト ===');
  $('table').each((idx, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return;
    const headerRow = $(rows[0]).find('td,th').toArray();
    if (headerRow.length < 3) return;
    const headerTexts = headerRow.map(c => normalize($(c).text().trim()));
    const h0 = headerTexts[0];
    const h1 = headerTexts[1];
    const h2 = headerTexts[2];
    const isDataTable = (h0 === '日付' || h0.includes('日付')) &&
                        (h1 === '時間' || h1.includes('時間')) &&
                        (h2.includes('伝票') || h2.includes('No') || h2.includes('番号'));
    console.log(`テーブル${idx}: h0="${h0}" h1="${h1}" h2="${h2}" → isDataTable=${isDataTable}`);
    // 文字コードも出力
    const h0codes = [...h0].map(c => c.codePointAt(0).toString(16)).join(',');
    console.log(`  h0 codepoints: ${h0codes}`);
  });
}

main().catch(err => {
  console.error('エラー:', err.message);
  console.error(err.stack);
});
