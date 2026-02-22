import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CheckCircle, 
  Mail, 
  MessageSquare, 
  Bell, 
  Users, 
  Download, 
  Printer, 
  FileText,
  AlertCircle,
  Eye,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, endOfWeek, getDay, parseISO, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { insertRecord } from '@/api/supabaseHelpers';
import { createNotification } from '@/components/notifications/NotificationSystem';
import { cn } from '@/lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { ConfirmShiftPreview, WeekTimelineView } from './ShiftTableView';
import ReadOnlyTableView from './ReadOnlyTableView';
import { getStoreSettingsForDate } from '@/hooks/useStoreSettings';

export default function ShiftConfirmDialog({
  open,
  onOpenChange,
  selectedMonth,
  users,
  workShifts,
  store,
  currentViewMode = 'month'
}) {
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [notifyMethods, setNotifyMethods] = useState({
    app: true,
    email: true,
    line: true
  });
  const [selectedUserEmails, setSelectedUserEmails] = useState([]);
  const [activeTab, setActiveTab] = useState('preview');
  const printRef = useRef(null);

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Filter users who have shifts in this month
  const usersWithShifts = useMemo(() => {
    const emailsWithShifts = new Set(workShifts.map(s => s.user_email));
    return users
      .filter(u => emailsWithShifts.has(u.email))
      .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999));
  }, [users, workShifts]);

  // Initialize selected users
  React.useEffect(() => {
    if (open && usersWithShifts.length > 0 && selectedUserEmails.length === 0) {
      setSelectedUserEmails(usersWithShifts.map(u => u.email));
    }
  }, [open, usersWithShifts]);

  const toggleUser = (email) => {
    setSelectedUserEmails(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email) 
        : [...prev, email]
    );
  };

  const selectAll = () => setSelectedUserEmails(usersWithShifts.map(u => u.email));
  const selectNone = () => setSelectedUserEmails([]);

  // sessionStorageから選択中の週・日・週開始曜日を取得
  const savedWeekIndex = parseInt(sessionStorage.getItem('shiftTableSelectedWeek') || '0', 10);
  const savedWeekStartsOn = parseInt(sessionStorage.getItem('shiftTableWeekStartsOn') || '1', 10);
  const savedSelectedDay = sessionStorage.getItem('shiftTableSelectedDay');

  // viewModeに応じて表示期間を計算
  const displayDays = useMemo(() => {
    if (currentViewMode === 'month' || currentViewMode === 'confirm') {
      return days;
    } else if (currentViewMode === 'week' || currentViewMode === 'day') {
      const weeksInMonth = eachWeekOfInterval({
        start: monthStart,
        end: monthEnd
      }, { weekStartsOn: savedWeekStartsOn });
      const weekIdx = Math.min(savedWeekIndex, weeksInMonth.length - 1);
      if (weekIdx >= 0 && weekIdx < weeksInMonth.length) {
        const weekStart = weeksInMonth[weekIdx];
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: savedWeekStartsOn });
        return eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(d =>
          d >= monthStart && d <= monthEnd
        );
      }
      return days;
    }
    return days;
  }, [currentViewMode, days, monthStart, monthEnd, savedWeekIndex, savedWeekStartsOn]);

  // 表示期間のラベルを生成
  const getPeriodLabel = () => {
    if (currentViewMode === 'week' || currentViewMode === 'day') {
      if (displayDays.length > 0) {
        const start = displayDays[0];
        const end = displayDays[displayDays.length - 1];
        return `第${savedWeekIndex + 1}週 (${format(start, 'M/d', { locale: ja })} - ${format(end, 'M/d', { locale: ja })})`;
      }
    }
    return '';
  };

  // Get the view mode label for display
  const getViewModeLabel = () => {
    switch (currentViewMode) {
      case 'month': return '月ごと';
      case 'week': return '週ごと';
      case 'day': return '日ごと';
      case 'confirm': return '月ごと横表';
      default: return '月ごと';
    }
  };

  // ===== Render the preview using actual React components from ShiftTableView =====
  const renderPreviewContent = () => {
    switch (currentViewMode) {
      case 'confirm':
        return (
          <ConfirmShiftPreview
            selectedMonth={selectedMonth}
            users={users}
            workShifts={workShifts}
            store={store}
            monthDays={displayDays}
          />
        );
      case 'day':
        return (
          <WeekTimelineView
            weekDays={displayDays}
            users={users}
            workShifts={workShifts}
            onEditShift={() => {}}
            onCellClick={() => {}}
            shiftRequests={[]}
            store={store}
          />
        );
      case 'month':
      case 'week':
      default:
        return (
          <ReadOnlyTableView
            displayDays={displayDays}
            users={users}
            workShifts={workShifts}
            store={store}
            shiftRequests={[]}
          />
        );
    }
  };

  // ===== Build high-quality snapshot HTML for DB storage =====
  // This HTML is designed to match the React component output as closely as possible
  const buildSnapshotHtml = () => {
    const monthStr = format(selectedMonth, 'yyyy年M月');
    const storeName = store?.name || store?.store_name || '店舗';

    // Time formatting helper matching formatTimeJa
    const formatTimeJa = (t) => {
      if (!t) return '';
      const [h, m] = t.split(':');
      const hour = parseInt(h, 10);
      const min = parseInt(m, 10);
      if (min === 0) return `${hour}時`;
      return `${hour}時${min}分`;
    };

    // Short time format for confirm view
    const fmtT = (t) => {
      if (!t) return '';
      const [h, m] = t.split(':');
      return parseInt(m) === 0 ? `${parseInt(h)}` : `${parseInt(h)}:${m}`;
    };

    const orderedUsers = users
      .filter(u => (u.user_role || u.role) === 'user')
      .sort((a, b) => (a.metadata?.sort_order ?? 999) - (b.metadata?.sort_order ?? 999));

    let tableHtml = '';

    if (currentViewMode === 'confirm') {
      // ===== 月ごと横表 (ConfirmShiftPreview matching) =====
      const headerDays = displayDays.map(day => {
        const dow = getDay(day);
        const isSun = dow === 0;
        const isSat = dow === 6;
        const color = isSun ? '#ef4444' : isSat ? '#3b82f6' : '#475569';
        const bg = (isSun || isSat) ? '#f1f5f9' : '#f8fafc';
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        return `<th style="border:1px solid #cbd5e1;padding:1px;font-size:10px;color:${color};background:${bg};text-align:center;">
          <div style="font-weight:bold;">${format(day, 'd')}</div>
          <div style="font-size:8px;">${dayNames[dow]}</div>
        </th>`;
      }).join('');

      const userRows = orderedUsers.map(user => {
        const cells = displayDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const shift = workShifts.find(s => s.user_email === user.email && s.date === dateStr);
          const dow = getDay(day);
          const isWeekend = dow === 0 || dow === 6;
          let bgColor = isWeekend ? '#f8fafc' : 'white';
          let content = '';
          if (shift) {
            const startH = parseInt(shift.start_time?.split(':')[0] || '0');
            if (startH < 12) bgColor = '#ecfeff'; // cyan-50
            else if (startH < 17) bgColor = '#f7fee7'; // lime-50
            else bgColor = '#fff7ed'; // orange-50
            content = `<div style="font-size:8px;line-height:1.2;font-weight:500;">${fmtT(shift.start_time)}-${fmtT(shift.end_time)}</div>`;
          }
          return `<td style="border:1px solid #cbd5e1;text-align:center;background:${bgColor};padding:0 1px;height:32px;">${content}</td>`;
        }).join('');
        const name = user.metadata?.display_name || user.full_name || user.email.split('@')[0];
        return `<tr><td style="border:1px solid #cbd5e1;padding:2px 4px;font-size:11px;font-weight:bold;background:#f8fafc;white-space:nowrap;color:#334155;">${name}</td>${cells}</tr>`;
      }).join('');

      tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr>
          <th style="min-width:60px;border:1px solid #cbd5e1;padding:2px 4px;font-size:11px;font-weight:bold;background:#f8fafc;color:#334155;">氏名</th>
          ${headerDays}
        </tr></thead>
        <tbody>${userRows}</tbody>
      </table>`;

    } else if (currentViewMode === 'day') {
      // ===== 日ごと (WeekTimelineView matching) =====
      // タイムライン表示をHTMLで再現
      const getTimeRange = () => {
        if (!store?.business_hours) return { startHour: 6, endHour: 23 };
        const bh = store.business_hours;
        let minOpen = 24, maxClose = 0;
        const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        dayKeys.forEach(day => {
          const dayConfig = bh[day];
          if (dayConfig && !dayConfig.closed && !dayConfig.is_closed) {
            const openH = parseInt(dayConfig.open?.split(':')[0] || '9');
            const closeH = parseInt(dayConfig.close?.split(':')[0] || '18');
            if (openH < minOpen) minOpen = openH;
            if (closeH > maxClose) maxClose = closeH;
          }
        });
        if (minOpen >= maxClose) return { startHour: 6, endHour: 23 };
        let mStart = minOpen > 0 ? minOpen - 1 : 0;
        let mEnd = maxClose < 24 ? maxClose + 1 : 24;
        return { startHour: mStart, endHour: mEnd };
      };
      const { startHour, endHour } = getTimeRange();
      const hourCount = endHour - startHour;
      const hours = Array.from({ length: hourCount }, (_, i) => i + startHour);

      let dayBlocks = '';
      displayDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayShifts = workShifts.filter(s => s.date === dateStr);
        const dayOfWeek = getDay(day);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Time header
        const timeHeaders = hours.map(hour => {
          const leftPct = ((hour - startHour) / hourCount) * 100;
          return `<div style="position:absolute;left:${leftPct}%;font-size:10px;color:#475569;font-weight:500;">${hour}</div>`;
        }).join('');

        // Grid lines
        const gridLines = hours.map(hour => {
          const leftPct = ((hour - startHour) / hourCount) * 100;
          return `<div style="position:absolute;left:${leftPct}%;height:100%;border-left:1px solid #e2e8f0;"></div>`;
        }).join('');

        // Staff rows
        const staffRows = orderedUsers.map(user => {
          const userShifts = dayShifts.filter(s => s.user_email === user?.email);
          const name = user?.metadata?.display_name || user?.full_name || user?.email?.split('@')[0];

          let shiftBars = '';
          userShifts.forEach(shift => {
            const [sH, sM] = shift.start_time.split(':').map(Number);
            const [eH, eM] = shift.end_time.split(':').map(Number);
            const leftPct = Math.max(0, ((sH - startHour) + sM / 60) / hourCount * 100);
            const widthPct = ((eH - sH) + (eM - sM) / 60) / hourCount * 100;
            const hour = sH;
            let bgColor, textColor;
            if (hour < 12) { bgColor = '#a5f3fc'; textColor = '#164e63'; } // cyan-200
            else if (hour < 17) { bgColor = '#bef264'; textColor = '#365314'; } // lime-200
            else { bgColor = '#fdba74'; textColor = '#7c2d12'; } // orange-200
            shiftBars += `<div style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:32px;top:4px;background:${bgColor};color:${textColor};border-radius:4px;padding:0 8px;display:flex;align-items:center;font-size:11px;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.05);overflow:hidden;white-space:nowrap;">${shift.start_time?.slice(0, 5)} - ${shift.end_time?.slice(0, 5)}</div>`;
          });

          return `<div style="display:flex;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:8px;">
            <div style="width:130px;flex-shrink:0;padding-right:12px;font-size:15px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
            <div style="flex:1;position:relative;height:40px;">
              ${gridLines}
              ${shiftBars}
            </div>
          </div>`;
        }).join('');

        dayBlocks += `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;background:${isWeekend ? 'rgba(254,226,226,0.1)' : 'white'};">
          <div style="margin-bottom:12px;">
            <h3 style="font-size:16px;font-weight:bold;color:#1e293b;">${format(day, 'M月d日(E)', { locale: ja })}</h3>
          </div>
          <div style="display:flex;border-bottom:2px solid #cbd5e1;margin-bottom:8px;">
            <div style="width:130px;flex-shrink:0;"></div>
            <div style="flex:1;position:relative;height:28px;">${timeHeaders}</div>
          </div>
          ${staffRows}
          ${dayShifts.length === 0 ? '<div style="text-align:center;padding:16px;color:#94a3b8;font-size:13px;">この日のシフトはまだ登録されていません</div>' : ''}
        </div>`;
      });

      tableHtml = dayBlocks;

    } else {
      // ===== 月ごと / 週ごと (ReadOnlyTableView matching) =====
      const userHeaders = orderedUsers.map(u => {
        const name = u.metadata?.display_name || u.full_name || u.email.split('@')[0];
        return `<th style="border:1px solid #cbd5e1;padding:4px 8px;background:#f1f5f9;font-size:12px;font-weight:600;white-space:nowrap;color:#334155;">${name}</th>`;
      }).join('');

      let rows = '';
      displayDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dow = getDay(day);
        const isWeekend = dow === 0 || dow === 6;
        const dateColor = dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : '#334155';
        const dateBg = isWeekend ? '#fef2f2' : 'white';

        // Store settings for this date
        const storeSettings = store ? getStoreSettingsForDate(store, dateStr) : null;
        const isClosed = storeSettings?.isClosedDay;

        let cells = '';
        let totalHours = 0;
        let staffCount = 0;

        orderedUsers.forEach(user => {
          const shifts = workShifts.filter(s => s.user_email === user.email && s.date === dateStr);
          let content = '';
          let cellBg = isWeekend ? 'rgba(254,226,226,0.3)' : 'white';
          if (shifts.length > 0) {
            const shiftDivs = shifts.map(shift => {
              staffCount++;
              const startH = parseInt(shift.start_time?.split(':')[0] || '0');
              let shiftBg, shiftText, shiftBorder;
              if (startH < 12) { shiftBg = '#cffafe'; shiftText = '#164e63'; shiftBorder = '#67e8f9'; } // cyan-100
              else if (startH < 17) { shiftBg = '#ecfccb'; shiftText = '#365314'; shiftBorder = '#a3e635'; } // lime-100
              else { shiftBg = '#ffedd5'; shiftText = '#7c2d12'; shiftBorder = '#fb923c'; } // orange-100
              const st = new Date(`2000-01-01T${shift.start_time}`);
              const en = new Date(`2000-01-01T${shift.end_time}`);
              const h = (en - st) / 3600000;
              if (h > 0) totalHours += h;
              return `<div style="background:${shiftBg};color:${shiftText};border:1px solid ${shiftBorder};border-radius:3px;padding:1px 4px;font-size:10px;font-weight:500;text-align:center;line-height:1.3;margin:1px 0;">${formatTimeJa(shift.start_time)}-${formatTimeJa(shift.end_time)}</div>`;
            }).join('');
            content = `<div style="display:flex;flex-direction:column;gap:1px;">${shiftDivs}</div>`;
          }
          cells += `<td style="border:1px solid #cbd5e1;background:${cellBg};padding:2px;vertical-align:middle;">${content}</td>`;
        });

        const totalContent = staffCount > 0 
          ? `<div style="font-size:11px;">${new Set(workShifts.filter(s => s.date === dateStr).map(s => s.user_email)).size}人 | ${totalHours.toFixed(1)}h</div>` 
          : '';

        // Business hours info
        let businessHoursInfo = '';
        if (storeSettings?.businessHours && !isClosed) {
          businessHoursInfo = `<div style="font-size:9px;color:#94a3b8;">${storeSettings.businessHours.open}-${storeSettings.businessHours.close}</div>`;
        }

        const rowOpacity = isClosed ? 'opacity:0.6;' : '';
        const closedBg = isClosed ? '#e2e8f0' : dateBg;

        rows += `<tr style="${rowOpacity}">
          <td style="border:1px solid #cbd5e1;padding:4px 8px;font-weight:500;background:${closedBg};white-space:nowrap;">
            <div style="font-size:13px;">
              <span style="color:${dateColor};">${format(day, 'M/d')}</span>
              <span style="font-size:11px;color:#64748b;margin-left:4px;">(${format(day, 'E', { locale: ja })})</span>
              ${isClosed ? '<span style="font-size:10px;color:#ef4444;margin-left:4px;font-weight:600;">休</span>' : ''}
            </div>
            ${businessHoursInfo}
          </td>
          ${cells}
          <td style="border:1px solid #cbd5e1;text-align:center;font-weight:600;background:${isWeekend ? '#fecaca' : '#fef9c3'};padding:4px;">
            ${totalContent}
          </td>
        </tr>`;
      });

      // User totals row
      let userTotalCells = '';
      orderedUsers.forEach(user => {
        let totalHours = 0;
        let workDays = new Set();
        workShifts.forEach(shift => {
          if (shift.user_email === user.email) {
            const st = new Date(`2000-01-01T${shift.start_time}`);
            const en = new Date(`2000-01-01T${shift.end_time}`);
            const h = (en - st) / 3600000;
            if (h > 0) totalHours += h;
            workDays.add(shift.date);
          }
        });
        userTotalCells += `<td style="border:1px solid #cbd5e1;text-align:center;background:#fef08a;padding:4px;">
          <div style="font-size:11px;">${workDays.size}日</div>
          <div style="font-size:11px;color:#475569;">${totalHours.toFixed(1)}h</div>
        </td>`;
      });

      tableHtml = `<table style="border-collapse:collapse;width:100%;min-width:600px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="border:1px solid #cbd5e1;padding:4px 8px;font-weight:600;font-size:12px;color:#334155;">日付</th>
          ${userHeaders}
          <th style="border:1px solid #cbd5e1;padding:4px;background:#fefce8;font-weight:600;font-size:12px;min-width:120px;">
            <div>合計</div>
          </th>
        </tr></thead>
        <tbody>
          ${rows}
          <tr style="background:#f1f5f9;font-weight:600;">
            <td style="border:1px solid #cbd5e1;padding:4px 8px;color:#334155;font-size:12px;">合計</td>
            ${userTotalCells}
            <td style="border:1px solid #cbd5e1;background:#fef08a;padding:4px;"></td>
          </tr>
        </tbody>
      </table>`;
    }

    // Legend
    const legendHtml = currentViewMode === 'day' ? '' : `
      <div style="margin-top:12px;display:flex;gap:16px;font-size:11px;color:#64748b;">
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:12px;height:12px;background:${currentViewMode === 'confirm' ? '#ecfeff' : '#cffafe'};border:1px solid #67e8f9;border-radius:2px;"></span>
          早番 (~12:00)
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:12px;height:12px;background:${currentViewMode === 'confirm' ? '#f7fee7' : '#ecfccb'};border:1px solid #a3e635;border-radius:2px;"></span>
          中番 (12:00-17:00)
        </span>
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:12px;height:12px;background:${currentViewMode === 'confirm' ? '#fff7ed' : '#ffedd5'};border:1px solid #fb923c;border-radius:2px;"></span>
          遅番 (17:00~)
        </span>
      </div>`;

    return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;padding:8px;">
      <div style="text-align:center;margin-bottom:12px;">
        <h2 style="font-size:18px;font-weight:bold;margin:0;color:#1e293b;">${storeName} ${monthStr} 確定シフト表</h2>
        <p style="font-size:11px;color:#94a3b8;margin:4px 0;">確定日: ${format(new Date(), 'yyyy/MM/dd HH:mm')} | 表示形式: ${getViewModeLabel()}</p>
      </div>
      <div style="overflow-x:auto;">
        ${tableHtml}
      </div>
      ${legendHtml}
    </div>`;
  };

  // Handle PDF Generation
  const handleDownloadPdf = useCallback(async () => {
    if (!printRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      
      const isLandscape = currentViewMode === 'confirm' || currentViewMode === 'week';
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 5;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      
      const imgAspect = canvas.width / canvas.height;
      let imgWidth = usableWidth;
      let imgHeight = usableWidth / imgAspect;
      
      if (imgHeight > usableHeight) {
        imgHeight = usableHeight;
        imgWidth = usableHeight * imgAspect;
      }
      
      const xOffset = margin + (usableWidth - imgWidth) / 2;
      const yOffset = margin + (usableHeight - imgHeight) / 2;
      
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);

      pdf.save(`シフト表_${format(selectedMonth, 'yyyy年MM月')}_${getViewModeLabel()}.pdf`);
      toast.success('PDFをダウンロードしました');
    } catch (error) {
      console.error('PDF生成エラー:', error);
      toast.error('PDF生成に失敗しました');
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [selectedMonth, currentViewMode]);

  // Send confirmation notifications + save snapshot
  const handleConfirmAndNotify = async () => {
    setIsSending(true);
    try {
      const monthStr = format(selectedMonth, 'yyyy年M月');
      const storeName = store?.name || store?.store_name || '店舗';
      const userEmails = selectedUserEmails.length > 0 ? selectedUserEmails : usersWithShifts.map(u => u.email);
      const currentUserEmail = (await supabase.auth.getUser())?.data?.user?.email || 'unknown';

      if (userEmails.length === 0) {
        toast.error('通知対象ユーザーが選択されていません');
        setIsSending(false);
        return;
      }

      // ---- Save confirmed shift snapshot ----
      const targetYear = selectedMonth.getFullYear();
      const targetMonth = selectedMonth.getMonth() + 1;

      // buildSnapshotHtml() を使用してHTMLを生成（html2canvasキャプチャではなく）
      const snapshotHtml = buildSnapshotHtml();

      // 確定シフト表の期間情報を計算（displayDaysベース）
      const periodStart = displayDays.length > 0 ? format(displayDays[0], 'M月d日') : format(monthStart, 'M月d日');
      const periodEnd = displayDays.length > 0 ? format(displayDays[displayDays.length - 1], 'M月d日') : format(monthEnd, 'M月d日');
      const periodStr = `${periodStart}〜${periodEnd}`;

      // Mark previous snapshots as not current
      try {
        const { data: oldSnaps } = await supabase
          .from('ConfirmedShiftSnapshot')
          .select('id')
          .eq('store_id', store?.id)
          .eq('target_year', targetYear)
          .eq('target_month', targetMonth)
          .eq('is_current', true);
        if (oldSnaps && oldSnaps.length > 0) {
          for (const snap of oldSnaps) {
            await supabase.from('ConfirmedShiftSnapshot').update({ is_current: false }).eq('id', snap.id);
          }
        }
      } catch (e) {
        console.warn('旧スナップショット更新エラー:', e);
      }

      // Insert new snapshot with currentViewMode as display_format
      // JSONデータも保存して、ConfirmedShiftViewerで同じReactコンポーネントを使って表示できるようにする
      const snapshotShiftData = workShifts.map(s => ({
        id: s.id,
        user_email: s.user_email,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
      }));
      const snapshotUsersData = users.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        user_role: u.user_role || u.role,
        metadata: u.metadata ? { display_name: u.metadata.display_name, sort_order: u.metadata.sort_order } : {},
      }));
      const snapshotStoreData = {
        id: store?.id,
        name: store?.name || store?.store_name,
        business_hours: store?.business_hours || {},
        temporary_closures: store?.temporary_closures || [],
        holiday_exceptions: store?.holiday_exceptions || [],
      };
      const snapshotDisplayDays = displayDays.map(d => format(d, 'yyyy-MM-dd'));

      await insertRecord('ConfirmedShiftSnapshot', {
        store_id: store?.id || '',
        target_year: targetYear,
        target_month: targetMonth,
        display_format: currentViewMode,
        html_content: snapshotHtml,
        shift_data: JSON.stringify(snapshotShiftData),
        users_data: JSON.stringify(snapshotUsersData),
        store_data: JSON.stringify(snapshotStoreData),
        display_days: JSON.stringify(snapshotDisplayDays),
        confirmed_by: currentUserEmail,
        is_current: true,
      });

      // Reset all user confirmations for this store/month
      const monthStr2 = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
      try {
        const { data: oldConfirms } = await supabase
          .from('ShiftConfirmation')
          .select('id')
          .eq('store_id', store?.id)
          .eq('month', monthStr2);
        if (oldConfirms && oldConfirms.length > 0) {
          for (const c of oldConfirms) {
            await supabase.from('ShiftConfirmation').delete().eq('id', c.id);
          }
        }
      } catch (e) {
        console.warn('確認状況リセットエラー:', e);
      }

      // ---- PDF生成（通知添付用） ----
      let pdfAttachment = null;
      if (printRef.current && (notifyMethods.email || notifyMethods.line)) {
        try {
          const canvas = await html2canvas(printRef.current, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');
          const isLandscape = currentViewMode === 'confirm' || currentViewMode === 'week';
          const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 5;
          const usableWidth = pageWidth - margin * 2;
          const usableHeight = pageHeight - margin * 2;
          const imgAspect = canvas.width / canvas.height;
          let imgWidth = usableWidth;
          let imgHeight = usableWidth / imgAspect;
          if (imgHeight > usableHeight) {
            imgHeight = usableHeight;
            imgWidth = usableHeight * imgAspect;
          }
          const xOffset = margin + (usableWidth - imgWidth) / 2;
          const yOffset = margin + (usableHeight - imgHeight) / 2;
          pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);
          const pdfBase64 = pdf.output('datauristring').split(',')[1];
          pdfAttachment = {
            filename: `シフト表_${format(selectedMonth, 'yyyy年MM月')}_${getViewModeLabel()}.pdf`,
            content: pdfBase64,
          };
        } catch (e) {
          console.warn('PDF生成エラー（通知は続行）:', e);
        }
      }

      // ---- Send notifications ----
      for (const email of userEmails) {
        await createNotification({
          userEmail: email,
          title: `${storeName} ${monthStr}（${periodStr}）シフト確定`,
          message: `アプリの「確定シフト表」アイコンからご確認ください。`,
          type: 'shift_confirmed',
          actionUrl: '/',
          sendEmail: notifyMethods.email,
          sendLine: notifyMethods.line,
          notificationType: 'shift_confirm',
          pdfAttachment: pdfAttachment || null,
        });
      }

      toast.success(`${userEmails.length}名にシフト確定通知を送信しました`);
      onOpenChange(false);
    } catch (error) {
      console.error('通知送信エラー:', error);
      toast.error('通知の送信に失敗しました');
    } finally {
      setIsSending(false);
    }
  };

  // Tab configuration with colors
  const tabConfig = {
    preview: { icon: Eye, label: 'プレビュー', shortLabel: '確認', color: 'indigo' },
    users: { icon: Users, label: '通知対象', shortLabel: '対象', color: 'emerald' },
    settings: { icon: Bell, label: '設定', shortLabel: '設定', color: 'amber' },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg flex items-center gap-2 text-indigo-700">
            <CheckCircle className="w-5 h-5" />
            シフト確定連絡 — {format(selectedMonth, 'yyyy年M月')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="preview" value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* ===== 改善されたタブUI ===== */}
          <div className="flex gap-2 mb-4 sm:mb-6 p-1 bg-slate-100 rounded-xl">
            {Object.entries(tabConfig).map(([key, config]) => {
              const Icon = config.icon;
              const isActive = activeTab === key;
              const colorMap = {
                indigo: { active: 'bg-indigo-600 text-white shadow-lg shadow-indigo-200', icon: 'text-indigo-200' },
                emerald: { active: 'bg-emerald-600 text-white shadow-lg shadow-emerald-200', icon: 'text-emerald-200' },
                amber: { active: 'bg-amber-500 text-white shadow-lg shadow-amber-200', icon: 'text-amber-200' },
              };
              const colors = colorMap[config.color];
              
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-2 sm:px-4 rounded-lg font-bold transition-all duration-200 text-xs sm:text-sm",
                    isActive
                      ? colors.active
                      : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                  )}
                >
                  <Icon className={cn(
                    "w-4 h-4 sm:w-5 sm:h-5",
                    isActive ? colors.icon : "text-slate-400"
                  )} />
                  <span className="hidden sm:inline">{config.label}</span>
                  <span className="sm:hidden">{config.shortLabel}</span>
                  {key === 'users' && (
                    <span className={cn(
                      "text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-bold",
                      isActive ? "bg-white/20" : "bg-slate-200 text-slate-600"
                    )}>
                      {selectedUserEmails.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <TabsContent value="preview" className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
              <h3 className="text-xs sm:text-sm font-bold text-slate-700 flex flex-wrap items-center gap-1">
                確定シフト表のプレビュー
                <span className="text-[10px] sm:text-xs font-normal text-indigo-600 bg-indigo-50 px-1.5 sm:px-2 py-0.5 rounded-full">
                  {getViewModeLabel()}形式
                </span>
                {getPeriodLabel() && (
                  <span className="text-[10px] sm:text-xs font-normal text-amber-600 bg-amber-50 px-1.5 sm:px-2 py-0.5 rounded-full">
                    {getPeriodLabel()}
                  </span>
                )}
              </h3>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="text-xs h-8"
                >
                  {isGeneratingPdf ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-600 mr-1"></div>
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1" />
                  )}
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs h-8">
                  <Printer className="w-3.5 h-3.5 mr-1" />
                  印刷
                </Button>
              </div>
            </div>
            
            <div className="border border-slate-200 rounded-xl p-2 sm:p-6 bg-white shadow-inner overflow-x-auto">
              <div ref={printRef} className="min-w-[600px] p-2 sm:p-4 bg-white">
                <div className="text-center mb-4 sm:mb-6">
                  <h2 className="text-base sm:text-xl font-bold text-slate-800">{store?.name || store?.store_name} {format(selectedMonth, 'yyyy年M月')} 確定シフト表</h2>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1">
                    確定日: {format(new Date(), 'yyyy/MM/dd HH:mm')} | 表示形式: {getViewModeLabel()}
                    {getPeriodLabel() && ` | ${getPeriodLabel()}`}
                  </p>
                </div>
                
                {/* ShiftTableViewと完全に同じReactコンポーネントを使用 */}
                {renderPreviewContent()}
              </div>
            </div>
            {/* プレビュータブ: 「次へ」ボタン → 通知対象タブへ */}
            <div className="mt-4 sm:mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs sm:text-sm text-slate-500">
                キャンセル
              </Button>
              <Button 
                onClick={() => setActiveTab('users')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 sm:px-8 h-9 sm:h-11 rounded-xl font-bold shadow-lg shadow-emerald-100 text-xs sm:text-sm"
              >
                通知対象を選択
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-3 sm:space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs sm:text-sm font-bold text-slate-700">通知を送信するスタッフを選択</h3>
              <div className="flex gap-1 sm:gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-[10px] sm:text-xs text-indigo-600 h-7 px-2">全選択</Button>
                <Button variant="ghost" size="sm" onClick={selectNone} className="text-[10px] sm:text-xs text-slate-500 h-7 px-2">全解除</Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 max-h-[400px] overflow-y-auto p-1">
              {usersWithShifts.map(user => (
                <div 
                  key={user.email}
                  onClick={() => toggleUser(user.email)}
                  className={cn(
                    "flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border cursor-pointer transition-all",
                    selectedUserEmails.includes(user.email)
                      ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-100"
                      : "bg-white border-slate-200 hover:border-indigo-200"
                  )}
                >
                  <Checkbox 
                    checked={selectedUserEmails.includes(user.email)}
                    onCheckedChange={() => toggleUser(user.email)}
                  />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-700 truncate">
                      {user.metadata?.display_name || user.full_name || user.email.split('@')[0]}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* 通知対象タブ: 「次へ」ボタン → 設定タブへ */}
            <div className="mt-4 sm:mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
              <Button variant="ghost" onClick={() => setActiveTab('preview')} className="text-xs sm:text-sm text-slate-500">
                <ChevronRight className="w-3.5 h-3.5 mr-1 rotate-180" />
                プレビューに戻る
              </Button>
              <Button 
                onClick={() => setActiveTab('settings')}
                className="bg-amber-500 hover:bg-amber-600 text-white px-6 sm:px-8 h-9 sm:h-11 rounded-xl font-bold shadow-lg shadow-amber-100 text-xs sm:text-sm"
              >
                通知設定へ
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 sm:space-y-6 py-2 sm:py-4">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-xs sm:text-sm font-bold text-slate-700">通知方法</h3>
              <div className="grid gap-3 sm:gap-4">
                <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-700">アプリ内通知</p>
                      <p className="text-[10px] sm:text-xs text-slate-400">アプリの通知一覧に表示します</p>
                    </div>
                  </div>
                  <Checkbox 
                    checked={notifyMethods.app}
                    onCheckedChange={(checked) => setNotifyMethods(prev => ({ ...prev, app: !!checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                      <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-700">メール通知</p>
                      <p className="text-[10px] sm:text-xs text-slate-400">登録されたメールアドレスに送信します</p>
                    </div>
                  </div>
                  <Checkbox 
                    checked={notifyMethods.email}
                    onCheckedChange={(checked) => setNotifyMethods(prev => ({ ...prev, email: !!checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-700">LINE通知</p>
                      <p className="text-[10px] sm:text-xs text-slate-400">連携済みのLINEアカウントに通知します</p>
                    </div>
                  </div>
                  <Checkbox 
                    checked={notifyMethods.line}
                    onCheckedChange={(checked) => setNotifyMethods(prev => ({ ...prev, line: !!checked }))}
                  />
                </div>
              </div>
            </div>

            <div className="p-3 sm:p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-2 sm:gap-3">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-[10px] sm:text-xs text-amber-700 leading-relaxed">
                <p className="font-bold mb-1">確定後の変更について</p>
                <p>確定通知を送信すると、スタッフは自分のシフトを確認できるようになります。確定後にシフトを変更した場合は、再度このダイアログから通知を送信することをお勧めします。</p>
              </div>
            </div>
            {/* 設定タブ: 「確定通知」ボタン */}
            <div className="mt-4 sm:mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
              <Button variant="ghost" onClick={() => setActiveTab('users')} className="text-xs sm:text-sm text-slate-500">
                <ChevronRight className="w-3.5 h-3.5 mr-1 rotate-180" />
                通知対象に戻る
              </Button>
              <Button 
                onClick={handleConfirmAndNotify} 
                disabled={isSending || selectedUserEmails.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 h-9 sm:h-11 rounded-xl font-bold shadow-lg shadow-indigo-100 text-xs sm:text-sm"
              >
                {isSending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    送信中...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-1 sm:mr-2" />
                    確定通知 ({selectedUserEmails.length}名)
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
