import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';

export default function ShiftResetDialog({ open, onOpenChange, onReset, currentMonth = new Date() }) {
  const [startDate, setStartDate] = useState(() => {
    try {
      return format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    } catch (e) {
      return format(startOfMonth(new Date()), 'yyyy-MM-dd');
    }
  });
  const [endDate, setEndDate] = useState(() => {
    try {
      return format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    } catch (e) {
      return format(endOfMonth(new Date()), 'yyyy-MM-dd');
    }
  });

  const handleReset = () => {
    onReset(startDate, endDate);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            シフト希望をリセット
          </DialogTitle>
          <DialogDescription>
            指定した期間のシフト希望を削除します（過去・ロック済みは除く）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">削除する期間</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="reset-start" className="text-xs">開始日</Label>
                <Input
                  id="reset-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label htmlFor="reset-end" className="text-xs">終了日</Label>
                <Input
                  id="reset-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>
          
          <div className="text-xs text-slate-600 p-2 bg-yellow-50 rounded border border-yellow-200">
            ⚠️ この操作は元に戻せません。過去の日付や期限切れの日付は削除されません。
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleReset} className="bg-red-600 hover:bg-red-700">
            <Trash2 className="w-4 h-4 mr-2" />
            削除実行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}