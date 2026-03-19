// このファイルの内容をrealtime.jsの255行目（fetchStoreSettings関数の後）に挿入する

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

    if (emp.status === '勤務中' || emp.status === '退勤済み' || emp.status === '休憩中') {
      store.attended_employees++;
      store.total_hours += emp.work_hours || 0;
    }
    if (emp.status === '勤務中') store.working_employees++;
    if (emp.status === '休憩中') store.break_employees++;
  });

  // total_hoursを小数点1桁に丸める
  Object.values(rebuilt).forEach(store => {
    store.total_hours = parseFloat(store.total_hours.toFixed(1));
  });

  return rebuilt;
}
