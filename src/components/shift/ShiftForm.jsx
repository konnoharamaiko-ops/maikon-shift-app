import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Clock, Calendar, Trash2, CheckCircle2, XCircle, MessageSquare, Save, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeMotionDiv as MotionDiv, SafeMotionButton as MotionButton, SafeAnimatePresence as AnimatePresence } from "@/components/SafeMotion";
import { Switch } from "@/components/ui/switch";

// 時間を分に変換するヘルパー
function timeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// 分を時間文字列に変換するヘルパー
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
  const lastEndMinutes = timeToMinutes(lastEnd);
  // 23:30以降は追加不可
  return lastEndMinutes <= 23 * 60;
}

// 追加可能な最小開始時刻を計算（前の終了時刻 + 30分）
function getMinStartTime(endTime, additionalTimes) {
  const lastEnd = additionalTimes.length > 0
    ? additionalTimes[additionalTimes.length - 1].end_time
    : endTime;
  return minutesToTime(timeToMinutes(lastEnd) + 30);
}

export default function ShiftForm({ date, shift, storeId, onSubmit, onDelete, onCancel, isSubmitting, isDeleting, isLocked, canEdit, notesOnlyMode, selectedDate, existingShift }) {
  // Support both old and new prop names
  const rawDate = date || selectedDate;
  const actualDate = rawDate ? (typeof rawDate === 'string' ? parseISO(rawDate) : rawDate) : null;
  const actualShift = shift || existingShift;
  const [shiftType, setShiftType] = useState(null); // 'work' or 'dayoff'
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [isPaidLeave, setIsPaidLeave] = useState(false);
  const [isFullDayAvailable, setIsFullDayAvailable] = useState(false);
  const [isNegotiableIfNeeded, setIsNegotiableIfNeeded] = useState(false);
  const [notes, setNotes] = useState('');
  const [additionalTimes, setAdditionalTimes] = useState([]);

  useEffect(() => {
    if (actualShift) {
      setShiftType(actualShift.is_day_off ? 'dayoff' : 'work');
      setStartTime(actualShift.start_time || '09:00');
      setEndTime(actualShift.end_time || '18:00');
      setIsPaidLeave(actualShift.is_paid_leave || false);
      setIsFullDayAvailable(actualShift.is_full_day_available || false);
      setIsNegotiableIfNeeded(actualShift.is_negotiable_if_needed || false);
      setNotes(actualShift.notes || '');
      setAdditionalTimes(actualShift.additional_times || []);
    } else {
      setShiftType(null);
      setStartTime('09:00');
      setEndTime('18:00');
      setIsPaidLeave(false);
      setIsFullDayAvailable(false);
      setIsNegotiableIfNeeded(false);
      setNotes('');
      setAdditionalTimes([]);
    }
  }, [actualShift, actualDate]);

  // 追加の時間帯を追加
  const handleAddTime = () => {
    const minStart = getMinStartTime(endTime, additionalTimes);
    const minStartMinutes = timeToMinutes(minStart);
    const defaultEnd = minutesToTime(Math.min(minStartMinutes + 180, 23 * 60 + 30)); // デフォルト3時間後
    setAdditionalTimes([...additionalTimes, { start_time: minStart, end_time: defaultEnd }]);
  };

  // 追加の時間帯を削除
  const handleRemoveTime = (index) => {
    // 指定のインデックス以降をすべて削除（後続の時間帯の整合性を保つため）
    setAdditionalTimes(additionalTimes.slice(0, index));
  };

  // 追加の時間帯を更新
  const handleUpdateAdditionalTime = (index, field, value) => {
    const updated = [...additionalTimes];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalTimes(updated);
  };

  const handleSubmit = () => {
    // notesOnlyMode時は備考のみ更新
    if (notesOnlyMode) {
      const data = {
        date: format(actualDate, 'yyyy-MM-dd'),
        notes: notes.trim() || '',
      };
      // 既存シフトの情報を保持
      if (actualShift) {
        data.is_day_off = actualShift.is_day_off;
        data.is_paid_leave = actualShift.is_paid_leave || false;
        data.is_full_day_available = actualShift.is_full_day_available || false;
        data.is_negotiable_if_needed = actualShift.is_negotiable_if_needed || false;
        if (!actualShift.is_day_off && !actualShift.is_full_day_available) {
          data.start_time = actualShift.start_time;
          data.end_time = actualShift.end_time;
        }
        data.additional_times = actualShift.additional_times || [];
      }
      onSubmit(data);
      return;
    }

    const isDayOff = shiftType === 'dayoff';
    const data = {
      date: format(actualDate, 'yyyy-MM-dd'),
      is_day_off: isDayOff,
      is_paid_leave: isDayOff && isPaidLeave,
      is_full_day_available: !isDayOff && isFullDayAvailable,
      is_negotiable_if_needed: isDayOff && isNegotiableIfNeeded,
      notes: notes.trim() || ''
    };
    
    if (!isDayOff && !isFullDayAvailable) {
      data.start_time = startTime;
      data.end_time = endTime;
      data.additional_times = additionalTimes.length > 0 ? additionalTimes : [];
    } else {
      data.additional_times = [];
    }
    
    onSubmit(data);
  };

  const handleDeleteClick = () => {
    if (onDelete) {
      onDelete();
    }
  };

  if (!actualDate) {
    return (
      <div className="rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-slate-500">カレンダーから日付を選択してください</p>
      </div>
    );
  }

  // 曜日に応じた色を決定
  const dayOfWeek = actualDate.getDay();
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const dayColor = isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-slate-500';

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      {/* ===== Date Header ===== */}
      <div className="mb-6 sm:mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-3 sm:mb-4">
          <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
        </div>
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-800 mb-1 sm:mb-2">
          {format(actualDate, 'M月d日', { locale: ja })}
        </h3>
        <p className={cn("text-base sm:text-lg font-medium", dayColor)}>
          {format(actualDate, '(EEEE)', { locale: ja })}
        </p>
        {/* ステータスバッジ */}
        <div className="flex gap-2 mt-3 sm:mt-4 justify-center flex-wrap">
          {actualShift && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-indigo-600 text-sm font-semibold rounded-full ring-1 ring-indigo-200">
              <CheckCircle2 className="w-4 h-4" />
              登録済み
            </span>
          )}
          {notesOnlyMode && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-amber-600 text-sm font-semibold rounded-full ring-1 ring-amber-200">
              提出期限経過（備考のみ編集可）
            </span>
          )}
          {isLocked && !notesOnlyMode && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-600 text-sm font-semibold rounded-full ring-1 ring-red-200">
              編集不可
            </span>
          )}
        </div>
      </div>

      {/* ===== Gradient Divider ===== */}
      <div className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-6 sm:mb-8" />

      {/* ===== Shift Type Selection ===== */}
      {!isLocked && !notesOnlyMode && (
        <div className="mb-6 sm:mb-8">
          <Label className="text-xs sm:text-sm font-bold text-indigo-500 uppercase tracking-widest mb-4 sm:mb-5 block text-center">
            シフト希望を選択
          </Label>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* 出勤ボタン */}
            <MotionButton
              type="button"
              onClick={() => {
                setShiftType('work');
                setIsPaidLeave(false);
                setIsNegotiableIfNeeded(false);
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "p-4 sm:p-6 md:p-8 rounded-2xl transition-all text-center relative overflow-hidden",
                shiftType === 'work'
                  ? "ring-2 ring-emerald-400"
                  : "ring-1 ring-slate-200 hover:ring-emerald-300"
              )}
            >
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 mx-auto mb-2 sm:mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
                </div>
                <div className={cn(
                  "font-bold text-sm sm:text-lg md:text-xl mb-1 sm:mb-2 transition-colors",
                  shiftType === 'work' ? "text-emerald-700" : "text-slate-700"
                )}>出勤できます</div>
                <div className="text-xs sm:text-sm text-slate-400">この日は出勤可能です</div>
              </div>
              {shiftType === 'work' && (
                <MotionDiv
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 sm:top-3 sm:right-3 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-500 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </MotionDiv>
              )}
            </MotionButton>
            
            {/* 休みボタン */}
            <MotionButton
              type="button"
              onClick={() => {
                setShiftType('dayoff');
                setIsFullDayAvailable(false);
                setAdditionalTimes([]);
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "p-4 sm:p-6 md:p-8 rounded-2xl transition-all text-center relative overflow-hidden",
                shiftType === 'dayoff'
                  ? "ring-2 ring-slate-400"
                  : "ring-1 ring-slate-200 hover:ring-slate-300"
              )}
            >
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 mx-auto mb-2 sm:mb-4 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center">
                  <XCircle className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
                </div>
                <div className={cn(
                  "font-bold text-sm sm:text-lg md:text-xl mb-1 sm:mb-2 transition-colors",
                  shiftType === 'dayoff' ? "text-slate-700" : "text-slate-700"
                )}>休み希望</div>
                <div className="text-xs sm:text-sm text-slate-400">この日は出勤できません</div>
              </div>
              {shiftType === 'dayoff' && (
                <MotionDiv
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 sm:top-3 sm:right-3 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-500 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </MotionDiv>
              )}
            </MotionButton>
          </div>
        </div>
      )}

      {/* ===== Work Options ===== */}
      <AnimatePresence>
        {shiftType === 'work' && !isLocked && !notesOnlyMode && (
          <MotionDiv
            initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
            animate={{ opacity: 1, height: 'auto', overflow: 'visible', transition: { overflow: { delay: 0.3 } } }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            className="mb-6 space-y-1"
          >
            {/* Section Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent mb-4" />

            {/* 終日出勤可能 */}
            <div className="flex items-center justify-between py-3 sm:py-4 px-2 sm:px-3 gap-3 rounded-xl hover:ring-1 hover:ring-purple-100 transition-all">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <Label className="text-sm sm:text-base font-bold text-slate-700 block truncate">
                    終日出勤可能
                  </Label>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">営業時間すべて対応可能</p>
                </div>
              </div>
              <Switch
                checked={isFullDayAvailable}
                onCheckedChange={(checked) => {
                  setIsFullDayAvailable(checked);
                  if (checked) setAdditionalTimes([]);
                }}
                className="data-[state=checked]:bg-purple-600 flex-shrink-0"
              />
            </div>

            {!isFullDayAvailable && (
              <MotionDiv
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-3 pb-4 px-2 sm:px-3"
              >
                {/* Thin divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent mb-4" />

                <Label className="text-sm sm:text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 flex-shrink-0" />
                  出勤可能な時間帯
                </Label>

                {/* メインの時間帯 */}
                <div className="grid grid-cols-2 gap-4 sm:gap-6 mt-3">
                  <div>
                    <Label htmlFor="start-time" className="text-xs sm:text-sm text-indigo-500 mb-2 block font-semibold tracking-wide">
                      開始
                    </Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        // メイン時間帯が変わったら追加時間帯をリセット
                        setAdditionalTimes([]);
                      }}
                      className="h-11 sm:h-12 text-base sm:text-lg font-semibold bg-transparent border-0 border-b-2 border-indigo-200 focus:border-indigo-500 rounded-none w-full transition-colors text-slate-700"
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-time" className="text-xs sm:text-sm text-indigo-500 mb-2 block font-semibold tracking-wide">
                      終了
                    </Label>
                    <Input
                      id="end-time"
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        // メイン時間帯が変わったら追加時間帯をリセット
                        setAdditionalTimes([]);
                      }}
                      className="h-11 sm:h-12 text-base sm:text-lg font-semibold bg-transparent border-0 border-b-2 border-indigo-200 focus:border-indigo-500 rounded-none w-full transition-colors text-slate-700"
                    />
                  </div>
                </div>

                {/* 追加の時間帯 */}
                <AnimatePresence>
                  {additionalTimes.map((at, index) => {
                    const prevEnd = index === 0 ? endTime : additionalTimes[index - 1].end_time;
                    const minStart = minutesToTime(timeToMinutes(prevEnd) + 30);
                    return (
                      <MotionDiv
                        key={index}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-teal-300 to-transparent" />
                          <span className="text-xs font-semibold text-teal-600 px-2">追加 {index + 1}</span>
                          <div className="h-px flex-1 bg-gradient-to-r from-teal-300 via-transparent to-transparent" />
                          <button
                            type="button"
                            onClick={() => handleRemoveTime(index)}
                            className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"
                          >
                            <X className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 sm:gap-6">
                          <div>
                            <Label className="text-xs sm:text-sm text-teal-500 mb-2 block font-semibold tracking-wide">
                              開始
                            </Label>
                            <Input
                              type="time"
                              value={at.start_time}
                              min={minStart}
                              onChange={(e) => handleUpdateAdditionalTime(index, 'start_time', e.target.value)}
                              className="h-11 sm:h-12 text-base sm:text-lg font-semibold bg-transparent border-0 border-b-2 border-teal-200 focus:border-teal-500 rounded-none w-full transition-colors text-slate-700"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">{prevEnd} から30分以上空けてください</p>
                          </div>
                          <div>
                            <Label className="text-xs sm:text-sm text-teal-500 mb-2 block font-semibold tracking-wide">
                              終了
                            </Label>
                            <Input
                              type="time"
                              value={at.end_time}
                              onChange={(e) => handleUpdateAdditionalTime(index, 'end_time', e.target.value)}
                              className="h-11 sm:h-12 text-base sm:text-lg font-semibold bg-transparent border-0 border-b-2 border-teal-200 focus:border-teal-500 rounded-none w-full transition-colors text-slate-700"
                            />
                          </div>
                        </div>
                      </MotionDiv>
                    );
                  })}
                </AnimatePresence>

                {/* 時間帯追加ボタン */}
                {canAddAdditionalTime(endTime, additionalTimes) && (
                  <MotionDiv
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4"
                  >
                    <button
                      type="button"
                      onClick={handleAddTime}
                      className="w-full py-2.5 rounded-xl border-2 border-dashed border-teal-200 hover:border-teal-400 text-teal-600 hover:text-teal-700 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:bg-teal-50"
                    >
                      <Plus className="w-4 h-4" />
                      時間帯を追加
                    </button>
                    <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                      前の終了時刻から30分以上空いた時間帯を追加できます
                    </p>
                  </MotionDiv>
                )}
              </MotionDiv>
            )}
          </MotionDiv>
        )}
      </AnimatePresence>

      {/* ===== Day Off Options ===== */}
      <AnimatePresence>
        {shiftType === 'dayoff' && !isLocked && !notesOnlyMode && (
          <MotionDiv
            initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
            animate={{ opacity: 1, height: 'auto', overflow: 'visible', transition: { overflow: { delay: 0.3 } } }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            className="mb-6 space-y-1"
          >
            {/* Section Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent mb-4" />

            {/* 有給申請 */}
            <div className="flex items-center justify-between py-3 sm:py-4 px-2 sm:px-3 gap-3 rounded-xl hover:ring-1 hover:ring-blue-100 transition-all">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-base sm:text-lg">💼</span>
                </div>
                <div className="min-w-0">
                  <Label className="text-sm sm:text-base font-bold text-slate-700 block truncate">
                    有給申請予定
                  </Label>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">有給休暇として申請します</p>
                </div>
              </div>
              <Switch
                checked={isPaidLeave}
                onCheckedChange={setIsPaidLeave}
                className="data-[state=checked]:bg-blue-600 flex-shrink-0"
              />
            </div>

            {/* Thin divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent mx-3" />

            {/* 要相談 */}
            <div className="flex items-center justify-between py-3 sm:py-4 px-2 sm:px-3 gap-3 rounded-xl hover:ring-1 hover:ring-amber-100 transition-all">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-base sm:text-lg">🤝</span>
                </div>
                <div className="min-w-0">
                  <Label className="text-sm sm:text-base font-bold text-slate-700 block truncate">
                    人員不足なら要相談
                  </Label>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">必要に応じて調整可能</p>
                </div>
              </div>
              <Switch
                checked={isNegotiableIfNeeded}
                onCheckedChange={setIsNegotiableIfNeeded}
                className="data-[state=checked]:bg-amber-600 flex-shrink-0"
              />
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>

      {/* ===== Notes ===== */}
      {(shiftType || isLocked || notesOnlyMode) && (
        <div className="mb-6">
          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent mb-5" />

          <Label htmlFor="notes" className="text-sm sm:text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 flex-shrink-0" />
            備考・連絡事項
            <span className="text-xs font-normal text-slate-400 ml-1">（任意）</span>
            {notesOnlyMode && <span className="ml-auto text-amber-500 text-xs sm:text-sm font-semibold">※ 期限後は備考のみ編集可能</span>}
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="連絡事項や希望があれば入力してください..."
            className="resize-none h-20 sm:h-24 text-sm sm:text-base border-0 border-b-2 border-indigo-200 focus:border-indigo-500 rounded-none bg-transparent transition-colors text-slate-700 placeholder:text-slate-300"
            disabled={isLocked && !notesOnlyMode}
          />
        </div>
      )}

      {/* ===== Divider before actions ===== */}
      {(shiftType || isLocked || notesOnlyMode) && (
        <div className="h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent mb-6" />
      )}

      {/* ===== Action Buttons ===== */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || (!canEdit && !notesOnlyMode && canEdit !== undefined) || (!shiftType && !notesOnlyMode)}
          className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl h-12 sm:h-14 text-sm sm:text-base font-bold transition-all gap-2"
        >
          <Save className="w-4 h-4 sm:w-5 sm:h-5" />
          {isSubmitting ? '保存中...' : notesOnlyMode ? '備考を更新' : actualShift ? '更新する' : '登録する'}
        </Button>
        {actualShift && (canEdit || canEdit === undefined) && !notesOnlyMode && onDelete && (
          <Button
            onClick={handleDeleteClick}
            disabled={isSubmitting || isDeleting}
            variant="outline"
            className="rounded-xl h-12 sm:h-14 text-red-500 hover:text-red-600 border-0 ring-1 ring-red-200 hover:ring-red-300 font-bold transition-all"
          >
            <Trash2 className="w-5 h-5 sm:mr-2" />
            <span className="hidden sm:inline">削除</span>
          </Button>
        )}
        {onCancel && (
          <Button
            onClick={onCancel}
            disabled={isSubmitting || isDeleting}
            variant="ghost"
            className="rounded-xl h-12 sm:h-14 font-bold text-slate-400 hover:text-slate-600 transition-all"
          >
            キャンセル
          </Button>
        )}
      </div>
    </MotionDiv>
  );
}
