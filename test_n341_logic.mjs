import * as cheerio from 'cheerio';
import fs from 'fs';

const html = fs.readFileSync('/home/ubuntu/n341_today.html', 'utf8');
const $ = cheerio.load(html);

const normalize = s => s.replace(/\s/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
  String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

let allEntries = [];
let foundTable = false;
let amountColIndex = -1;

$('table').each((_, table) => {
  if (foundTable) return;
  const rows = $(table).find('tr').toArray();
  if (rows.length < 3) return;
  const headerRow = $(rows[0]).find('td,th').toArray();
  if (headerRow.length < 3) return;
  const headerTexts = headerRow.map(c => normalize($(c).text().trim()));
  const h0 = headerTexts[0];
  const h1 = headerTexts[1];
  const h2 = headerTexts[2];
  const isDataTable = (h0 === '日付' || h0.includes('日付')) &&
                      (h1 === '時間' || h1.includes('時間')) &&
                      (h2.includes('伝票') || h2.includes('No') || h2.includes('番号'));
  if (!isDataTable) return;
  
  amountColIndex = headerTexts.findIndex(h => h.includes('金額') || h.includes('小計'));
  if (amountColIndex === -1) amountColIndex = headerRow.length - 1;
  console.log('テーブル発見! 金額列:', amountColIndex, 'ヘッダー:', headerTexts.slice(0,7).join('|'));
  
  rows.forEach(row => {
    const cells = $(row).find('td,th').toArray();
    if (cells.length < 3) return;
    const c0 = $(cells[0]).text().trim();
    const c1 = $(cells[1]).text().trim();
    if (c0.match(/^\d{4}\/\d{2}\/\d{2}$/) && c1.match(/^\d{1,2}:\d{2}$/)) {
      const timeMatch = c1.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) return;
      const h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      const totalMinutes = h * 60 + m;
      let amount = 0;
      if (amountColIndex >= 0 && amountColIndex < cells.length) {
        const amtText = $(cells[amountColIndex]).text().trim()
          .replace(/[\\\u00a5･,]/g, '')
          .replace(/[^\d-]/g, '');
        amount = parseInt(amtText) || 0;
      }
      allEntries.push({ hour: h, minutes: totalMinutes, timeStr: c1, amount });
    }
  });
  foundTable = true;
});

console.log('foundTable:', foundTable);
console.log('allEntries count:', allEntries.length);
if (allEntries.length > 0) {
  const minMinutes = Math.min(...allEntries.map(e => e.minutes));
  const OPEN_HOUR_MINUTES = 9 * 60;
  console.log('最小時刻(分):', minMinutes, '=', Math.floor(minMinutes/60) + ':' + String(minMinutes%60).padStart(2,'0'));
  console.log('OPEN_HOUR_MINUTES:', OPEN_HOUR_MINUTES);
  console.log('minMinutes >= OPEN_HOUR_MINUTES:', minMinutes >= OPEN_HOUR_MINUTES);
  
  const hourlyTotal = {};
  allEntries.forEach(e => {
    hourlyTotal[e.hour] = (hourlyTotal[e.hour] || 0) + e.amount;
  });
  console.log('時間帯別合計:', JSON.stringify(hourlyTotal));
  
  // パターン判定
  const OPEN = 9 * 60;
  const firstEntry = allEntries[0];
  if (minMinutes >= OPEN) {
    console.log('→ パターンB: 全伝票が前日レジ締め後分（全除外）');
    let total = 0;
    const hourlyExclude = {};
    allEntries.forEach(e => {
      total += e.amount;
      hourlyExclude[e.hour] = (hourlyExclude[e.hour] || 0) + e.amount;
    });
    console.log('除外合計:', total, '円');
    console.log('時間帯別除外:', JSON.stringify(hourlyExclude));
  } else if (!firstEntry || firstEntry.minutes === minMinutes) {
    console.log('→ パターンC: 前日レジ締め後分なし（除外不要）');
  } else {
    console.log('→ パターンA: 先頭から最小時刻まで前日分');
  }
}
