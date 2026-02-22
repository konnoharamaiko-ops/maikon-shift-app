import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function StaffRequirementDisplay({ store, workShifts, dateStr, onUpdateStore }) {
  const [showSettings, setShowSettings] = useState(false);
  const [requirements, setRequirements] = useState(store?.staff_requirements || []);

  const dayOfWeekMap = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday'
  };

  const dayLabels = {
    monday: '月', tuesday: '火', wednesday: '水', thursday: '木',
    friday: '金', saturday: '土', sunday: '日'
  };

  const date = new Date(dateStr);
  const dayOfWeek = dayOfWeekMap[date.getDay()];
  
  const dayRequirements = requirements.filter(r => r.day_of_week === dayOfWeek);
  
  const getStaffCountForTime = (timeStr) => {
    const dayShifts = workShifts.filter(s => s.date === dateStr);
    return dayShifts.filter(shift => {
      const shiftStart = shift.start_time;
      const shiftEnd = shift.end_time;
      return timeStr >= shiftStart && timeStr < shiftEnd;
    }).length;
  };

  const handleSave = async () => {
    try {
      await onUpdateStore({ staff_requirements: requirements });
      setShowSettings(false);
      toast.success('必要人数設定を保存しました');
    } catch (error) {
      toast.error('保存に失敗しました');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 space-y-1">
          {dayRequirements.length > 0 ? (
            dayRequirements.map((req, idx) => {
              const currentStaff = getStaffCountForTime(req.time_slot_start);
              const isSufficient = currentStaff >= req.required_staff;
              
              return (
                <div key={idx} className="text-xs">
                  <span className={`font-semibold ${isSufficient ? 'text-green-600' : 'text-red-600'}`}>
                    {req.time_slot_start?.slice(0, 5)}-{req.time_slot_end?.slice(0, 5)}
                  </span>
                  <span className="text-slate-600 ml-1">
                    {currentStaff}/{req.required_staff}人
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-xs text-slate-400">未設定</div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setShowSettings(true)}
        >
          <Settings className="w-3 h-3" />
        </Button>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>時間帯別必要人数設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {requirements.map((req, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 border rounded-lg">
                <Select
                  value={req.day_of_week}
                  onValueChange={(v) => {
                    const newReqs = [...requirements];
                    newReqs[idx] = { ...req, day_of_week: v };
                    setRequirements(newReqs);
                  }}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(dayLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="time"
                  value={req.time_slot_start}
                  onChange={(e) => {
                    const newReqs = [...requirements];
                    newReqs[idx] = { ...req, time_slot_start: e.target.value };
                    setRequirements(newReqs);
                  }}
                  className="w-32"
                />
                <span>〜</span>
                <Input
                  type="time"
                  value={req.time_slot_end}
                  onChange={(e) => {
                    const newReqs = [...requirements];
                    newReqs[idx] = { ...req, time_slot_end: e.target.value };
                    setRequirements(newReqs);
                  }}
                  className="w-32"
                />
                <Input
                  type="number"
                  value={req.required_staff}
                  onChange={(e) => {
                    const newReqs = [...requirements];
                    newReqs[idx] = { ...req, required_staff: parseInt(e.target.value) };
                    setRequirements(newReqs);
                  }}
                  className="w-20"
                  min="1"
                />
                <span className="text-sm">人</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRequirements(requirements.filter((_, i) => i !== idx))}
                  className="text-red-600"
                >
                  削除
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setRequirements([...requirements, {
                day_of_week: dayOfWeek,
                time_slot_start: '09:00',
                time_slot_end: '17:00',
                required_staff: 1
              }])}
            >
              時間帯を追加
            </Button>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1">保存</Button>
              <Button variant="outline" onClick={() => setShowSettings(false)} className="flex-1">キャンセル</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}