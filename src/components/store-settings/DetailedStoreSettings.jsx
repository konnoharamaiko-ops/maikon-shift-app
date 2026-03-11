import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { RefreshCw, Copy, Save, X, RotateCcw } from 'lucide-react';

const DAYS = [
  { key: 'sunday',    short: '日', label: '日', color: 'text-red-600',  bg: 'bg-red-600',  lightBg: 'bg-red-50',  border: 'border-red-300' },
  { key: 'monday',    short: '月', label: '月', color: 'text-slate-700', bg: 'bg-slate-600', lightBg: 'bg-slate-50', border: 'border-slate-200' },
  { key: 'tuesday',   short: '火', label: '火', color: 'text-slate-700', bg: 'bg-slate-600', lightBg: 'bg-slate-50', border: 'border-slate-200' },
  { key: 'wednesday', short: '水', label: '水', color: 'text-slate-700', bg: 'bg-slate-600', lightBg: 'bg-slate-50', border: 'border-slate-200' },
  { key: 'thursday',  short: '木', label: '木', color: 'text-slate-700', bg: 'bg-slate-600', lightBg: 'bg-slate-50', border: 'border-slate-200' },
  { key: 'friday',    short: '金', label: '金', color: 'text-slate-700', bg: 'bg-slate-600', lightBg: 'bg-slate-50', border: 'border-slate-200' },
  { key: 'saturday',  short: '土', label: '土', color: 'text-blue-600',  bg: 'bg-blue-600',  lightBg: 'bg-blue-50',  border: 'border-blue-300' },
];

const DEFAULT_HOURS = {
  sunday:    { open: '09:00', close: '19:00', closed: false },
  monday:    { open: '09:00', close: '19:00', closed: false },
  tuesday:   { open: '09:00', close: '19:00', closed: false },
  wednesday: { open: '09:00', close: '19:00', closed: false },
  thursday:  { open: '09:00', close: '19:00', closed: false },
  friday:    { open: '09:00', close: '19:00', closed: false },
  saturday:  { open: '09:00', close: '19:00', closed: false },
};

// 時間帯の選択肢（30分刻み）
const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function calcHours(open, close) {
  if (!open || !close) return 0;
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const diff = (ch * 60 + cm) - (oh * 60 + om);
  return diff > 0 ? diff / 60 : 0;
}

export default function DetailedStoreSettings({ store, onUpdate }) {
  const todayDayIndex = new Date().getDay(); // 0=日, 1=月, ..., 6=土
  const todayKey = DAYS[todayDayIndex].key;

  const initHours = () => {
    const base = store.business_hours || {};
    const result = {};
    DAYS.forEach(d => {
      result[d.key] = {
        open:   base[d.key]?.open   ?? DEFAULT_HOURS[d.key].open,
        close:  base[d.key]?.close  ?? DEFAULT_HOURS[d.key].close,
        closed: base[d.key]?.closed ?? false,
      };
    });
    return result;
  };

  const [hours, setHours] = useState(initHours);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setHours(initHours());
  }, [store.id]);

  const updateDay = (dayKey, field, value) => {
    setHours(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value }
    }));
  };

  // 全曜日に一括適用（最初の営業日の時間を全曜日にコピー）
  const applyToAll = () => {
    const firstOpen = DAYS.find(d => !hours[d.key]?.closed);
    if (!firstOpen) return;
    const ref = hours[firstOpen.key];
    const updated = {};
    DAYS.forEach(d => {
      updated[d.key] = { ...hours[d.key], open: ref.open, close: ref.close };
    });
    setHours(updated);
    toast.success('全曜日に一括適用しました');
  };

  const resetToDefault = () => {
    setHours({ ...DEFAULT_HOURS });
    toast.success('デフォルト設定に戻しました');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({ business_hours: hours });
      toast.success('営業時間を保存しました');
    } catch (e) {
      toast.error('保存に失敗しました: ' + (e.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  const totalWeeklyHours = DAYS.reduce((sum, d) => {
    if (hours[d.key]?.closed) return sum;
    return sum + calcHours(hours[d.key]?.open, hours[d.key]?.close);
  }, 0);

  return (
    <div className="space-y-4">
      {/* ヘッダーアクション */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">曜日別営業時間</h3>
        <button
          onClick={applyToAll}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all border border-blue-200"
        >
          <Copy className="w-3.5 h-3.5" />
          全曜日に一括適用
        </button>
      </div>

      {/* 曜日別設定 */}
      <div className="space-y-2">
        {DAYS.map((day, idx) => {
          const isToday = day.key === todayKey;
          const dayHours = hours[day.key] || { open: '09:00', close: '19:00', closed: false };
          const h = calcHours(dayHours.open, dayHours.close);

          return (
            <div
              key={day.key}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                isToday
                  ? 'bg-red-50 border-red-300 shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* 曜日バッジ */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm ${
                isToday
                  ? 'bg-red-600 text-white shadow-sm'
                  : idx === 0 ? 'bg-red-100 text-red-600'
                  : idx === 6 ? 'bg-blue-100 text-blue-600'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {day.short}
                {isToday && <span className="sr-only">今日</span>}
              </div>

              {/* 曜日ラベル */}
              <span className={`text-sm font-semibold w-8 flex-shrink-0 ${
                idx === 0 ? 'text-red-600' : idx === 6 ? 'text-blue-600' : 'text-slate-700'
              }`}>
                {day.label}
                {isToday && <span className="text-[10px] text-red-500 ml-1">今日</span>}
              </span>

              {/* 営業日スイッチ */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Switch
                  checked={!dayHours.closed}
                  onCheckedChange={(checked) => updateDay(day.key, 'closed', !checked)}
                  className="scale-90"
                />
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  !dayHours.closed
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {!dayHours.closed ? '営業日' : '定休日'}
                </span>
              </div>

              {/* 時間設定 */}
              {!dayHours.closed ? (
                <>
                  <div className="flex items-center gap-1 flex-1">
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                      <span className="text-slate-400 text-xs">🕐</span>
                      <select
                        value={dayHours.open}
                        onChange={(e) => updateDay(day.key, 'open', e.target.value)}
                        className="text-sm font-semibold text-slate-700 bg-transparent border-none outline-none cursor-pointer"
                      >
                        {TIME_OPTIONS.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-slate-400 text-sm font-bold">〜</span>
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                      <span className="text-slate-400 text-xs">🕐</span>
                      <select
                        value={dayHours.close}
                        onChange={(e) => updateDay(day.key, 'close', e.target.value)}
                        className="text-sm font-semibold text-slate-700 bg-transparent border-none outline-none cursor-pointer"
                      >
                        {TIME_OPTIONS.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-500 flex-shrink-0 w-10 text-right">
                    {h > 0 ? `${h}h` : '-'}
                  </span>
                </>
              ) : (
                <div className="flex-1 flex items-center">
                  <span className="text-sm text-slate-400 italic">定休日</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 週間営業スケジュール */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-bold text-slate-600">📅 週間営業スケジュール</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((day, idx) => {
            const isToday = day.key === todayKey;
            const dayHours = hours[day.key] || {};
            return (
              <div
                key={day.key}
                className={`flex flex-col items-center p-2 rounded-lg text-center ${
                  isToday
                    ? 'bg-red-600 text-white shadow-sm'
                    : dayHours.closed
                    ? 'bg-slate-200 text-slate-400'
                    : 'bg-white border border-slate-200'
                }`}
              >
                <span className={`text-xs font-bold mb-1 ${
                  isToday ? 'text-white' :
                  idx === 0 ? 'text-red-600' :
                  idx === 6 ? 'text-blue-600' :
                  'text-slate-600'
                }`}>{day.short}</span>
                {!dayHours.closed ? (
                  <>
                    <span className={`text-[10px] font-semibold ${isToday ? 'text-white' : 'text-slate-700'}`}>
                      {dayHours.open}
                    </span>
                    <span className={`text-[9px] ${isToday ? 'text-red-200' : 'text-slate-400'}`}>〜</span>
                    <span className={`text-[10px] font-semibold ${isToday ? 'text-white' : 'text-slate-700'}`}>
                      {dayHours.close}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] text-slate-400">休</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
          <span className="text-xs text-slate-500">週間営業時間合計</span>
          <span className="text-sm font-bold text-slate-700">{totalWeeklyHours}時間 / 週</span>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={resetToDefault}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          デフォルトに戻す
        </button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHours(initHours())}
            className="text-xs"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            キャンセル
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="text-xs bg-red-700 hover:bg-red-800 text-white"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1" />
            )}
            保存して反映
          </Button>
        </div>
      </div>
    </div>
  );
}
