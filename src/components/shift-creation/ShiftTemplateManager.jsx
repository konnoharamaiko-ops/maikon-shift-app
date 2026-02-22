import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { insertRecord } from '@/api/supabaseHelpers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function ShiftTemplateManager({ templates, storeId }) {
  const queryClient = useQueryClient();
  const [templateName, setTemplateName] = useState('');
  const [templateItems, setTemplateItems] = useState([
    { day_of_week: 1, start_time: '09:00', end_time: '17:00', required_staff: 1 }
  ]);

  const createMutation = useMutation({
    mutationFn: (data) => insertRecord('ShiftTemplate', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftTemplates'] });
      toast.success('テンプレートを保存しました');
      setTemplateName('');
      setTemplateItems([{ day_of_week: 1, start_time: '09:00', end_time: '17:00', required_staff: 1 }]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (name) => {
      const toDelete = templates.filter(t => t.template_name === name);
      await Promise.all(toDelete.map(t => supabase.from('ShiftTemplate').delete().eq('id', t.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shiftTemplates'] });
      toast.success('テンプレートを削除しました');
    },
  });

  const handleAddDay = () => {
    setTemplateItems([...templateItems, { day_of_week: 1, start_time: '09:00', end_time: '17:00', required_staff: 1 }]);
  };

  const handleRemoveDay = (index) => {
    setTemplateItems(templateItems.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...templateItems];
    updated[index][field] = field === 'day_of_week' || field === 'required_staff' ? parseInt(value) : value;
    setTemplateItems(updated);
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast.error('テンプレート名を入力してください');
      return;
    }
    const data = templateItems.map(item => ({
      ...item,
      template_name: templateName,
      store_id: storeId
    }));
    createMutation.mutate(data);
  };

  const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
  const uniqueTemplateNames = [...new Set(templates.map(t => t.template_name))];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>新しいテンプレートを作成</CardTitle>
          <CardDescription>曜日ごとの勤務時間パターンを保存できます</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>テンプレート名</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="例: 通常週パターン"
              className="mt-2"
            />
          </div>

          {templateItems.map((item, index) => (
            <div key={index} className="flex gap-3 items-end p-4 bg-slate-50 rounded-lg">
              <div className="flex-1">
                <Label className="text-xs">曜日</Label>
                <Select
                  value={item.day_of_week.toString()}
                  onValueChange={(v) => handleUpdateItem(index, 'day_of_week', v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayNames.map((day, i) => (
                      <SelectItem key={i} value={i.toString()}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">開始時刻</Label>
                <Input
                  type="time"
                  value={item.start_time}
                  onChange={(e) => handleUpdateItem(index, 'start_time', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">終了時刻</Label>
                <Input
                  type="time"
                  value={item.end_time}
                  onChange={(e) => handleUpdateItem(index, 'end_time', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="w-24">
                <Label className="text-xs">必要人数</Label>
                <Input
                  type="number"
                  min="1"
                  value={item.required_staff}
                  onChange={(e) => handleUpdateItem(index, 'required_staff', e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveDay(index)}
                disabled={templateItems.length === 1}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          ))}

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleAddDay} className="flex-1">
              <Plus className="w-4 h-4 mr-2" />
              曜日を追加
            </Button>
            <Button onClick={handleSaveTemplate} disabled={createMutation.isPending} className="flex-1">
              <Save className="w-4 h-4 mr-2" />
              {createMutation.isPending ? '保存中...' : 'テンプレートを保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>保存済みテンプレート</CardTitle>
          <CardDescription>既存のテンプレートを管理できます</CardDescription>
        </CardHeader>
        <CardContent>
          {uniqueTemplateNames.length === 0 ? (
            <p className="text-slate-400 text-center py-8">保存されたテンプレートはありません</p>
          ) : (
            <div className="space-y-3">
              {uniqueTemplateNames.map(name => {
                const items = templates.filter(t => t.template_name === name);
                return (
                  <div key={name} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-slate-800">{name}</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(name)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {items.map((item, i) => (
                        <div key={i} className="text-sm text-slate-600 flex items-center gap-2">
                          <span className="font-medium">{dayNames[item.day_of_week]}</span>
                          <span>•</span>
                          <span>{item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}</span>
                          <span>•</span>
                          <span>{item.required_staff}名</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}