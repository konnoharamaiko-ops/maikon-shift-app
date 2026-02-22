import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Save, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { fetchFiltered, updateRecord } from '@/api/supabaseHelpers';
import { useAuth } from '@/lib/AuthContext';

const DAYS = [
  { key: 'monday', label: '月曜日' },
  { key: 'tuesday', label: '火曜日' },
  { key: 'wednesday', label: '水曜日' },
  { key: 'thursday', label: '木曜日' },
  { key: 'friday', label: '金曜日' },
  { key: 'saturday', label: '土曜日' },
  { key: 'sunday', label: '日曜日' },
];

// Helper to migrate old format to new format
function migrateSettings(settings) {
  if (!settings) return {};
  const migrated = {};
  DAYS.forEach(day => {
    const old = settings[day.key];
    if (!old) {
      migrated[day.key] = { enabled: false, week_settings: {} };
      return;
    }
    if (old.week_settings) {
      migrated[day.key] = old;
      return;
    }
    const weeks = old.weeks || [1, 2, 3, 4, 5];
    const weekSettings = {};
    weeks.forEach(w => {
      weekSettings[w] = {
        is_day_off: old.is_day_off || false,
        is_negotiable_if_needed: old.is_negotiable_if_needed || false,
        start_time: old.start_time || '09:00',
        end_time: old.end_time || '18:00',
        notes: old.notes || ''
      };
    });
    migrated[day.key] = {
      enabled: old.enabled || false,
      week_settings: weekSettings
    };
  });
  return migrated;
}

export default function DefaultShiftSettings({ user, isAdminEdit = false }) {
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  const [shiftSettings, setShiftSettings] = useState({});
  const [expandedDays, setExpandedDays] = useState({});

  useEffect(() => {
    if (user?.default_shift_settings) {
      setShiftSettings(migrateSettings(user.default_shift_settings));
    } else {
      const defaultSettings = {};
      DAYS.forEach(day => {
        defaultSettings[day.key] = {
          enabled: false,
          week_settings: {}
        };
      });
      setShiftSettings(defaultSettings);
    }
  }, [user]);

  const convertToLegacyFormat = (settings) => {
    const legacy = {};
    DAYS.forEach(day => {
      const daySetting = settings[day.key];
      if (!daySetting) return;
      const weekSettings = daySetting.week_settings || {};
      const weeks = Object.keys(weekSettings).map(Number).sort();
      const firstWeek = weekSettings[weeks[0]];
      legacy[day.key] = {
        enabled: daySetting.enabled,
        is_day_off: firstWeek?.is_day_off || false,
        is_negotiable_if_needed: firstWeek?.is_negotiable_if_needed || false,
        start_time: firstWeek?.start_time || '09:00',
        end_time: firstWeek?.end_time || '18:00',
        notes: firstWeek?.notes || '',
        weeks: weeks,
        week_settings: weekSettings
      };
    });
    return legacy;
  };

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      const userId = user?.id;
      if (!userId) throw new Error('ユーザーIDが見つかりません');
      await updateRecord('User', userId, data);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = format(today, 'yyyy-MM-dd');
      
      const futureShifts = await fetchFiltered('ShiftRequest', {
        created_by: user?.email
      });
      
      const shiftsToUpdate = futureShifts.filter(shift => shift.date >= todayStr);
      
      const dayMap = {
        0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
      };
      
      for (const shift of shiftsToUpdate) {
        const shiftDate = new Date(shift.date);
        const dayOfWeek = shiftDate.getDay();
        const dayKey = dayMap[dayOfWeek];
        const firstDayOfMonth = new Date(shiftDate.getFullYear(), shiftDate.getMonth(), 1);
        const firstDayOfWeek = firstDayOfMonth.getDay();
        const adjustedDate = shiftDate.getDate() + firstDayOfWeek;
        const weekOfMonth = Math.ceil(adjustedDate / 7);
        
        const defaultShift = data.default_shift_settings?.[dayKey];
        
        if (defaultShift?.enabled) {
          const weekSettings = defaultShift.week_settings || {};
          const weekSetting = weekSettings[weekOfMonth];
          
          if (weekSetting) {
            await updateRecord('ShiftRequest', shift.id, {
              start_time: weekSetting.is_day_off ? null : weekSetting.start_time,
              end_time: weekSetting.is_day_off ? null : weekSetting.end_time,
              notes: weekSetting.notes || shift.notes,
              is_day_off: weekSetting.is_day_off || false,
              is_negotiable_if_needed: weekSetting.is_negotiable_if_needed || false
            });
          }
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['targetUser'] });
      await queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      await queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      
      if (!isAdminEdit) {
        await refreshProfile();
      }
      
      toast.success('基本シフト設定を保存しました。シフト希望画面で自動的に反映されます。');
    },
    onError: (error) => {
      toast.error('基本シフト設定の保存に失敗しました: ' + error.message);
    },
  });

  const handleSave = () => {
    const saveData = convertToLegacyFormat(shiftSettings);
    updateUserMutation.mutate({ default_shift_settings: saveData });
  };

  const handleDayToggle = (dayKey, enabled) => {
    setShiftSettings(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        enabled,
        week_settings: enabled && Object.keys(prev[dayKey]?.week_settings || {}).length === 0
          ? { 1: { is_day_off: false, is_negotiable_if_needed: false, start_time: '09:00', end_time: '18:00', notes: '' },
              2: { is_day_off: false, is_negotiable_if_needed: false, start_time: '09:00', end_time: '18:00', notes: '' },
              3: { is_day_off: false, is_negotiable_if_needed: false, start_time: '09:00', end_time: '18:00', notes: '' },
              4: { is_day_off: false, is_negotiable_if_needed: false, start_time: '09:00', end_time: '18:00', notes: '' },
              5: { is_day_off: false, is_negotiable_if_needed: false, start_time: '09:00', end_time: '18:00', notes: '' } }
          : prev[dayKey]?.week_settings || {}
      }
    }));
  };

  const handleWeekToggle = (dayKey, week, checked) => {
    setShiftSettings(prev => {
      const currentWeekSettings = { ...(prev[dayKey]?.week_settings || {}) };
      if (checked) {
        currentWeekSettings[week] = currentWeekSettings[week] || {
          is_day_off: false, is_negotiable_if_needed: false, start_time: '09:00', end_time: '18:00', notes: ''
        };
      } else {
        delete currentWeekSettings[week];
      }
      return { ...prev, [dayKey]: { ...prev[dayKey], week_settings: currentWeekSettings } };
    });
  };

  const handleAllWeeksToggle = (dayKey, checked) => {
    setShiftSettings(prev => {
      if (checked) {
        const weekSettings = {};
        [1, 2, 3, 4, 5].forEach(w => {
          weekSettings[w] = prev[dayKey]?.week_settings?.[w] || {
            is_day_off: false, is_negotiable_if_needed: false, start_time: '09:00', end_time: '18:00', notes: ''
          };
        });
        return { ...prev, [dayKey]: { ...prev[dayKey], week_settings: weekSettings } };
      } else {
        return { ...prev, [dayKey]: { ...prev[dayKey], week_settings: {} } };
      }
    });
  };

  const handleWeekSettingChange = (dayKey, week, field, value) => {
    setShiftSettings(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        week_settings: {
          ...prev[dayKey]?.week_settings,
          [week]: {
            ...prev[dayKey]?.week_settings?.[week],
            [field]: value
          }
        }
      }
    }));
  };

  const toggleDayExpand = (dayKey) => {
    setExpandedDays(prev => ({ ...prev, [dayKey]: !prev[dayKey] }));
  };

  const applyToAllWeeks = (dayKey, sourceWeek) => {
    setShiftSettings(prev => {
      const source = prev[dayKey]?.week_settings?.[sourceWeek];
      if (!source) return prev;
      const weekSettings = { ...(prev[dayKey]?.week_settings || {}) };
      Object.keys(weekSettings).forEach(w => {
        weekSettings[w] = { ...source };
      });
      return { ...prev, [dayKey]: { ...prev[dayKey], week_settings: weekSettings } };
    });
    toast.success('全ての選択週に同じ設定を適用しました');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Calendar className="w-5 h-5" />
          基本シフト設定
        </CardTitle>
        <CardDescription className="text-base">
          毎週の固定シフトを設定すると、シフト希望提出時に自動的に反映されます。
          週ごとに異なる出勤/休みを設定できます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {DAYS.map(day => {
            const daySetting = shiftSettings[day.key] || {};
            const weekSettings = daySetting.week_settings || {};
            const activeWeeks = Object.keys(weekSettings).map(Number).sort();
            const isExpanded = expandedDays[day.key];

            const allSame = activeWeeks.length > 1 && activeWeeks.every(w => {
              const first = weekSettings[activeWeeks[0]];
              const current = weekSettings[w];
              return current?.is_day_off === first?.is_day_off &&
                     current?.is_negotiable_if_needed === first?.is_negotiable_if_needed &&
                     current?.start_time === first?.start_time &&
                     current?.end_time === first?.end_time;
            });

            return (
              <div
                key={day.key}
                className={`border-2 rounded-xl p-4 transition-all ${
                  daySetting.enabled
                    ? 'border-indigo-200 bg-indigo-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold text-slate-800">
                    {day.label}
                  </Label>
                  <Switch
                    checked={daySetting.enabled || false}
                    onCheckedChange={(checked) => handleDayToggle(day.key, checked)}
                  />
                </div>

                {daySetting.enabled && (
                  <div className="space-y-3">
                    {/* Week selection checkboxes */}
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-slate-500 mr-1">対象週:</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={activeWeeks.length === 5}
                          onCheckedChange={(checked) => handleAllWeeksToggle(day.key, checked)}
                        />
                        <span className="text-xs font-medium">全週</span>
                      </label>
                      {[1, 2, 3, 4, 5].map(week => (
                        <label key={week} className="flex items-center gap-1 cursor-pointer">
                          <Checkbox
                            checked={activeWeeks.includes(week)}
                            onCheckedChange={(checked) => handleWeekToggle(day.key, week, checked)}
                          />
                          <span className="text-xs">{week}週</span>
                        </label>
                      ))}
                    </div>

                    {/* Common settings (when all weeks are the same) */}
                    {allSame && activeWeeks.length > 0 ? (
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">
                            全週共通設定
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toggleDayExpand(day.key)}
                          >
                            {isExpanded ? (
                              <><ChevronUp className="w-3 h-3 mr-1" />週別設定を閉じる</>
                            ) : (
                              <><ChevronDown className="w-3 h-3 mr-1" />週別に設定する</>
                            )}
                          </Button>
                        </div>
                        {!isExpanded && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id={`${day.key}-common-dayoff`}
                                checked={weekSettings[activeWeeks[0]]?.is_day_off || false}
                                onCheckedChange={(checked) => {
                                  activeWeeks.forEach(w => handleWeekSettingChange(day.key, w, 'is_day_off', checked));
                                }}
                              />
                              <Label htmlFor={`${day.key}-common-dayoff`} className="text-sm cursor-pointer">
                                休み希望として設定
                              </Label>
                            </div>
                            {weekSettings[activeWeeks[0]]?.is_day_off && (
                              <div className="flex items-center gap-3 ml-6">
                                <Checkbox
                                  id={`${day.key}-common-negotiable`}
                                  checked={weekSettings[activeWeeks[0]]?.is_negotiable_if_needed || false}
                                  onCheckedChange={(checked) => {
                                    activeWeeks.forEach(w => handleWeekSettingChange(day.key, w, 'is_negotiable_if_needed', checked));
                                  }}
                                />
                                <Label htmlFor={`${day.key}-common-negotiable`} className="text-xs cursor-pointer text-amber-600 font-medium">
                                  人員不足なら要相談
                                </Label>
                              </div>
                            )}
                            {!weekSettings[activeWeeks[0]]?.is_day_off && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-slate-600 mb-1 block">開始時刻</Label>
                                  <Input
                                    type="time"
                                    value={weekSettings[activeWeeks[0]]?.start_time || '09:00'}
                                    onChange={(e) => {
                                      activeWeeks.forEach(w => handleWeekSettingChange(day.key, w, 'start_time', e.target.value));
                                    }}
                                    className="h-10"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-600 mb-1 block">終了時刻</Label>
                                  <Input
                                    type="time"
                                    value={weekSettings[activeWeeks[0]]?.end_time || '18:00'}
                                    onChange={(e) => {
                                      activeWeeks.forEach(w => handleWeekSettingChange(day.key, w, 'end_time', e.target.value));
                                    }}
                                    className="h-10"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Individual week settings (shown when expanded or when settings differ) */}
                    {(isExpanded || !allSame) && activeWeeks.map(week => {
                      const ws = weekSettings[week] || {};
                      return (
                        <div key={week} className="p-3 bg-white rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-sm font-semibold ${ws.is_day_off ? 'text-red-600' : 'text-indigo-700'}`}>
                              {week}週目 {ws.is_day_off ? '🔴 休み' : '🟢 出勤'}
                            </span>
                            {activeWeeks.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] text-slate-500"
                                onClick={() => applyToAllWeeks(day.key, week)}
                              >
                                この設定を全週に適用
                              </Button>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id={`${day.key}-w${week}-dayoff`}
                                checked={ws.is_day_off || false}
                                onCheckedChange={(checked) => handleWeekSettingChange(day.key, week, 'is_day_off', checked)}
                              />
                              <Label htmlFor={`${day.key}-w${week}-dayoff`} className="text-sm cursor-pointer">
                                休み希望として設定
                              </Label>
                            </div>
                            {ws.is_day_off && (
                              <div className="flex items-center gap-3 ml-6">
                                <Checkbox
                                  id={`${day.key}-w${week}-negotiable`}
                                  checked={ws.is_negotiable_if_needed || false}
                                  onCheckedChange={(checked) => handleWeekSettingChange(day.key, week, 'is_negotiable_if_needed', checked)}
                                />
                                <Label htmlFor={`${day.key}-w${week}-negotiable`} className="text-xs cursor-pointer text-amber-600 font-medium">
                                  人員不足なら要相談
                                </Label>
                              </div>
                            )}
                            {!ws.is_day_off && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-slate-600 mb-1 block">開始時刻</Label>
                                  <Input
                                    type="time"
                                    value={ws.start_time || '09:00'}
                                    onChange={(e) => handleWeekSettingChange(day.key, week, 'start_time', e.target.value)}
                                    className="h-10"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-600 mb-1 block">終了時刻</Label>
                                  <Input
                                    type="time"
                                    value={ws.end_time || '18:00'}
                                    onChange={(e) => handleWeekSettingChange(day.key, week, 'end_time', e.target.value)}
                                    className="h-10"
                                  />
                                </div>
                              </div>
                            )}
                            <div>
                              <Label className="text-xs text-slate-600 mb-1 block">備考（任意）</Label>
                              <Input
                                value={ws.notes || ''}
                                onChange={(e) => handleWeekSettingChange(day.key, week, 'notes', e.target.value)}
                                placeholder="特記事項..."
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <Button
            onClick={handleSave}
            size="lg"
            className="w-full text-base"
            disabled={updateUserMutation.isPending}
          >
            <Save className="w-5 h-5 mr-2" />
            {updateUserMutation.isPending ? '保存中...' : '設定を保存'}
          </Button>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              💡 <strong>ヒント:</strong> 週ごとに異なる出勤/休みを設定できます。例えば「1週目は休み、2週目は出勤」のような設定が可能です。
              ここで設定した基本シフトは、シフト希望提出時に自動的に反映されます。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
