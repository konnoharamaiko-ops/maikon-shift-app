import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function ShiftRequestEditDialog({
  open,
  onOpenChange,
  request,
  onSave,
  onDelete
}) {
  const [editData, setEditData] = useState({
    start_time: '09:00',
    end_time: '17:00',
    is_day_off: false,
    is_paid_leave: false,
    is_full_day_available: false,
    is_negotiable_if_needed: false,
    notes: ''
  });

  useEffect(() => {
    if (request) {
      setEditData(request);
    } else {
      setEditData({
        start_time: '09:00',
        end_time: '17:00',
        is_day_off: false,
        is_paid_leave: false,
        is_full_day_available: false,
        is_negotiable_if_needed: false,
        notes: ''
      });
    }
  }, [request, open]);

  const handleSave = () => {
    onSave(editData);
  };

  const handleDelete = () => {
    if (request?.id) {
      onDelete(request.id);
    }
  };

  const dateLabel = request && request.date ? format(new Date(request.date), 'M月d日(E)', { locale: ja }) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>シフト希望編集 - {dateLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3 p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Checkbox
                id="dayOff"
                checked={editData.is_day_off}
                onCheckedChange={(checked) => setEditData({
                  ...editData,
                  is_day_off: checked,
                  is_full_day_available: false,
                  is_negotiable_if_needed: false
                })}
              />
              <Label htmlFor="dayOff" className="font-semibold cursor-pointer">休み希望</Label>
            </div>

            {editData.is_day_off && (
              <div className="space-y-2 pl-6">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="paidLeave"
                    checked={editData.is_paid_leave}
                    onCheckedChange={(checked) => setEditData({ ...editData, is_paid_leave: checked })}
                  />
                  <Label htmlFor="paidLeave" className="cursor-pointer text-sm">有給休暇</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="negotiableDayOff"
                    checked={editData.is_negotiable_if_needed}
                    onCheckedChange={(checked) => setEditData({ ...editData, is_negotiable_if_needed: checked })}
                  />
                  <Label htmlFor="negotiableDayOff" className="cursor-pointer text-sm text-amber-600 font-medium">人員不足なら要相談</Label>
                </div>
              </div>
            )}

            {!editData.is_day_off && (
              <>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="fullDay"
                    checked={editData.is_full_day_available}
                    onCheckedChange={(checked) => setEditData({
                      ...editData,
                      is_full_day_available: checked,
                      is_negotiable_if_needed: false
                    })}
                  />
                  <Label htmlFor="fullDay" className="font-semibold cursor-pointer">終日出勤可能</Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="negotiable"
                    checked={editData.is_negotiable_if_needed}
                    onCheckedChange={(checked) => setEditData({
                      ...editData,
                      is_negotiable_if_needed: checked,
                      is_full_day_available: false
                    })}
                  />
                  <Label htmlFor="negotiable" className="font-semibold cursor-pointer">人員足りない時は要相談</Label>
                </div>

                {!editData.is_full_day_available && !editData.is_negotiable_if_needed && (
                  <div className="space-y-3 pl-6 pt-2 border-t">
                    <div>
                      <Label className="text-sm">開始時刻</Label>
                      <Input
                        type="time"
                        value={editData.start_time}
                        onChange={(e) => setEditData({ ...editData, start_time: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">終了時刻</Label>
                      <Input
                        type="time"
                        value={editData.end_time}
                        onChange={(e) => setEditData({ ...editData, end_time: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <Label className="text-sm">メモ</Label>
            <Input
              value={editData.notes || ''}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              placeholder="メモ（任意）"
              className="mt-1"
            />
          </div>

          <div className="flex gap-3">
            {request?.id && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="flex-1"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                削除
              </Button>
            )}
            <Button
              onClick={handleSave}
              className="flex-1"
            >
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
