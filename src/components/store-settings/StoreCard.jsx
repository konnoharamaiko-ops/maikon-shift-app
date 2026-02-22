import React from 'react';
import { MapPin, Edit2, Trash2, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const bgColors = {
  blue: 'bg-blue-100 group-hover:bg-blue-200',
  purple: 'bg-purple-100 group-hover:bg-purple-200',
  green: 'bg-green-100 group-hover:bg-green-200',
  orange: 'bg-orange-100 group-hover:bg-orange-200',
  pink: 'bg-pink-100 group-hover:bg-pink-200',
  teal: 'bg-teal-100 group-hover:bg-teal-200',
};

const iconColors = {
  blue: 'text-blue-600',
  purple: 'text-purple-600',
  green: 'text-green-600',
  orange: 'text-orange-600',
  pink: 'text-pink-600',
  teal: 'text-teal-600',
};

export default function StoreCard({ 
  store, 
  color, 
  isSelected, 
  onSelect, 
  onEdit, 
  onDelete, 
  onColorChange,
  showColorPicker,
  setShowColorPicker,
  canEdit = true,
  canDelete = true,
  colorOptions
}) {
  return (
    <div className="relative">
      <button
        onClick={onSelect}
        className={cn(
          'group w-full flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all',
          isSelected 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50'
        )}
      >
        <div className={cn('w-14 h-14 rounded-lg flex items-center justify-center mb-2 transition-colors', bgColors[color])}>
          <MapPin className={cn('w-7 h-7', iconColors[color])} />
        </div>
        <p className="text-sm font-bold text-slate-800 text-center line-clamp-2">{store.store_name}</p>
        <p className="text-xs text-slate-500 mt-1">{store.store_code}</p>
      </button>
      
      {canEdit && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              setShowColorPicker(showColorPicker === store.id ? null : store.id);
            }}
          >
            <Palette className="w-4 h-4" />
          </Button>
          {showColorPicker === store.id && (
            <div className="absolute top-10 right-1 bg-white rounded-lg shadow-lg border p-2 z-50">
              <div className="grid grid-cols-3 gap-2">
                {colorOptions.map(colorOption => (
                  <button
                    key={colorOption.value}
                    onClick={() => onColorChange(store.id, colorOption.value)}
                    className={cn(
                      'w-8 h-8 rounded-full border-2',
                      color === colorOption.value ? 'border-slate-800' : 'border-slate-200',
                      `bg-${colorOption.value}-500`
                    )}
                    title={colorOption.label}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      
      {canEdit && onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 left-1 h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(store);
          }}
        >
          <Edit2 className="w-4 h-4" />
        </Button>
      )}
      
      {canDelete && onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute bottom-1 right-1 h-7 w-7 text-red-600 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(store.id, store.store_name);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}