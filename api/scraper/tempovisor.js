/**
 * Vercel Serverless Function: TempoVisor Scraper
 * TempoVisorから売上データを取得
 */

import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium';

const TEMPOVISOR_URL = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet?legacy=true';
const USERNAME = process.env.TEMPOVISOR_USERNAME || 'manu';
const PASSWORD = process.env.TEMPOVISOR_PASSWORD || 'manus';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let browser = null;

  try {
    const { date } = req.body; // yyyy-mm-dd形式

    // Playwrightブラウザを起動（Vercel環境用）
    browser = await chromium.launch({
      args: chromiumPkg.args,
      executablePath: await chromiumPkg.executablePath(),
      headless: chromiumPkg.headless,
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // TempoVisorにログイン
    await page.goto(TEMPOVISOR_URL, { waitUntil: 'networkidle' });
    
    await page.fill('input[name="userId"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('input[type="submit"]');
    
    await page.waitForLoadState('networkidle');

    // 売上データを取得
    // TODO: 実際のページ構造に合わせてセレクタを調整
    const salesData = await page.evaluate(() => {
      const stores = [];
      const rows = document.querySelectorAll('table tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          stores.push({
            store_name: cells[0]?.textContent?.trim(),
            sales: cells[1]?.textContent?.trim(),
            date: cells[2]?.textContent?.trim(),
          });
        }
      });
      
      return stores;
    });

    await browser.close();

    return res.status(200).json({
      success: true,
      date,
      data: salesData,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('TempoVisor scraping error:', error);
    
    if (browser) {
      await browser.close();
    }

    return res.status(500).json({
      error: 'Scraping failed',
      message: error.message,
    });
  }
}

export const config = {
  maxDuration: 60, // 最大60秒
};
