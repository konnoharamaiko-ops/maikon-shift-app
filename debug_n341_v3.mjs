import iconv from 'iconv-lite';
import * as cheerio from 'cheerio';
import { writeFileSync, readFileSync } from 'fs';

// 既存のHTMLを使用
const html = readFileSync('/home/ubuntu/n341_debug_v2.html', 'utf8');
const $ = cheerio.load(html);

console.log('=== Table 14の詳細分析 ===');
const table14 = $('table').eq(14);
const rows = table14.find('tr').toArray();
console.log(`Total rows: ${rows.length}`);

// 最初の5行を詳しく表示
rows.slice(0, 10).forEach((row, i) => {
  const cells = $(row).find('td,th').toArray();
  const cellData = cells.map((c, ci) => {
    const text = $(c).text().trim().replace(/\s+/g, ' ').substring(0, 30);
    const tag = $(c).prop('tagName');
    const cls = $(c).attr('class') || '';
    return `[${ci}:${tag}.${cls}]"${text}"`;
  });
  console.log(`Row ${i}: ${cellData.join(', ')}`);
});

console.log('\n=== 全行のcell[0]とcell[1]を確認 ===');
rows.forEach((row, i) => {
  const cells = $(row).find('td,th').toArray();
  if (cells.length >= 2) {
    const c0 = $(cells[0]).text().trim().replace(/\s+/g, ' ');
    const c1 = $(cells[1]).text().trim().replace(/\s+/g, ' ');
    console.log(`Row ${i}: c0="${c0}", c1="${c1}"`);
  }
});
