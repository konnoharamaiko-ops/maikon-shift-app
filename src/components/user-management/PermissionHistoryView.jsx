import React from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { History, User, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function PermissionHistoryView({ userId }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['permissionHistory', userId],
    queryFn: () => supabase.from('PermissionHistory').select('*').eq('user_id', userId).then(res => res.data || []),
  });

  const { data: allHistory = [] } = useQuery({
    queryKey: ['permissionHistoryAll'],
    queryFn: () => supabase.from('PermissionHistory').select('*').then(res => res.data || []),
    enabled: !userId,
  });

  const displayHistory = userId ? history : allHistory;

  const getChangeTypeLabel = (type) => {
    switch (type) {
      case 'grant': return '付与';
      case 'revoke': return '削除';
      case 'modify': return '変更';
      default: return type;
    }
  };

  const getChangeTypeColor = (type) => {
    switch (type) {
      case 'grant': return 'bg-green-100 text-green-800';
      case 'revoke': return 'bg-red-100 text-red-800';
      case 'modify': return 'bg-blue-100 text-blue-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-slate-600" />
        <h3 className="text-lg font-bold text-slate-800">権限変更履歴</h3>
        <span className="text-sm text-slate-500">（最新{displayHistory.length}件）</span>
      </div>

      {displayHistory.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>権限変更履歴はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayHistory.map((entry) => (
            <div
              key={entry.id}
              className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getChangeTypeColor(entry.change_type)}`}>
                    {getChangeTypeLabel(entry.change_type)}
                  </span>
                  <span className="text-sm text-slate-600">
                    {entry.resource_type === 'store' ? '店舗権限' : '機能権限'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(entry.created_date), 'yyyy/MM/dd HH:mm', { locale: ja })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700">
                    対象: <span className="font-medium">{entry.user_email}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700">
                    変更者: <span className="font-medium">{entry.changed_by}</span>
                  </span>
                </div>

                {entry.change_description && (
                  <p className="text-sm text-slate-600 bg-slate-50 rounded p-2 mt-2">
                    {entry.change_description}
                  </p>
                )}

                {(entry.old_permissions?.length > 0 || entry.new_permissions?.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500 mb-1">変更前:</p>
                      <div className="flex flex-wrap gap-1">
                        {entry.old_permissions?.length > 0 ? (
                          entry.old_permissions.map((p, i) => (
                            <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">なし</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-500 mb-1">変更後:</p>
                      <div className="flex flex-wrap gap-1">
                        {entry.new_permissions?.length > 0 ? (
                          entry.new_permissions.map((p, i) => (
                            <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">なし</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}