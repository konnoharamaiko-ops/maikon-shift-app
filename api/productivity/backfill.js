/**
 * Vercel Serverless Function: 過去実績バックフィルAPI
 * ジョブカンから指定日付範囲の勤怠データを取得してSupabaseに保存
 * 
 * エンドポイント: GET /api/productivity/backfill
 * クエリパラメータ:
 *   - date_from: 開始日 (yyyy-mm-dd)
 *   - date_to: 終了日 (yyyy-mm-dd) ※最大7日間
 *   - key: 認証キー (CRON_SECRET)
 *   - status: 進捗確認モード（パラメータのみ）
 */

import * as cheerio from 'cheerio';

const STORE_DEPT_MAP = {
  '10110': '田辺店', '10400': '大正店', '10500': '天下茶屋店',
  '10600': '天王寺店', '10800': 'アベノ店', '10900': '心斎橋店',
  '11010': 'かがや店', '11200': '駅丸', '12000': '北摂店',
  '12200': '堺東店', '12300': 'イオン松原店', '12400': 'イオン守口店',
  '20000': '美和堂福島店',
  '11021': '企画部', '11022': '通販部', '11025': '特販部',
  '11012': 'かがや工場', '12010': '北摂工場', '10210': '南田辺工房',
};

const STORE_NAME_TO_ID_MAP = {
  '田辺店': 'tanabe', '大正店': 'taisho', '天下茶屋店': 'tengachaya',
  '天王寺店': 'tennoji', 'アベノ店': 'abeno', '心斎橋店': 'shinsaibashi',
  'かがや店': 'kagaya', '駅丸': 'ekimaru', '北摂店': 'hokusetsu',
  '堺東店': 'sakaikita', 'イオン松原店': 'aeon_matsubara',
  'イオン守口店': 'aeon_moriguchi', '美和堂福島店': 'miwado_fc',
  '企画部': 'kikaku', '通販部': 'tsuhan', '特販部': 'tokuhan',
  'かがや工場': 'kagaya_factory', '北摂工場': 'hokusetsu_factory',
  '南田辺工房': 'minamitanabe_kobo',
};

export const config = {
  maxDuration: 300,
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
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const manualKey = req.query.key;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && manualKey !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 進捗確認モード
  if (req.query.status !== undefined) {
    return await getBackfillStatus(req, res);
  }

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

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    const jobcanCompany = process.env.JOBCAN_COMPANY_ID;
    const jobcanUser = process.env.JOBCAN_LOGIN_ID;
    const jobcanPass = process.env.JOBCAN_PASSWORD;

    if (!jobcanCompany || !jobcanUser || !jobcanPass) {
      return res.status(500).json({ error: 'Jobcan credentials not configured' });
    }

    // ジョブカンにログイン
    const cookies = await loginJobcan(jobcanCompany, jobcanUser, jobcanPass);
    console.log('[Backfill] ジョブカンログイン成功');

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
          // 進捗をSupabaseに保存
          await saveBackfillProgress(supabaseUrl, supabaseKey, date, 'no_data', 0);
          continue;
        }

        // WorkHistoryテーブルに保存
        const records = attendanceData.map(emp => {
          const storeName = emp.assigned_store || emp.dept_store_name;
          const storeId = storeMap[storeName] || STORE_NAME_TO_ID_MAP[storeName] || null;
          const userId = emp.jobcan_code ? userMap[emp.jobcan_code] : null;

          return {
            user_id: userId || `jobcan_${emp.jobcan_code || emp.name}`,
            store_id: storeId || `unknown_${storeName}`,
            work_date: date,
            clock_in: emp.clock_in || null,
            clock_out: emp.clock_out || null,
            break_minutes: emp.break_minutes || 0,
            work_minutes: emp.work_minutes || null,
            jobcan_code: emp.jobcan_code || null,
          };
        });

        const savedCount = await saveToWorkHistory(supabaseUrl, supabaseKey, records);

        // DailyStaffHoursテーブルにも集計データを保存
        const staffHoursRecords = attendanceData
          .filter(emp => emp.clock_in)
          .map(emp => ({
            work_date: date,
            employee_id: emp.jobcan_code || null,
            staff_name: emp.name,
            dept_code: emp.dept_code,
            assigned_store: emp.assigned_store || emp.dept_store_name,
            clock_in_place: emp.clock_in_place || null,
            work_hours: emp.work_minutes ? Math.round((emp.work_minutes / 60) * 100) / 100 : 0,
            clock_in: emp.clock_in || null,
            clock_out: emp.clock_out || null,
            status: emp.status,
          }));

        if (staffHoursRecords.length > 0) {
          await saveToDailyStaffHours(supabaseUrl, supabaseKey, staffHoursRecords);
        }

        // DailyDeptProductivityテーブルに部署別集計を保存
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

        const deptRecords = Object.entries(deptSummary).map(([deptName, data]) => ({
          work_date: date,
          dept_name: deptName,
          work_hours: Math.round(data.total_hours * 100) / 100,
          attended_employees: data.count,
        }));

        if (deptRecords.length > 0) {
          await saveToDailyDeptProductivity(supabaseUrl, supabaseKey, deptRecords);
        }

        results.push({ date, status: 'success', saved: savedCount, staff_hours: staffHoursRecords.length, dept_records: deptRecords.length });
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
// 進捗確認
// ============================================================

async function getBackfillStatus(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  try {
    // BackfillProgressテーブルから進捗を取得
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
      // テーブルが存在しない場合
      return res.status(200).json({
        success: true,
        progress: [],
        message: 'BackfillProgressテーブルが未作成です。最初のバックフィル実行時に自動作成されます。',
      });
    }

    const progress = await resp.json();

    // 全体の進捗を計算
    const totalDays = 1095; // 約3年
    const completedDays = progress.filter(p => p.status === 'success' || p.status === 'no_data').length;
    const errorDays = progress.filter(p => p.status === 'error').length;

    // 最古と最新の取得済み日付
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
// ジョブカン勤怠データ取得（指定日付）
// ============================================================

async function fetchAttendanceForDate(cookies, date) {
  // 勤務状況表示ページ（指定日付）
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

  // 勤務状況テーブルを検索
  let targetTable = null;
  $work('table').each((i, table) => {
    const headerText = $work(table).find('tr').first().text();
    if (headerText.includes('スタッフ') && (headerText.includes('出勤状況') || headerText.includes('労働時間'))) {
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

  // 出入詳細ページから打刻場所を並列取得
  const [year, month, day] = date.split('-');
  const stampDetailMap = {};

  const fetchWithTimeout = (url, options, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  // 並列数を制限（同時5件）
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
          // フォールバック: 出勤打刻がない場合は最初の打刻場所を使用
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

    // バッチ間に200ms待機
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

    // シフト時間
    const shiftText = $work(cells[3]).text().trim();

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
    console.error(`[Backfill] WorkHistory保存エラー: ${resp.status} ${errText}`);
    // エラーでも続行（テーブルが存在しない場合など）
  }

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
    console.error(`[Backfill] DailyStaffHours保存エラー: ${resp.status} ${errText}`);
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
    console.error(`[Backfill] DailyDeptProductivity保存エラー: ${resp.status} ${errText}`);
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
    // 進捗保存エラーは無視（テーブルが存在しない場合など）
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
    console.warn('[Backfill] User map error:', e.message);
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
    console.warn('[Backfill] Store map error:', e.message);
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
  return mergeCookies(initialCookies, loginCookies);
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
