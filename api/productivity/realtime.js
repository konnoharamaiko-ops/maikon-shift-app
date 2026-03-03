/**
 * Vercel Serverless Function: Real-time HR Productivity API
 * TempoVisor（売上）とジョブカン（勤怠）からリアルタイムデータを取得して人時生産性を計算
 * 時間帯別人時生産性：打刻時間 × 時間別売上（N3D1Servlet）で正確に算出
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// 部署コードと店舗名のマッピング（ジョブカン部署コード → 店舗名）
const STORE_DEPT_MAP = {
  '10110': '田辺店',
  '10400': '大正店',
  '10500': '天下茶屋店',
  '10600': '天王寺店',
  '10800': 'アベノ店',
  '10900': '心斎橋店',
  '11010': 'かがや店',
  '11200': 'エキマル',
  '12000': '北摂店',
  '12200': '堺東店',
  '12300': 'イオン松原店',
  '12400': 'イオン守口店',
  '20000': '美和堂FC店',
};

// 打刻場所名 → システム店舗名のマッピング
// ジョブカンの打刻場所名とシステム上の店舗名が異なる場合に使用
const LOCATION_TO_STORE_MAP = {
  'かがや店':           'かがや店',
  'アベノ店':           'アベノ店',
  '美和堂福島':         '美和堂FC店',
  '田辺店':             '田辺店',
  'イオンタウン松原店': 'イオン松原店',
  '北摂店':             '北摂店',
  '天王寺店':           '天王寺店',
  'イオンタウン守口店': 'イオン守口店',
  '心斎橋店':           '心斎橋店',
  '天下茶屋店':         '天下茶屋店',
  '堺東店':             '堺東店',
  '大正店':             '大正店',
  'エキマル':           'エキマル',
  'エキマルシェ':       'エキマル',
  '駅丸':               'エキマル',   // 駅催事出張->駅丸 の場合
  '駅催事出張':         'エキマル',   // 駅催事出張のみの場合
};

// TempoVisorの店舗名 → TempoVisor店舗コードのマッピング
const TEMPOVISOR_STORE_CODES = {
  '田辺店': '0001',
  '大正店': '0002',
  '天下茶屋店': '0003',
  '天王寺店': '0004',
  'アベノ店': '0005',
  '心斎橋店': '0006',
  'かがや店': '0007',
  'エキマル': '0008',
  '北摂店': '0009',
  '堺東店': '0010',
  'イオン松原店': '0011',
  'イオン守口店': '0012',
  '美和堂FC店': '0013',
};

// デフォルト営業時間（Supabaseから取得できない場合のフォールバック）
// 曜日別設定は { weekday: {open, close}, sunday: {open, close}, is_closed: false } 形式
const DEFAULT_BUSINESS_HOURS = {
  '田辺店':       { open: 9,  close: 19 },
  '大正店':       { open: 10, close: 18 },
  '天下茶屋店':   { open: 10, close: 18 },
  '天王寺店':     { open: 10, close: 18 },
  'アベノ店':     { open: 10, close: 18 },
  '心斎橋店':     { open: 10, close: 18 },
  'かがや店':     { open: 10, close: 18 },
  'エキマル':     { open: 10, close: 22 },
  '北摂店':       { open: 10, close: 18 },
  '堺東店':       { open: 10, close: 20 }, // 月〜土は10-20時（日は10-19時）
  'イオン松原店': { open: 9,  close: 20 },
  'イオン守口店': { open: 9,  close: 20 },
  '美和堂FC店':   { open: 10, close: 18 }, // 日曜休み
};

// 全13店舗リスト
const ALL_STORES = [
  '田辺店', '大正店', '天下茶屋店', '天王寺店', 'アベノ店',
  '心斎橋店', 'かがや店', 'エキマル', '北摂店', '堺東店',
  'イオン松原店', 'イオン守口店', '美和堂FC店'
];

// ============================================================
// サーバーサイドキャッシュ（stale-while-revalidate）
// Vercelの同一インスタンスが再利用される間、キャッシュが有効
// 初回リクエスト：フル取得（遅い）
// 2回目以降：キャッシュを即座に返し、バックグラウンドで更新
// ============================================================
let _cache = null;          // キャッシュデータ
let _cacheTime = 0;         // キャッシュ作成時刻（ms）
let _isRevalidating = false; // バックグラウンド更新中フラグ
const CACHE_TTL_MS = 90 * 1000;  // 90秒（自動更新間隔と同じ）
const CACHE_STALE_MS = 300 * 1000; // 5分（古いデータを返す最大時間）

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const tempovisorUser = process.env.TEMPOVISOR_USERNAME || 'manu';
    const tempovisorPass = process.env.TEMPOVISOR_PASSWORD || 'manus';
    const jobcanCompany = process.env.JOBCAN_COMPANY_ID || 'maikon';
    const jobcanUser = process.env.JOBCAN_LOGIN_ID || 'fujita.yog';
    const jobcanPass = process.env.JOBCAN_PASSWORD || 'fujita.yog';

    // staff_only=1 の場合はスタッフマスタのみ返す（設定画面用）
    if (req.query.staff_only === '1') {
      const staffMaster = await fetchStaffMaster();
      return res.status(200).json({ success: true, staff_master: staffMaster });
    }

    // force=1 の場合はキャッシュを無視して強制更新
    const forceRefresh = req.query.force === '1';

    // クエリパラメータから店舗設定を取得（フロントエンドから渡される）
    let clientStoreSettings = {};
    if (req.query.store_settings) {
      try {
        clientStoreSettings = JSON.parse(decodeURIComponent(req.query.store_settings));
      } catch (e) {
        console.warn('[StoreSettings] Failed to parse client store_settings:', e.message);
      }
    }

    // ============================================================
    // キャッシュチェック（stale-while-revalidate）
    // ============================================================
    const now = Date.now();
    const cacheAge = now - _cacheTime;
    const isCacheValid = _cache !== null && cacheAge < CACHE_TTL_MS;
    const isCacheStale = _cache !== null && cacheAge < CACHE_STALE_MS;

    if (!forceRefresh && isCacheValid) {
      // キャッシュが新鮮：即座に返す
      console.log(`[Cache] HIT (age: ${Math.round(cacheAge/1000)}s)`);
      return res.status(200).json({
        ..._cache,
        cached: true,
        cache_age_seconds: Math.round(cacheAge / 1000),
      });
    }

    if (!forceRefresh && isCacheStale && !_isRevalidating) {
      // キャッシュが古い（stale）：古いデータを即座に返し、バックグラウンドで更新開始
      console.log(`[Cache] STALE (age: ${Math.round(cacheAge/1000)}s) - returning stale data, revalidating in background`);
      _isRevalidating = true;
      // バックグラウンドで更新（awaitしない）
      fetchAndCacheData(tempovisorUser, tempovisorPass, jobcanCompany, jobcanUser, jobcanPass, clientStoreSettings)
        .catch(e => console.error('[Cache] Background revalidation failed:', e.message))
        .finally(() => { _isRevalidating = false; });
      return res.status(200).json({
        ..._cache,
        cached: true,
        cache_age_seconds: Math.round(cacheAge / 1000),
      });
    }

    // キャッシュがない（初回）または強制更新：フル取得
    console.log(`[Cache] MISS - fetching fresh data`);
    const freshData = await fetchAndCacheData(tempovisorUser, tempovisorPass, jobcanCompany, jobcanUser, jobcanPass, clientStoreSettings);
    return res.status(200).json(freshData);

  } catch (error) {
    console.error('Realtime API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch realtime data',
      message: error.message,
    });
  }
}

/**
 * 実際のデータ取得・計算・キャッシュ更新を行う関数
 * handlerから分離し、バックグラウンド再検証でも尌用できるようにする
 */
async function fetchAndCacheData(tempovisorUser, tempovisorPass, jobcanCompany, jobcanUser, jobcanPass, clientStoreSettings) {
  const [salesResult, attendanceResult, supabaseSettingsResult, staffMasterResult] = await Promise.allSettled([
    fetchTempoVisorAllData(tempovisorUser, tempovisorPass),
    fetchJobcanAttendance(jobcanCompany, jobcanUser, jobcanPass),
    fetchStoreSettings(),
    fetchStaffMaster(),
  ]);

  const salesData = salesResult.status === 'fulfilled' ? salesResult.value : { stores: [], hourly: {}, yesterdayStores: [], yesterdayHourly: {} };
  const attendance = attendanceResult.status === 'fulfilled' ? attendanceResult.value : { stores: {}, employees: [] };
  const supabaseSettings = supabaseSettingsResult.status === 'fulfilled' ? supabaseSettingsResult.value : {};
  const staffMaster = staffMasterResult.status === 'fulfilled' ? staffMasterResult.value : [];

  const storeSettings = buildStoreSettings(clientStoreSettings, supabaseSettings);

  const allEmployees = attendance.employees || [];
  const { storeEmployees, employeeProductivity } = applyEmployeeServiceHours(allEmployees, staffMaster);
  const adjustedAttendance = rebuildAttendanceWithServiceHours(attendance.stores, storeEmployees);

  const storeData = mergeStoreData(
    salesData.stores,
    salesData.hourly,
    adjustedAttendance,
    storeSettings,
    salesData.yesterdayStores || [],
    salesData.yesterdayHourly || {}
  );

  const responseData = {
    success: true,
    data: storeData,
    employees: storeEmployees,
    employee_productivity: employeeProductivity,
    timestamp: new Date().toISOString(),
    cached: false,
    sources: {
      tempovisor: salesResult.status === 'fulfilled' ? 'live' : `error: ${salesResult.reason?.message}`,
      jobcan: attendanceResult.status === 'fulfilled' ? 'live' : `error: ${attendanceResult.reason?.message}`,
      store_settings: Object.keys(clientStoreSettings).length > 0 ? 'client' : supabaseSettingsResult.status === 'fulfilled' ? 'supabase' : 'default',
      staff_master: staffMasterResult.status === 'fulfilled' ? `${staffMaster.length}名` : 'error',
    }
  };

  // キャッシュを更新
  _cache = responseData;
  _cacheTime = Date.now();
  console.log(`[Cache] Updated at ${new Date().toISOString()}`);

  return responseData;
}

/**
 * クライアント設定・Supabase設定・デフォルト値を統合して店舗設定マップを構築
 * @param {Object} clientSettings - フロントエンドlocalStorageから渡された設定
 * @param {Object} supabaseSettings - SupabaseのStoreテーブルから取得した設定
 * @returns {Object} 統合された店舗設定マップ
 */
function buildStoreSettings(clientSettings, supabaseSettings) {
  // クライアント設定がある場合はそれを優先
  // フォーマットv2: { '田辺店': { days: [{open,close,is_closed}, ...x7] }, ... }
  // フォーマットv1: { '田辺店': { open: 9, close: 19, closed_days: [0], sunday_close: 19 }, ... }
  const result = {};

  ALL_STORES.forEach(storeName => {
    const client = clientSettings[storeName];
    const supabase = supabaseSettings[storeName];

    if (client) {
      const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const businessHours = {};

      if (client.days && Array.isArray(client.days)) {
        // 新形式v2: days[]配列から変換
        dayKeys.forEach((dayKey, dayIndex) => {
          const d = client.days[dayIndex] || { open: 10, close: 18, is_closed: false };
          if (d.is_closed) {
            businessHours[dayKey] = { is_closed: true, open: null, close: null };
          } else {
            businessHours[dayKey] = {
              is_closed: false,
              open: `${String(d.open).padStart(2, '0')}:00`,
              close: `${String(d.close).padStart(2, '0')}:00`,
            };
          }
        });
      } else {
        // 旧形式v1: open/close/closed_daysから変換（後方互換）
        dayKeys.forEach((dayKey, dayIndex) => {
          const isClosed = (client.closed_days || []).includes(dayIndex);
          if (isClosed) {
            businessHours[dayKey] = { is_closed: true, open: null, close: null };
          } else {
            const closeHour = (dayIndex === 0 && client.sunday_close) ? client.sunday_close : client.close;
            businessHours[dayKey] = {
              is_closed: false,
              open: `${String(client.open).padStart(2, '0')}:00`,
              close: `${String(closeHour).padStart(2, '0')}:00`,
            };
          }
        });
      }

      result[storeName] = { business_hours: businessHours, temporary_closures: [] };
    } else if (supabase) {
      result[storeName] = supabase;
    }
    // どちらもない場合はデフォルト値（getBusinessHoursForToday内で処理）
  });

  return result;
}

/**
 * SupabaseからStoresテーブルの店舗設定（営業時間・休業日）を取得
 */
async function fetchStoreSettings() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[StoreSettings] Supabase credentials not found, using defaults');
    return {};
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/Store?select=store_name,business_hours,temporary_closures`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('[StoreSettings] Supabase fetch failed:', response.status);
      return {};
    }

    const stores = await response.json();
    const settingsMap = {};
    stores.forEach(store => {
      if (store.store_name) {
        settingsMap[store.store_name] = {
          business_hours: store.business_hours || null,
          temporary_closures: store.temporary_closures || [],
        };
      }
    });
    return settingsMap;
  } catch (err) {
    console.warn('[StoreSettings] Error fetching store settings:', err.message);
    return {};
  }
}

/**
 * SupabaseからStaffMasterテーブルのスタッフ情報（スタッフ種別・接客時間帯）を取得
 */
async function fetchStaffMaster() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[StaffMaster] Supabase credentials not found');
    return [];
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/StaffMaster?select=id,staff_name,dept_code,store_name,staff_type,service_start,service_end,service_store`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn('[StaffMaster] Supabase fetch failed:', response.status);
      return [];
    }

    const staff = await response.json();
    console.log(`[StaffMaster] Fetched ${staff.length} staff records`);
    return staff;
  } catch (err) {
    console.warn('[StaffMaster] Error fetching staff master:', err.message);
    return [];
  }
}

/**
 * 社員スタッフの接客時間帯を適用して人時計算用データを変換する
 *
 * 社員の場合：
 * - 接客時間帯（service_start〜service_end）は店舗の人時に含める
 * - それ以外の時間は社員個人の生産性として計算
 *
 * パート・アルバイトの場合：
 * - 従来通り全勤務時間を店舗の人時に含める
 *
 * @param {Array} employees - ジョブカンから取得した全スタッフ
 * @param {Array} staffMaster - Supabaseのスタッフマスタ
 * @returns {{ storeEmployees: Array, employeeProductivity: Array }}
 */
function applyEmployeeServiceHours(employees, staffMaster) {
  // スタッフマスタをスタッフ名でマップ化（部分一致対応）
  const staffMap = {};
  staffMaster.forEach(sm => {
    if (sm.staff_name) {
      staffMap[sm.staff_name] = sm;
    }
  });

  // スタッフ名の部分一致検索
  function findStaffMaster(name) {
    if (!name) return null;
    // 完全一致
    if (staffMap[name]) return staffMap[name];
    // 部分一致（スタッフマスタ名がジョブカン名に含まれる、またはその逆）
    for (const [masterName, masterData] of Object.entries(staffMap)) {
      if (name.includes(masterName) || masterName.includes(name)) {
        return masterData;
      }
    }
    return null;
  }

  const storeEmployees = [];
  const employeeProductivity = [];  // 社員個人の生産性データ

  employees.forEach(emp => {
    const master = findStaffMaster(emp.name);
    const isEmployee = master?.staff_type === '社員' || master?.staff_type === '契約社員' || master?.staff_type === '役員';

    if (!isEmployee || !master?.service_start || !master?.service_end) {
      // パート・アルバイト、または接客時間帯未設定の社員：従来通り
      storeEmployees.push({
        ...emp,
        staff_type: master?.staff_type || 'パート',
        is_employee: isEmployee,
        service_hours_applied: false,
      });
      return;
    }

    // 社員かつ接客時間帯設定あり
    const serviceStartMinutes = parseTimeToMinutes(master.service_start);
    const serviceEndMinutes = parseTimeToMinutes(master.service_end);
    const serviceStore = master.service_store || emp.store_name;

    if (serviceStartMinutes === null || serviceEndMinutes === null) {
      storeEmployees.push({
        ...emp,
        staff_type: master.staff_type,
        is_employee: true,
        service_hours_applied: false,
      });
      return;
    }

    const empStart = emp.clock_in_minutes;
    const empEnd = emp.clock_out_minutes || null;

    if (empStart === null || empStart === undefined) {
      storeEmployees.push({
        ...emp,
        staff_type: master.staff_type,
        is_employee: true,
        service_hours_applied: false,
      });
      return;
    }

    // 接客時間帯（店舗の人時に含める）
    const serviceClockIn = Math.max(empStart, serviceStartMinutes);
    const serviceClockOut = empEnd !== null
      ? Math.min(empEnd, serviceEndMinutes)
      : serviceEndMinutes;
    const serviceMinutes = Math.max(0, serviceClockOut - serviceClockIn);

    // 非接客時間帯（社員個人の生産性に含める）
    const preServiceMinutes = Math.max(0, Math.min(empEnd !== null ? empEnd : serviceStartMinutes, serviceStartMinutes) - empStart);
    const postServiceMinutes = empEnd !== null
      ? Math.max(0, empEnd - Math.max(empEnd, serviceEndMinutes))
      : 0;
    const nonServiceMinutes = preServiceMinutes + postServiceMinutes;

    // 店舗の人時計算用：接客時間帯のみの打刻情報に変換
    const serviceEmployee = {
      ...emp,
      staff_type: master.staff_type,
      is_employee: true,
      service_hours_applied: true,
      clock_in_minutes: serviceClockIn,
      clock_out_minutes: serviceClockOut > serviceClockIn ? serviceClockOut : null,
      work_hours: parseFloat((serviceMinutes / 60).toFixed(2)),
      // 元の打刻情報を保持
      original_clock_in_minutes: empStart,
      original_clock_out_minutes: empEnd,
      original_work_hours: emp.work_hours,
      // 接客時間帯情報
      service_start: master.service_start,
      service_end: master.service_end,
      service_store: serviceStore,
      // 非接客時間（個人生産性用）
      non_service_minutes: nonServiceMinutes,
    };

    storeEmployees.push(serviceEmployee);

    // 社員個人の生産性データを記録
    employeeProductivity.push({
      name: emp.name,
      store_name: emp.store_name,
      dept_store_name: emp.dept_store_name,
      staff_type: master.staff_type,
      status: emp.status,
      clock_in: emp.clock_in,
      clock_out: emp.clock_out,
      break_start: emp.break_start || null,
      total_work_hours: emp.work_hours,
      service_hours: parseFloat((serviceMinutes / 60).toFixed(2)),
      non_service_hours: parseFloat((nonServiceMinutes / 60).toFixed(2)),
      service_start: master.service_start,
      service_end: master.service_end,
      service_store: serviceStore,
    });
  });

  return { storeEmployees, employeeProductivity };
}

/**
 * 接客時間帯適用後のスタッフデータで店舗集計を再構築
 * @param {Object} originalStores - 元の店舗集計データ
 * @param {Array} storeEmployees - 接客時間帯適用済みスタッフ一覧
 * @returns {Object} 再構築された店舗集計データ
 */
function rebuildAttendanceWithServiceHours(originalStores, storeEmployees) {
  const rebuilt = {};

  // 全店舗の基本構造を初期化
  ALL_STORES.forEach(storeName => {
    const orig = originalStores[storeName];
    if (!orig) return;
    rebuilt[storeName] = {
      store_name: storeName,
      total_employees: orig.total_employees,
      attended_employees: 0,
      working_employees: 0,
      break_employees: 0,
      total_hours: 0,
      employees: [],
    };
  });

  // 接客時間帯適用済みスタッフを店舗ごとに集計
  storeEmployees.forEach(emp => {
    const storeName = emp.store_name;
    if (!rebuilt[storeName]) {
      rebuilt[storeName] = {
        store_name: storeName,
        total_employees: 0,
        attended_employees: 0,
        working_employees: 0,
        break_employees: 0,
        total_hours: 0,
        employees: [],
      };
    }

    const store = rebuilt[storeName];
    store.employees.push(emp);

    if (emp.status === '勤務中' || emp.status === '退勤済み' || emp.status === '休憩中' || emp.status === '退出中') {
      store.attended_employees++;
      store.total_hours += emp.work_hours || 0;
    }
    if (emp.status === '勤務中') store.working_employees++;
    if (emp.status === '休憩中' || emp.status === '退出中') store.break_employees++;
  });

  // total_hoursを小数点1桁に丸める
  Object.values(rebuilt).forEach(store => {
    store.total_hours = parseFloat(store.total_hours.toFixed(1));
  });

  return rebuilt;
}

/**
 * 現在の日本時間（JST）に基づいて店舗の営業時間を取得
 * Supabaseの設定がある場合はそちらを優先、なければデフォルト値を使用
 */
function getBusinessHoursForToday(storeName, storeSettings, jstDayOfWeek) {
  // 曜日マッピング（0=日曜, 1=月曜, ..., 6=土曜）
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayKeys[jstDayOfWeek];

  const settings = storeSettings[storeName];

  if (settings && settings.business_hours) {
    const bh = settings.business_hours;
    // 曜日別設定がある場合
    const dayHours = bh[dayKey];
    if (dayHours) {
      if (dayHours.is_closed) {
        return { open: 0, close: 0, is_closed: true };
      }
      const open = dayHours.open ? parseInt(dayHours.open.split(':')[0]) : 10;
      const close = dayHours.close ? parseInt(dayHours.close.split(':')[0]) : 18;
      return { open, close, is_closed: false };
    }
    // 曜日別設定がない場合は全日共通設定を探す
    if (bh.open !== undefined) {
      return { open: bh.open, close: bh.close, is_closed: false };
    }
  }

  // Supabase設定なし → デフォルト値を使用
  const defaultHours = DEFAULT_BUSINESS_HOURS[storeName] || { open: 10, close: 18 };

  // デフォルト値での曜日別処理
  if (storeName === '美和堂FC店' && jstDayOfWeek === 0) {
    return { open: 0, close: 0, is_closed: true }; // 日曜休み
  }
  if (storeName === '堺東店' && jstDayOfWeek === 0) {
    return { open: 10, close: 19, is_closed: false }; // 日曜は10-19時
  }

  return { ...defaultHours, is_closed: false };
}

/**
 * 臨時休業日かどうかを確認
 */
function isTemporaryClosure(storeName, storeSettings, jstDateStr) {
  const settings = storeSettings[storeName];
  if (!settings || !settings.temporary_closures) return false;

  return settings.temporary_closures.some(tc => {
    if (tc.date === jstDateStr) return true;
    if (tc.start_date && tc.end_date) {
      return jstDateStr >= tc.start_date && jstDateStr <= tc.end_date;
    }
    return false;
  });
}

/**
 * TempoVisorのMainMenuServletから各店舗の更新時刻（最終レジ稼働時間）を取得
 * @param {string} cookies - ログイン済みCookie
 * @returns {Object} { '田辺店': '03/01 18:46', ... }
 */
async function fetchStoreUpdateTimes(cookies) {
  try {
    const menuUrl = 'https://www.tenpovisor.jp/alioth/servlet/MainMenuServlet';
    const menuRes = await fetch(menuUrl, {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const menuBuffer = await menuRes.arrayBuffer();
    const menuHtml = iconv.decode(Buffer.from(menuBuffer), 'cp932');
    const $menu = cheerio.load(menuHtml);

    const updateTimes = {};
    // テーブルから店舗名と更新時刻を取得
    // 構造: 店舗名 | 前年売上 | 予算 | 前月売上 | 今月売上 | 達成率 | 前日売上 | 当日売上 | 更新時刻
    $menu('table tr').each((i, row) => {
      const cells = $menu(row).find('td,th').toArray();
      if (cells.length < 9) return;
      const storeName = $menu(cells[0]).text().trim().replace(/[\\\[\]]/g, '');
      if (!TEMPOVISOR_STORE_CODES[storeName]) return;
      // 更新時刻は最後の列（または最後から2番目）
      const lastCell = $menu(cells[cells.length - 1]).text().trim();
      const secondLastCell = $menu(cells[cells.length - 2]).text().trim();
      const timePattern = /\d{2}\/\d{2}\s+\d{2}:\d{2}/;
      if (timePattern.test(lastCell)) {
        updateTimes[storeName] = lastCell;
      } else if (timePattern.test(secondLastCell)) {
        updateTimes[storeName] = secondLastCell;
      }
    });

    console.log('[TV] Update times:', JSON.stringify(updateTimes));
    return updateTimes;
  } catch (err) {
    console.warn('[TV] fetchStoreUpdateTimes error:', err.message);
    return {};
  }
}

/**
 * N341Servlet（明細管理 - 処理種別）から各店舗のレジ締め後売上を直接集計
 * 
 * 仕様（田辺店3/2の例）：
 * - 3/2のN341には「3/1のレジ締め後分」と「3/2の通常営業分」が混在する
 * - 例：16:55、17:17、18:45（前日レジ締め後）、その後9:25、10:22（本日通常営業）
 * - 「最初の伝票時刻（9:25）」より前に出現した伝票 = 前日レジ締め後分
 * - その伝票の「金額」を直接合計 → 分単位で正確に集計（17:30締めならう3:30以降の伝票のみ）
 * 
 * @param {string} cookies - ログイン済みCookie
 * @param {string} repBaseUrl - TempoVisorのベースURL
 * @param {string} dateStr - 対象日付（YYYY/MM/DD形式）
 * @param {boolean} [isTomorrow=false] - 翌日N341を処理する場合はtrue
 *   今日N341（isTomorrow=false）：前日レジ締め後分が先頭に出現 → 最小時刻より前に出現した伝票を集計
 *   翌日N341（isTomorrow=true）：今日レジ締め後分が末尾に出現 → 最小時刻より大きい時刻の伝票を集計
 * @returns { '田辺店': { afterSalesTotal: 15230, regijimeMinutes: 1050, excludeHours: Set{16,17,18} }, ... }
 */
async function fetchRegijimeStartHours(cookies, repBaseUrl, dateStr, isTomorrow = false) {
  const storeEntries = Object.entries(TEMPOVISOR_STORE_CODES);
  
  // 全店舗を並行取得
  const results = await Promise.allSettled(
    storeEntries.map(async ([storeName, storeCode]) => {
      try {
        const body = new URLSearchParams({
          chkcsv: 'false',
          slipDetailNo: '',
          slipDetailDate: '',
          slipDetailShopCode: '',
          yyyymmdd1: dateStr,
          yyyymmdd2: dateStr,
          scode1: storeCode,
          areasearch: 'off',
          group: '1',
          syutsuryoku: '2',
          ssbetsu: 'HANBAI',
          henpin: 'off',
          ido_from: '0000',
          ido_to: '9999',
          out_method: '2',
          zeinuki: '1',
          keykind: 'nasi',
          searchkey1: '',
          searchkey2: '',
          pan2_flag: '1',
          useZikantai: '2',
          zikantai1: '00:00',
          zikantai2: '24:00',
          useCcode: '2',
          ccode1: '0000000000',
          ccode2: '9999999999',
          useDcode: '2',
          dcode1: '0000000',
          dcode2: '9999999',
        });
        
        const res = await fetch(`${repBaseUrl}N341Servlet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': repBaseUrl,
          },
          body: body.toString(),
          signal: AbortSignal.timeout(8000),
        });
        
        const buffer = await res.arrayBuffer();
        const html = iconv.decode(Buffer.from(buffer), 'cp932');
        const $ = cheerio.load(html);
        
        console.log(`[N341] ${storeName}(${dateStr}): HTML長=${html.length}, テーブル数=${$('table').length}`);

        // N341のデータテーブルを探す
        // ヘッダー構造：日付 | 時間 | 伝票No | 商品コード | 商品名 | 数量 | 金額
        // 金額列はヘッダーから動的に特定する
        let allEntries = []; // { minutes, hour, timeStr, amount } 形式で全伝票を出現順に収集
        let amountColIndex = -1; // 金額列のインデックス
        let foundTable = false;

        $('table').each((_, table) => {
          if (foundTable) return;
          const rows = $(table).find('tr').toArray();
          if (rows.length < 3) return;

          // ヘッダー行を確認
          const headerRow = $(rows[0]).find('td,th').toArray();
          if (headerRow.length < 3) return;

          const normalize = s => s.replace(/\s/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
            String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

          const headerTexts = headerRow.map(c => normalize($(c).text().trim()));
          const h0 = headerTexts[0];
          const h1 = headerTexts[1];
          const h2 = headerTexts[2];

          const isDataTable = (h0 === '日付' || h0.includes('日付')) &&
                              (h1 === '時間' || h1.includes('時間')) &&
                              (h2.includes('伝票') || h2.includes('No') || h2.includes('番号'));
          if (!isDataTable) return;

          // 金額列のインデックスを特定（「金額」または「小計」を含む列）
          amountColIndex = headerTexts.findIndex(h => h.includes('金額') || h.includes('小計'));
          if (amountColIndex === -1) amountColIndex = headerRow.length - 1; // 最後列をフォールバック
          console.log(`[N341] ${storeName}(${dateStr}): データテーブル発見, 金額列=${amountColIndex}, ヘッダー=[${headerTexts.slice(0,7).join('|')}]`);

          // 全伝票を出現順に収集
          rows.forEach(row => {
            const cells = $(row).find('td,th').toArray();
            if (cells.length < 3) return;
            const c0 = $(cells[0]).text().trim();
            const c1 = $(cells[1]).text().trim();
            // 日付形式（YYYY/MM/DD）かつ時刻形式（H:MMまたはHH:MM）の行のみ処理
            if (c0.match(/^\d{4}\/\d{2}\/\d{2}$/) && c1.match(/^\d{1,2}:\d{2}$/)) {
              const timeMatch = c1.match(/^(\d{1,2}):(\d{2})$/);
              if (!timeMatch) return;
              const h = parseInt(timeMatch[1]);
              const m = parseInt(timeMatch[2]);
              const totalMinutes = h * 60 + m;
              // 金額を取得
              let amount = 0;
              if (amountColIndex >= 0 && amountColIndex < cells.length) {
                const amtText = $(cells[amountColIndex]).text().trim()
                  .replace(/[\\\u00a5･,]/g, '')
                  .replace(/[^\d-]/g, '');
                amount = parseInt(amtText) || 0;
              }
              allEntries.push({ hour: h, minutes: totalMinutes, timeStr: c1, amount });
            }
          });
          foundTable = true;
        });

        if (!foundTable) {
          console.log(`[N341] ${storeName}(${dateStr}): データテーブル未検出`);
          return { storeName, hasData: false, afterSalesTotal: 0, regijimeMinutes: null, excludeHours: new Set() };
        }

        if (allEntries.length === 0) {
          console.log(`[N341] ${storeName}(${dateStr}): 伝票データなし`);
          return { storeName, hasData: false, afterSalesTotal: 0, regijimeMinutes: null, excludeHours: new Set() };
        }

        // 全伝票の中で最小時刻（= 本日通常営業の最初の伝票）を特定
        const minMinutes = Math.min(...allEntries.map(e => e.minutes));
        const minEntry = allEntries.find(e => e.minutes === minMinutes);
        console.log(`[N341] ${storeName}(${dateStr}): 最小時刻=${minEntry.timeStr}, 全伝票数=${allEntries.length}`);

        let afterSalesTotal = 0;
        let excludeHours = new Set();
        let regijimeMinutes = null; // レジ締め時刻（分単位）

        if (isTomorrow) {
          // ===== 翌日N341の処理 =====
          // 翌日N341の構造：[今日のレジ締め後分（末尾）] + [明日の通常営業分（先頭〜中間）]
          // 最小時刻 = 明日の通常営業開始時刻（例：9:30）
          // 最小時刻より大きい時刻の伝票 = 今日のレジ締め後分（例：17:30〜）
          for (const entry of allEntries) {
            if (entry.minutes > minMinutes) {
              afterSalesTotal += entry.amount;
              excludeHours.add(entry.hour);
              if (regijimeMinutes === null || entry.minutes < regijimeMinutes) {
                regijimeMinutes = entry.minutes; // 最初のレジ締め後伝票の時刻
              }
            }
          }
        } else {
          // ===== 今日N341の処理 =====
          // 今日N341の構造：[前日レジ締め後分（先頭）] + [今日の通常営業分（中間〜末尾）]
          // 最小時刻 = 今日の通常営業開始時刻（例：9:25）
          // 出現順に走査し、最小時刻より前に出現した伝票 = 前日レジ締め後分
          let reachedMin = false;
          for (const entry of allEntries) {
            if (reachedMin) break;
            if (entry.minutes === minMinutes) {
              reachedMin = true;
              break;
            }
            // 最小時刻より大きい時刻が先に出現 = 前日レジ締め後分
            afterSalesTotal += entry.amount;
            excludeHours.add(entry.hour);
            if (regijimeMinutes === null || entry.minutes < regijimeMinutes) {
              regijimeMinutes = entry.minutes;
            }
          }
        }

        const regijimeStr = regijimeMinutes !== null
          ? `${Math.floor(regijimeMinutes/60)}:${String(regijimeMinutes%60).padStart(2,'0')}`
          : 'なし';
        console.log(`[N341] ${storeName}(${dateStr}): レジ締め時刻=${regijimeStr}, レジ締め後金額=${afterSalesTotal}円, 除外時間帯=${JSON.stringify([...excludeHours])}`);

        return { storeName, hasData: true, afterSalesTotal, regijimeMinutes, excludeHours };
      } catch (err) {
        console.warn(`[N341] ${storeName}: 取得失敗 ${err.message}`);
        return { storeName, hasData: false, afterSalesTotal: 0, regijimeMinutes: null, excludeHours: new Set() };
      }
    })
  );
  
  // 結果をマップに変換 { storeName: { afterSalesTotal, regijimeMinutes, excludeHours } }
  const regijimeMap = {};
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      const { storeName, hasData, afterSalesTotal, regijimeMinutes, excludeHours } = result.value;
      regijimeMap[storeName] = { hasData, afterSalesTotal, regijimeMinutes, excludeHours };
    }
  });
  
  const debugMap = {};
  Object.entries(regijimeMap).forEach(([k, v]) => {
    debugMap[k] = { afterSales: v.afterSalesTotal, regijime: v.regijimeMinutes, excludeHours: [...(v.excludeHours||[])] };
  });
  console.log(`[N341] レジ締めデータ(${dateStr}):`, JSON.stringify(debugMap));
  return regijimeMap;
}

/**
 * TempoVisorにログインしてCookieを取得
 */
async function loginTempoVisor(username, password) {
  const loginUrl = 'https://www.tenpovisor.jp/alioth/servlet/LoginServlet';
  const repBaseUrl = 'https://www.tenpovisor.jp/alioth/rep/';

  const getRes = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    redirect: 'manual',
  });

  const initialCookies = extractCookies(getRes);

  const loginBody = new URLSearchParams({
    id: username,
    pass: password,
  }).toString();

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

  const loginCookies = extractCookies(loginRes);
  const allCookies = mergeCookies(initialCookies, loginCookies);

  return { cookies: allCookies, repBaseUrl };
}

/**
 * TempoVisorから全店舗の売上データと時間別売上を取得
 * 時間別売上テーブルの合計列から日次売上も取得する
 */
async function fetchTempoVisorAllData(username, password) {
  const { cookies, repBaseUrl } = await loginTempoVisor(username, password);

  // 時間別売上を取得（日次売上も同テーブルの合計列から取得）
  // yesterdayStores/yesterdayHourlyも取得して前日データフォールバックに使用
  const { stores, hourly: hourlyData, yesterdayStores, yesterdayHourly } = await fetchAllStoresHourlySales(cookies, repBaseUrl);

  return { stores, hourly: hourlyData, yesterdayStores: yesterdayStores || [], yesterdayHourly: yesterdayHourly || {} };
}

/**
 * 全店舗の時間別売上を取得（N3D1Servlet）
 * 
 * テーブル構造（ブラウザで確認済み）:
 * Row 0: ヘッダー [店舗名 | 10:00～ | 11:00～ | ... | 21:00～ | 合計]
 * Row 1+: 各店舗 [田辺店 | \43,886 | \47,098 | ... | \0 | \218,828]
 * 
 * HTMLはShift-JIS（cp932）エンコーディング
 */
async function fetchAllStoresHourlySales(cookies, repBaseUrl) {
  // 今日の日付をJST（YYYY/MM/DD形式）で取得
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jstNow.getUTCFullYear();
  const mm = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jstNow.getUTCDate()).padStart(2, '0');
  const todayStr = `${yyyy}/${mm}/${dd}`;

  // N3D1ServletはPOSTリクエストでデータを返す（「実行」ボタンのkensaku()関数がフォームをPOST送信）
  // 時間帯は8〜23時に拡張（田辺店9時開店・エキマル22時閉店に対応）
  const makePostBody = (dateStr, slot1 = '8', slot2 = '23') => new URLSearchParams({
    chkcsv: 'false',
    chkcustom: '',
    shopcode: '',
    searched_time_slot1: slot1,
    searched_time_slot2: slot2,
    searched_yyyymmdd1: dateStr,
    searched_yyyymmdd2: dateStr,
    time_slot1_val: slot1,
    time_slot2_val: slot2,
    interval: '1',
    yyyymmdd1: dateStr,
    yyyymmdd2: dateStr,
    scode1: '0001',
    scode2: '2000',
    which_time_type: '1',
    time_type: '1',
    which_tani: '1',
    tani: '1',
    time_slot1: slot1,
    time_slot2: slot2,
    which_zeinuki: '1',
    zeinuki: '1',
    pan2_flag: '1',
    which1: '1',
    radio1: '1',
  });

  const hourlyUrl = `${repBaseUrl}N3D1Servlet`;
  console.log('[TV] Fetching hourly sales (POST):', hourlyUrl);

  // 昨日・翌日の日付を計算
  const jstYesterday = new Date(jstNow.getTime() - 24 * 60 * 60 * 1000);
  const yyyyy = jstYesterday.getUTCFullYear();
  const ymm = String(jstYesterday.getUTCMonth() + 1).padStart(2, '0');
  const ydd = String(jstYesterday.getUTCDate()).padStart(2, '0');
  const yesterdayStr = `${yyyyy}/${ymm}/${ydd}`;

  const jstTomorrow = new Date(jstNow.getTime() + 24 * 60 * 60 * 1000);
  const tyyyy = jstTomorrow.getUTCFullYear();
  const tmm = String(jstTomorrow.getUTCMonth() + 1).padStart(2, '0');
  const tdd = String(jstTomorrow.getUTCDate()).padStart(2, '0');
  const tomorrowStr = `${tyyyy}/${tmm}/${tdd}`;

  // ===== 高速化：今日・昨日・翌日のN3D1取得とMainMenuServlet取得を並行実行 =====
  const fetchN3D1 = (dateStr, slot1 = '8', slot2 = '23') => fetch(hourlyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': repBaseUrl,
    },
    body: makePostBody(dateStr, slot1, slot2).toString(),
  });

  const startTime = Date.now();
  // ===== 高速化：N3D1取得・MainMenuServlet・N341取得を全て同時並行実行 =====
  const [hourlyRes, yesterdayRes, tomorrowRes, updateTimes, todayRegijimeMap, tomorrowRegijimeMap] = await Promise.all([
    fetchN3D1(todayStr),
    fetchN3D1(yesterdayStr),
    fetchN3D1(tomorrowStr, '8', '23'),
    fetchStoreUpdateTimes(cookies),
    fetchRegijimeStartHours(cookies, repBaseUrl, todayStr, false),
    fetchRegijimeStartHours(cookies, repBaseUrl, tomorrowStr, true),
  ]);
  console.log(`[TV] 全並行取得完了: ${Date.now() - startTime}ms`);

  // TempoVisorのHTMLはShift-JIS（cp932）エンコーディング
  console.log('[TV] HTTP status:', hourlyRes.status, hourlyRes.statusText);
  const [hourlyBuffer, yesterdayBuffer, tomorrowBuffer] = await Promise.all([
    hourlyRes.arrayBuffer(),
    yesterdayRes.arrayBuffer(),
    tomorrowRes.arrayBuffer(),
  ]);
  const hourlyHtml = iconv.decode(Buffer.from(hourlyBuffer), 'cp932');
  const yesterdayHtml = iconv.decode(Buffer.from(yesterdayBuffer), 'cp932');
  const tomorrowHtml = iconv.decode(Buffer.from(tomorrowBuffer), 'cp932');
  console.log('[TV] HTML length:', hourlyHtml.length);
  console.log('[TV] Yesterday HTML length:', yesterdayHtml.length);

  const $hourly = cheerio.load(hourlyHtml);
  const tableCount = $hourly('table').length;
  console.log('[TV] Total tables found:', tableCount);

  const storeHourly = {};
  const storeSales = [];

  // 全テーブルを検索して、店舗名と時間帯売上を含むテーブルを特定
  $hourly('table').each((tableIdx, table) => {
    const rows = $hourly(table).find('tr').toArray();
    if (rows.length < 2) return;

    // ヘッダー行を確認（「店舗名」と時間帯を含む行）
    const headerCells = $hourly(rows[0]).find('td,th').toArray();
    if (headerCells.length < 3) return;

    const firstHeaderText = $hourly(headerCells[0]).text().trim();
    const secondHeaderText = headerCells.length > 1 ? $hourly(headerCells[1]).text().trim() : '';

    // デバッグ: nlistテーブルのヘッダーテキストをログ出力
    const tableClass = $hourly(table).attr('class') || '';
    if (tableClass.includes('nlist') || secondHeaderText.includes(':00')) {
      console.log(`[TV] Table ${tableIdx} class="${tableClass}" firstHeader="${firstHeaderText}" (len=${firstHeaderText.length}) secondHeader="${secondHeaderText}"`);
      // 文字コードデバッグ: 各文字のコードポイントを出力
      const codePoints = [...firstHeaderText].map(c => c.codePointAt(0).toString(16)).join(',');
      console.log(`[TV] firstHeader codepoints: ${codePoints}`);
    }

    // 「店舗名」ヘッダーを持つテーブルのみ処理（合計テーブルは除外）
    // Table 0（合計テーブル）: firstHeaderText='' → 除外
    // Table 1（店舗テーブル）: firstHeaderText='店舗名' → 処理対象
    // 文字コード問題に対応するため、secondHeaderが時間帯かつfirstHeaderが空でない場合も対象とする
    const isHourlyTable = firstHeaderText === '店舗名' || 
      (firstHeaderText.length > 0 && firstHeaderText !== '合計' && secondHeaderText.match(/\d{1,2}:00/));

    if (!isHourlyTable) return;

    // ヘッダーから時間帯を取得
    const hourColumns = [];
    let totalColIndex = -1;
    headerCells.forEach((cell, idx) => {
      if (idx === 0) return; // 店舗名列をスキップ
      const cellText = $hourly(cell).text().trim();
      const hourMatch = cellText.match(/^(\d{1,2})[:：]/);
      if (hourMatch) {
        hourColumns.push({ colIndex: idx, hour: parseInt(hourMatch[1]) });
      } else if (cellText === '合計' || cellText === '計') {
        totalColIndex = idx;
      }
    });

    if (hourColumns.length === 0) return;

    console.log(`[TV] Found hourly table ${tableIdx}: ${hourColumns.length} hour columns, totalCol: ${totalColIndex}`);

    // データ行を解析
    for (let r = 1; r < rows.length; r++) {
      const cells = $hourly(rows[r]).find('td,th').toArray();
      if (cells.length < 2) continue;

      const storeName = $hourly(cells[0]).text().trim();
      if (!storeName || !TEMPOVISOR_STORE_CODES[storeName]) continue;

      // 時間別売上を取得
      const hourly = {};
      hourColumns.forEach(({ colIndex, hour }) => {
        if (colIndex >= cells.length) return;
        const salesText = $hourly(cells[colIndex]).text().trim()
          .replace(/[\\¥,]/g, '')  // バックスラッシュ・円記号・カンマを除去
          .replace(/[^\d-]/g, ''); // 数字とマイナス以外を除去
        const sales = parseInt(salesText) || 0;
        hourly[hour] = sales;
      });

      // 合計（日次売上）を取得
      let todaySales = 0;
      if (totalColIndex >= 0 && totalColIndex < cells.length) {
        const totalText = $hourly(cells[totalColIndex]).text().trim()
          .replace(/[\\¥,]/g, '')
          .replace(/[^\d-]/g, '');
        todaySales = parseInt(totalText) || 0;
      } else {
        // 合計列がない場合は時間別売上の合計を計算
        todaySales = Object.values(hourly).reduce((sum, v) => sum + v, 0);
      }

      storeHourly[storeName] = hourly;
      storeSales.push({
        store_name: storeName,
        store_code: TEMPOVISOR_STORE_CODES[storeName],
        today_sales: todaySales,
        monthly_sales: 0,
        update_time: updateTimes[storeName] || '',
      });

      console.log(`[TV] ${storeName}: today_sales=${todaySales}, hourly_keys=${Object.keys(hourly).length}`);
    }
  });

  // ============================================================
  // 前日データを解析（N341除外ロジックの前に実行する必要がある）
  // ============================================================
  const yesterdayStores = [];
  const yesterdayHourly = {};
  const $yesterday = cheerio.load(yesterdayHtml);
  $yesterday('table').each((tableIdx, table) => {
    const rows = $yesterday(table).find('tr').toArray();
    if (rows.length < 2) return;
    const headerCells = $yesterday(rows[0]).find('td,th').toArray();
    if (headerCells.length < 3) return;
    const firstHeaderText = $yesterday(headerCells[0]).text().trim();
    const secondHeaderText = headerCells.length > 1 ? $yesterday(headerCells[1]).text().trim() : '';
    const isHourlyTable = firstHeaderText === '店舗名' ||
      (firstHeaderText.length > 0 && firstHeaderText !== '合計' && secondHeaderText.match(/\d{1,2}:00/));
    if (!isHourlyTable) return;

    const hourColumns = [];
    let totalColIndex = -1;
    headerCells.forEach((cell, idx) => {
      if (idx === 0) return;
      const cellText = $yesterday(cell).text().trim();
      const hourMatch = cellText.match(/^(\d{1,2})[::]/); // 半角・全角コロン対応
      if (hourMatch) hourColumns.push({ colIndex: idx, hour: parseInt(hourMatch[1]) });
      else if (cellText === '合計' || cellText === '計') totalColIndex = idx;
    });
    if (hourColumns.length === 0) return;

    for (let r = 1; r < rows.length; r++) {
      const cells = $yesterday(rows[r]).find('td,th').toArray();
      if (cells.length < 2) continue;
      const storeName = $yesterday(cells[0]).text().trim();
      if (!storeName || !TEMPOVISOR_STORE_CODES[storeName]) continue;

      const hourly = {};
      hourColumns.forEach(({ colIndex, hour }) => {
        if (colIndex >= cells.length) return;
        const salesText = $yesterday(cells[colIndex]).text().trim()
          .replace(/[\\¥,]/g, '')
          .replace(/[^\d-]/g, '');
        hourly[hour] = parseInt(salesText) || 0;
      });

      let ySales = 0;
      if (totalColIndex >= 0 && totalColIndex < cells.length) {
        const totalText = $yesterday(cells[totalColIndex]).text().trim()
          .replace(/[\\¥,]/g, '')
          .replace(/[^\d-]/g, '');
        ySales = parseInt(totalText) || 0;
      } else {
        ySales = Object.values(hourly).reduce((sum, v) => sum + v, 0);
      }

      yesterdayHourly[storeName] = hourly;
      yesterdayStores.push({
        store_name: storeName,
        store_code: TEMPOVISOR_STORE_CODES[storeName],
        today_sales: ySales,
        monthly_sales: 0,
        update_time: updateTimes[storeName] || '',
      });
    }
  });
  console.log(`[TV] Yesterday stores parsed: ${yesterdayStores.length}`);

  // ============================================================
  // N341Servletから当日・翌日のレジ締め時間帯を取得
  // （todayRegijimeMap・tomorrowRegijimeMapは上部の並行実行で既に取得済み）
  // ============================================================

  // ============================================================
  // 「今日の売上」から「前日レジ締め後分」を除外
  // 
  // TempoVisorの今日（3/2）データには、前日（3/1）のレジ締め後分が混在している
  // 例：3/2のN341に 16:55、17:17、18:45（前日分）、その後 9:25（本日分）が記録されている
  // N341のHTMLは出現順に並んでいるので、「最初の伝票時刻（9:25）より前に出現した時間帯」が前日分
  // → todayRegijimeMap[storeName] = Set{16, 17, 18} 形式で除外すべき時間帯のセットを取得済み
  // 
  // N341が取得できなかった店舗は、現在時刻より後の時間帯を除外（カバーリング）
  // ============================================================
  
  // 現在時刻（日本時間）
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentHourJST = nowJST.getUTCHours();
  const currentMinutesJST = nowJST.getUTCHours() * 60 + nowJST.getUTCMinutes();
  
  for (const storeName of Object.keys(storeHourly)) {
    if (!storeHourly[storeName]) continue;
    const saleEntry = storeSales.find(s => s.store_name === storeName);
    const storeData = todayRegijimeMap[storeName];
    
    // N341からレジ締めデータを取得
    if (storeData && storeData.hasData && storeData.afterSalesTotal > 0) {
      // N341から直接集計したレジ締め後金額を除外
      // 除外時間帯（時単位）の売上を昨日に補完し、今日の売上から除外
      const excludeHours = storeData.excludeHours;
      let totalExcluded = 0;
      for (const [hourStr, sales] of Object.entries(storeHourly[storeName])) {
        const hour = parseInt(hourStr);
        if (excludeHours.has(hour) && sales > 0) {
          totalExcluded += sales;
          storeHourly[storeName][hourStr] = 0;
          if (!yesterdayHourly[storeName]) yesterdayHourly[storeName] = {};
          yesterdayHourly[storeName][hourStr] = (yesterdayHourly[storeName][hourStr] || 0) + sales;
          console.log(`[N341] ${storeName}: 前日レジ締め後除外 ${hour}時台 ${sales}円 → 昨日に補完`);
        }
      }
      // N341の直接集計金額とTempoVisor時間帯除外金額の差異を調整
      // （時間帯単位の除外ではレジ締め時刻の分単位誤差が生じるため、N341金額を使用）
      if (saleEntry) {
        // TempoVisor時間帯除外でなく、N341直接集計金額で今日売上を計算
        // 今日売上 = TempoVisor合計 - N341レジ締め後金額
        const correctedSales = Math.max(0, saleEntry.today_sales - storeData.afterSalesTotal);
        console.log(`[N341] ${storeName}: TempoVisor合計=${saleEntry.today_sales}円, N341レジ締め後=${storeData.afterSalesTotal}円, 修正後=${correctedSales}円 (レジ締め=${storeData.regijimeMinutes !== null ? Math.floor(storeData.regijimeMinutes/60)+':'+String(storeData.regijimeMinutes%60).padStart(2,'0') : 'なし'})`);
        saleEntry.today_sales = correctedSales;
      }
    } else {
      // N341が取得できなかった場合は、現在時刻より後の時間帯を除外（カバーリング）
      let totalExcluded = 0;
      for (const [hourStr, sales] of Object.entries(storeHourly[storeName])) {
        const hour = parseInt(hourStr);
        if (hour > currentHourJST && sales > 0) {
          totalExcluded += sales;
          storeHourly[storeName][hourStr] = 0;
          if (!yesterdayHourly[storeName]) yesterdayHourly[storeName] = {};
          yesterdayHourly[storeName][hourStr] = (yesterdayHourly[storeName][hourStr] || 0) + sales;
          console.log(`[N341] ${storeName}: N341未取得 → ${hour}時台 ${sales}円 → 昨日に補完`);
        }
      }
      if (totalExcluded > 0 && saleEntry) {
        saleEntry.today_sales = Math.max(0, saleEntry.today_sales - totalExcluded);
        console.log(`[N341] ${storeName}: N341未取得除外合計=${totalExcluded}円, 修正後today_sales=${saleEntry.today_sales}円`);
      }
    }
  }

  // 昨日の売上合計を再計算（補完後）
  for (const storeName of Object.keys(yesterdayHourly)) {
    const yesterdayEntry = yesterdayStores.find(s => s.store_name === storeName);
    if (yesterdayEntry) {
      yesterdayEntry.today_sales = Object.values(yesterdayHourly[storeName]).reduce((sum, v) => sum + v, 0);
    } else {
      // yesterdayStoresにない店舗（今日のレジ締め後分のみ補完された店舗）は新規追加
      const totalSales = Object.values(yesterdayHourly[storeName]).reduce((sum, v) => sum + v, 0);
      yesterdayStores.push({
        store_name: storeName,
        store_code: TEMPOVISOR_STORE_CODES[storeName],
        today_sales: totalSales,
        monthly_sales: 0,
        update_time: updateTimes[storeName] || '',
      });
    }
  }

  // ============================================================
  // 翌日データを解析して「翌日のレジ締め時間帯以降」を今日分に補完
  // （今日のレジ締め後売上が翌日日付で計上されているため、今日の売上に加算）
  // ============================================================
  const $tomorrow = cheerio.load(tomorrowHtml);
  console.log(`[TV] 翌日HTML length: ${tomorrowHtml.length}, tables: ${$tomorrow('table').length}`);

  // 翌日の時間帯別売上を解析
  const tomorrowHourlyAll = {}; // { storeName: { hour: sales } }
  $tomorrow('table').each((tableIdx, table) => {
    const rows = $tomorrow(table).find('tr').toArray();
    if (rows.length < 2) return;
    const headerCells = $tomorrow(rows[0]).find('td,th').toArray();
    if (headerCells.length < 3) return;
    const firstHeaderText = $tomorrow(headerCells[0]).text().trim();
    const secondHeaderText = headerCells.length > 1 ? $tomorrow(headerCells[1]).text().trim() : '';
    const tableClass = $tomorrow(table).attr('class') || '';
    if (tableClass.includes('nlist') || secondHeaderText.includes(':00')) {
      console.log(`[TV] 翌日 Table ${tableIdx} class="${tableClass}" firstHeader="${firstHeaderText}" secondHeader="${secondHeaderText}"`);
    }
    const isHourlyTable = firstHeaderText === '店舗名' ||
      (firstHeaderText !== '合計' && secondHeaderText.match(/\d{1,2}:00/));
    if (!isHourlyTable) return;

    const hourColumns = [];
    headerCells.forEach((cell, idx) => {
      if (idx === 0) return;
      const cellText = $tomorrow(cell).text().trim();
      const hourMatch = cellText.match(/^(\d{1,2})[:：]/);
      if (hourMatch) hourColumns.push({ colIndex: idx, hour: parseInt(hourMatch[1]) });
    });
    if (hourColumns.length === 0) return;

    for (let r = 1; r < rows.length; r++) {
      const cells = $tomorrow(rows[r]).find('td,th').toArray();
      if (cells.length < 2) continue;
      const storeName = $tomorrow(cells[0]).text().trim();
      if (!storeName || !TEMPOVISOR_STORE_CODES[storeName]) continue;
      if (!tomorrowHourlyAll[storeName]) tomorrowHourlyAll[storeName] = {};
      hourColumns.forEach(({ colIndex, hour: tomorrowHour }) => {
        const salesText = $tomorrow(cells[colIndex]).text().trim()
          .replace(/[\\¥,]/g, '')
          .replace(/[^\d-]/g, '');
        const sales = parseInt(salesText) || 0;
        if (sales > 0) tomorrowHourlyAll[storeName][tomorrowHour] = sales;
      });
    }
  });

  // 翌日N341の「レジ締め後分」を今日分に補完
  //
  // 新方式：N341の伝票金額を直接集計した afterSalesTotal を今日売上に加算
  // （時間帯単位の補完ではレジ締め時刻の分単位誤差が生じるため、N341金額を直接使用）
  //
  // 重要：翌日N341が存在しない場合（今日の閉店前）は補完しない
  //       翌日N341が存在する場合（今日の閉店後）は afterSalesTotal を今日に加算
  for (const storeName of Object.keys(TEMPOVISOR_STORE_CODES)) {
    const tomorrowData = tomorrowRegijimeMap[storeName];
    if (!tomorrowData || !tomorrowData.hasData || tomorrowData.afterSalesTotal <= 0) {
      console.log(`[TV] ${storeName}: 翌日N341データなし → 翌日補完スキップ`);
      continue;
    }
    // 翌日N341のレジ締め後金額を今日売上に加算
    const saleEntry = storeSales.find(s => s.store_name === storeName);
    if (saleEntry) {
      saleEntry.today_sales += tomorrowData.afterSalesTotal;
      console.log(`[TV] ${storeName}: 翌日N341レジ締め後=${tomorrowData.afterSalesTotal}円 → 今日売上に加算 (${saleEntry.today_sales}円) (レジ締め=${tomorrowData.regijimeMinutes !== null ? Math.floor(tomorrowData.regijimeMinutes/60)+':'+String(tomorrowData.regijimeMinutes%60).padStart(2,'0') : 'なし'})`);
    } else {
      // storeSalesにない店舗（今日未営業等）は新規追加
      storeSales.push({
        store_name: storeName,
        store_code: TEMPOVISOR_STORE_CODES[storeName],
        today_sales: tomorrowData.afterSalesTotal,
        monthly_sales: 0,
        update_time: '',
      });
      console.log(`[TV] ${storeName}: 翌日N341レジ締め後=${tomorrowData.afterSalesTotal}円 → 新規追加`);
    }
    // storeHourlyにも翌日N341の除外時間帯を補完（グラフ表示用）
    if (tomorrowData.excludeHours && tomorrowData.excludeHours.size > 0) {
      const tomorrowHourly = tomorrowHourlyAll[storeName] || {};
      for (const [hourStr, sales] of Object.entries(tomorrowHourly)) {
        const hour = parseInt(hourStr);
        if (tomorrowData.excludeHours.has(hour) && sales > 0) {
          if (!storeHourly[storeName]) storeHourly[storeName] = {};
          storeHourly[storeName][hourStr] = (storeHourly[storeName][hourStr] || 0) + sales;
        }
      }
    }
  }

  console.log(`[TV] Total stores parsed: ${storeSales.length}`);
  console.log(`[TV] storeHourly keys: ${Object.keys(storeHourly).join(', ')}`);
  console.log(`[TV] storeSales names: ${storeSales.map(s => s.store_name).join(', ')}`);

  return { stores: storeSales, hourly: storeHourly, yesterdayStores, yesterdayHourly };
}

/**
 * ジョブカンから本日の勤務状況を取得
 * 
 * テーブル列構造（12列）：
 * [0] スタッフ名 + 部署コード + 打刻場所（例: 冨永 純隆 11010 店1018->かがや店）
 * [1] リンク（出入詳細・月次出勤簿）
 * [2] 出勤状況（勤務中/退勤済み/休憩中/未出勤）
 * [3] シフト時間
 * [4] 出勤時刻（シフト形式）
 * [5] 直近退室
 * [6] 出勤打刻時刻（例: 08:48 (08:48)）
 * [7] 退勤打刻時刻（退勤済みの場合）
 * [8] 労働時間（例: 5時間20分）
 * [9] 休憩時間（例: 30分）
 * [10] 概算給与
 * [11] エラー
 */
async function fetchJobcanAttendance(companyId, loginId, password) {
  const loginUrl = 'https://ssl.jobcan.jp/login/client/';

  const getRes = await fetch(loginUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const initialCookies = extractCookies(getRes);
  const loginHtml = await getRes.text();

  const $login = cheerio.load(loginHtml);
  const csrfToken = $login('input[name="token"]').val() || '';

  const loginBody = new URLSearchParams({
    token: csrfToken,
    client_login_id: companyId,
    client_manager_login_id: loginId,
    client_login_password: password,
    url: '/client',
    login_type: '2',
  }).toString();

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

  const loginCookies = extractCookies(loginRes);
  const allCookies = mergeCookies(initialCookies, loginCookies);

  const location = loginRes.headers.get('location') || '';
  if (location.includes('error')) {
    throw new Error(`Jobcan login failed: ${location}`);
  }

  // ===== 勤務状況一覧ページを取得（先に取得してスタッフIDリストを作成）=====
  const workUrl = 'https://ssl.jobcan.jp/client/work-state/show/?submit_type=today&searching=1&list_type=normal&number_par_page=300&retirement=work';
  const workRes = await fetch(workUrl, {
    headers: {
      'Cookie': allCookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://ssl.jobcan.jp/client/',
    },
    redirect: 'follow',
  });

  const workHtml = await workRes.text();
  const $work = cheerio.load(workHtml);

  const storeAttendance = {};
  const employees = [];

  let targetTable = null;
  $work('table').each((i, table) => {
    const headerRow = $work(table).find('tr').first();
    const headerText = headerRow.text();
    if (headerText.includes('スタッフ') && headerText.includes('出勤状況') && headerText.includes('労働時間')) {
      targetTable = table;
    }
  });

  if (!targetTable) {
    throw new Error('Jobcan: Work state table not found');
  }

  const rows = $work(targetTable).find('tr').toArray();

  // ===== 勤務状況ページからスタッフIDリストを収集 =====
  const staffIdList = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    if (cells.length < 10) continue;
    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    if (staffIdMatch) staffIdList.push(staffIdMatch[1]);
  }
  console.log(`[JC] 勤務状況ページからスタッフID: ${staffIdList.length}件`);

  // ===== 出入詳細ページから打刻場所（GPS打刻エリア）を取得 =====
  // 例: 佐藤美咲（所属: 心斎橋店）がアベノ店で打刻した場合、打刻場所=アベノ店を使用する
  // 出入詳細ページの select[id^="change_group_id"] option[selected] のテキストが実際の打刻場所
  const stampPlaceMap = {}; // staffId → 打刻場所コード（5桁）

  const today = new Date();
  const jstToday = new Date(today.getTime() + 9 * 60 * 60 * 1000);

  // 全員同時並行取得（タイムアウト5秒で高速化）
  const fetchWithTimeout = (url, options, timeoutMs = 5000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  const allStampResults = await Promise.allSettled(
    staffIdList.map(async (empId) => {
      const aditUrl = `https://ssl.jobcan.jp/client/adit/?employee_id=${empId}&year=${jstToday.getUTCFullYear()}&month=${jstToday.getUTCMonth() + 1}&day=${jstToday.getUTCDate()}`;
      const aditRes = await fetchWithTimeout(aditUrl, {
        headers: {
          'Cookie': allCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://ssl.jobcan.jp/client/',
        },
        redirect: 'follow',
      }, 5000);
      const aditHtml = await aditRes.text();
      const $adit = cheerio.load(aditHtml);
      let stampCode = null;
      $adit('select[id^="change_group_id"]').each((idx, sel) => {
        if (stampCode) return;
        const selectedOption = $adit(sel).find('option[selected]');
        const targetOption = selectedOption.length > 0 ? selectedOption : $adit(sel).find('option').first();
        if (targetOption.length > 0) {
          const optText = targetOption.text().trim();
          const codeMatch = optText.match(/^(\d{5})/);
          if (codeMatch) stampCode = codeMatch[1];
        }
      });
      return { empId, stampCode };
    })
  );
  for (const result of allStampResults) {
    if (result.status === 'fulfilled' && result.value.stampCode) {
      stampPlaceMap[result.value.empId] = result.value.stampCode;
    }
  }
  console.log(`[JC] 打刻場所マッピング取得: ${Object.keys(stampPlaceMap).length}件`);

  for (let i = 1; i < rows.length; i++) {
    const cells = $work(rows[i]).find('td').toArray();
    // 12列のデータ行のみ処理（2列のシフト詳細行はスキップ）
    if (cells.length < 10) continue;

    const staffCell = $work(cells[0]).text().trim().replace(/\s+/g, ' ');
    if (!staffCell) continue;

    // 部署コードを取得（所属店舗）
    const deptMatch = staffCell.match(/(\d{5})\s/);
    if (!deptMatch) continue;

    const deptCode = deptMatch[1];
    const deptStoreName = STORE_DEPT_MAP[deptCode]; // 所属店舗
    if (!deptStoreName) continue;

    // スタッフ名を取得
    const nameMatch = staffCell.match(/^(.+?)\s*\d{5}/);
    const staffName = nameMatch ? nameMatch[1].replace(/\xa0/g, ' ').trim() : staffCell.split(/\d{5}/)[0].trim();

    // スタッフIDをリンクhrefsから取得（例: /client/edit-employee?employee_id=701 → "701"）
    const staffLink = $work(cells[0]).find('a').attr('href') || '';
    const staffIdMatch = staffLink.match(/employee_id=(\d+)/);
    const staffId = staffIdMatch ? staffIdMatch[1] : null;

    // 打刻場所（GPS打刻エリア）を出入詳細ページのマッピングから取得
    const stampCode = staffId ? stampPlaceMap[staffId] : null;
    const stampStoreName = stampCode ? STORE_DEPT_MAP[stampCode] : null;
    // staffCellの "->店舗名" はシフトグループ名（所属グループ）であり、打刻場所ではない
    const locationMatch = staffCell.match(/->(.+)$/);
    const rawLocation = locationMatch ? locationMatch[1].trim() : null;
    const clockLocation = rawLocation ? (LOCATION_TO_STORE_MAP[rawLocation] || null) : null;
    if (staffId) {
      console.log(`[JC] ${staffName}(id=${staffId}): 所属=${deptStoreName}, 打刻場所=${stampStoreName || 'なし'}(コード:${stampCode || '-'}), GPS打刻=${clockLocation || 'なし'}`);
    }

    // 出勤状況
    const status = $work(cells[2]).text().trim();

    // 出勤打刻時刻：cells[6]の形式は "08:48 (08:48)" → 括弧内が実際の打刻時刻
    const clockInRaw = $work(cells[6]).text().trim().replace(/\s+/g, ' ');
    const clockInBracket = clockInRaw.match(/\((\d{1,2}:\d{2})\)/);
    const clockIn = clockInBracket ? clockInBracket[1] : clockInRaw.match(/^(\d{1,2}:\d{2})/) ? clockInRaw.match(/^(\d{1,2}:\d{2})/)[1] : null;

    // 退勤打刻時刻：cells[7]の形式は "14:08 (14:08)" → 括弧内が実際の打刻時刻
    const clockOutRaw = $work(cells[7]).text().trim().replace(/\s+/g, ' ');
    const clockOutBracket = clockOutRaw.match(/\((\d{1,2}:\d{2})\)/);
    const clockOut = clockOutBracket ? clockOutBracket[1] : clockOutRaw.match(/^(\d{1,2}:\d{2})/) ? clockOutRaw.match(/^(\d{1,2}:\d{2})/)[1] : null;

    // 休憩時間・打刻時間をパース
    const workTimeText = $work(cells[8]).text().trim();
    const breakTimeText = $work(cells[9]).text().trim();
    const breakMinutes = parseJapaneseTime(breakTimeText);

    // 打刻時間をパース（分単位）
    const clockInMinutes = parseTimeToMinutes(clockIn);
    const clockOutMinutes = parseTimeToMinutes(clockOut);

    // リアルタイム勤務時間計算：現在時刻 - 出勤打刻時刻 - 休憩時間
    // ジョブカンの「労働時間」は更新タイミングに依存するため、より正確なリアルタイム計算を使用
    const nowJst = new Date();
    const jstNowMs = nowJst.getTime() + 9 * 60 * 60 * 1000;
    const jstNowDate = new Date(jstNowMs);
    const nowTotalMinutes = jstNowDate.getUTCHours() * 60 + jstNowDate.getUTCMinutes();

    let netMinutes = 0;
    if (status === '勤務中' || status === '休憩中' || status === '退出中') {
      // 勤務中・休憩中・退出中（一時外出）：現在時刻 - 出勤打刻時刻 - 休憩時間（リアルタイム）
      if (clockInMinutes !== null) {
        const elapsedMinutes = Math.max(0, nowTotalMinutes - clockInMinutes);
        netMinutes = Math.max(0, elapsedMinutes - breakMinutes);
      }
    } else if (status === '退勤済み') {
      // 退勤済み：退勤打刻時刻 - 出勤打刻時刻 - 休憩時間
      if (clockInMinutes !== null && clockOutMinutes !== null) {
        const elapsedMinutes = Math.max(0, clockOutMinutes - clockInMinutes);
        netMinutes = Math.max(0, elapsedMinutes - breakMinutes);
      } else {
        // 打刻データがない場合はジョブカンの労働時間テキストを使用
        const workMinutes = parseJapaneseTime(workTimeText);
        netMinutes = Math.max(0, workMinutes - breakMinutes);
      }
    }
    const netHours = parseFloat((netMinutes / 60).toFixed(2));

    // 栲り分け先の店舗を決定
    // 優先順位: 打刻場所（出入詳細ページのGPS打刻エリア）> 所属部署コード
    // 打刻場所 = 実際に打刻した場所（ヘルプ対応や所属外店舗での勤務に対応）
    let assignedStore = stampStoreName || deptStoreName;

    const employee = {
      name: staffName,
      dept_code: deptCode,
      dept_store_name: deptStoreName,   // 所属店舗
      store_name: assignedStore,         // 振り分け先店舗（打刻場所優先）
      clock_location: clockLocation,     // 打刻場所
      status: status,
      clock_in: clockIn || null,
      clock_out: (status === '退勤済み') ? (clockOut || null) : null,  // 退勤済みのみ退勤時刻
      break_start: (status === '退出中') ? (clockOut || null) : null,  // 退出中は休憩開始時刻
      had_break: breakMinutes > 0,  // 休憩実績があるか（勤務中に戻った後も休憩ログを表示するため）
      clock_in_minutes: clockInMinutes,   // 分単位（例: 10:30 → 630）
      clock_out_minutes: clockOutMinutes, // 分単位（退勤済みの場合）
      work_hours: netHours,
      break_minutes: breakMinutes,        // 休憩時間（分）
      work_time_text: workTimeText,
      break_time_text: breakTimeText,
    };

    employees.push(employee);

    // 振り分け先店舗に集計
    if (!storeAttendance[assignedStore]) {
      storeAttendance[assignedStore] = {
        store_name: assignedStore,
        total_employees: 0,
        attended_employees: 0,
        working_employees: 0,
        break_employees: 0,
        total_hours: 0,
        employees: [],
      };
    }

    const store = storeAttendance[assignedStore];
    store.total_employees++;

    if (status === '勤務中' || status === '退勤済み' || status === '休憩中' || status === '退出中') {
      store.attended_employees++;
      store.total_hours += netHours;
    }
    if (status === '勤務中') {
      store.working_employees++;
    }
    if (status === '休憩中' || status === '退出中') {
      // 退出中（一時外出・休憩）は休憩中と同等に扱う
      store.break_employees++;
    }

    store.employees.push(employee);
  }

  Object.values(storeAttendance).forEach(store => {
    store.total_hours = parseFloat(store.total_hours.toFixed(1));
  });

  return { stores: storeAttendance, employees };
}

/**
 * 売上データ・時間別売上・勤怠データを統合
 * 時間帯別人時生産性を計算して返す
 */
function mergeStoreData(sales, hourlyData, attendance, storeSettings = {}, yesterdaySales = [], yesterdayHourlyData = {}) {
  // 現在の日本時間（Vercel環境はUTCなのでgetUTCHours/getUTCMinutesを使用）
  const now = new Date();
  // UTC時刻に9時間を加算してJST時刻を表すDateオブジェクトを作成
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentHour = jstNow.getUTCHours();
  const currentMinutes = jstNow.getUTCHours() * 60 + jstNow.getUTCMinutes();
  const jstDayOfWeek = jstNow.getUTCDay(); // 0=日曜, 1=月曜, ..., 6=土曜
  const jstDateStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`;

  return ALL_STORES.map(storeName => {
    const todaySalesInfo = sales.find(s => s.store_name === storeName);
    const attendInfo = attendance[storeName] || {
      store_name: storeName,
      total_employees: 0,
      working_employees: 0,
      break_employees: 0,
      attended_employees: 0,
      total_hours: 0,
      employees: [],
    };

    const storeEmployees = attendInfo.employees || [];

    // 本日の営業時間を取得（Supabase設定優先、なければデフォルト）
    const businessHours = getBusinessHoursForToday(storeName, storeSettings, jstDayOfWeek);

    // 臨時休業日チェック
    const isClosed = businessHours.is_closed || isTemporaryClosure(storeName, storeSettings, jstDateStr);

    // ============================================================
    // 3時間帯判定ロジック
    // 
    // 各店舗の最初の出勤打刻・最後の退勤打刻を基に3時間帯を判定する：
    // 
    // 「営業前」（0:00 〜 最初の出勤）:
    //   昨日の売上を表示
    //   （昨日の開店時間〜今日のレジ締め時間までの売上＋今日のレジ締め時間〜今日の閉店時間までの売上）
    //   → yesterdayHourlyData を使用（除外・補完済み）
    // 
    // 「営業中」（最初の出勤 〜 最後の退勤）および「営業後」（最後の退勤 〜 0:00）:
    //   今日の売上を表示
    //   （今日の開店時間〜翌日のレジ締め時間までの売上＋翌日のレジ締め時間〜翌日の閉店時間までの売上）
    //   → hourlyData を使用（除外・補完済み）
    // ============================================================

    // 各店舗の最初の出勤時刻と最後の退勤時刻を取得
    const allEmployeesForStore = storeEmployees.filter(
      emp => emp.status === '勤務中' || emp.status === '退勤済み' || emp.status === '休憩中' || emp.status === '退出中'
    );
    const clockInMinutesList = allEmployeesForStore
      .map(emp => emp.clock_in_minutes)
      .filter(m => m !== null && m !== undefined);
    const clockOutMinutesList = allEmployeesForStore
      .filter(emp => emp.status === '退勤済み' && emp.clock_out_minutes !== null)
      .map(emp => emp.clock_out_minutes);

    // 店舗の最初の出勤時刻（分単位）
    const firstClockInMinutes = clockInMinutesList.length > 0 ? Math.min(...clockInMinutesList) : null;
    // 店舗の最後の退勤時刻（分単位）
    const lastClockOutMinutes = clockOutMinutesList.length > 0 ? Math.max(...clockOutMinutesList) : null;

    // 現在時刻（分単位）
    const nowMinutes = currentMinutes;

    // 時間帯判定：
    // - 営業前：最初の出勤がない（または現在時刻が最初の出勤前）
    // - 営業中：最初の出勤があり、まだ最後の退勤後でない
    //   （退勤時刻がない場合も含む = 勤務中・休憩中のスタッフがいる）
    // - 営業後：最後の退勤後（全員退勤済み）
    const hasWorkingStaff = allEmployeesForStore.some(
      emp => emp.status === '勤務中' || emp.status === '休憩中' || emp.status === '退出中'
    );
    const isBeforeOpen = firstClockInMinutes === null || nowMinutes < firstClockInMinutes;
    const isAfterClose = !hasWorkingStaff && lastClockOutMinutes !== null && nowMinutes > lastClockOutMinutes;
    const isDuringBusiness = !isBeforeOpen && !isAfterClose;

    // 売上データの選択：
    // - 営業前：昨日の売上（yesterdayHourlyData）
    // - 営業中・営業後：今日の売上（hourlyData）
    const useYesterday = isBeforeOpen;

    console.log(`[mergeStoreData] ${storeName}: 現在=${nowMinutes}分, 最初出勤=${firstClockInMinutes}分, 最後退勤=${lastClockOutMinutes}分, 営業中=${hasWorkingStaff}, 時間帯=${isBeforeOpen ? '営業前' : isAfterClose ? '営業後' : '営業中'}, useYesterday=${useYesterday}`);

    const salesInfo = useYesterday
      ? (yesterdaySales.find(s => s.store_name === storeName) || {
          store_code: TEMPOVISOR_STORE_CODES[storeName] || '',
          store_name: storeName,
          today_sales: 0,
          monthly_sales: 0,
          update_time: '',
        })
      : (todaySalesInfo || {
          store_code: TEMPOVISOR_STORE_CODES[storeName] || '',
          store_name: storeName,
          today_sales: 0,
          monthly_sales: 0,
          update_time: '',
        });

    const hourly = useYesterday
      ? (yesterdayHourlyData[storeName] || {})
      : (hourlyData[storeName] || {});

    // 時間帯別人時生産性を計算
    const hourlyProductivity = isClosed ? [] : calculateHourlyProductivity(
      storeEmployees,
      hourly,
      businessHours,
      currentHour,
      currentMinutes
    );

    const todaySales = salesInfo.today_sales || 0;

    // ヘッダーの人時数・人時生産性を時間帯別データと統一する
    // attendInfo.total_hours は小数点1桁に丸めた値のため、
    // 時間帯別テーブルの person_hours 合計と0.1単位の誤差が生じる。
    // → hourlyProductivity の person_hours を合計して統一した値を使用する。
    const totalHoursFromHourly = hourlyProductivity.reduce((sum, h) => sum + (h.person_hours || 0), 0);
    // 小数点1桁に丸めてヘッダー表示用に使用
    const totalHours = parseFloat(totalHoursFromHourly.toFixed(1));
    // 人時生産性はhourlyの合計人時数（丸めなし）で割って正確に計算
    const productivity = totalHoursFromHourly > 0 ? Math.round(todaySales / totalHoursFromHourly) : 0;

    return {
      tenpo_name: storeName,
      code: salesInfo.store_code || TEMPOVISOR_STORE_CODES[storeName] || '',
      kingaku: todaySales.toString(),
      monthly_sales: salesInfo.monthly_sales || 0,
      wk_cnt: attendInfo.attended_employees || attendInfo.working_employees || 0,
      working_now: attendInfo.working_employees || 0,
      break_now: attendInfo.break_employees || 0,
      total_employees: attendInfo.total_employees,
      wk_tm: totalHours,
      spd: productivity.toString(),
      update_time: salesInfo.update_time || '',
      employees: storeEmployees,
      hourly_productivity: hourlyProductivity,  // 時間帯別人時生産性
      business_hours: businessHours,
      is_closed: isClosed,
      is_yesterday_data: useYesterday,  // 前日データを使用中かどうか（フロントエンド表示用）
      time_zone: isBeforeOpen ? 'before_open' : isAfterClose ? 'after_close' : 'during_business',  // 時間帯判定結果
      first_clock_in: firstClockInMinutes,   // 最初の出勤時刻（分単位）
      last_clock_out: lastClockOutMinutes,   // 最後の退勤時刻（分単位）
    };
  });
}

/**
 * 時間帯別人時生産性を計算
 * 
 * 休憩中スタッフの扱い：
 * - 休憩中ステータスは「勤務中」と同様に扱う
 * - 休憩時間帯は人時から除外（ただし休憩開始・終了時刻が不明なため、
 *   現状は休憩中も含めて計算し、break_minutesを按分して除外）
 * 
 * @param {Array} employees - スタッフ一覧（打刻時間付き）
 * @param {Object} hourly - 時間別売上 { '10': 36756, '11': 48108, ... }
 * @param {Object} businessHours - 営業時間 { open: 10, close: 18 }
 * @param {number} currentHour - 現在時刻（時）
 * @param {number} currentMinutes - 現在時刻（分単位）
 * @returns {Array} 時間帯別データ配列
 */
function calculateHourlyProductivity(employees, hourly, businessHours, currentHour, currentMinutes) {
  const result = [];

  // 対象時間帯を決定：営業時間 + 売上がある時間帯（動的拡張）
  const salesHours = Object.keys(hourly).map(h => parseInt(h)).filter(h => !isNaN(h) && hourly[h] > 0);
  const minHour = Math.min(businessHours.open, ...salesHours);
  const maxHour = Math.max(businessHours.close - 1, ...salesHours);

  // salesHoursが空の場合（salesHoursが[]）、スプレッドで Infinity/-Infinity になるため修正
  const safeMinHour = isFinite(minHour) ? minHour : businessHours.open;
  const rawMaxHour = isFinite(maxHour) ? maxHour : businessHours.close - 1;

  // 表示する最大時間帯を決定：
  // - 通常：現在時刻の時間帯まで表示（現在進行中のスロットまで）
  // - レジ締め補完データがある場合：閉店後の補完データも表示するため、
  //   rawMaxHour（売上がある最大時間帯）と currentHour の大きい方を採用
  // これにより、レジ締め後に翌日データから補完された閉店後の売上も表示される
  const safeMaxHour = Math.max(currentHour, rawMaxHour);

  for (let hour = safeMinHour; hour <= safeMaxHour; hour++) {
    // この時間帯が営業時間内かどうか
    const isBusinessHour = hour >= businessHours.open && hour < businessHours.close;

    // 営業時間外かつ売上もない時間帯はスキップ
    // ただし現在進行中の時間帯（hour === currentHour）は必ず表示
    if (hour !== currentHour && !isBusinessHour && (hourly[hour] === undefined || hourly[hour] === 0)) {
      continue;
    }

    // この時間帯（hour:00 〜 hour+1:00）に在籍していた人時数を計算
    const slotStartMinutes = hour * 60;
    const slotEndMinutes = (hour + 1) * 60;

    // 現在時刻より未来の時間帯は、売上データがなければスキップ
    // slotEndMinutes > currentMinutes: スロットがまだ終わっていない（現在時刻がスロット内 or 未来）
    const isFutureSlot = slotEndMinutes > currentMinutes;
    if (isFutureSlot && slotStartMinutes >= currentMinutes && (hourly[hour] === undefined || hourly[hour] === 0)) {
      continue;
    }

    let personHours = 0;

    employees.forEach(emp => {
      // 勤務中・退勤済み・休憩中・退出中のスタッフを対象とする
      if (emp.status !== '勤務中' && emp.status !== '退勤済み' && emp.status !== '休憩中' && emp.status !== '退出中') return;
      if (emp.clock_in_minutes === null || emp.clock_in_minutes === undefined) return;

      const empStart = emp.clock_in_minutes;

      // 終了時刻の決定
      // - 退勤済み：退勤打刻時刻
      // - 勤務中・休憩中：現在時刻（未来スロットの場合はスロット終了時刻）
      const effectiveCurrentMinutes = isFutureSlot ? slotEndMinutes : currentMinutes;
      const empEnd = (emp.status === '退勤済み') && emp.clock_out_minutes
        ? emp.clock_out_minutes
        : effectiveCurrentMinutes;
      // 退出中（一時外出）は休憩中と同様に現在時刻まで在籍として扱う

      // この時間帯との重複時間（分）を計算
      const overlapStart = Math.max(empStart, slotStartMinutes);
      const overlapEnd = Math.min(empEnd, slotEndMinutes);
      const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

      if (overlapMinutes <= 0) return;

      // 休憩時間の除外
      // ジョブカンは休憩開始・終了時刻を提供しないため、以下の方針で除外する：
      //
      // 「休憩中」ステータスの場合：
      //   現在進行中のスロット（isFutureSlot=true）にいる場合は人時に含めない
      //   過去のスロットは通常通り計算（その時間帯は勤務していたはず）
      //
      // 「退勤済み」・「勤務中」ステータスの場合：
      //   休憩時間は「退勤時刻（または現在時刻）が含まれる時間帯」から集中除外する。
      //   これにより、最初の時間帯ではなく最後の時間帯から休憩分が引かれる。
      //   例：10:00〜18:00勤務、休憩60分 → 17:00〜18:00の時間帯から60分除外
      let adjustedOverlapMinutes = overlapMinutes;

      if ((emp.status === '休憩中' || emp.status === '退出中') && isFutureSlot) {
        // 休憩中・退出中ステータスかつ現在進行中のスロット：人時に含めない
        adjustedOverlapMinutes = 0;
      } else if (emp.break_minutes > 0) {
        // 休憩時間を「退勤時刻（または現在時刻）が含まれる時間帯」から集中除外
        // empEnd が含まれる時間帯のスロット = Math.floor(empEnd / 60) 時台
        const breakSlotHour = Math.floor((empEnd - 1) / 60); // empEnd-1 で境界値を調整
        if (hour === breakSlotHour) {
          // このスロットが「休憩除外スロット」：休憩時間分を除外
          const breakDeduction = Math.min(adjustedOverlapMinutes, emp.break_minutes);
          adjustedOverlapMinutes = Math.max(0, adjustedOverlapMinutes - breakDeduction);
        }
        // それ以外のスロットは按分なし（overlapMinutes そのまま）
      }

      personHours += adjustedOverlapMinutes / 60;
    });

    const hourlySales = hourly[hour] !== undefined ? hourly[hour] : 0;

    // 閉店後の時間帯（補完データがある場合）は、閉店直前の時間帯の人時生産性をそのまま使用する
    // 閉店後はスタッフが退勤済みのため人時が0になるが、
    // 売上効率の参考値として閉店直前の人時生産性（円/人時）を引き継ぐ
    const isAfterClose = hour >= businessHours.close;
    let finalPersonHours = personHours;
    let hourlyProductivityValue;

    if (isAfterClose && hourlySales > 0) {
      // 閉店直前の時間帯（businessHours.close - 1）の人時生産性を取得
      const lastBusinessSlot = result.findLast(r => r.is_business_hour);
      if (lastBusinessSlot && lastBusinessSlot.person_hours > 0) {
        // 閉店直前の人時生産性（円/人時）を使って、補完売上から逆算した人時を算出
        finalPersonHours = lastBusinessSlot.person_hours;
        hourlyProductivityValue = Math.round(hourlySales / finalPersonHours);
      } else {
        hourlyProductivityValue = 0;
      }
    } else {
      hourlyProductivityValue = personHours > 0 ? Math.round(hourlySales / personHours) : 0;
    }

    result.push({
      hour,
      label: `${hour}:00〜${hour + 1}:00`,
      sales: hourlySales,
      person_hours: parseFloat(finalPersonHours.toFixed(2)),
      productivity: hourlyProductivityValue,
      is_business_hour: isBusinessHour,
    });
  }

  return result;
}

/**
 * 時刻文字列（HH:MM）を分単位に変換
 * @param {string} timeStr - "10:30" 形式
 * @returns {number|null} 分単位（例: 630）、解析できない場合はnull
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '') return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/**
 * レスポンスからSet-CookieヘッダーをCookie文字列として抽出
 */
function extractCookies(response) {
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

  const cookies = [];
  const parts = raw.split(/,(?=[^;]+=)/);
  parts.forEach(part => {
    const cookiePart = part.trim().split(';')[0].trim();
    if (cookiePart.includes('=')) {
      cookies.push(cookiePart);
    }
  });

  return cookies.join('; ');
}

/**
 * 既存のCookieと新しいCookieをマージ
 */
function mergeCookies(existing, newCookies) {
  if (!existing && !newCookies) return '';
  if (!existing) return newCookies;
  if (!newCookies) return existing;

  const cookieMap = {};

  const parseCookieStr = (str) => {
    str.split(';').forEach(c => {
      const idx = c.indexOf('=');
      if (idx > 0) {
        const key = c.substring(0, idx).trim();
        const val = c.substring(idx + 1).trim();
        if (key) cookieMap[key] = val;
      }
    });
  };

  parseCookieStr(existing);
  parseCookieStr(newCookies);

  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * 日本語の時間表記（例: "9時間0分"）を分に変換
 */
function parseJapaneseTime(timeText) {
  if (!timeText || timeText === '-') return 0;

  const hoursMatch = timeText.match(/(\d+)時間/);
  const minutesMatch = timeText.match(/(\d+)分/);

  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;

  if (!hoursMatch && !minutesMatch) {
    const colonMatch = timeText.match(/(\d+):(\d+)/);
    if (colonMatch) {
      return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
    }
  }

  return hours * 60 + minutes;
}

export const config = {
  maxDuration: 60,
};
