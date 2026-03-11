import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Calendar, Shield, Users, Settings, LogOut, ClipboardList, BarChart3, Wrench, Clock, Edit2, Eye, CalendarDays, CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, CalendarHeart, FileEdit, ArrowRight, Sparkles, Bell, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/AuthContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fetchAll, fetchFiltered, updateRecord } from '@/api/supabaseHelpers';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';
import DeadlineSettingDialog from '@/components/shift/DeadlineSettingDialog';
import ConfirmedShiftViewer from '@/components/shift/ConfirmedShiftViewer';
import { sortStoresByOrder } from '@/lib/storeOrder';

function SortableCard({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [cardOrder, setCardOrder] = useState([]);
  const [deadlineEditOpen, setDeadlineEditOpen] = useState(false);
  const [deadlineStoreId, setDeadlineStoreId] = useState('');
  const [deadlineStoreName, setDeadlineStoreName] = useState('');
  const [paidLeaveDialogOpen, setPaidLeaveDialogOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: stores = [] } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const data = await fetchAll('Store');
      return sortStoresByOrder(data || []);
    },
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const data = await fetchAll('AppSettings');
      return data || [];
    },
  });

  const { data: deadlines = [] } = useQuery({
    queryKey: ['shiftDeadlines'],
    queryFn: async () => {
      const data = await fetchAll('ShiftDeadline');
      return data || [];
    },
  });

  const { data: allPaidLeaveRequests = [] } = useQuery({
    queryKey: ['paidLeaveRequests'],
    queryFn: () => fetchAll('PaidLeaveRequest'),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => fetchAll('User'),
  });

  const isAdmin = user?.user_role === 'admin' || user?.role === 'admin';
  const isManager = user?.user_role === 'manager';
  const isAdminOrManager = isAdmin || isManager;

  const pendingRequests = useMemo(() => {
    if (!isAdminOrManager) return [];
    return allPaidLeaveRequests
      .filter(r => r.status === 'pending')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [allPaidLeaveRequests, isAdminOrManager]);

  const handleApproveReject = async (requestId, action, reason = '') => {
    try {
      await updateRecord('PaidLeaveRequest', requestId, {
        status: action,
        approved_by: user?.email,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      });
      toast.success(action === 'approved' ? '有給申請を承認しました' : '有給申請を却下しました');
      queryClient.invalidateQueries({ queryKey: ['paidLeaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['shiftRequests'] });
      queryClient.invalidateQueries({ queryKey: ['myPaidLeaveRequests'] });
    } catch (error) {
      toast.error('処理に失敗しました: ' + error.message);
    }
  };

  const getActiveDeadlines = () => {
    const userStoreIds = (user?.store_ids && user.store_ids.length > 0) 
      ? user.store_ids 
      : stores.map(s => s.id); // Fallback: use all stores if user has no store_ids
    if (userStoreIds.length === 0) return [];
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    
    const results = [];
    for (const storeId of userStoreIds) {
      const store = stores.find(s => s.id === storeId);
      const storeDeadlines = deadlines.filter(d => 
        d.store_id === storeId && d.target_month_end >= todayStr
      );
      const simpleDeadline = appSettings.find(s => 
        s.setting_key === 'submission_deadline' && s.store_id === storeId
      );
      if (storeDeadlines.length > 0) {
        for (const deadline of storeDeadlines) {
          results.push({
            storeId,
            storeName: store?.store_name || '店舗',
            deadline,
            simpleDeadline,
          });
        }
      } else if (simpleDeadline) {
        results.push({
          storeId,
          storeName: store?.store_name || '店舗',
          deadline: null,
          simpleDeadline,
        });
      }
    }
    return results;
  };

  const activeDeadlines = getActiveDeadlines();

  // 提出期限のテキストを取得
  const getDeadlineText = () => {
    if (activeDeadlines.length === 0) return null;
    // 未来直近の締切日を優先
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const futureDeadlines = activeDeadlines
      .filter(dl => dl.deadline?.deadline_date >= todayStr)
      .sort((a, b) => a.deadline.deadline_date.localeCompare(b.deadline.deadline_date));
    const dl = futureDeadlines.length > 0 ? futureDeadlines[0] : activeDeadlines[0];
    const dateText = dl.deadline
      ? format(parseISO(dl.deadline.deadline_date), 'M/d')
      : dl.simpleDeadline
        ? dl.simpleDeadline.setting_value
        : null;
    if (!dateText) return null;
    return `締切${dateText}迄`;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);

  const adminSubItems = [
    { id: 'store-settings', label: '所属先設定', icon: Shield, path: 'StoreSettings', color: 'from-orange-500 to-red-600', desc: '店舗・工房・部署の設定' },
    { id: 'user-mgmt', label: 'ユーザー管理', icon: Users, path: 'UserManagement', color: 'from-indigo-500 to-blue-600', desc: 'スタッフの登録・権限管理' },
    { id: 'system-settings', label: 'システム設定', icon: Wrench, path: 'SystemSettings', color: 'from-gray-600 to-gray-800', desc: 'アプリ全体の設定・管理' },
    { id: 'settings', label: '基本設定', icon: Settings, path: 'Settings', color: 'from-slate-500 to-slate-600', desc: 'アカウント設定・通知設定' },
  ];

  const allCards = [
    { id: 'shift-submit', label: 'シフト希望提出', icon: Calendar, path: 'Home', color: 'from-indigo-500 to-purple-600', desc: 'シフト希望を入力・管理', show: true },
    { id: 'shift-overview', label: 'シフト一覧表', icon: Eye, path: 'ShiftOverview', color: 'from-cyan-500 to-blue-600', desc: '所属先のシフト希望一覧', show: true },
    { id: 'analytics', label: '有給管理・勤務分析', icon: CalendarHeart, path: 'Analytics', color: 'from-orange-400 to-amber-500', desc: '有給休暇管理・労働時間の可視化', show: true },
    { id: 'productivity', label: '人時生産性', icon: Activity, path: 'productivity-dashboard', color: 'from-violet-500 to-indigo-600', desc: '各店舗の売上・稼働状況をリアルタイム監視', show: isAdminOrManager },
    { id: 'admin-view', label: 'シフト提出状況', icon: ClipboardList, path: 'Admin', color: 'from-purple-500 to-pink-600', desc: '全員のシフト希望を確認・管理', show: isAdminOrManager },
    { id: 'shift-creation', label: 'シフト作成', icon: FileEdit, path: 'ShiftCreation', color: 'from-emerald-500 to-teal-600', desc: '確定シフトの作成・編集', show: isAdminOrManager },
    { id: 'event-mgmt', label: 'イベント管理', icon: CalendarDays, path: 'EventManagement', color: 'from-rose-500 to-orange-600', desc: '店舗イベント・催事の管理', show: isAdminOrManager },
    ...(isAdmin ? [{ id: 'admin-settings', label: '管理者設定', icon: Settings, path: null, color: 'from-rose-500 to-red-700', desc: '店舗・ユーザー・システム・基本設定', show: true, isGroup: true }] : [
      { id: 'settings', label: '基本設定', icon: Settings, path: 'Settings', color: 'from-slate-500 to-slate-600', desc: 'アカウント設定・通知設定', show: true },
    ]),
  ];

  const visibleCards = allCards.filter(card => card.show);

  useEffect(() => {
    setCardOrder(visibleCards.map(c => c.id));
  }, [isAdmin, isAdminOrManager]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCardOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleDeadlineClick = (deadlineInfo) => {
    if (!isAdminOrManager) return;
    setDeadlineStoreId(deadlineInfo.storeId);
    setDeadlineStoreName(deadlineInfo.storeName);
    setDeadlineEditOpen(true);
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return 'お疲れさまです';
    if (hour < 12) return 'おはようございます';
    if (hour < 18) return 'こんにちは';
    return 'お疲れさまです';
  };

  const deadlineText = getDeadlineText();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 pb-12">
      {/* Header */}
      <header className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700">
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-purple-400/10 rounded-full blur-2xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 py-5 sm:py-7">
          <div className="flex items-center justify-between">
            {/* Left: Greeting */}
            <div>
              <p className="text-indigo-200 text-xs sm:text-sm font-medium mb-0.5">
                {getGreeting()}
              </p>
              <h1 className="text-lg sm:text-2xl font-bold text-white">
                {user?.display_name || user?.full_name || user?.email || 'ゲスト'}さん
              </h1>
              <p className="text-indigo-200/80 text-[10px] sm:text-xs mt-0.5">
                {format(new Date(), 'yyyy年M月d日(E)', { locale: ja })}
              </p>
            </div>

            {/* Right: Quick action icons */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <ConfirmedShiftViewer />
                <span className="text-[8px] sm:text-[10px] font-medium text-white/80 whitespace-nowrap leading-none">確定シフト表</span>
              </div>
              {isAdminOrManager && (
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => setPaidLeaveDialogOpen(true)}
                    className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-pink-400/40 backdrop-blur-sm border border-pink-200/40 flex items-center justify-center hover:bg-pink-400/55 transition-all shadow-lg hover:shadow-xl hover:scale-105"
                    title="未承認の有給申請"
                  >
                    <CalendarHeart className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    {pendingRequests.length > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 shadow-md">
                        {pendingRequests.length}
                      </span>
                    )}
                  </button>
                  <span className="text-[8px] sm:text-[10px] font-medium text-white/80 whitespace-nowrap leading-none">有給申請状況</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6">

        {/* Menu Grid */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cardOrder} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {cardOrder.map((cardId) => {
                const card = visibleCards.find(c => c.id === cardId);
                if (!card) return null;
                const Icon = card.icon;

                // 管理者設定グループカード
                if (card.isGroup) {
                  return (
                    <SortableCard key={cardId} id={cardId}>
                      <div className="col-span-1">
                        <div
                          className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]"
                          onClick={() => setAdminSettingsOpen(prev => !prev)}
                        >
                          <div className="flex items-start justify-between mb-2.5">
                            <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}>
                              <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                              {adminSettingsOpen ? (
                                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                              )}
                            </div>
                          </div>
                          <h2 className="text-sm sm:text-base font-bold text-slate-800 mb-0.5">{card.label}</h2>
                          <p className="text-[10px] sm:text-xs text-slate-400 leading-relaxed">{card.desc}</p>
                        </div>

                        {adminSettingsOpen && (
                          <div className="mt-2 grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 duration-200">
                            {adminSubItems.map(subItem => {
                              const SubIcon = subItem.icon;
                              return (
                                <Link key={subItem.id} to={`/${subItem.path}`}>
                                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-2.5 hover:shadow-md transition-all cursor-pointer group active:scale-[0.97]">
                                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${subItem.color} flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform`}>
                                      <SubIcon className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <h3 className="text-[10px] sm:text-xs font-bold text-slate-800 mb-0.5">{subItem.label}</h3>
                                    <p className="text-[8px] sm:text-[10px] text-slate-400 leading-relaxed line-clamp-2">{subItem.desc}</p>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </SortableCard>
                  );
                }

                // 通常カード
                const isShiftSubmit = card.id === 'shift-submit';
                const isShiftCreation = card.id === 'shift-creation';

                // シフト作成カード用の確定締切テキストを取得（全期限から最も直近の確定締切を探す）
                const getConfirmDeadlineText = () => {
                  if (!isShiftCreation || activeDeadlines.length === 0) return null;
                  const today = new Date();
                  const todayStr = format(today, 'yyyy-MM-dd');
                  // 未来直近の確定締切日を優先
                  const futureConfirmDls = activeDeadlines
                    .filter(dl => dl.deadline?.confirm_deadline_date && dl.deadline.confirm_deadline_date >= todayStr)
                    .sort((a, b) => a.deadline.confirm_deadline_date.localeCompare(b.deadline.confirm_deadline_date));
                  // 未来があれば最も近い未来、なければ最も近い過去
                  let nearestConfirmDl = futureConfirmDls.length > 0 ? futureConfirmDls[0] : null;
                  if (!nearestConfirmDl) {
                    let closestDiff = Infinity;
                    for (const dl of activeDeadlines) {
                      if (dl.deadline?.confirm_deadline_date) {
                        const confirmDate = parseISO(dl.deadline.confirm_deadline_date);
                        const diff = Math.abs(confirmDate.getTime() - today.getTime());
                        if (diff < closestDiff) {
                          closestDiff = diff;
                          nearestConfirmDl = dl;
                        }
                      }
                    }
                  }
                  if (nearestConfirmDl) {
                    return `確定${format(parseISO(nearestConfirmDl.deadline.confirm_deadline_date), 'M/d')}迄`;
                  }
                  return null;
                };
                const confirmDeadlineText = getConfirmDeadlineText();

                return (
                  <SortableCard key={cardId} id={cardId}>
                    <Link to={`/${card.path}`}>
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98] h-full">
                        <div className="flex items-start justify-between mb-2.5">
                          <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}>
                            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          </div>
                          <div className="flex items-center gap-1">
                            {/* 提出期限バッジ - シフト希望提出カードの右側 */}
                            {isShiftSubmit && deadlineText && (
                              <span className="inline-flex items-center gap-0.5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[9px] sm:text-xs font-bold rounded-full px-1.5 sm:px-2.5 py-0.5 shadow-sm">
                                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                                <span className="whitespace-nowrap">{deadlineText}</span>
                              </span>
                            )}
                            {/* 確定締切バッジ - シフト作成カードの右側 */}
                            {isShiftCreation && confirmDeadlineText && (
                              <span className="inline-flex items-center gap-0.5 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[9px] sm:text-xs font-bold rounded-full px-1.5 sm:px-2.5 py-0.5 shadow-sm">
                                <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                                <span className="whitespace-nowrap">{confirmDeadlineText}</span>
                              </span>
                            )}
                            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                          </div>
                        </div>
                        <h2 className="text-sm sm:text-base font-bold text-slate-800 mb-0.5">{card.label}</h2>
                        <p className="text-[10px] sm:text-xs text-slate-400 leading-relaxed">{card.desc}</p>
                      </div>
                    </Link>
                  </SortableCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </main>

      {/* 有給申請モーダル */}
      <Dialog open={paidLeaveDialogOpen} onOpenChange={setPaidLeaveDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-amber-700">
              <CalendarDays className="w-5 h-5" />
              未承認の有給申請
              {pendingRequests.length > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-2">
                  {pendingRequests.length}件
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 mt-2">
            {pendingRequests.length > 0 ? (
              <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden">
                {pendingRequests.map(req => {
                  const reqUser = allUsers.find(u => u.email === req.user_email);
                  const displayName = reqUser?.metadata?.display_name || reqUser?.full_name || req.user_email;
                  let dateLabel = req.date;
                  try {
                    dateLabel = format(parseISO(req.date), 'M月d日(E)', { locale: ja });
                  } catch {}
                  return (
                    <div key={req.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-800">{displayName}</span>
                            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">
                              申請中
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-sm text-slate-600">{dateLabel}</span>
                            {req.notes && (
                              <span className="text-xs text-slate-400 truncate">- {req.notes}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs px-3"
                            onClick={() => handleApproveReject(req.id, 'approved')}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            承認
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50 border-red-200 h-8 text-xs px-3"
                            onClick={() => {
                              const reason = window.prompt('却下理由を入力してください（任意）');
                              if (reason !== null) {
                                handleApproveReject(req.id, 'rejected', reason || '');
                              }
                            }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            却下
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">未承認の有給申請はありません</p>
              </div>
            )}
            <div className="pt-3">
              <Link to="/Analytics">
                <Button variant="outline" className="w-full text-amber-700 border-amber-300 hover:bg-amber-50 text-sm">
                  <CalendarHeart className="w-4 h-4 mr-2" />
                  有給管理・勤務分析ページへ
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deadline Setting Dialog */}
      <DeadlineSettingDialog
        open={deadlineEditOpen}
        onOpenChange={setDeadlineEditOpen}
        storeId={deadlineStoreId}
        storeName={deadlineStoreName}
      />
    </div>
  );
}
