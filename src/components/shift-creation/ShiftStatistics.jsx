import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Calendar, Clock, TrendingUp } from 'lucide-react';

export default function ShiftStatistics({ workShifts, users, selectedMonth }) {
  // Calculate total shifts
  const totalShifts = workShifts.length;

  // Calculate total hours
  const totalHours = workShifts.reduce((sum, shift) => {
    const start = new Date(`2000-01-01T${shift.start_time}`);
    const end = new Date(`2000-01-01T${shift.end_time}`);
    const hours = (end - start) / (1000 * 60 * 60);
    return sum + (hours > 0 ? hours : 0);
  }, 0);

  // Calculate shifts per user
  const shiftsPerUser = {};
  workShifts.forEach(shift => {
    shiftsPerUser[shift.user_email] = (shiftsPerUser[shift.user_email] || 0) + 1;
  });

  // Calculate confirmed shifts
  const confirmedShifts = workShifts.filter(s => s.is_confirmed).length;
  const confirmationRate = totalShifts > 0 ? Math.round((confirmedShifts / totalShifts) * 100) : 0;

  const stats = [
    {
      title: '総シフト数',
      value: totalShifts,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: '総勤務時間',
      value: `${totalHours.toFixed(1)}h`,
      icon: Clock,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: '配置人数',
      value: Object.keys(shiftsPerUser).length,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      title: '確定率',
      value: `${confirmationRate}%`,
      icon: TrendingUp,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}