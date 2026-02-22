import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Trash2, Clock, User, MessageSquare, Plus, X, ChevronDown, ChevronUp, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';

// 時間を分に変換
function timeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// 分を時間文字列に変換
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 30分以上の間隔があるかチェック
function canAddAdditionalTime(endTime, additionalTimes) {
  const lastEnd = additionalTimes.length > 0
    ? additionalTimes[additionalTimes.length - 1].end_time
    : endTime;
  return timeToMinutes(lastEnd) <= 23 * 60;
}

// 追加可能な最小開始時刻を計算
function getMinStartTime(endTime, additionalTimes) {
  const lastEnd = additionalTimes.length > 0
    ? additionalTimes[additionalTimes.length - 1].end_time
    : endTime;
  return minutesToTime(timeToMinutes(lastEnd) + 30);
}

// 勤務詳細のプリセットラベル
const WORK_DETAIL_PRESETS = [
  '店舗', '店舗会議', '商談', '研修', '事務作業', '配送', '棚卸', 'その他'
];

export default function ShiftEditDialog({ 
  open, 
  onOpenChange, 
  shift, 
  users, 
  onSave, 
  onDelete,
  dateLabel 
}) {
  const [editData, setEditData] = useState({
    user_email: '',
    start_time: '09:00',
    end_time: '17:00',
    notes: '',
    is_confirmed: false
  });
  const [additionalTimes, setAdditionalTimes] = useState([]);
  const [workDetails, setWorkDetails] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  
  useEffect(() => {
    if (shift) {
      setEditData({
        user_email: shift.user_email || '',
        start_time: shift.start_time || '09:00',
        end_time: shift.end_time || '17:00',
        notes: shift.notes || '',
        is_confirmed: shift.is_confirmed || false,
        date: shift.date || '',
        id: shift.id || undefined
      });
      setAdditionalTimes(shift.additional_times || []);
      setWorkDetails(shift.work_details || []);
      setShowDetails((shift.work_details || []).length > 0);
    } else {
      setEditData({
        user_email: '',
        start_time: '09:00',
        end_time: '17:00',
        notes: '',
        is_confirmed: false
      });
      setAdditionalTimes([]);
      setWorkDetails([]);
      setShowDetails(false);
    }
  }, [shift, open]);

  // 追加の時間帯を追加
  const handleAddTime = () => {
    const minStart = getMinStartTime(editData.end_time, additionalTimes);
    const minStartMinutes = timeToMinutes(minStart);
    const defaultEnd = minutesToTime(Math.min(minStartMinutes + 180, 23 * 60 + 30));
    setAdditionalTimes([...additionalTimes, { start_time: minStart, end_time: defaultEnd }]);
  };

  // 追加の時間帯を削除
  const handleRemoveTime = (index) => {
    setAdditionalTimes(additionalTimes.slice(0, index));
  };

  // 追加の時間帯を更新
  const handleUpdateAdditionalTime = (index, field, value) => {
    const updated = [...additionalTimes];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalTimes(updated);
  };

  // 勤務詳細を追加
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

  // 勤務詳細を削除
  const handleRemoveWorkDetail = (index) => {
    setWorkDetails(workDetails.filter((_, i) => i !== index));
  };

  // 勤務詳細を更新
  const handleUpdateWorkDetail = (index, field, value) => {
    const updated = [...workDetails];
    updated[index] = { ...updated[index], [field]: value };
    setWorkDetails(updated);
  };

  // 勤務詳細を自動生成（全時間帯をカバー）
  const handleAutoFillDetails = () => {
    setWorkDetails([{
      start_time: editData.start_time,
      end_time: editData.end_time,
      label: '店舗'
    }]);
  };

  const handleSave = () => {
    const saveData = {
      ...editData,
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

  const selectedUser = users?.find(u => u.email === editData.user_email);
  const displayName = selectedUser?.metadata?.display_name || selectedUser?.full_name || selectedUser?.email?.split('@')[0] || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-4 rounded-t-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {shift?.id ? 'シフト編集' : 'シフト作成'}
            </DialogTitle>
            <p className="text-indigo-100 text-sm mt-1">{dateLabel}</p>
          </DialogHeader>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* スタッフ選択 */}
          <div>
            <Label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-indigo-500" />
              スタッフ
            </Label>
            <Select
              value={editData.user_email}
              onValueChange={(v) => setEditData({ ...editData, user_email: v })}
            >
              <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400">
                <SelectValue placeholder="スタッフを選択" />
              </SelectTrigger>
              <SelectContent>
                {users?.filter(u => (u.user_role || u.role) === 'user').map(user => (
                  <SelectItem key={user?.email} value={user?.email}>
                    {user?.metadata?.display_name || user?.full_name || user?.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 時間設定 */}
          <div>
            <Label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              勤務時間
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-indigo-500 mb-1.5 block font-semibold">開始</Label>
                <Input
                  type="time"
                  value={editData.start_time}
                  onChange={(e) => {
                    setEditData({ ...editData, start_time: e.target.value });
                    setAdditionalTimes([]);
                  }}
                  className="h-11 rounded-xl text-base font-semibold border-slate-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                />
              </div>
              <div>
                <Label className="text-xs text-indigo-500 mb-1.5 block font-semibold">終了</Label>
                <Input
                  type="time"
                  value={editData.end_time}
                  onChange={(e) => {
                    setEditData({ ...editData, end_time: e.target.value });
                    setAdditionalTimes([]);
                  }}
                  className="h-11 rounded-xl text-base font-semibold border-slate-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                />
              </div>
            </div>

            {/* 追加の時間帯 */}
            {additionalTimes.map((at, index) => {
              const prevEnd = index === 0 ? editData.end_time : additionalTimes[index - 1].end_time;
              return (
                <div key={index} className="mt-3 p-3 rounded-xl bg-teal-50 border border-teal-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-700">追加時間帯 {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTime(index)}
                      className="w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-teal-600 mb-1 block font-semibold">開始</Label>
                      <Input
                        type="time"
                        value={at.start_time}
                        onChange={(e) => handleUpdateAdditionalTime(index, 'start_time', e.target.value)}
                        className="h-10 rounded-lg text-sm font-semibold border-teal-200 focus:ring-2 focus:ring-teal-200"
                      />
                      <p className="text-[10px] text-teal-500 mt-0.5">{prevEnd}から30分以上空ける</p>
                    </div>
                    <div>
                      <Label className="text-xs text-teal-600 mb-1 block font-semibold">終了</Label>
                      <Input
                        type="time"
                        value={at.end_time}
                        onChange={(e) => handleUpdateAdditionalTime(index, 'end_time', e.target.value)}
                        className="h-10 rounded-lg text-sm font-semibold border-teal-200 focus:ring-2 focus:ring-teal-200"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 時間帯追加ボタン */}
            {canAddAdditionalTime(editData.end_time, additionalTimes) && (
              <button
                type="button"
                onClick={handleAddTime}
                className="mt-3 w-full py-2 rounded-xl border-2 border-dashed border-teal-200 hover:border-teal-400 text-teal-600 hover:text-teal-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:bg-teal-50"
              >
                <Plus className="w-3.5 h-3.5" />
                時間帯を追加（30分以上の間隔が必要）
              </button>
            )}
          </div>

          {/* 勤務詳細設定（アコーディオン） */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className={cn(
                "w-full px-4 py-3 flex items-center justify-between text-left transition-colors",
                showDetails ? "bg-amber-50 border-b border-amber-100" : "bg-slate-50 hover:bg-slate-100"
              )}
            >
              <div className="flex items-center gap-2">
                <Briefcase className={cn("w-4 h-4", showDetails ? "text-amber-600" : "text-slate-500")} />
                <span className={cn("text-sm font-bold", showDetails ? "text-amber-800" : "text-slate-700")}>
                  勤務詳細設定
                </span>
                <span className="text-[10px] text-slate-400 font-normal">（任意）</span>
              </div>
              {showDetails ? (
                <ChevronUp className="w-4 h-4 text-amber-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showDetails && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-slate-500 mb-2">
                  勤務時間内の内訳を設定できます（例: 店舗、会議、商談など）
                </p>

                {workDetails.map((detail, index) => (
                  <div key={index} className="p-3 rounded-lg bg-amber-50/50 border border-amber-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-700">詳細 {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveWorkDetail(index)}
                        className="w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
                      >
                        <X className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-amber-600 mb-1 block font-semibold">開始</Label>
                        <Input
                          type="time"
                          value={detail.start_time}
                          onChange={(e) => handleUpdateWorkDetail(index, 'start_time', e.target.value)}
                          className="h-9 rounded-lg text-sm font-semibold border-amber-200 focus:ring-2 focus:ring-amber-200"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-amber-600 mb-1 block font-semibold">終了</Label>
                        <Input
                          type="time"
                          value={detail.end_time}
                          onChange={(e) => handleUpdateWorkDetail(index, 'end_time', e.target.value)}
                          className="h-9 rounded-lg text-sm font-semibold border-amber-200 focus:ring-2 focus:ring-amber-200"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-amber-600 mb-1 block font-semibold">内容</Label>
                      <div className="flex gap-1.5 flex-wrap mb-1.5">
                        {WORK_DETAIL_PRESETS.map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleUpdateWorkDetail(index, 'label', preset)}
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all border",
                              detail.label === preset
                                ? "bg-amber-500 text-white border-amber-500"
                                : "bg-white text-amber-700 border-amber-200 hover:border-amber-400"
                            )}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <Input
                        value={detail.label}
                        onChange={(e) => handleUpdateWorkDetail(index, 'label', e.target.value)}
                        placeholder="内容を入力（例: 店舗会議）"
                        className="h-9 rounded-lg text-sm border-amber-200 focus:ring-2 focus:ring-amber-200"
                      />
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddWorkDetail}
                    className="flex-1 py-2 rounded-lg border-2 border-dashed border-amber-200 hover:border-amber-400 text-amber-600 hover:text-amber-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:bg-amber-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    詳細を追加
                  </button>
                  {workDetails.length === 0 && (
                    <button
                      type="button"
                      onClick={handleAutoFillDetails}
                      className="py-2 px-3 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-semibold transition-all"
                    >
                      自動入力
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* メモ */}
          <div>
            <Label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              メモ
              <span className="text-xs font-normal text-slate-400">（任意）</span>
            </Label>
            <Input
              value={editData.notes || ''}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              placeholder="メモを入力..."
              className="h-11 rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </div>

          {/* アクションボタン */}
          <div className="flex gap-3 pt-2 pb-1">
            {shift?.id && (
              <Button
                variant="outline"
                onClick={handleDelete}
                className="rounded-xl h-11 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50 font-bold transition-all"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                削除
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!editData.user_email}
              className="flex-1 rounded-xl h-11 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold transition-all gap-2"
            >
              <Save className="w-4 h-4" />
              {shift?.id ? '更新' : '作成'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
