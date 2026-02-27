/**
 * Vercel Serverless Function: Jobcan Attendance Data API
 * ジョブカンから勤怠データを取得
 * 
 * エンドポイント: POST /api/productivity/attendance
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
    const companyId = process.env.JOBCAN_COMPANY_ID;
    const loginId = process.env.JOBCAN_LOGIN_ID;
    const password = process.env.JOBCAN_PASSWORD;

    if (!companyId || !loginId || !password) {
      return res.status(500).json({ 
        error: 'Jobcan credentials not configured',
        message: 'Please set JOBCAN_COMPANY_ID, JOBCAN_LOGIN_ID, and JOBCAN_PASSWORD environment variables'
      });
    }

    // TODO: 実際のジョブカンスクレイピング実装
    // 現在はダミーデータを返す
    const dummyData = generateDummyAttendanceData(date);

    return res.status(200).json({
      success: true,
      date,
      data: dummyData,
      timestamp: new Date().toISOString(),
      source: 'Jobcan',
    });

  } catch (error) {
    console.error('Jobcan API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch attendance data',
      message: error.message,
    });
  }
}

/**
 * ダミー勤怠データ生成（開発用）
 */
function generateDummyAttendanceData(date) {
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
    // 時間帯別勤務データ（9:00-21:00）
    const hourlyData = [];
    for (let hour = 9; hour <= 21; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      
      // ランダムに勤務人数を生成（1-5人）
      const employeeCount = Math.floor(Math.random() * 5) + 1;
      
      // 勤務時間（1時間）
      const workHours = 1.0;

      hourlyData.push({
        time: timeStr,
        employee_count: employeeCount,
        work_hours: workHours,
        total_hours: employeeCount * workHours,
      });
    }

    // 日次合計
    const totalEmployees = Math.max(...hourlyData.map(h => h.employee_count));
    const totalHours = hourlyData.reduce((sum, h) => sum + h.total_hours, 0);

    // ダミー従業員リスト
    const employees = [];
    for (let i = 1; i <= totalEmployees; i++) {
      employees.push({
        employee_id: `${store.code}-${i.toString().padStart(3, '0')}`,
        employee_name: `従業員${i}`,
        clock_in: '09:00',
        clock_out: '18:00',
        work_hours: 8.0,
        break_hours: 1.0,
        actual_work_hours: 7.0,
      });
    }

    return {
      store_code: store.code,
      store_name: store.name,
      date: date,
      total_employees: totalEmployees,
      total_hours: totalHours,
      hourly_attendance: hourlyData,
      employees: employees,
    };
  });
}

export const config = {
  maxDuration: 60, // 最大60秒
};
