/**
 * 過去実績比較API
 * SupabaseのDailyProductivityテーブルから月別・日別集計データを取得し、
 * 店舗別の売上・客数・客単価・稼働時間・人時生産性を比較可能な形式で返す
 *
 * Query params:
 *   mode: 'monthly'(デフォルト) or 'daily'
 *
 *   [月別比較]
 *   month1: 比較月1 (YYYY-MM形式, 必須)
 *   month2: 比較月2 (YYYY-MM形式, 任意 - 前年同月など)
 *   action: 'comparison' の場合、自動的に前年同月を比較対象にする
 *
 *   [日別比較]
 *   date1: 比較日1 (YYYY-MM-DD形式, 必須)
 *   date2: 比較日2 (YYYY-MM-DD形式, 任意)
 *
 * 同日期間比較ロジック:
 *   month1が当月の場合、今日までの日数で集計し、
 *   month2も同じ日数分（1日～同じ日）で集計する。
 *   例: 今日が3/16の場合、month1=2026-03は3/1-3/16、month2=2025-03は3/1-3/16で比較
 */

// ===== 定数 =====
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001', '大正店': '0002', '天下茶屋店': '0003',
  '天王寺店': '0004', 'アベノ店': '0005', '心斎橋店': '0006',
  'かがや店': '0007', '駅丸': '0008', '北摂店': '0009',
  '堺東店': '0010', 'イオン松原店': '0011', 'イオン守口店': '0012',
  '美和堂福島店': '0013',
};

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

/**
 * 今日の日付をJST（UTC+9）で取得
 */
function getTodayJST() {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffset);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    dateStr: `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { mode, month1, month2, action, date1, date2 } = req.query;

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    // 日別比較モード
    if (mode === 'daily') {
      return handleDailyComparison(req, res, supabaseUrl, supabaseKey, date1, date2);
    }

    // 月別比較モード（デフォルト）
    return handleMonthlyComparison(req, res, supabaseUrl, supabaseKey, month1, month2, action);

  } catch (err) {
    console.error('[Comparison] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// 月別比較（同日期間比較対応）
// ============================================================

async function handleMonthlyComparison(req, res, supabaseUrl, supabaseKey, month1, month2, action) {
  if (!month1) {
    return res.status(400).json({ error: 'month1 is required (YYYY-MM format)' });
  }

  const months = [month1];
  if (action === 'comparison') {
    const [y, m] = month1.split('-').map(Number);
    const lastYearMonth = `${y - 1}-${String(m).padStart(2, '0')}`;
    months.push(month2 || lastYearMonth);
  } else if (month2) {
    months.push(month2);
  }

  // 同日期間比較: month1の最終日を決定
  const today = getTodayJST();
  const [m1Year, m1Month] = month1.split('-').map(Number);

  // month1が当月かどうか判定
  const isCurrentMonth = (m1Year === today.year && m1Month === today.month);

  // 同日期間の上限日を決定
  // 当月の場合: 今日の日付
  // 過去月の場合: その月の末日
  let cutoffDay;
  if (isCurrentMonth) {
    cutoffDay = today.day;
  } else {
    cutoffDay = new Date(m1Year, m1Month, 0).getDate(); // 月末日
  }

  const comparison = [];

  for (const month of months) {
    const monthData = await fetchMonthData(supabaseUrl, supabaseKey, month, cutoffDay);
    comparison.push(monthData);
  }

  return res.status(200).json({
    comparison,
    mode: 'monthly',
    action: action || 'default',
    source: 'supabase_cache',
    cutoffDay,
    isCurrentMonth,
    timestamp: new Date().toISOString(),
  });
}

async function fetchMonthData(supabaseUrl, supabaseKey, month, cutoffDay) {
  const [year, monthNum] = month.split('-').map(Number);

  // cutoffDayがその月の末日を超えないようにする
  const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
  const effectiveCutoffDay = Math.min(cutoffDay, lastDayOfMonth);

  const dateFrom = `${month}-01`;
  const dateTo = `${month}-${String(effectiveCutoffDay).padStart(2, '0')}`;

  const storeRecords = await fetchFromSupabase(
    supabaseUrl, supabaseKey,
    'DailyProductivity',
    `work_date=gte.${dateFrom}&work_date=lte.${dateTo}`
  );

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

  return {
    month,
    dateFrom,
    dateTo,
    days: effectiveCutoffDay,
    stores,
    total,
    departments,
  };
}

// ============================================================
// 日別比較
// ============================================================

async function handleDailyComparison(req, res, supabaseUrl, supabaseKey, date1, date2) {
  if (!date1) {
    return res.status(400).json({ error: 'date1 is required (YYYY-MM-DD format) for daily mode' });
  }

  const dates = [date1];
  if (date2) {
    dates.push(date2);
  }

  const comparison = [];

  for (const date of dates) {
    const dayData = await fetchDayData(supabaseUrl, supabaseKey, date);
    comparison.push(dayData);
  }

  return res.status(200).json({
    comparison,
    mode: 'daily',
    source: 'supabase_cache',
    timestamp: new Date().toISOString(),
  });
}

async function fetchDayData(supabaseUrl, supabaseKey, date) {
  const storeRecords = await fetchFromSupabase(
    supabaseUrl, supabaseKey,
    'DailyProductivity',
    `work_date=eq.${date}`
  );

  const deptRecords = await fetchFromSupabase(
    supabaseUrl, supabaseKey,
    'DailyDeptProductivity',
    `work_date=eq.${date}`
  );

  const stores = {};
  let totalSales = 0, totalCustomers = 0, totalHours = 0;

  // レコードをマップ化
  const storeMap = {};
  for (const record of storeRecords) {
    storeMap[record.store_name] = record;
  }

  for (const storeName of Object.keys(TEMPOVISOR_STORE_CODES)) {
    const record = storeMap[storeName];
    const sales = record?.sales || 0;
    const customers = record?.customers || 0;
    const workHours = parseFloat(record?.work_hours) || 0;
    const unitPrice = customers > 0 ? Math.round(sales / customers) : 0;
    const productivity = workHours > 0 ? Math.round(sales / workHours) : 0;

    stores[storeName] = {
      sales,
      customers,
      unit_price: unitPrice,
      work_hours: Math.round(workHours * 10) / 10,
      productivity,
      attended_employees: record?.attended_employees || 0,
    };

    totalSales += sales;
    totalCustomers += customers;
    totalHours += workHours;
  }

  const total = {
    sales: totalSales,
    customers: totalCustomers,
    unit_price: totalCustomers > 0 ? Math.round(totalSales / totalCustomers) : 0,
    work_hours: Math.round(totalHours * 10) / 10,
    productivity: totalHours > 0 ? Math.round(totalSales / totalHours) : 0,
  };

  // 部署データ
  const deptMap = {};
  for (const record of deptRecords) {
    deptMap[record.dept_name] = record;
  }

  const departments = {};
  for (const [deptName, info] of Object.entries(DEPT_CATEGORIES)) {
    const record = deptMap[deptName];
    departments[deptName] = {
      label: info.label,
      type: info.type,
      work_hours: Math.round((parseFloat(record?.work_hours) || 0) * 10) / 10,
      attended_employees: record?.attended_employees || 0,
      sales: 0,
      customers: 0,
      productivity: 0,
    };
  }

  // 曜日を追加
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = days[dateObj.getUTCDay()];

  return { date, dayOfWeek, stores, total, departments };
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
