import React from 'react';
import { Users, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function ShiftSummaryCard({ users, shiftsByUser, stores, selectedStoreId }) {
  // Filter users based on selected store
  const relevantUsers = users.filter(user => {
    if (selectedStoreId === 'all') {
      return true;
    }
    return user?.store_ids?.includes(selectedStoreId);
  });

  const totalUsers = relevantUsers.length;
  const submittedUserEmails = Object.keys(shiftsByUser);
  const submittedUsersCount = relevantUsers.filter(u => submittedUserEmails.includes(u.email)).length;
  const notSubmittedUsers = totalUsers - submittedUsersCount;
  const submissionRate = totalUsers > 0 ? Math.round((submittedUsersCount / totalUsers) * 100) : 0;

  const stats = [
    {
      label: '対象スタッフ',
      value: totalUsers,
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      label: '提出済み',
      value: submittedUsersCount,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-600',
      iconBg: 'bg-green-100',
    },
    {
      label: '未提出',
      value: notSubmittedUsers,
      icon: Clock,
      color: 'bg-amber-50 text-amber-600',
      iconBg: 'bg-amber-100',
    },
    {
      label: '提出率',
      value: `${submissionRate}%`,
      icon: AlertCircle,
      color: submissionRate >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600',
      iconBg: submissionRate >= 80 ? 'bg-emerald-100' : 'bg-rose-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className={cn("border-2 transition-all hover:shadow-lg", stat.color)}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", stat.iconBg)}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs opacity-70 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}