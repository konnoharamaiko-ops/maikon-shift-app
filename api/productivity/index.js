/**
 * 過去実績比較API
 * SupabaseのDailyProductivityテーブルから月別集計データを取得し、
 * 店舗別の売上・客数・客単価・稼働時間・人時生産性を比較可能な形式で返す
 *
 * Query params:
 *   month1: 比較月1 (YYYY-MM形式, 必須)
 *   month2: 比較月2 (YYYY-MM形式, 任意 - 前年同月など)
 *   action: 'comparison' の場合、昨対比較データを返す（month1のみ指定で自動的に前年同月を比較）
 */

// ===== 定数 =====
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001', '大正店': '0002', '天下茶屋店': '0003',
  '天王寺店': '0004', 'アベノ店': '0005', '心斎橋店': '0006',
  'かがや店': '0007', '駅丸': '0008', '北摂店': '0009',
  '堺東店': '0010', 'イオン松原店': '0011', 'イオン守口店': '0012',
  '美和堂福島店': '0013',
};

// 部署カテゴリ（比較分析用）
const DEPT_CATEGORIES = {
  '通販部': { label: '通販部', type: 'department' },
  '企画部': { label: '企画部', type: 'department' },
  '特販部': { label: '特販部', type: 'department' },
  'かがや工場': { label: 'かがや工場', type: 'factory' },
  '北摂工場': { label: '北摂工場', type: 'factory' },
  '鶴橋工房': { label: '鶴橋工房', type: 'factory' },
  '都島工場': { label: '都島工場', type: 'factory' },
};

export const config = {
  maxDuration: 15,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { month1, month2, action } = req.query;
    if (!month1) {
      return res.status(400).json({ error: 'month1 is required (YYYY-MM format)' });
    }

    // action=comparison の場合、自動的に前年同月を比較対象にする
    const months = [month1];
    if (action === 'comparison') {
      const [y, m] = month1.split('-').map(Number);
      const lastYearMonth = `${y - 1}-${String(m).padStart(2, '0')}`;
      months.push(month2 || lastYearMonth);
    } else if (month2) {
      months.push(month2);
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    // 各月のデータを取得
    const comparison = [];

    for (const month of months) {
      const [year, monthNum] = month.split('-').map(Number);
      const lastDay = new Date(year, monthNum, 0).getDate();
      const dateFrom = `${month}-01`;
      const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;

      // Supabaseから店舗データを取得
      const storeRecords = await fetchFromSupabase(
        supabaseUrl, supabaseKey,
        'DailyProductivity',
        `work_date=gte.${dateFrom}&work_date=lte.${dateTo}`
      );

      // Supabaseから部署データを取得
      const deptRecords = await fetchFromSupabase(
        supabaseUrl, supabaseKey,
        'DailyDeptProductivity',
        `work_date=gte.${dateFrom}&work_date=lte.${dateTo}`
      );

      // 店舗別に集計
      const storeAgg = {};
      for (const record of storeRecords) {
        const name = record.store_name;
        if (!storeAgg[name]) {
          storeAgg[name] = { sales: 0, customers: 0, work_hours: 0 };
        }
        storeAgg[name].sales += record.sales || 0;
        storeAgg[name].customers += record.customers || 0;
        storeAgg[name].work_hours += parseFloat(record.work_hours) || 0;
      }

      // 店舗別データを構築
      const stores = {};
      let totalSales = 0, totalCustomers = 0, totalHours = 0;

      for (const storeName of Object.keys(TEMPOVISOR_STORE_CODES)) {
        const agg = storeAgg[storeName] || { sales: 0, customers: 0, work_hours: 0 };
        const unitPrice = agg.customers > 0 ? Math.round(agg.sales / agg.customers) : 0;
        const productivity = agg.work_hours > 0 ? Math.round(agg.sales / agg.work_hours) : 0;

        stores[storeName] = {
          sales: agg.sales,
          customers: agg.customers,
          unit_price: unitPrice,
          work_hours: Math.round(agg.work_hours * 10) / 10,
          productivity,
        };

        totalSales += agg.sales;
        totalCustomers += agg.customers;
        totalHours += agg.work_hours;
      }

      const total = {
        sales: totalSales,
        customers: totalCustomers,
        unit_price: totalCustomers > 0 ? Math.round(totalSales / totalCustomers) : 0,
        work_hours: Math.round(totalHours * 10) / 10,
        productivity: totalHours > 0 ? Math.round(totalSales / totalHours) : 0,
      };

      // 部署別に集計
      const deptAgg = {};
      for (const record of deptRecords) {
        const name = record.dept_name;
        if (!deptAgg[name]) {
          deptAgg[name] = { work_hours: 0 };
        }
        deptAgg[name].work_hours += parseFloat(record.work_hours) || 0;
      }

      const departments = {};
      for (const [deptName, info] of Object.entries(DEPT_CATEGORIES)) {
        const agg = deptAgg[deptName] || { work_hours: 0 };
        departments[deptName] = {
          label: info.label,
          type: info.type,
          work_hours: Math.round(agg.work_hours * 10) / 10,
          sales: 0,
          customers: 0,
          productivity: 0,
        };
      }

      comparison.push({ month, stores, total, departments });
    }

    return res.status(200).json({
      comparison,
      action: action || 'default',
      source: 'supabase_cache',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Comparison] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ===== Supabase読み取り =====

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
