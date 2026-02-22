import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, Calendar, Users, Settings, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function DetailedStoreSettings({ store, onUpdate }) {
  const [businessHours, setBusinessHours] = useState(store.business_hours || {});
  const [staffRequirements, setStaffRequirements] = useState(store.staff_requirements || []);
  const [temporaryClosures, setTemporaryClosures] = useState(store.temporary_closures || []);
  const [holidayExceptions, setHolidayExceptions] = useState(store.holiday_exceptions || []);
  const [shiftPolicies, setShiftPolicies] = useState(store.shift_policies || {
    days_before_confirmation: 7,
    submission_deadline_days: 20,
    allow_late_changes: false,
    require_manager_approval: true
  });
  const [isSaving, setIsSaving] = useState(false);

  // Re-initialize state when store prop changes (e.g., after save or store switch)
  useEffect(() => {
    setBusinessHours(store.business_hours || {});
    setStaffRequirements(store.staff_requirements || []);
    setTemporaryClosures(store.temporary_closures || []);
    setHolidayExceptions(store.holiday_exceptions || []);
    setShiftPolicies(store.shift_policies || {
      days_before_confirmation: 7,
      submission_deadline_days: 20,
      allow_late_changes: false,
      require_manager_approval: true
    });
  }, [store.id, store.business_hours, store.staff_requirements, store.temporary_closures, store.holiday_exceptions, store.shift_policies]);

  const daysOfWeek = [
    { key: 'monday', label: '月曜日' },
    { key: 'tuesday', label: '火曜日' },
    { key: 'wednesday', label: '水曜日' },
    { key: 'thursday', label: '木曜日' },
    { key: 'friday', label: '金曜日' },
    { key: 'saturday', label: '土曜日' },
    { key: 'sunday', label: '日曜日' }
  ];

  const handleBusinessHoursChange = (day, field, value) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }));
  };

  const addStaffRequirement = () => {
    setStaffRequirements(prev => [...prev, {
      day_of_week: 'monday',
      time_slot_start: '09:00',
      time_slot_end: '09:30',
      required_staff: 1
    }]);
  };

  const removeStaffRequirement = (index) => {
    setStaffRequirements(prev => prev.filter((_, i) => i !== index));
  };

  const updateStaffRequirement = (index, field, value) => {
    setStaffRequirements(prev => prev.map((req, i) => 
      i === index ? { ...req, [field]: value } : req
    ));
  };

  const addTemporaryClosure = () => {
    setTemporaryClosures(prev => [...prev, {
      date: '',
      reason: ''
    }]);
  };

  const removeTemporaryClosure = (index) => {
    setTemporaryClosures(prev => prev.filter((_, i) => i !== index));
  };

  const updateTemporaryClosure = (index, field, value) => {
    setTemporaryClosures(prev => prev.map((closure, i) => 
      i === index ? { ...closure, [field]: value } : closure
    ));
  };

  const addHolidayException = () => {
    setHolidayExceptions(prev => [...prev, {
      date: '',
      open: '09:00',
      close: '18:00',
      closed: false
    }]);
  };

  const removeHolidayException = (index) => {
    setHolidayExceptions(prev => prev.filter((_, i) => i !== index));
  };

  const updateHolidayException = (index, field, value) => {
    setHolidayExceptions(prev => prev.map((exception, i) => 
      i === index ? { ...exception, [field]: value } : exception
    ));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({
        business_hours: businessHours,
        staff_requirements: staffRequirements,
        temporary_closures: temporaryClosures,
        holiday_exceptions: holidayExceptions,
        shift_policies: shiftPolicies
      });
      toast.success('店舗設定を保存しました');
    } catch (error) {
      console.error('[StoreSettings] Save error:', error);
      toast.error('保存に失敗しました: ' + (error.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="hours" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="hours">営業時間</TabsTrigger>
          <TabsTrigger value="staff">必要人数</TabsTrigger>
          <TabsTrigger value="closures">休業日</TabsTrigger>
          <TabsTrigger value="policies">ポリシー</TabsTrigger>
        </TabsList>

        <TabsContent value="hours" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                通常営業時間
              </CardTitle>
              <CardDescription>曜日ごとの営業時間を設定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {daysOfWeek.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-4 p-3 border rounded-lg">
                  <Label className="w-20">{label}</Label>
                  <Switch
                    checked={!businessHours[key]?.closed}
                    onCheckedChange={(checked) => 
                      handleBusinessHoursChange(key, 'closed', !checked)
                    }
                  />
                  {!businessHours[key]?.closed && (
                    <>
                      <Input
                        type="time"
                        value={businessHours[key]?.open || '09:00'}
                        onChange={(e) => handleBusinessHoursChange(key, 'open', e.target.value)}
                        className="w-32"
                      />
                      <span>〜</span>
                      <Input
                        type="time"
                        value={businessHours[key]?.close || '18:00'}
                        onChange={(e) => handleBusinessHoursChange(key, 'close', e.target.value)}
                        className="w-32"
                      />
                    </>
                  )}
                  {businessHours[key]?.closed && (
                    <span className="text-slate-400">定休日</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                祝日特例営業時間
              </CardTitle>
              <CardDescription>祝日の営業時間を個別に設定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {holidayExceptions.map((exception, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Input
                    type="date"
                    value={exception.date}
                    onChange={(e) => updateHolidayException(index, 'date', e.target.value)}
                    className="w-40"
                  />
                  <Switch
                    checked={!exception.closed}
                    onCheckedChange={(checked) => 
                      updateHolidayException(index, 'closed', !checked)
                    }
                  />
                  {!exception.closed && (
                    <>
                      <Input
                        type="time"
                        value={exception.open}
                        onChange={(e) => updateHolidayException(index, 'open', e.target.value)}
                        className="w-32"
                      />
                      <span>〜</span>
                      <Input
                        type="time"
                        value={exception.close}
                        onChange={(e) => updateHolidayException(index, 'close', e.target.value)}
                        className="w-32"
                      />
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeHolidayException(index)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button onClick={addHolidayException} variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                祝日を追加
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                時間帯別必要人数
              </CardTitle>
              <CardDescription>30分単位で必要なスタッフ数を設定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {staffRequirements.map((req, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                  <select
                    value={req.day_of_week}
                    onChange={(e) => updateStaffRequirement(index, 'day_of_week', e.target.value)}
                    className="border rounded px-3 py-2"
                  >
                    {daysOfWeek.map(({ key, label }) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <Input
                    type="time"
                    value={req.time_slot_start}
                    onChange={(e) => updateStaffRequirement(index, 'time_slot_start', e.target.value)}
                    className="w-32"
                  />
                  <span>〜</span>
                  <Input
                    type="time"
                    value={req.time_slot_end}
                    onChange={(e) => updateStaffRequirement(index, 'time_slot_end', e.target.value)}
                    className="w-32"
                  />
                  <Input
                    type="number"
                    value={req.required_staff}
                    onChange={(e) => updateStaffRequirement(index, 'required_staff', parseInt(e.target.value))}
                    className="w-20"
                    min="1"
                  />
                  <span className="text-sm text-slate-600">人</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStaffRequirement(index)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button onClick={addStaffRequirement} variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                時間帯を追加
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closures" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                一時休業日
              </CardTitle>
              <CardDescription>臨時休業日を設定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {temporaryClosures.map((closure, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Input
                    type="date"
                    value={closure.date}
                    onChange={(e) => updateTemporaryClosure(index, 'date', e.target.value)}
                    className="w-40"
                  />
                  <Input
                    placeholder="休業理由"
                    value={closure.reason}
                    onChange={(e) => updateTemporaryClosure(index, 'reason', e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTemporaryClosure(index)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <Button onClick={addTemporaryClosure} variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                休業日を追加
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                シフト作成ポリシー
              </CardTitle>
              <CardDescription>シフト確定や提出のルールを設定</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>シフト確定までの日数</Label>
                <Input
                  type="number"
                  value={shiftPolicies.days_before_confirmation}
                  onChange={(e) => setShiftPolicies(prev => ({
                    ...prev,
                    days_before_confirmation: parseInt(e.target.value)
                  }))}
                  min="1"
                />
                <p className="text-xs text-slate-500">
                  シフト確定日の何日前に作成を完了するか
                </p>
              </div>

              <div className="space-y-2">
                <Label>希望提出期限（前月の何日前）</Label>
                <Input
                  type="number"
                  value={shiftPolicies.submission_deadline_days}
                  onChange={(e) => setShiftPolicies(prev => ({
                    ...prev,
                    submission_deadline_days: parseInt(e.target.value)
                  }))}
                  min="1"
                />
                <p className="text-xs text-slate-500">
                  対象月の前月末から何日前を提出期限とするか
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>期限後の変更を許可</Label>
                  <p className="text-xs text-slate-500">
                    提出期限後もシフト希望の変更を許可する
                  </p>
                </div>
                <Switch
                  checked={shiftPolicies.allow_late_changes}
                  onCheckedChange={(checked) => setShiftPolicies(prev => ({
                    ...prev,
                    allow_late_changes: checked
                  }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>マネージャー承認必須</Label>
                  <p className="text-xs text-slate-500">
                    シフト確定前にマネージャーの承認を必須とする
                  </p>
                </div>
                <Switch
                  checked={shiftPolicies.require_manager_approval}
                  onCheckedChange={(checked) => setShiftPolicies(prev => ({
                    ...prev,
                    require_manager_approval: checked
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700" disabled={isSaving}>
          {isSaving ? '保存中...' : '設定を保存'}
        </Button>
      </div>
    </div>
  );
}