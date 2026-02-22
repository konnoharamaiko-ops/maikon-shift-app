import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { insertRecords } from '@/api/supabaseHelpers';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay, subMonths, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, Copy, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function AutoGenerateShift({ selectedMonth, users, templates, shiftRequests = [], storeId }) {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [generationMethod, setGenerationMethod] = useState('template');

  const { data: previousMonthShifts = [] } = useQuery({
    queryKey: ['previousMonthShifts', storeId],
    queryFn: async () => {
      if (!storeId) return [];
      const prevMonth = subMonths(selectedMonth, 1);
      const monthStart = startOfMonth(prevMonth);
      const monthEnd = endOfMonth(prevMonth);
      const { data: allShifts = [] } = await supabase.from('WorkShift').select('*').eq('store_id', storeId);
      return allShifts.filter(shift => {
        const shiftDate = parseISO(shift.date);
        return shiftDate >= monthStart && shiftDate <= monthEnd;
      });
    },
    enabled: !!storeId,
  });

  const generateMutation = useMutation({
    mutationFn: (data) => insertRecords('WorkShift', Array.isArray(data) ? data : [data]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      toast.success('シフトを自動生成しました');
    },
  });

  const handleGenerateFromTemplate = () => {
    if (!selectedTemplate) {
      toast.error('テンプレートを選択してください');
      return;
    }

    const templateItems = templates.filter(t => t.template_name === selectedTemplate);
    const monthDays = eachDayOfInterval({
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth)
    });

    const newShifts = [];
    monthDays.forEach(date => {
      const dayOfWeek = getDay(date);
      const templateForDay = templateItems.filter(t => t.day_of_week === dayOfWeek);
      
      templateForDay.forEach(template => {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        // シフト希望を考慮してユーザーをフィルタリング
        const availableUsers = users.filter(u => {
          if (!u.email) return false;
          
          const userRequest = shiftRequests.find(r => 
            r.created_by === u.email && r.date === dateStr
          );
          
          // 休み希望の人は除外
          if (userRequest?.is_day_off) return false;
          
          return true;
        });

        // シフト希望がある人を優先
        const usersWithRequest = availableUsers.filter(u => {
          const userRequest = shiftRequests.find(r => 
            r.created_by === u.email && r.date === dateStr
          );
          return userRequest && !userRequest.is_day_off;
        });

        const usersToSchedule = usersWithRequest.length > 0 ? usersWithRequest : availableUsers;
        
        if (usersToSchedule.length > 0) {
          // Shuffle users for fair distribution
          const shuffledUsers = [...usersToSchedule].sort(() => Math.random() - 0.5);
          
          for (let i = 0; i < Math.min(template.required_staff || 1, shuffledUsers.length); i++) {
            const user = shuffledUsers[i];
            const userRequest = shiftRequests.find(r => 
              r.created_by === user?.email && r.date === dateStr
            );
            
            newShifts.push({
              store_id: storeId,
              user_email: user?.email,
              date: dateStr,
              start_time: userRequest?.start_time || template.start_time,
              end_time: userRequest?.end_time || template.end_time,
              notes: userRequest?.notes || `${selectedTemplate}から自動生成`,
              is_confirmed: false
            });
          }
        }
      });
    });

    if (newShifts.length === 0) {
      toast.error('生成できるシフトがありません');
      return;
    }

    generateMutation.mutate(newShifts);
  };

  const handleCopyFromPreviousMonth = () => {
    if (previousMonthShifts.length === 0) {
      toast.error('前月のシフトがありません');
      return;
    }

    const monthDays = eachDayOfInterval({
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth)
    });

    const newShifts = [];
    monthDays.forEach(date => {
      const dayOfWeek = getDay(date);
      const prevShiftsForDay = previousMonthShifts.filter(s => {
        const prevDate = parseISO(s.date);
        return getDay(prevDate) === dayOfWeek;
      });

      prevShiftsForDay.forEach(prevShift => {
        newShifts.push({
          store_id: storeId,
          user_email: prevShift.user_email,
          date: format(date, 'yyyy-MM-dd'),
          start_time: prevShift.start_time,
          end_time: prevShift.end_time,
          notes: '前月のシフトからコピー',
          is_confirmed: false
        });
      });
    });

    if (newShifts.length === 0) {
      toast.error('コピーできるシフトがありません');
      return;
    }

    generateMutation.mutate(newShifts);
  };

  const uniqueTemplateNames = [...new Set(templates.map(t => t.template_name))];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            テンプレートから自動生成
          </CardTitle>
          <CardDescription>
            保存したテンプレートを使用して、1ヶ月分のシフトを自動的に作成します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="テンプレートを選択" />
              </SelectTrigger>
              <SelectContent>
                {uniqueTemplateNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerateFromTemplate}
            disabled={generateMutation.isPending || !selectedTemplate}
            className="w-full"
          >
            <Calendar className="w-4 h-4 mr-2" />
            テンプレートから生成
          </Button>
          <p className="text-sm text-slate-500">
            ※ テンプレートの曜日設定に基づいて、必要人数分のシフトを自動配置します
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            前月のシフトをコピー
          </CardTitle>
          <CardDescription>
            前月のシフトパターンを今月にコピーして、同じスタッフを同じ曜日に配置します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-600">
              前月のシフト数: <span className="font-semibold">{previousMonthShifts.length}件</span>
            </p>
          </div>
          <Button
            onClick={handleCopyFromPreviousMonth}
            disabled={generateMutation.isPending || previousMonthShifts.length === 0}
            className="w-full"
            variant="outline"
          >
            <Copy className="w-4 h-4 mr-2" />
            前月からコピー
          </Button>
          <p className="text-sm text-slate-500">
            ※ 前月と同じ曜日に、同じスタッフ・同じ時間帯でシフトを作成します
          </p>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Wand2 className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">自動生成のヒント</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• シフト希望が反映され、休み希望の人は除外されます</li>
                <li>• 希望時間がある場合は、その時間でシフトが作成されます</li>
                <li>• 生成後も個別に編集できます</li>
                <li>• 既存のシフトがある場合は上書きされません（追加されます）</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}