import React from 'react';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Rows3, Calendar } from 'lucide-react';

export default function ViewModeSelector({ viewMode, onViewModeChange }) {
  const modes = [
    { value: 'month', label: '月ごと', icon: LayoutGrid },
    { value: 'week', label: '週ごと', icon: Rows3 },
    { value: 'day', label: '日ごと', icon: Calendar },
    { value: 'calendar', label: 'カレンダー', icon: Calendar }
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {modes.map(mode => {
        const Icon = mode.icon;
        return (
          <Button
            key={mode.value}
            onClick={() => onViewModeChange(mode.value)}
            variant={viewMode === mode.value ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{mode.label}</span>
          </Button>
        );
      })}
    </div>
  );
}