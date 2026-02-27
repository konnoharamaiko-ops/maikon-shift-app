/**
 * Vercel Serverless Function: TempoVisor Sales Data API
 * TempoVisorから売上データを取得
 * 
 * エンドポイント: POST /api/productivity/sales
 * リクエストボディ: { date: "yyyy-mm-dd" }
 * レスポンス: { success: true, data: [...] }
 */

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

  try {
    const { date } = req.body; // yyyy-mm-dd形式

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // 環境変数から認証情報を取得
    const username = process.env.TEMPOVISOR_USERNAME;
    const password = process.env.TEMPOVISOR_PASSWORD;

    if (!username || !password) {
      return res.status(500).json({ 
        error: 'TempoVisor credentials not configured',
        message: 'Please set TEMPOVISOR_USERNAME and TEMPOVISOR_PASSWORD environment variables'
      });
    }

    // TODO: 実際のTempoVisorスクレイピング実装
    // 現在はダミーデータを返す
    const dummyData = generateDummySalesData(date);

    return res.status(200).json({
      success: true,
      date,
      data: dummyData,
      timestamp: new Date().toISOString(),
      source: 'TempoVisor',
    });

  } catch (error) {
    console.error('TempoVisor API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch sales data',
      message: error.message,
    });
  }
}

/**
 * ダミー売上データ生成（開発用）
 */
function generateDummySalesData(date) {
  const stores = [
    { code: '001', name: '田辺店' },
    { code: '002', name: 'アベノ店' },
    { code: '003', name: '住之江店' },
    { code: '004', name: '平野店' },
    { code: '005', name: '東住吉店' },
    { code: '006', name: '生野店' },
    { code: '007', name: '東成店' },
    { code: '008', name: '城東店' },
    { code: '009', name: '鶴見店' },
    { code: '010', name: '旭店' },
    { code: '011', name: '都島店' },
    { code: '012', name: '北区店' },
    { code: '013', name: '福島店' },
    { code: '014', name: '西区店' },
  ];

  return stores.map(store => {
    // 時間帯別売上データ（9:00-21:00）
    const hourlyData = [];
    for (let hour = 9; hour <= 21; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      const baseSales = Math.random() * 50000 + 10000; // 10,000-60,000円
      
      hourlyData.push({
        time: timeStr,
        sales: Math.round(baseSales),
      });
    }

    // 日次合計売上
    const totalSales = hourlyData.reduce((sum, h) => sum + h.sales, 0);

    return {
      store_code: store.code,
      store_name: store.name,
      date: date,
      total_sales: totalSales,
      hourly_sales: hourlyData,
    };
  });
}

export const config = {
  maxDuration: 60, // 最大60秒
};
