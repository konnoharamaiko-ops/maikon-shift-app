import iconv from 'iconv-lite';

const TV_USER = '113';
const TV_PASS = '90514';
const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
const repBaseUrl = 'https://www.tenpovisor.jp/alioth/rep/';

function extractCookies(res) {
  const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return setCookieHeaders.map(c => c.split(';')[0]).join('; ');
}

async function main() {
  // Step 1: GETでセッションCookieを取得
  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });
  const initialCookies = extractCookies(getRes);
  console.log('Initial cookies:', initialCookies);

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
  const allCookies = [initialCookies, loginCookies].filter(Boolean).join('; ');
  console.log('Login status:', loginRes.status);
  console.log('All cookies:', allCookies.substring(0, 100));

  // Step 3: N341にPOSTリクエスト（田辺店、2026/03/02）
  const dateStr = '2026/03/02';
  const body = new URLSearchParams({
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

  console.log('\nPOSTing to N341Servlet...');
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
  
  // HTMLをファイルに保存
  import('fs').then(fs => {
    fs.writeFileSync('/home/ubuntu/n341_debug.html', html, 'utf8');
    console.log('HTML saved to /home/ubuntu/n341_debug.html');
    
    // データ行を探す
    const lines = html.split('\n');
    const dataLines = lines.filter(l => l.includes('2026/03/02') || l.includes('2026/03/01'));
    console.log('\nLines with date 2026/03/02 or 2026/03/01:');
    dataLines.slice(0, 20).forEach(l => console.log(l.trim().substring(0, 200)));
  });
}

main().catch(console.error);
