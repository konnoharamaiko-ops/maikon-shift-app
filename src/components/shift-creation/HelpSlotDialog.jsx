import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Trash2, Clock, UserPlus, MessageSquare, Plus, X, ChevronDown, ChevronUp, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';

function timeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getMinStartTime(endTime, additionalTimes) {
  const lastEnd = additionalTimes.length > 0
    ? additionalTimes[additionalTimes.length - 1].end_time
    : endTime;
  return minutesToTime(timeToMinutes(lastEnd) + 30);
}

const WORK_DETAIL_PRESETS = [
  '店舗', '店舗会議', '商談', '研修', '事務作業', '配送', '棚卸', 'その他'
];

export default function HelpSlotDialog({
  open,
  onOpenChange,
  shift,
  onSave,
  onDelete,
  dateLabel
}) {
  const [editData, setEditData] = useState({
    help_name: '',
    start_time: '09:00',
    end_time: '17:00',
    notes: '',
  });
  const [additionalTimes, setAdditionalTimes] = useState([]);
  const [workDetails, setWorkDetails] = useState([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (shift) {
      setEditData({
        help_name: shift.help_name || '',
        start_time: shift.start_time || '09:00',
        end_time: shift.end_time || '17:00',
        notes: shift.notes || '',
        date: shift.date || '',
        id: shift.id || undefined
      });
      setAdditionalTimes(shift.additional_times || []);
      setWorkDetails(shift.work_details || []);
      setShowDetails((shift.work_details || []).length > 0);
    } else {
      setEditData({
        help_name: '',
        start_time: '09:00',
        end_time: '17:00',
        notes: '',
      });
      setAdditionalTimes([]);
      setWorkDetails([]);
      setShowDetails(false);
    }
  }, [shift, open]);

  const handleAddTime = () => {
    const minStart = getMinStartTime(editData.end_time, additionalTimes);
    const minStartMinutes = timeToMinutes(minStart);
    const defaultEnd = minutesToTime(Math.min(minStartMinutes + 180, 23 * 60 + 30));
    setAdditionalTimes([...additionalTimes, { start_time: minStart, end_time: defaultEnd }]);
  };

  const handleRemoveTime = (index) => {
    setAdditionalTimes(additionalTimes.slice(0, index));
  };

  const handleUpdateAdditionalTime = (index, field, value) => {
    const updated = [...additionalTimes];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalTimes(updated);
  };

  const handleAddWorkDetail = () => {
    const lastEnd = workDetails.length > 0
      ? workDetails[workDetails.length - 1].end_time
      : editData.start_time;
    const endMinutes = Math.min(timeToMinutes(lastEnd) + 120, timeToMinutes(editData.end_time));
    setWorkDetails([...workDetails, {
      start_time: lastEnd,
      end_time: minutesToTime(endMinutes),
      label: ''
    }]);
  };

  const handleRemoveWorkDetail = (index) => {
    setWorkDetails(workDetails.filter((_, i) => i !== index));
  };

  const handleUpdateWorkDetail = (index, field, value) => {
    const updated = [...workDetails];
    updated[index] = { ...updated[index], [field]: value };
    setWorkDetails(updated);
  };

  const handleSave = () => {
    const saveData = {
      ...editData,
      is_help_slot: true,
      user_email: `help_${Date.now()}@help.local`,
      is_confirmed: true,
      additional_times: additionalTimes.length > 0 ? additionalTimes : [],
      work_details: workDetails.length > 0 ? workDetails : []
    };
    onSave(saveData);
  };

  const handleDelete = () => {
    if (shift?.id) {
      onDelete(shift.id);
    }
  };

  // Generate time options
  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      timeOptions.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  const totalHours = (() => {
    let total = 0;
    const s = timeToMinutes(editData.start_time);
    const e = timeToMinutes(editData.end_time);
    if (e > s) total += (e - s) / 60;
    additionalTimes.forEach(at => {
      const as = timeToMinutes(at.start_time);
      const ae = timeToMinutes(at.end_time);
      if (ae > as) total += (ae - as) / 60;
    });
    return total.toFixed(1);
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 rounded-t-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-base">
              <UserPlus className="w-5 h-5" />
              ヘルプ枠 {shift?.id ? '編集' : '追加'}
            </DialogTitle>
            {dateLabel && (
              <p className="text-white/80 text-sm mt-1">{dateLabel}</p>
            )}
          </DialogHeader>
        </div>

        <div className="p-5 space-y-5">
          {/* スタッフ名 */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-orange-500" />
              スタッフ名
            </Label>
            <Input
              value={editData.help_name}
              onChange={(e) => setEditData({ ...editData, help_name: e.target.value })}
              placeholder="ヘルプスタッフ名を入力（任意）"
              className="border-slate-200 focus:border-orange-400 focus:ring-orange-400"
            />
          </div>

          {/* 勤務時間 */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              勤務時間
              <span className="ml-auto text-xs font-normal text-slate-400">合計 {totalHours}h</span>
            </Label>
            <div className="flex items-center gap-2">
              <Select value={editData.start_time} onValueChange={(v) => setEditData({ ...editData, start_time: v })}>
                <SelectTrigger className="flex-1 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-slate-400 font-medium">〜</span>
              <Select value={editData.end_time} onValueChange={(v) => setEditData({ ...editData, end_time: v })}>
                <SelectTrigger className="flex-1 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.filter(t => t > editData.start_time).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 追加の時間帯 */}
          {additionalTimes.map((at, index) => (
            <div key={index} className="space-y-2 bg-orange-50/50 rounded-lg p-3 border border-orange-100">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-orange-700">追加時間 {index + 1}</Label>
                <Button variant="ghost" size="sm" onClick={() => handleRemoveTime(index)} className="h-6 w-6 p-0 text-red-400 hover:text-red-600">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={at.start_time} onValueChange={(v) => handleUpdateAdditionalTime(index, 'start_time', v)}>
                  <SelectTrigger className="flex-1 border-orange-200 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.filter(t => {
                      const prev = index === 0 ? editData.end_time : additionalTimes[index - 1].end_time;
                      return t >= prev;
                    }).map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-slate-400">〜</span>
                <Select value={at.end_time} onValueChange={(v) => handleUpdateAdditionalTime(index, 'end_time', v)}>
                  <SelectTrigger className="flex-1 border-orange-200 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.filter(t => t > at.start_time).map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={handleAddTime}
            className="w-full border-dashed border-orange-300 text-orange-600 hover:bg-orange-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            時間追加
          </Button>

          {/* 勤務詳細設定 */}
          <div className="space-y-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-orange-600 transition-colors"
            >
              <Briefcase className="w-4 h-4 text-orange-500" />
              勤務時間内詳細設定
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDetails && (
              <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-200">
                {workDetails.map((detail, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select value={detail.start_time} onValueChange={(v) => handleUpdateWorkDetail(index, 'start_time', v)}>
                      <SelectTrigger className="w-20 text-xs border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeOptions.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-slate-400 text-xs">〜</span>
                    <Select value={detail.end_time} onValueChange={(v) => handleUpdateWorkDetail(index, 'end_time', v)}>
                      <SelectTrigger className="w-20 text-xs border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeOptions.filter(t => t > detail.start_time).map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={detail.label} onValueChange={(v) => handleUpdateWorkDetail(index, 'label', v)}>
                      <SelectTrigger className="flex-1 text-xs border-slate-200">
                        <SelectValue placeholder="業務内容" />
                      </SelectTrigger>
                      <SelectContent>
                        {WORK_DETAIL_PRESETS.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveWorkDetail(index)} className="h-6 w-6 p-0 text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddWorkDetail}
                  className="w-full border-dashed text-slate-500"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  詳細追加
                </Button>
              </div>
            )}
          </div>

          {/* 備考 */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-500" />
              備考
            </Label>
            <Input
              value={editData.notes}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              placeholder="備考を入力"
              className="border-slate-200 focus:border-orange-400 focus:ring-orange-400"
            />
          </div>
        </div>

        {/* フッター */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex items-center gap-3 rounded-b-lg">
          {shift?.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-red-500 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              削除
            </Button>
          )}
          <div className="flex-1" />
          <Button
            onClick={handleSave}
            size="sm"
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
          >
            <Save className="w-4 h-4 mr-1" />
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
