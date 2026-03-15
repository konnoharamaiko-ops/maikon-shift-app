/**
 * Vercel Serverless Function: HR Productivity History API
 * SupabaseのDailyProductivityテーブルからキャッシュ済みデータを読み取り
 *
 * エンドポイント: POST /api/productivity/history
 * リクエストボディ: { date_from: "yyyy-mm-dd", date_to: "yyyy-mm-dd" }
 * レスポンス: { success: true, data: [...], department_data: {...} }
 */

// TempoVisorの店舗コード
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001', '大正店': '0002', '天下茶屋店': '0003',
  '天王寺店': '0004', 'アベノ店': '0005', '心斎橋店': '0006',
  'かがや店': '0007', '駅丸': '0008', '北摂店': '0009',
  '堺東店': '0010', 'イオン松原店': '0011', 'イオン守口店': '0012',
  '美和堂福島店': '0013',
};

// 全13店舗リスト
const ALL_STORES = Object.keys(TEMPOVISOR_STORE_CODES);

// 部署カテゴリ分類
const DEPT_CATEGORIES = {
  '通販部': 'online',
  '企画部': 'planning',
  '特販部': 'online',
  'かがや工場': 'manufacturing',
  '北摂工場': 'manufacturing',
  '都島工場': 'manufacturing',
  '鶴橋工房': 'manufacturing',
};

export const config = {
  maxDuration: 15,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { date_from, date_to } = req.body;

    if (!date_from) {
      return res.status(400).json({ error: 'date_from is required' });
    }

    const endDate = date_to || date_from;

    // 日付範囲の検証（最大31日）
    const daysDiff = getDaysDifference(date_from, endDate);
    if (daysDiff > 31) {
      return res.status(400).json({
        error: 'Date range exceeds maximum of 31 days',
        days: daysDiff,
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    // DailyProductivityテーブルから店舗データを取得
    const storeData = await fetchFromSupabase(
      supabaseUrl, supabaseKey,
      'DailyProductivity',
      `work_date=gte.${date_from}&work_date=lte.${endDate}&order=work_date.asc,store_name.asc`
    );

    // DailyDeptProductivityテーブルから部署データを取得
    const deptData = await fetchFromSupabase(
      supabaseUrl, supabaseKey,
      'DailyDeptProductivity',
      `work_date=gte.${date_from}&work_date=lte.${endDate}&order=work_date.asc`
    );

    // 日付範囲のリストを生成
    const dates = getDateRange(date_from, endDate);

    // 店舗データをマップに変換（date+store_name → record）
    const storeMap = {};
    for (const record of storeData) {
      const key = `${record.work_date}_${record.store_name}`;
      storeMap[key] = record;
    }

    // レスポンスデータを構築
    const allData = [];

    for (const date of dates) {
      for (const storeName of ALL_STORES) {
        const key = `${date}_${storeName}`;
        const record = storeMap[key];

        allData.push({
          tenpo_name: storeName,
          code: TEMPOVISOR_STORE_CODES[storeName] || '',
          wk_date: date,
          dayweek: getDayOfWeek(date),
          kingaku: String(record?.sales || 0),
          customers: record?.customers || 0,
          monthly_sales: 0,
          wk_cnt: record?.attended_employees || 0,
          working_now: 0,
          total_employees: 0,
          wk_tm: record ? parseFloat(record.work_hours) : 0,
          spd: String(record?.productivity || 0),
          update_time: record?.updated_at || '',
          employees: [],
        });
      }
    }

    // 部署データを構築
    const departmentData = {};
    for (const record of deptData) {
      const deptName = record.dept_name;
      if (!departmentData[deptName]) {
        departmentData[deptName] = {
          name: deptName,
          category: DEPT_CATEGORIES[deptName] || 'other',
          dates: {},
        };
      }
      departmentData[deptName].dates[record.work_date] = {
        wk_date: record.work_date,
        dayweek: getDayOfWeek(record.work_date),
        total_hours: parseFloat(record.work_hours),
        attended_employees: record.attended_employees,
        employees: [],
      };
    }

    return res.status(200).json({
      success: true,
      date_from,
      date_to: endDate,
      data: allData,
      department_data: departmentData,
      source: 'supabase_cache',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch history data',
      message: error.message,
    });
  }
}

// ============================================================
// Supabase読み取り
// ============================================================

async function fetchFromSupabase(supabaseUrl, supabaseKey, tableName, query) {
  const url = `${supabaseUrl}/rest/v1/${tableName}?${query}`;
  const resp = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Supabase fetch failed for ${tableName}: ${resp.status} ${errText}`);
  }

  return resp.json();
}

// ============================================================
// ユーティリティ関数
// ============================================================

function getDateRange(startDate, endDate) {
  const dates = [];
  // タイムゾーンに依存しない日付計算（YYYY-MM-DD文字列で処理）
  let [y, m, d] = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  const endVal = endParts[0] * 10000 + endParts[1] * 100 + endParts[2];

  while (y * 10000 + m * 100 + d <= endVal) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    // 次の日に進める
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }

  return dates;
}

function getDaysDifference(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getDayOfWeek(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return days[date.getUTCDay()];
}
