/**
 * Vercel Serverless Function: HR Productivity Integration API
 * 売上データと勤怠データを統合して人時生産性を計算
 * 
 * エンドポイント: POST /api/productivity
 * リクエストボディ: { date_from: "yyyy-mm-dd", date_to: "yyyy-mm-dd", store_code: "001" (optional) }
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
    const { date_from, date_to, store_code } = req.body;

    if (!date_from) {
      return res.status(400).json({ error: 'date_from is required' });
    }

    // date_toが指定されていない場合はdate_fromと同じ
    const endDate = date_to || date_from;

    // 日付範囲の検証（最大62日）
    const daysDiff = getDaysDifference(date_from, endDate);
    if (daysDiff > 62) {
      return res.status(400).json({ 
        error: 'Date range exceeds maximum of 62 days',
        days: daysDiff 
      });
    }

    // 日付範囲のリストを生成
    const dates = getDateRange(date_from, endDate);

    // 各日付のデータを取得・統合
    const productivityData = [];

    for (const date of dates) {
      // 売上データを取得（内部API呼び出し）
      const salesData = await fetchSalesData(date);
      
      // 勤怠データを取得（内部API呼び出し）
      const attendanceData = await fetchAttendanceData(date);

      // データを統合して人時生産性を計算
      const integratedData = integrateSalesAndAttendance(salesData, attendanceData, date);

      // 店舗コードでフィルタリング
      if (store_code && store_code !== 'all') {
        const filtered = integratedData.filter(item => item.code === store_code);
        productivityData.push(...filtered);
      } else {
        productivityData.push(...integratedData);
      }
    }

    return res.status(200).json({
      success: true,
      date_from,
      date_to: endDate,
      store_code: store_code || 'all',
      data: productivityData,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Productivity API error:', error);
    return res.status(500).json({
      error: 'Failed to calculate productivity',
      message: error.message,
    });
  }
}

/**
 * 売上データを取得（ダミー実装）
 */
async function fetchSalesData(date) {
  // 実際の実装では /api/productivity/sales を呼び出す
  // 現在はダミーデータを返す
  return generateDummySalesData(date);
}

/**
 * 勤怠データを取得（ダミー実装）
 */
async function fetchAttendanceData(date) {
  // 実際の実装では /api/productivity/attendance を呼び出す
  // 現在はダミーデータを返す
  return generateDummyAttendanceData(date);
}

/**
 * 売上データと勤怠データを統合して人時生産性を計算
 */
function integrateSalesAndAttendance(salesData, attendanceData, date) {
  const result = [];

  // 店舗ごとに統合
  salesData.forEach(sales => {
    const attendance = attendanceData.find(a => a.store_code === sales.store_code);

    if (!attendance) {
      console.warn(`No attendance data for store ${sales.store_code}`);
      return;
    }

    // 時間帯別データを統合
    const hourlyDetails = [];
    sales.hourly_sales.forEach(hourSales => {
      const hourAttendance = attendance.hourly_attendance.find(a => a.time === hourSales.time);

      if (hourAttendance) {
        const salesPerHour = hourAttendance.total_hours > 0 
          ? Math.round(hourSales.sales / hourAttendance.total_hours)
          : 0;

        hourlyDetails.push({
          tm: hourSales.time,
          kingaku: hourSales.sales.toString(),
          wk_tm: hourAttendance.total_hours.toFixed(1),
          wk_cnt: hourAttendance.employee_count,
          sph: salesPerHour.toString(),
          day_key: `${date}_${sales.store_code}_${hourSales.time}`,
        });
      }
    });

    // 日次サマリーを計算
    const totalSales = sales.total_sales;
    const totalEmployees = attendance.total_employees;
    const totalHours = attendance.total_hours;

    const salesPerPerson = totalEmployees > 0 
      ? Math.round(totalSales / totalEmployees)
      : 0;

    const salesPerHour = totalHours > 0 
      ? Math.round(totalSales / totalHours)
      : 0;

    // 曜日を取得
    const dayweek = getDayOfWeek(date);

    result.push({
      tenpo_name: sales.store_name,
      wk_date: date,
      dayweek: dayweek,
      kingaku: totalSales.toString(),
      wk_cnt: totalEmployees,
      wk_tm: totalHours.toFixed(1),
      spm: salesPerPerson.toString(), // 1人あたり生産性
      spd: salesPerHour.toString(), // 1時間あたり生産性
      code: sales.store_code,
      day_key: `${date}_${sales.store_code}`,
      detail: hourlyDetails,
    });
  });

  return result;
}

/**
 * 日付範囲のリストを生成
 */
function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 日付間の日数差を計算
 */
function getDaysDifference(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * 曜日を取得
 */
function getDayOfWeek(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

/**
 * ダミー売上データ生成
 */
function generateDummySalesData(date) {
  const stores = [
    { code: '10110', name: '田辺店' },
    { code: '10120', name: '大正店' },
    { code: '10130', name: '天下茶屋店' },
    { code: '10140', name: '天王寺店' },
    { code: '10800', name: 'アベノ店' },
    { code: '10150', name: '心斎橋店' },
    { code: '10160', name: 'かがや店' },
    { code: '10170', name: 'エキマル' },
    { code: '10180', name: '北摂店' },
    { code: '10190', name: '堺東店' },
    { code: '10200', name: 'イオン松原店' },
    { code: '10210', name: 'イオン守口店' },
    { code: '10220', name: '美和堂FC店' },
  ];

  return stores.map(store => {
    const hourlyData = [];
    for (let hour = 9; hour <= 21; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      const baseSales = Math.random() * 50000 + 10000;
      
      hourlyData.push({
        time: timeStr,
        sales: Math.round(baseSales),
      });
    }

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

/**
 * ダミー勤怠データ生成
 */
function generateDummyAttendanceData(date) {
  const stores = [
    { code: '10110', name: '田辺店' },
    { code: '10120', name: '大正店' },
    { code: '10130', name: '天下茶屋店' },
    { code: '10140', name: '天王寺店' },
    { code: '10800', name: 'アベノ店' },
    { code: '10150', name: '心斎橋店' },
    { code: '10160', name: 'かがや店' },
    { code: '10170', name: 'エキマル' },
    { code: '10180', name: '北摂店' },
    { code: '10190', name: '堺東店' },
    { code: '10200', name: 'イオン松原店' },
    { code: '10210', name: 'イオン守口店' },
    { code: '10220', name: '美和堂FC店' },
  ];

  return stores.map(store => {
    const hourlyData = [];
    for (let hour = 9; hour <= 21; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      const employeeCount = Math.floor(Math.random() * 5) + 1;
      const workHours = 1.0;

      hourlyData.push({
        time: timeStr,
        employee_count: employeeCount,
        work_hours: workHours,
        total_hours: employeeCount * workHours,
      });
    }

    const totalEmployees = Math.max(...hourlyData.map(h => h.employee_count));
    const totalHours = hourlyData.reduce((sum, h) => sum + h.total_hours, 0);

    return {
      store_code: store.code,
      store_name: store.name,
      date: date,
      total_employees: totalEmployees,
      total_hours: totalHours,
      hourly_attendance: hourlyData,
    };
  });
}

export const config = {
  maxDuration: 60, // 最大60秒
};
