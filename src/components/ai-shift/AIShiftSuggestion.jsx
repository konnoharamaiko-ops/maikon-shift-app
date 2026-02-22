import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

export default function AIShiftSuggestion({ store, targetMonth, users, shiftRequests }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const queryClient = useQueryClient();

  const applyShiftsMutation = useMutation({
    mutationFn: (shifts) => supabase.from('WorkShift').insert(shifts).select().then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workShifts'] });
      toast.success('AIシフト案を適用しました');
      setSuggestions(null);
    }
  });

  const generateAIShifts = async () => {
    setIsGenerating(true);
    try {
      const monthStart = startOfMonth(targetMonth);
      const monthEnd = endOfMonth(targetMonth);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      // Prepare data for AI
      const storeInfo = {
        store_name: store.store_name,
        business_hours: store.business_hours,
        staff_requirements: store.staff_requirements,
        temporary_closures: store.temporary_closures || [],
        holiday_exceptions: store.holiday_exceptions || []
      };

      const employeeInfo = users.map(user => ({
        email: user?.email,
        name: user?.metadata?.display_name || user?.full_name,
        employment_type: user.employment_type,
        max_working_days_per_week: user.max_working_days_per_week,
        max_working_hours_per_week: user.max_working_hours_per_week,
        max_working_hours_per_month: user.max_working_hours_per_month,
        hourly_wage: user.hourly_wage
      }));

      const shiftRequestsInfo = shiftRequests.map(req => ({
        date: req.date,
        user_email: req.created_by,
        start_time: req.start_time,
        end_time: req.end_time,
        is_day_off: req.is_day_off,
        is_full_day_available: req.is_full_day_available,
        is_negotiable_if_needed: req.is_negotiable_if_needed,
        notes: req.notes
      }));

      const prompt = `あなたはシフト作成の専門家です。以下の情報を元に、${format(targetMonth, 'yyyy年M月')}のシフト案を作成してください。

【店舗情報】
${JSON.stringify(storeInfo, null, 2)}

【従業員情報】
${JSON.stringify(employeeInfo, null, 2)}

【従業員のシフト希望】
${JSON.stringify(shiftRequestsInfo, null, 2)}

【作成ルール】
1. 従業員の希望を最大限尊重する
2. 必要人数を満たすよう配置する
3. 週の最大勤務日数/時間を守る
4. 月の最大勤務時間を守る
5. 公平な勤務日数になるよう調整する
6. 休み希望は必ず反映する
7. 「終日出勤可能」の希望は営業時間いっぱいで配置
8. 「相談可能」の希望は人員不足の場合のみ配置を検討

【出力形式】
各日付ごとに、配置する従業員とその勤務時間をJSON形式で出力してください。
また、警告や調整が必要な点があればコメントも含めてください。`;

      // AI shift suggestion - requires OpenAI API key in environment
      // For now, show a message that this feature needs configuration
      const response = { 
        shifts: [], 
        warnings: ['AI機能はOpenAI APIキーの設定が必要です。環境変数 VITE_OPENAI_API_KEY を設定してください。'], 
        summary: 'AI機能は現在設定が必要です。' 
      };
      
      // TODO: Uncomment and configure when OpenAI API key is available
      // const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
      // if (apiKey) {
      //   const res = await fetch('https://api.openai.com/v1/chat/completions', {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      //     body: JSON.stringify({
      //       model: 'gpt-4o-mini',
      //       messages: [{ role: 'user', content: prompt }],
      //       response_format: { type: 'json_object' }
      //     })
      //   });
      //   const data = await res.json();
      //   response = JSON.parse(data.choices[0].message.content);
      // }

      setSuggestions(response);
      toast.success('AIシフト案を生成しました');
    } catch (error) {
      console.error('AI shift generation error:', error);
      toast.error('シフト案の生成に失敗しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplySuggestions = async () => {
    if (!suggestions?.shifts) return;

    const shiftsToCreate = suggestions.shifts.map(shift => ({
      store_id: store.id,
      user_email: shift.user_email,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      notes: shift.notes || '',
      is_confirmed: false
    }));

    applyShiftsMutation.mutate(shiftsToCreate);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          AIシフト提案
        </CardTitle>
        <CardDescription>
          従業員の希望と店舗の要件を考慮したシフト案を自動生成
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!suggestions && (
          <Button
            onClick={generateAIShifts}
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                AIシフト案を生成
              </>
            )}
          </Button>
        )}

        {suggestions && (
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <h4 className="font-semibold text-indigo-900 mb-2">生成結果</h4>
              <p className="text-sm text-indigo-700">{suggestions.summary}</p>
            </div>

            {suggestions.warnings && suggestions.warnings.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  注意事項
                </h4>
                <ul className="text-sm text-amber-700 space-y-1">
                  {suggestions.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-4 bg-slate-50 border rounded-lg">
              <h4 className="font-semibold mb-2">生成されたシフト数</h4>
              <p className="text-2xl font-bold text-indigo-600">
                {suggestions.shifts?.length || 0} 件
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleApplySuggestions}
                disabled={applyShiftsMutation.isPending}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                {applyShiftsMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    適用中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    この案を適用
                  </>
                )}
              </Button>
              <Button
                onClick={() => setSuggestions(null)}
                variant="outline"
                className="flex-1"
              >
                キャンセル
              </Button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              ※適用後も手動で調整が可能です
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}