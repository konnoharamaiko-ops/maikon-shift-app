import React, { useState } from 'react';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Repeat, Calendar } from 'lucide-react';

export default function RepeatShiftDialog({ open, onOpenChange, onApply, currentMonth, storeId }) {
  const [daySettings, setDaySettings] = useState({
    0: { enabled: false, startTime: '09:00', endTime: '18:00', repeatType: 'weekly', isDayOff: false },
    1: { enabled: false, startTime: '09:00', endTime: '18:00', repeatType: 'weekly', isDayOff: false },
    2: { enabled: false, startTime: '09:00', endTime: '18:00', repeatType: 'weekly', isDayOff: false },
    3: { enabled: false, startTime: '09:00', endTime: '18:00', repeatType: 'weekly', isDayOff: false },
    4: { enabled: false, startTime: '09:00', endTime: '18:00', repeatType: 'weekly', isDayOff: false },
    5: { enabled: false, startTime: '09:00', endTime: '18:00', repeatType: 'weekly', isDayOff: false },
    6: { enabled: false, startTime: '09:00', endTime: '18:00', repeatType: 'weekly', isDayOff: false }
  });

  const daysOfWeek = [
    { key: 0, label: '日', fullLabel: '日曜日' },
    { key: 1, label: '月', fullLabel: '月曜日' },
    { key: 2, label: '火', fullLabel: '火曜日' },
    { key: 3, label: '水', fullLabel: '水曜日' },
    { key: 4, label: '木', fullLabel: '木曜日' },
    { key: 5, label: '金', fullLabel: '金曜日' },
    { key: 6, label: '土', fullLabel: '土曜日' }
  ];

  const toggleDay = (dayKey) => {
    setDaySettings(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], enabled: !prev[dayKey].enabled }
    }));
  };

  const updateDaySetting = (dayKey, field, value) => {
    setDaySettings(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value }
    }));
  };

  const handleApply = () => {
    const hasAnyEnabled = Object.values(daySettings).some(d => d.enabled);
    if (!hasAnyEnabled) {
      return;
    }
    onApply(daySettings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-indigo-600" />
            繰り返しシフト設定
          </DialogTitle>
          <DialogDescription>
            特定の曜日と時間帯で繰り返しシフト希望を作成します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-3">
            {daysOfWeek.map(day => {
              const daySetting = daySettings[day.key];
              return (
                <div
                  key={day.key}
                  className={`border-2 rounded-lg p-3 transition-all ${
                    daySetting.enabled
                      ? 'border-indigo-200 bg-indigo-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Label className="font-semibold">{day.fullLabel}</Label>
                    <Checkbox
                      checked={daySetting.enabled}
                      onCheckedChange={() => toggleDay(day.key)}
                    />
                  </div>

                  {daySetting.enabled && (
                    <div className="space-y-2 mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox
                          checked={daySetting.isDayOff}
                          onCheckedChange={(checked) => updateDaySetting(day.key, 'isDayOff', checked)}
                        />
                        <Label className="text-sm text-slate-700">休み希望</Label>
                      </div>
                      
                      {!daySetting.isDayOff && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">開始</Label>
                            <Input
                              type="time"
                              value={daySetting.startTime}
                              onChange={(e) => updateDaySetting(day.key, 'startTime', e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">終了</Label>
                            <Input
                              type="time"
                              value={daySetting.endTime}
                              onChange={(e) => updateDaySetting(day.key, 'endTime', e.target.value)}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs text-slate-600 mb-1 block">繰り返し</Label>
                        <Select 
                          value={daySetting.repeatType} 
                          onValueChange={(value) => updateDaySetting(day.key, 'repeatType', value)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">毎週</SelectItem>
                            <SelectItem value="biweekly">隔週</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button 
            onClick={handleApply} 
            disabled={!Object.values(daySettings).some(d => d.enabled)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Repeat className="w-4 h-4 mr-2" />
            適用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}