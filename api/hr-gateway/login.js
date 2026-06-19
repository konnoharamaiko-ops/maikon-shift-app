/**
 * Vercel Serverless Function: HR API Gateway - Login
 * 顧客管理DB APIへのログインプロキシ
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
    const { email, password } = req.body;

    // パラメータ検証
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // 顧客管理DB APIにログインリクエスト
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // トークンを返却
    return res.status(200).json(data);
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
