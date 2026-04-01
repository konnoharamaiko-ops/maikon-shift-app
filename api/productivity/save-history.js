/**
 * Vercel Cron Function: 過去実績自動保存API + バックフィルAPI
 * 
 * モード:
 *   - デフォルト: 当日の勤怠データを保存（毎日22:00 JST Cronで実行）
 *   - mode=backfill: 指定日付範囲の過去データを取得して保存
 *   - mode=status: バックフィル進捗確認
 *
 * エンドポイント: GET /api/productivity/save-history
 * Cronスケジュール: 0 13 * * * (UTC 13:00 = JST 22:00)
 * 
 * バックフィルパラメータ:
 *   - mode=backfill&date_from=yyyy-mm-dd&date_to=yyyy-mm-dd&key=xxx
 *   - mode=status&key=xxx
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// TempoVisor店舗コードマッピング
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001', '大正店': '0002', '天下茶屋店': '0003',
  '天王寺店': '0004', 'アベノ店': '0005', '心斎橋店': '0006',
  'かがや店': '0007', '駅丸': '0008', '北摂店': '0009',
  '堺東店': '0010', 'イオン松原店': '0011', 'イオン守口店': '0012',
  '美和堂福島店': '0013',
};

// 部署コードと店舗名のマッピング
const STORE_DEPT_MAP = {
  '10110': '田辺店',
  '10400': '大正店',
  '10500': '天下茶屋店',
  '10600': '天王寺店',
  '10800': 'アベノ店',
  '10900': '心斎橋店',
  '11010': 'かがや店',
  '11200': '駅丸',
  '12000': '北摂店',
  '12200': '堺東店',
  '12300': 'イオン松原店',
  '12400': 'イオン守口店',
  '20000': '美和堂福島店',
  '11021': '企画部',
  '11022': '通販部',
  '11025': '特販部',
  '11012': 'かがや工場',
  '12010': '北摂工場',
  '10210': '南田辺工房',
};

// 店舗名 → Supabase store_id のマッピング
const STORE_NAME_TO_ID_MAP = {
  '田辺店':       'tanabe',
  '大正店':       'taisho',
  '天下茶屋店':   'tengachaya',
  '天王寺店':     'tennoji',
  'アベノ店':     'abeno',
  '心斎橋店':     'shinsaibashi',
  'かがや店':     'kagaya',
  '駅丸':         'ekimaru',
  '北摂店':       'hokusetsu',
  '堺東店':       'sakaikita',
  'イオン松原店': 'aeon_matsubara',
  'イオン守口店': 'aeon_moriguchi',
  '美和堂福島店': 'miwado_fc',
  '企画部':       'kikaku',
  '通販部':       'tsuhan',
  '特販部':       'tokuhan',
  'かがや工場':   'kagaya_factory',
  '北摂工場':     'hokusetsu_factory',
  '南田辺工房':   'minamitanabe_kobo',
};

export const config = {
  maxDuration: 300, // 5分タイムアウト
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 認証チェック
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const manualKey = req.query.key;
    if (manualKey !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const mode = req.query.mode || 'daily';

  // モードルーティング
  if (mode === 'status') {
    return await handleBackfillStatus(req, res);
  } else if (mode === 'backfill') {
    return await handleBackfill(req, res);
  } else {
    return await handleDailySave(req, res);
  }
}

// ============================================================
// モード1: 当日の勤怠データ保存（Cron用）
// ============================================================

async function handleDailySave(req, res) {
  try {
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    // 対象日付を決定
    let targetDate = req.query.date;
    if (!targetDate) {
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      targetDate = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;
    }

    console.log(`[SaveHistory] 対象日付: ${targetDate}`);

    // ジョブカンにログイン
    const cookies = await loginJobcan(jobcanCompany, jobcanUser, jobcanPass);
    console.log('[SaveHistory] ジョブカンログイン成功');

    // 勤怠データを取得（出入詳細ページから打刻場所も取得）
    const attendanceData = await fetchAttendanceWithLocation(cookies, targetDate);
    console.log(`[SaveHistory] 勤怠データ取得: ${attendanceData.length}件`);

    if (attendanceData.length === 0) {
      return res.status(200).json({
        success: true,
        date: targetDate,
        message: '勤怠データなし（休業日または未出勤）',
        saved: 0,
      });
    }

    // ユーザーマップとストアマップを取得
    const userMap = await fetchUserJobcanMap(supabaseUrl, supabaseKey);
    const storeMap = await fetchStoreMap(supabaseUrl, supabaseKey);

    // WorkHistoryテーブルに保存するデータを構築
    const historyRecords = buildHistoryRecords(attendanceData, targetDate, userMap, storeMap);
    console.log(`[SaveHistory] 保存対象レコード: ${historyRecords.length}件`);

    // Supabaseにupsert
    const savedCount = await saveToWorkHistory(supabaseUrl, supabaseKey, historyRecords);

    // DailyStaffHoursテーブルにも保存
    const staffHoursRecords = buildStaffHoursRecords(attendanceData, targetDate);
    if (staffHoursRecords.length > 0) {
      await saveToDailyStaffHours(supabaseUrl, supabaseKey, staffHoursRecords);
    }

    // DailyDeptProductivityテーブルに部署別集計を保存
    const deptRecords = buildDeptRecords(attendanceData, targetDate);
    if (deptRecords.length > 0) {
      await saveToDailyDeptProductivity(supabaseUrl, supabaseKey, deptRecords);
    }

    // DailyProductivityテーブルに売上+勤怠データを保存
    let productivitySaved = 0;
    try {
      const tvUser = process.env.TEMPOVISOR_USERNAME;
      const tvPass = process.env.TEMPOVISOR_PASSWORD;
      if (tvUser && tvPass) {
        const { cookies: tvCookies, repBaseUrl } = await loginTempoVisor(tvUser, tvPass);
        const salesByStore = await fetchDailySalesFromTempoVisor(tvCookies, repBaseUrl, targetDate);
        const productivityRecords = buildProductivityRecords(attendanceData, salesByStore, targetDate);
        if (productivityRecords.length > 0) {
          productivitySaved = await saveToDailyProductivity(supabaseUrl, supabaseKey, productivityRecords);
        }
        console.log(`[SaveHistory] DailyProductivity保存: ${productivitySaved}件`);
      } else {
        console.warn('[SaveHistory] TEMPOVISOR credentials not set, skipping DailyProductivity');
      }
    } catch (tvErr) {
      console.error('[SaveHistory] DailyProductivity保存エラー:', tvErr.message);
    }

    return res.status(200).json({
      success: true,
      date: targetDate,
      total_attendance: attendanceData.length,
      saved: savedCount,
      records: historyRecords.length,
      staff_hours: staffHoursRecords.length,
      dept_records: deptRecords.length,
      productivity_records: productivitySaved,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[SaveHistory] エラー:', error);
    return res.status(500).json({
      error: 'Failed to save history',
      message: error.message,
    });
  }
}

// ============================================================
// モード2: バックフィル（過去データ取得）
// ============================================================

async function handleBackfill(req, res) {
  try {
    const dateFrom = req.query.date_from;
    const dateTo = req.query.date_to || dateFrom;

    if (!dateFrom) {
      return res.status(400).json({ error: 'date_from is required' });
    }

    // 最大7日間の制限
    const daysDiff = getDaysDifference(dateFrom, dateTo);
    if (daysDiff > 7) {
      return res.status(400).json({
        error: 'Date range exceeds maximum of 7 days per request',
        suggestion: 'Split into multiple requests of 7 days each',
      });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID;
    const jobcanUser = process.env.JOBCAN_LOGIN_ID;
    const jobcanPass = process.env.JOBCAN_PASSWORD;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }
    if (!jobcanCompany || !jobcanUser || !jobcanPass) {
      return res.status(500).json({ error: 'Jobcan credentials not configured' });
    }

    // ジョブカンにログイン
    const cookies = await loginJobcan(jobcanCompany, jobcanUser, jobcanPass);
    console.log('[Backfill] ジョブカンログイン成功');

    // TempoVisorにログイン（環境変数があれば）
    let tvCookies = null;
    let repBaseUrl = null;
    const tvUser = process.env.TEMPOVISOR_USERNAME;
    const tvPass = process.env.TEMPOVISOR_PASSWORD;
    if (tvUser && tvPass) {
      try {
        const tvLogin = await loginTempoVisor(tvUser, tvPass);
        tvCookies = tvLogin.cookies;
        repBaseUrl = tvLogin.repBaseUrl;
        console.log('[Backfill] TempoVisorログイン成功');
      } catch (tvErr) {
        console.warn('[Backfill] TempoVisorログイン失敗:', tvErr.message);
      }
    } else {
      console.warn('[Backfill] TEMPOVISOR credentials not set, skipping DailyProductivity');
    }

    // ユーザーマップとストアマップを取得
    const userMap = await fetchUserJobcanMap(supabaseUrl, supabaseKey);
    const storeMap = await fetchStoreMap(supabaseUrl, supabaseKey);

    // 日付範囲を生成
    const dates = getDateRange(dateFrom, dateTo);
    const results = [];

    for (const date of dates) {
      console.log(`[Backfill] 処理中: ${date}`);
      try {
        const attendanceData = await fetchAttendanceForDate(cookies, date);
        console.log(`[Backfill] ${date}: ${attendanceData.length}件取得`);

        if (attendanceData.length === 0) {
          results.push({ date, status: 'no_data', saved: 0 });
          await saveBackfillProgress(supabaseUrl, supabaseKey, date, 'no_data', 0);
          continue;
        }

        // WorkHistoryテーブルに保存
        const records = buildHistoryRecords(attendanceData, date, userMap, storeMap);
        const savedCount = await saveToWorkHistory(supabaseUrl, supabaseKey, records);

        // DailyStaffHoursテーブルにも保存
        const staffHoursRecords = buildStaffHoursRecords(attendanceData, date);
        if (staffHoursRecords.length > 0) {
          await saveToDailyStaffHours(supabaseUrl, supabaseKey, staffHoursRecords);
        }

        // DailyDeptProductivityテーブルに部署別集計を保存
        const deptRecords = buildDeptRecords(attendanceData, date);
        if (deptRecords.length > 0) {
          await saveToDailyDeptProductivity(supabaseUrl, supabaseKey, deptRecords);
        }

        // DailyProductivityテーブルに売上+勤怠データを保存
        let productivitySaved = 0;
        let salesDebug = {};
        if (tvCookies && repBaseUrl) {
          try {
            const salesByStore = await fetchDailySalesFromTempoVisor(tvCookies, repBaseUrl, date);
            salesDebug = { stores: Object.keys(salesByStore).filter(k => k !== '_debug').length, sample: Object.entries(salesByStore).filter(([k]) => k !== '_debug').slice(0, 3).map(([k,v]) => ({ store: k, sales: v.sales, customers: v.customers })), tvDebug: salesByStore._debug };
            console.log(`[Backfill] ${date} salesByStore: ${JSON.stringify(salesDebug)}`);
            const productivityRecords = buildProductivityRecords(attendanceData, salesByStore, date);
            if (productivityRecords.length > 0) {
              productivitySaved = await saveToDailyProductivity(supabaseUrl, supabaseKey, productivityRecords);
            }
          } catch (tvErr) {
            console.warn(`[Backfill] ${date} DailyProductivityエラー:`, tvErr.message);
          }
        }

        results.push({ date, status: 'success', saved: savedCount, staff_hours: staffHoursRecords.length, dept_records: deptRecords.length, productivity: productivitySaved, salesDebug });
        await saveBackfillProgress(supabaseUrl, supabaseKey, date, 'success', savedCount);

      } catch (dateErr) {
        console.error(`[Backfill] ${date} エラー:`, dateErr.message);
        results.push({ date, status: 'error', error: dateErr.message });
        await saveBackfillProgress(supabaseUrl, supabaseKey, date, 'error', 0);
      }

      // レート制限対策: 日付間に1秒待機
      await new Promise(r => setTimeout(r, 1000));
    }

    return res.status(200).json({
      success: true,
      date_from: dateFrom,
      date_to: dateTo,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Backfill] エラー:', error);
    return res.status(500).json({
      error: 'Backfill failed',
      message: error.message,
    });
  }
}

// ============================================================
// モード3: バックフィル進捗確認
// ============================================================

async function handleBackfillStatus(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/BackfillProgress?select=*&order=work_date.desc&limit=100`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!resp.ok) {
      return res.status(200).json({
        success: true,
        progress: [],
        message: 'BackfillProgressテーブルが未作成またはデータなし',
      });
    }

    const progress = await resp.json();

    const totalDays = 1095; // 約3年
    const completedDays = progress.filter(p => p.status === 'success' || p.status === 'no_data').length;
    const errorDays = progress.filter(p => p.status === 'error').length;

    const dates = progress.filter(p => p.status === 'success').map(p => p.work_date).sort();
    const oldestDate = dates.length > 0 ? dates[0] : null;
    const newestDate = dates.length > 0 ? dates[dates.length - 1] : null;

    return res.status(200).json({
      success: true,
      total_target_days: totalDays,
      completed_days: completedDays,
      error_days: errorDays,
      progress_percent: Math.round((completedDays / totalDays) * 100),
      oldest_date: oldestDate,
      newest_date: newestDate,
      recent_progress: progress.slice(0, 30),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================
// データ構築ヘルパー
// ============================================================

function buildHistoryRecords(attendanceData, date, userMap, storeMap) {
  const records = [];
  for (const emp of attendanceData) {
    if (!emp.clock_in) continue;
    const storeName = emp.assigned_store || emp.dept_store_name;
    const storeId = storeMap[storeName] || STORE_NAME_TO_ID_MAP[storeName] || null;
    const userId = emp.jobcan_code ? userMap[emp.jobcan_code] : null;

    if (!storeId) {
      console.warn(`[SaveHistory] 店舗IDが見つかりません: ${storeName} (${emp.name})`);
      continue;
    }

    records.push({
      user_id: userId || `jobcan_${emp.jobcan_code || emp.name}`,
      store_id: storeId,
      work_date: date,
      clock_in: emp.clock_in || null,
      clock_out: emp.clock_out || null,
      break_minutes: emp.break_minutes || 0,
      work_minutes: emp.work_minutes || null,
      jobcan_code: emp.jobcan_code || null,
    });
  }
  return records;
}

function buildStaffHoursRecords(attendanceData, date) {
  return attendanceData
    .filter(emp => emp.clock_in)
    .map(emp => ({
      work_date: date,
      employee_id: emp.jobcan_code || null,
      staff_name: emp.name,
      dept_code: emp.dept_code,
      assigned_store: emp.assigned_store || emp.dept_store_name,
      clock_in_place: emp.clock_in_place || emp.assigned_store || emp.dept_store_name,
      work_hours: emp.work_minutes ? Math.round((emp.work_minutes / 60) * 100) / 100 : 0,
      clock_in: emp.clock_in || null,
      clock_out: emp.clock_out || null,
      status: emp.status,
    }));
}

function buildDeptRecords(attendanceData, date) {
  const deptSummary = {};
  for (const emp of attendanceData) {
    if (!emp.clock_in) continue;
    const store = emp.assigned_store || emp.dept_store_name;
    if (!deptSummary[store]) {
      deptSummary[store] = { total_hours: 0, count: 0 };
    }
    deptSummary[store].total_hours += emp.work_minutes ? emp.work_minutes / 60 : 0;
    deptSummary[store].count++;
  }

  return Object.entries(deptSummary).map(([deptName, data]) => ({
    work_date: date,
    dept_name: deptName,
    work_hours: Math.round(data.total_hours * 100) / 100,
    attended_employees: data.count,
  }));
}

// ============================================================
// ジョブカン勤怠データ取得（当日用 - 出入詳細ページ付き）
// ============================================================

async function fetchAttendanceWithLocation(cookies, date) {
  const workUrl = `https://ssl.jobcan.jp/client/work-state/show/?submit_type=day&searching=1&list_type=normal&number_par_page=300&retirement=work&search_date=${date}`;

  const workRes = await fetch(workUrl, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssl.jobcan.jp/client/',
    },
    redirect: 'follow',
  });
  const workHtml = await workRes.text();
  const $work = cheerio.load(workHtml);

  let targetTable = null;
  $work('table').each((i, table) => {
    const headerText = $work(table).find('tr').first().text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    console.warn(`[SaveHistory] 勤務状況テーブルが見つかりません (date: ${date})`);
    return [];
  }

  const rows = $work(targetTable).find('tr').toArray();

  // スタッフIDリストを収集
  const staffIdList = [];
  const staffBasicInfo = {};

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim().replace(/\s+/g, ' ');
    if (!staffCell) continue;

    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    const staffId = staffIdMatch ? staffIdMatch[1] : null;

    if (staffId) {
      staffIdList.push(staffId);
      staffBasicInfo[staffId] = {
        staffCell,
        deptCode: deptMatch[1],
        rowIndex: i,
      };
    }
  }

  // 出入詳細ページから打刻場所を並列取得
  const [year, month, day] = date.split('-');
  const stampDetailMap = {};

  const fetchWithTimeout = (url, options, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  const allStampResults = await Promise.allSettled(
    staffIdList.map(async (empId) => {
      const aditUrl = `https://ssl.jobcan.jp/client/adit?employee_id=${empId}&year=${year}&month=${parseInt(month)}&day=${parseInt(day)}`;
      const aditRes = await fetchWithTimeout(aditUrl, {
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://ssl.jobcan.jp/client/',
        },
        redirect: 'follow',
      }, 8000);

      const aditHtml = await aditRes.text();
      const $adit = cheerio.load(aditHtml);

      let clockInCode = null, clockOutCode = null, breakStartCode = null, breakEndCode = null;
      let hasAutoClockOut = false;
      let realClockInTime = null, realClockOutTime = null;

      const stampRows = [];
      $adit('table').each((ti, tbl) => {
        const hdr = $adit(tbl).find('tr').first().text();
        if (hdr.includes('打刻区分') && hdr.includes('打刻方法')) {
          $adit(tbl).find('tr').each((ri, row) => {
            if (ri === 0) return;
            const tds = $adit(row).find('td');
            if (tds.length < 4) return;
            const typeEl = $adit(tds[0]).find('select option[selected]');
            const stampType = typeEl.length > 0 ? typeEl.text().trim() : $adit(tds[0]).text().trim();
            const stampTime = $adit(tds[1]).text().trim();
            const stampMethod = $adit(tds[2]).text().trim();
            const placeEl = $adit(tds[3]).find('select option[selected]');
            const placeText = placeEl.length > 0 ? placeEl.text().trim() : $adit(tds[3]).text().trim();
            const codeMatch = placeText.match(/^(\d{5})/);
            const placeCode = codeMatch ? codeMatch[1] : null;
            const isAutoClockOut = stampMethod.includes('自動退出');
            stampRows.push({ stampType, stampTime, placeCode, isAutoClockOut });
          });
        }
      });

      if (stampRows.length > 0) {
        stampRows.forEach(({ stampType, stampTime, placeCode, isAutoClockOut }, rowIdx) => {
          if (!stampType) return;
          if (isAutoClockOut) { hasAutoClockOut = true; return; }
          if (stampType === '出勤' || stampType === '1') {
            if (placeCode) clockInCode = placeCode;
            if (stampTime) realClockInTime = stampTime;
          } else if (stampType === '休憩開始' || stampType === '3') {
            if (placeCode) breakStartCode = placeCode;
          } else if (stampType === '休憩終了' || stampType === '4') {
            if (placeCode) breakEndCode = placeCode;
          } else if (stampType === '退勤' || stampType === '退室' || stampType === '2' ||
                     stampType.startsWith('- ') || stampType === '-退勤') {
            if (!isAutoClockOut) {
              if (placeCode) clockOutCode = placeCode;
              if (stampTime) realClockOutTime = stampTime;
            }
          } else if (stampType.includes('(自動判別)')) {
            if (rowIdx === 0) {
              if (placeCode) clockInCode = placeCode;
              if (stampTime) realClockInTime = stampTime;
            } else {
              if (placeCode) clockOutCode = placeCode;
              if (stampTime) realClockOutTime = stampTime;
            }
          }
        });
      }

      return { empId, clockInCode, clockOutCode, breakStartCode, breakEndCode, hasAutoClockOut, realClockInTime, realClockOutTime };
    })
  );

  for (const result of allStampResults) {
    if (result.status === 'fulfilled') {
      const { empId, ...detail } = result.value;
      stampDetailMap[empId] = detail;
    }
  }

  // 勤怠データを構築
  const attendanceList = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim().replace(/\s+/g, ' ');
    if (!staffCell) continue;

    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const deptCode = deptMatch[1];
    const deptStoreName = STORE_DEPT_MAP[deptCode];
    if (!deptStoreName) continue;

    const nameMatch = staffCell.match(/^(.+?)\s*\d{5}/);
    const staffName = nameMatch ? nameMatch[1].replace(/\xa0/g, ' ').trim() : staffCell.split(/\d{5}/)[0].trim();

    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    const staffId = staffIdMatch ? staffIdMatch[1] : null;

    const jobcanCode = staffId;

    let status = $work(cells[2]).text().trim();

    // 出勤打刻時刻
    const clockInRaw = $work(cells[6]).text().trim().replace(/\s+/g, ' ');
    const clockInBracket = clockInRaw.match(/\((\d{1,2}:\d{2})\)/);
    const clockIn = clockInBracket ? clockInBracket[1] : (clockInRaw.match(/^(\d{1,2}:\d{2})/) ? clockInRaw.match(/^(\d{1,2}:\d{2})/)[1] : null);

    // 退勤打刻時刻
    const clockOutRaw = $work(cells[7]).text().trim().replace(/\s+/g, ' ');
    const clockOutBracket = clockOutRaw.match(/\((\d{1,2}:\d{2})\)/);
    let clockOut = clockOutBracket ? clockOutBracket[1] : (clockOutRaw.match(/^(\d{1,2}:\d{2})/) ? clockOutRaw.match(/^(\d{1,2}:\d{2})/)[1] : null);

    // 自動退出の除外
    const empDetail = staffId ? stampDetailMap[staffId] : null;
    if (empDetail?.hasAutoClockOut && status === '退勤済み') {
      status = '勤務中';
      clockOut = null;
    } else if (empDetail?.realClockOutTime && status === '退勤済み') {
      clockOut = empDetail.realClockOutTime;
    }

    // 休憩時間
    const breakTimeText = $work(cells[9]).text().trim();
    const breakMinutes = parseJapaneseTime(breakTimeText);

    // 労働時間
    const workTimeText = $work(cells[8]).text().trim();
    const workMinutesRaw = parseJapaneseTime(workTimeText);
    const workMinutes = Math.max(0, workMinutesRaw - breakMinutes);

    // 振り分け先の店舗を決定（打刻場所優先）
    const clockInStoreName = empDetail?.clockInCode ? STORE_DEPT_MAP[empDetail.clockInCode] : null;
    const clockOutStoreName = empDetail?.clockOutCode ? STORE_DEPT_MAP[empDetail.clockOutCode] : null;
    let assignedStore;
    if (status === '退勤済み') {
      assignedStore = clockInStoreName || clockOutStoreName || deptStoreName;
    } else {
      assignedStore = clockInStoreName || deptStoreName;
    }

    attendanceList.push({
      name: staffName,
      jobcan_code: jobcanCode,
      dept_code: deptCode,
      dept_store_name: deptStoreName,
      assigned_store: assignedStore,
      clock_in_place: clockInStoreName || deptStoreName,
      status,
      clock_in: clockIn,
      clock_out: clockOut,
      break_minutes: breakMinutes,
      work_minutes: workMinutes,
    });
  }

  return attendanceList;
}

// ============================================================
// ジョブカン勤怠データ取得（バックフィル用 - 軽量版）
// ============================================================

async function fetchAttendanceForDate(cookies, date) {
  const workUrl = `https://ssl.jobcan.jp/client/work-state/show/?submit_type=day&searching=1&list_type=normal&number_par_page=300&retirement=work&search_date=${date}`;

  const workRes = await fetch(workUrl, {
    headers: {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssl.jobcan.jp/client/',
    },
    redirect: 'follow',
  });
  const workHtml = await workRes.text();
  const $work = cheerio.load(workHtml);

  let targetTable = null;
  $work('table').each((i, table) => {
    const headerText = $work(table).find('tr').first().text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    console.warn(`[Backfill] 勤務状況テーブルが見つかりません (date: ${date})`);
    return [];
  }

  const rows = $work(targetTable).find('tr').toArray();

  // スタッフIDリストを収集
  const staffIdList = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 8) continue;
    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    if (staffIdMatch) staffIdList.push(staffIdMatch[1]);
  }

  // 出入詳細ページから打刻場所を並列取得（同時5件制限）
  const [year, month, day] = date.split('-');
  const stampDetailMap = {};

  const fetchWithTimeout = (url, options, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  const CONCURRENCY = 5;
  for (let batchStart = 0; batchStart < staffIdList.length; batchStart += CONCURRENCY) {
    const batch = staffIdList.slice(batchStart, batchStart + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (empId) => {
        const aditUrl = `https://ssl.jobcan.jp/client/adit?employee_id=${empId}&year=${year}&month=${parseInt(month)}&day=${parseInt(day)}`;
        const aditRes = await fetchWithTimeout(aditUrl, {
          headers: {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://ssl.jobcan.jp/client/',
          },
          redirect: 'follow',
        }, 10000);

        const aditHtml = await aditRes.text();
        const $adit = cheerio.load(aditHtml);

        let clockInCode = null, clockOutCode = null;
        const stampRows = [];

        $adit('table').each((ti, tbl) => {
          const hdr = $adit(tbl).find('tr').first().text();
          if (hdr.includes('打刻区分') && hdr.includes('打刻方法')) {
            $adit(tbl).find('tr').each((ri, row) => {
              if (ri === 0) return;
              const tds = $adit(row).find('td');
              if (tds.length < 4) return;
              const typeEl = $adit(tds[0]).find('select option[selected]');
              const stampType = typeEl.length > 0 ? typeEl.text().trim() : $adit(tds[0]).text().trim();
              const placeEl = $adit(tds[3]).find('select option[selected]');
              const placeText = placeEl.length > 0 ? placeEl.text().trim() : $adit(tds[3]).text().trim();
              const codeMatch = placeText.match(/^(\d{5})/);
              const placeCode = codeMatch ? codeMatch[1] : null;
              stampRows.push({ stampType, placeCode });
            });
          }
        });

        if (stampRows.length > 0) {
          for (const { stampType, placeCode } of stampRows) {
            if (!placeCode) continue;
            if (stampType === '出勤' || stampType === '1') {
              clockInCode = placeCode;
            } else if (stampType === '退勤' || stampType === '退室' || stampType === '2') {
              clockOutCode = placeCode;
            } else if (stampType.includes('(自動判別)') && !clockInCode) {
              clockInCode = placeCode;
            }
          }
          if (!clockInCode && stampRows.length > 0 && stampRows[0].placeCode) {
            clockInCode = stampRows[0].placeCode;
          }
        }

        return { empId, clockInCode, clockOutCode };
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const { empId, ...detail } = result.value;
        stampDetailMap[empId] = detail;
      }
    }

    if (batchStart + CONCURRENCY < staffIdList.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 勤怠データを構築
  const attendanceList = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 8) continue;

    const staffCell = $work(cells[0]).text().trim().replace(/\s+/g, ' ');
    if (!staffCell) continue;

    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const deptCode = deptMatch[1];
    const deptStoreName = STORE_DEPT_MAP[deptCode];
    if (!deptStoreName) continue;

    const nameMatch = staffCell.match(/^(.+?)\s*\d{5}/);
    const staffName = nameMatch ? nameMatch[1].replace(/\xa0/g, ' ').trim() : staffCell.split(/\d{5}/)[0].trim();

    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    const staffId = staffIdMatch ? staffIdMatch[1] : null;

    const status = $work(cells[2]).text().trim();

    // 出勤時刻
    const clockInCol = cells.length >= 10 ? $work(cells[6]).text().trim() : $work(cells[4]).text().trim();
    const clockInMatch = clockInCol.match(/(\d{1,2}:\d{2})/);
    const clockIn = clockInMatch ? clockInMatch[1] : null;

    // 退勤時刻
    const clockOutCol = cells.length >= 10 ? $work(cells[7]).text().trim() : $work(cells[5]).text().trim();
    const clockOutMatch = clockOutCol.match(/(\d{1,2}:\d{2})/);
    const clockOut = clockOutMatch ? clockOutMatch[1] : null;

    // 労働時間
    const workTimeCol = cells.length >= 10 ? $work(cells[8]).text().trim() : $work(cells[6]).text().trim();
    const workMinutes = parseJapaneseTime(workTimeCol);

    // 休憩時間
    const breakTimeCol = cells.length >= 10 ? $work(cells[9]).text().trim() : $work(cells[7]).text().trim();
    const breakMinutes = parseJapaneseTime(breakTimeCol);

    // 打刻場所による振り分け
    const empDetail = staffId ? stampDetailMap[staffId] : null;
    const clockInStoreName = empDetail?.clockInCode ? STORE_DEPT_MAP[empDetail.clockInCode] : null;
    const assignedStore = clockInStoreName || deptStoreName;

    attendanceList.push({
      name: staffName,
      jobcan_code: staffId,
      dept_code: deptCode,
      dept_store_name: deptStoreName,
      assigned_store: assignedStore,
      clock_in_place: clockInStoreName || deptStoreName,
      status,
      clock_in: clockIn,
      clock_out: clockOut,
      break_minutes: breakMinutes,
      work_minutes: Math.max(0, workMinutes - breakMinutes),
    });
  }

  return attendanceList;
}

// ============================================================
// Supabase保存関数
// ============================================================

async function saveToWorkHistory(supabaseUrl, supabaseKey, records) {
  if (records.length === 0) return 0;

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/WorkHistory`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(records),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[SaveHistory] WorkHistory保存エラー: ${resp.status} ${errText}`);
  }

  console.log(`[SaveHistory] Supabase保存完了: ${records.length}件`);
  return records.length;
}

async function saveToDailyStaffHours(supabaseUrl, supabaseKey, records) {
  if (records.length === 0) return;

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/DailyStaffHours`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(records),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[SaveHistory] DailyStaffHours保存エラー: ${resp.status} ${errText}`);
  }
}

async function saveToDailyDeptProductivity(supabaseUrl, supabaseKey, records) {
  if (records.length === 0) return;

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/DailyDeptProductivity`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(records),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[SaveHistory] DailyDeptProductivity保存エラー: ${resp.status} ${errText}`);
  }
}

async function saveBackfillProgress(supabaseUrl, supabaseKey, date, status, savedCount) {
  try {
    await fetch(
      `${supabaseUrl}/rest/v1/BackfillProgress`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          work_date: date,
          status,
          saved_count: savedCount,
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch (e) {
    console.warn(`[Backfill] 進捗保存スキップ: ${e.message}`);
  }
}

// ============================================================
// Supabase読み取り
// ============================================================

async function fetchUserJobcanMap(supabaseUrl, supabaseKey) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/User?select=id,jobcan_code&jobcan_code=not.is.null`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!resp.ok) return {};
    const users = await resp.json();
    const map = {};
    users.forEach(u => { if (u.jobcan_code) map[u.jobcan_code] = u.id; });
    return map;
  } catch (e) {
    console.warn('[SaveHistory] User map error:', e.message);
    return {};
  }
}

async function fetchStoreMap(supabaseUrl, supabaseKey) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/Store?select=id,name`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!resp.ok) return {};
    const stores = await resp.json();
    const map = {};
    stores.forEach(s => { if (s.name) map[s.name] = s.id; });
    return map;
  } catch (e) {
    console.warn('[SaveHistory] Store map error:', e.message);
    return {};
  }
}

// ============================================================
// ジョブカンログイン
// ============================================================

async function loginJobcan(companyId, loginId, password) {
  const loginUrl = 'https://ssl.jobcan.jp/login/client/';

  const getRes = await fetch(loginUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'follow',
  });
  const loginHtml = await getRes.text();
  const $login = cheerio.load(loginHtml);
  const csrfToken = $login('input[name="token"]').val() || '';
  const initialCookies = extractCookies(getRes);

  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
      'Referer': loginUrl,
    },
    body: new URLSearchParams({
      'token': csrfToken,
      'client_login_id': companyId,
      'client_manager_login_id': loginId,
      'client_login_password': password,
      'login_type': '2',
    }).toString(),
    redirect: 'manual',
  });

  const loginCookies = extractCookies(loginRes);
  const allCookies = mergeCookies(initialCookies, loginCookies);

  const location = loginRes.headers.get('location') || '';
  if (location.includes('error')) {
    throw new Error(`Jobcan login failed: ${location}`);
  }

  return allCookies;
}

// ============================================================
// ユーティリティ
// ============================================================

function parseJapaneseTime(text) {
  if (!text) return 0;
  const hoursMatch = text.match(/(\d+)\s*時間/);
  const minutesMatch = text.match(/(\d+)\s*分/);
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
  return hours * 60 + minutes;
}

function getDateRange(startDate, endDate) {
  const dates = [];
  let [y, m, d] = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  const endVal = endParts[0] * 10000 + endParts[1] * 100 + endParts[2];

  while (y * 10000 + m * 100 + d <= endVal) {
    dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
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
  return Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
}

function extractCookies(response) {
  const cookies = [];
  try {
    if (response.headers.getSetCookie) {
      const setCookies = response.headers.getSetCookie();
      if (setCookies && setCookies.length > 0) {
        return setCookies.map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ');
      }
    }
  } catch (e) {}
  const raw = response.headers.get('set-cookie') || '';
  if (!raw) return '';
  raw.split(/,(?=[^;]+=)/).forEach(part => {
    const cookiePart = part.trim().split(';')[0].trim();
    if (cookiePart.includes('=')) cookies.push(cookiePart);
  });
  return cookies.join('; ');
}

function mergeCookies(existing, newCookies) {
  if (!existing && !newCookies) return '';
  if (!existing) return newCookies;
  if (!newCookies) return existing;
  const cookieMap = {};
  const parse = (str) => {
    str.split(';').forEach(c => {
      const idx = c.indexOf('=');
      if (idx > 0) {
        const key = c.substring(0, idx).trim();
        const val = c.substring(idx + 1).trim();
        if (key) cookieMap[key] = val;
      }
    });
  };
  parse(existing);
  parse(newCookies);
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ============================================================
// TempoVisor売上データ取得
// ============================================================

function extractTempoVisorCookies(response) {
  const setCookieHeaders = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : [];
  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    const rawHeader = response.headers.get('set-cookie');
    if (!rawHeader) return '';
    return rawHeader.split(',').map(c => c.split(';')[0].trim()).join('; ');
  }
  return setCookieHeaders.map(c => c.split(';')[0].trim()).join('; ');
}

function mergeTempoVisorCookies(existing, newCookies) {
  if (!existing) return newCookies;
  if (!newCookies) return existing;
  const map = {};
  [...existing.split('; '), ...newCookies.split('; ')].forEach(pair => {
    const [k, v] = pair.split('=');
    if (k && k.trim()) map[k.trim()] = v || '';
  });
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginTempoVisor(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
  const repBaseUrl = 'https://www.tenpovisor.jp/alioth/rep/';

  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });
  const initialCookies = extractTempoVisorCookies(getRes);

  const loginBody = new URLSearchParams({ id: username, pass: password }).toString();
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': initialCookies,
      'Referer': loginUrl,
    },
    body: loginBody,
    redirect: 'manual',
  });
  const loginCookies = extractTempoVisorCookies(loginRes);
  const allCookies = mergeTempoVisorCookies(initialCookies, loginCookies);
  console.log('[SaveHistory-TV] TempoVisor login done, cookies length:', allCookies.length);
  return { cookies: allCookies, repBaseUrl };
}

function parseSalesAmount(text) {
  if (!text) return 0;
  // TenpoVisorは金額を "\6,886,401" のようにバックスラッシュ+カンマ区切りで返す
  // ツールチップテキストが付く場合もある（例: "売上一覧を表示します。\682,770"）
  const cleaned = text.replace(/[¥￥\\,]/g, '');
  const matches = cleaned.match(/(\d+)/g);
  if (!matches) return 0;
  const nums = matches.map(m => parseInt(m)).filter(n => n > 0);
  return nums.length > 0 ? Math.max(...nums) : 0;
}

/**
 * TenpoVisor N221Servletから指定日の全店舗売上データを取得
 * @param {string} tvCookies - TempoVisorのログインCookie
 * @param {string} repBaseUrl - TempoVisorのレポートベースURL
 * @param {string} date - yyyy-mm-dd形式の日付
 * @returns {Object} { storeName: { sales, customers } }
 */
async function fetchDailySalesFromTempoVisor(tvCookies, repBaseUrl, date) {
  const [year, month, day] = date.split('-');
  const formattedDate = `${year}/${month}/${day}`;
  const salesByStore = {};

  // 全店舗を一括で取得（scode1=0001, scode2=0013）
  // 注意: 金額方式（値引前/値引後）はログインユーザーの基本設定に依存
  // フォームパラメータには金額方式の指定はない
  const body = new URLSearchParams({
    chkcsv: 'false',
    panSI_flag: '2',
    yyyymmdd1: formattedDate,
    yyyymmdd2: formattedDate,
    scode1: '0001',
    scode2: '0013',
    area1IsBottom: 'true',
    areasearch: 'off',
    monthlymode: 'off',
    consignAddFlagValue: 'off',
    deleteCookie: 'on',
  });

  try {
    const res = await fetch(`${repBaseUrl}N221Servlet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': tvCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': repBaseUrl,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[SaveHistory-TV] N221Servlet HTTP ${res.status}`);
      return salesByStore;
    }

    const buffer = await res.arrayBuffer();
    const html = iconv.decode(Buffer.from(buffer), 'cp932');

    const $ = cheerio.load(html);

    // 売上一覧テーブルを解析
    // 日報・全店舗モードでは: 店舗コード:店舗名 | 人数 | 販売数 | 売上 | 粗利 | 粗利率 | 客単価 ...
    $('table').each((_, table) => {
      const rows = $(table).find('tr').toArray();
      if (rows.length < 3) return;

      const headerRow = $(rows[0]).find('td,th').toArray();
      if (headerRow.length < 3) return;

      const headerTexts = headerRow.map(c => $(c).text().trim().replace(/\s+/g, ''));

      const hasSales = headerTexts.some(h => h.includes('売上'));
      if (!hasSales) return;

      // 列インデックスを特定
      let salesColIdx = -1, customersColIdx = -1;
      for (let i = 0; i < headerTexts.length; i++) {
        const h = headerTexts[i];
        if (h.includes('売上') && !h.includes('粗利') && !h.includes('率') && !h.includes('セール')) {
          salesColIdx = i;
        }
        if (h.includes('人数') || h.includes('客数')) {
          customersColIdx = i;
        }
      }
      if (salesColIdx < 0) return;

      console.log(`[SaveHistory-TV] Table headers: ${JSON.stringify(headerTexts)}, salesCol: ${salesColIdx}, customersCol: ${customersColIdx}`);

      rows.forEach((row, rowIdx) => {
        if (rowIdx === 0) return;
        const cells = $(row).find('td,th').toArray();
        if (cells.length < 2) return;

        const firstCellText = $(cells[0]).text().trim().replace(/\s+/g, '');
        if (!firstCellText) return;
        if (firstCellText.includes('合計') || firstCellText.includes('平均')) return;

        // 店舗コード:店舗名 パターンを検出
        const storeCodeMatch = firstCellText.match(/^(\d{4}):(.+)/);
        if (storeCodeMatch) {
          const storeCode = storeCodeMatch[1];
          const rawStoreName = storeCodeMatch[2].trim();

          // 店舗コードから店舗名を逆引き
          let storeName = null;
          for (const [name, code] of Object.entries(TEMPOVISOR_STORE_CODES)) {
            if (code === storeCode) {
              storeName = name;
              break;
            }
          }
          if (!storeName) storeName = rawStoreName;

          const salesText = salesColIdx < cells.length ? $(cells[salesColIdx]).text().trim() : '';
          const salesAmount = parseSalesAmount(salesText);

          const customersText = customersColIdx >= 0 && customersColIdx < cells.length
            ? $(cells[customersColIdx]).text().trim().replace(/[,\s]/g, '')
            : '';
          const customersCount = parseInt(customersText) || 0;

          salesByStore[storeName] = {
            sales: salesAmount,
            customers: customersCount,
          };
        }

        // 日付パターン（YYYY/MM/DD）も検出（単一店舗モードの場合）
        const dateMatch = firstCellText.match(/(\d{4}\/\d{2}\/\d{2})/);
        if (dateMatch && !storeCodeMatch) {
          const salesText = salesColIdx < cells.length ? $(cells[salesColIdx]).text().trim() : '';
          const salesAmount = parseSalesAmount(salesText);
          const customersText = customersColIdx >= 0 && customersColIdx < cells.length
            ? $(cells[customersColIdx]).text().trim().replace(/[,\s]/g, '')
            : '';
          const customersCount = parseInt(customersText) || 0;

          // 単一店舗モードの場合、後で店舗名を設定する
          salesByStore['_single'] = {
            sales: salesAmount,
            customers: customersCount,
          };
        }
      });
    });

    console.log(`[SaveHistory-TV] ${date}: ${Object.keys(salesByStore).length} stores found`);
    // デバッグ: 各テーブルのヘッダー情報を記録
    const tableDebug = [];
    $('table').each((idx, table) => {
      const rows = $(table).find('tr').toArray();
      if (rows.length < 2) return;
      const headerRow = $(rows[0]).find('td,th').toArray();
      const headerTexts = headerRow.map(c => $(c).text().trim().replace(/\s+/g, ''));
      const row1 = rows.length > 1 ? $(rows[1]).find('td,th').toArray().map(c => $(c).text().trim().substring(0, 30)) : [];
      tableDebug.push({ idx, rows: rows.length, headers: headerTexts, row1Sample: row1.slice(0, 5) });
    });
    salesByStore._debug = {
      htmlLength: html.length,
      tableCount: $('table').length,
      tables: tableDebug.slice(0, 5),
    };
  } catch (err) {
    console.error(`[SaveHistory-TV] ${date} fetch error:`, err.message);
    salesByStore._debug = { error: err.message };
  }

  return salesByStore;
}

/**
 * 勤怠データと売上データを結合してDailyProductivityレコードを構築
 */
function buildProductivityRecords(attendanceData, salesByStore, date) {
  // 勤怠データから店舗別の稼働時間と出勤人数を集計
  const storeWorkData = {};
  for (const emp of attendanceData) {
    if (!emp.clock_in) continue;
    const store = emp.assigned_store || emp.dept_store_name;
    // 店舗のみ対象（部署はスキップ）
    if (!TEMPOVISOR_STORE_CODES[store]) continue;

    if (!storeWorkData[store]) {
      storeWorkData[store] = { totalMinutes: 0, count: 0 };
    }
    storeWorkData[store].totalMinutes += emp.work_minutes || 0;
    storeWorkData[store].count++;
  }

  const records = [];
  // 売上データがある店舗を基準にレコードを作成
  for (const [storeName, salesData] of Object.entries(salesByStore)) {
    if (storeName === '_single' || storeName === '_debug') continue;
    const workData = storeWorkData[storeName] || { totalMinutes: 0, count: 0 };
    const workHours = Math.round((workData.totalMinutes / 60) * 100) / 100;
    const sales = salesData.sales || 0;
    const customers = salesData.customers || 0;
    const unitPrice = customers > 0 ? Math.round(sales / customers) : 0;
    const productivity = workHours > 0 ? Math.round(sales / workHours) : 0;

    records.push({
      work_date: date,
      store_name: storeName,
      sales: sales,
      customers: customers,
      work_hours: workHours,
      attended_employees: workData.count,
      productivity: productivity,
      unit_price: unitPrice,
      data_source: 'batch',
      updated_at: new Date().toISOString(),
    });
  }

  // 勤怠データはあるが売上データがない店舗（稼働時間のみ更新）
  for (const [storeName, workData] of Object.entries(storeWorkData)) {
    if (salesByStore[storeName]) continue; // 既に処理済み
    const workHours = Math.round((workData.totalMinutes / 60) * 100) / 100;
    records.push({
      work_date: date,
      store_name: storeName,
      sales: 0,
      customers: 0,
      work_hours: workHours,
      attended_employees: workData.count,
      productivity: 0,
      unit_price: 0,
      data_source: 'batch',
      updated_at: new Date().toISOString(),
    });
  }

  return records;
}

async function saveToDailyProductivity(supabaseUrl, supabaseKey, records) {
  if (records.length === 0) return 0;

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/DailyProductivity?on_conflict=work_date,store_name`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(records),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[SaveHistory] DailyProductivity保存エラー: ${resp.status} ${errText}`);
  } else {
    console.log(`[SaveHistory] DailyProductivity保存完了: ${records.length}件`);
  }

  return records.length;
}
