import React, { useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, isValid } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Copy } from 'lucide-react';
import { Label } from '@/components/ui/label';

const getValidDate = (date) => {
  if (date instanceof Date && isValid(date)) {
    return date;
  }
  return new Date(); // 無効な場合は現在の日付を返す
};

export default function ShiftCopyDialog({ open, onOpenChange, onCopy, currentMonth: propCurrentMonth, storeId }) {
  const currentMonth = getValidDate(propCurrentMonth);
  const [sourceStart, setSourceStart] = useState(() => {
    return format(startOfMonth(subMonths(currentMonth, 1)), 'yyyy-MM-dd');
  });
  const [sourceEnd, setSourceEnd] = useState(() => {
    return format(endOfMonth(subMonths(currentMonth, 1)), 'yyyy-MM-dd');
  });
  const [targetStart, setTargetStart] = useState(() => {
    return format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  });
  const [targetEnd, setTargetEnd] = useState(() => {
    return format(endOfMonth(currentMonth), 'yyyy-MM-dd');
  });

  const handleCopy = () => {
    onCopy(sourceStart, sourceEnd, targetStart, targetEnd);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-indigo-600" />
            シフト希望をコピー
          </DialogTitle>
          <DialogDescription>
            過去のシフト希望を別の月にコピーできます
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">コピー元の期間</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="source-start" className="text-xs">開始日</Label>
                <Input
                  id="source-start"
                  type="date"
                  value={sourceStart}
                  onChange={(e) => setSourceStart(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label htmlFor="source-end" className="text-xs">終了日</Label>
                <Input
                  id="source-end"
                  type="date"
                  value={sourceEnd}
                  onChange={(e) => setSourceEnd(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">コピー先の期間</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="target-start" className="text-xs">開始日</Label>
                <Input
                  id="target-start"
                  type="date"
                  value={targetStart}
                  onChange={(e) => setTargetStart(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label htmlFor="target-end" className="text-xs">終了日</Label>
                <Input
                  id="target-end"
                  type="date"
                  value={targetEnd}
                  onChange={(e) => setTargetEnd(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>
          
          <div className="text-xs text-slate-600 p-2 bg-slate-50 rounded">
            💡 期間の差分に応じて、各シフトの日付が自動調整されます
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleCopy} className="bg-indigo-600 hover:bg-indigo-700">
            <Copy className="w-4 h-4 mr-2" />
            コピー実行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}