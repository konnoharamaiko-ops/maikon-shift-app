/**
 * Vercel Serverless Function: HR API Gateway - Search
 * 顧客管理DB APIへの検索プロキシ
 */

import { applyCors } from '../_lib/security.js';

const API_BASE_URL = process.env.HR_API_BASE_URL || 'https://kokyaku-kanri.maikon.jp:9080';

export default async function handler(req, res) {
  // CORS: 許可Originのみ（オープンリレー防止）
  if (applyCors(req, res, { methods: 'POST,OPTIONS' })) return;

  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, search_type, search_item, search_from, search_to, page } = req.body;

    // パラメータ検証
    if (!token) {
      return res.status(401).json({ error: 'Token is required' });
    }

    if (!search_type || !search_item || !search_from) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // URLにページパラメータを追加
    const url = new URL(`${API_BASE_URL}/api/search`);
    if (page) {
      url.searchParams.append('page', page.toString());
    }

    // 顧客管理DB APIに検索リクエスト
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        search_type,
        search_item,
        search_from,
        search_to,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // データを返却
    return res.status(200).json(data);
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
