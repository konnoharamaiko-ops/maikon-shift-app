import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Clock, X, MessageSquare, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeMotionButton as MotionButton, SafeAnimatePresence as AnimatePresence } from "@/components/SafeMotion";

export default function ShiftList({ shiftRequests, onSelectDate }) {
  const [expandedNotes, setExpandedNotes] = useState({});

  const toggleNote = (id, e) => {
    e.stopPropagation();
    setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Sort by date
  const sortedShifts = [...shiftRequests].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );

  // Filter to show only upcoming shifts
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingShifts = sortedShifts.filter(s => parseISO(s.date) >= today);

  if (upcomingShifts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-slate-500 mb-1">登録済みのシフト希望はありません</p>
        <p className="text-sm text-slate-400">カレンダーから日付を選んで登録してください</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800">登録済みのシフト希望</h3>
        <p className="text-xs text-slate-400 mt-0.5">{upcomingShifts.length}件</p>
      </div>
      <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
        <AnimatePresence>
          {upcomingShifts.map((shift, index) => {
            const date = parseISO(shift.date);
            const isNoteExpanded = expandedNotes[shift.id];

            return (
              <MotionButton
                key={shift.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onSelectDate(date)}
                className="w-full p-3 sm:p-4 flex flex-col hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 sm:gap-4 w-full">
                  {/* Date */}
                  <div className="text-center min-w-[44px] sm:min-w-[48px]">
                    <p className="text-[10px] sm:text-xs text-slate-400 uppercase">
                      {format(date, 'MMM', { locale: ja })}
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-800">
                      {format(date, 'd')}
                    </p>
                    <p className={cn(
                      "text-[10px] sm:text-xs font-medium",
                      date.getDay() === 0 ? "text-red-400" : date.getDay() === 6 ? "text-blue-400" : "text-slate-400"
                    )}>
                      {format(date, 'E', { locale: ja })}
                    </p>
                  </div>

                  {/* Time display */}
                  <div className="flex-1 min-w-0">
                    {shift.is_day_off ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-50 border-slate-200 w-fit">
                        <X className="w-4 h-4 text-slate-600" />
                        <span className="text-sm font-medium text-slate-600">休み希望</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border bg-indigo-50 border-indigo-200">
                          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                          <span className="text-xs sm:text-sm font-medium text-indigo-600">
                            {shift.start_time?.slice(0, 5)} - {shift.end_time?.slice(0, 5)}
                          </span>
                        </div>
                        {shift.additional_times && shift.additional_times.length > 0 && (
                          shift.additional_times.map((at, idx) => (
                            <div key={idx} className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border bg-purple-50 border-purple-200">
                              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-600" />
                              <span className="text-[10px] sm:text-xs font-medium text-purple-600">
                                {at.start_time?.slice(0, 5)} - {at.end_time?.slice(0, 5)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notes toggle button */}
                  {shift.notes && (
                    <button
                      onClick={(e) => toggleNote(shift.id, e)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-lg transition-colors flex-shrink-0",
                        isNoteExpanded
                          ? "bg-indigo-100 text-indigo-600"
                          : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      )}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {isNoteExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {/* Notes content (expandable) */}
                {shift.notes && isNoteExpanded && (
                  <div className="mt-2 ml-[56px] sm:ml-[64px]">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                      <p className="text-xs sm:text-sm text-indigo-700 whitespace-pre-wrap">{shift.notes}</p>
                    </div>
                  </div>
                )}
              </MotionButton>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
