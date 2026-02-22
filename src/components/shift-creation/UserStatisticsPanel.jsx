import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, Calendar, TrendingUp } from 'lucide-react';

export default function UserStatisticsPanel({ users, workShifts }) {
  const calculateUserStats = (userEmail) => {
    const userShifts = workShifts.filter(s => s.user_email === userEmail);
    const workDates = new Set(userShifts.map(s => s.date));
    
    let totalHours = 0;
    let totalWage = 0;
    
    userShifts.forEach(shift => {
      const start = new Date(`2000-01-01T${shift.start_time}`);
      const end = new Date(`2000-01-01T${shift.end_time}`);
      const hours = (end - start) / (1000 * 60 * 60);
      if (hours > 0) {
        totalHours += hours;
        const user = users.find(u => u.email === userEmail);
        if (user?.hourly_wage) {
          totalWage += hours * user.hourly_wage;
        }
      }
    });
    
    return {
      workDays: workDates.size,
      totalHours: totalHours.toFixed(1),
      totalWage: Math.round(totalWage),
      avgHoursPerDay: workDates.size > 0 ? (totalHours / workDates.size).toFixed(1) : 0
    };
  };

  const userStats = users.map(user => ({
    user,
    stats: calculateUserStats(user?.email)
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          スタッフ別統計
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {userStats.map(({ user, stats }) => {
            const maxDays = user.max_work_days_per_week ? user.max_work_days_per_week * 4 : null;
            const maxHours = user.max_work_hours_per_week ? user.max_work_hours_per_week * 4 : null;
            const maxWage = user.dependent_income_limit ? user.dependent_income_limit / 12 : null;

            return (
              <div key={user?.email} className="p-4 border rounded-lg bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">
                      {user?.metadata?.display_name || user?.full_name || user?.email}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {user.employment_type === 'full_time' && '正社員'}
                      {user.employment_type === 'part_time' && 'パート'}
                      {user.employment_type === 'contract' && '契約社員'}
                      {user.hourly_wage && ` | 時給 ¥${user.hourly_wage.toLocaleString()}`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-slate-600">出勤日数</span>
                    </div>
                    <p className="text-lg font-bold text-slate-800">
                      {stats.workDays}日
                      {maxDays && (
                        <span className="text-xs font-normal text-slate-500 ml-1">
                          / {maxDays}日
                        </span>
                      )}
                    </p>
                    {maxDays && (
                      <div className="mt-1 w-full bg-slate-200 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full ${stats.workDays > maxDays ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min((stats.workDays / maxDays) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-green-600" />
                      <span className="text-xs text-slate-600">勤務時間</span>
                    </div>
                    <p className="text-lg font-bold text-slate-800">
                      {stats.totalHours}h
                      {maxHours && (
                        <span className="text-xs font-normal text-slate-500 ml-1">
                          / {maxHours}h
                        </span>
                      )}
                    </p>
                    {maxHours && (
                      <div className="mt-1 w-full bg-slate-200 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full ${parseFloat(stats.totalHours) > maxHours ? 'bg-red-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min((parseFloat(stats.totalHours) / maxHours) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                      <span className="text-xs text-slate-600">平均勤務</span>
                    </div>
                    <p className="text-lg font-bold text-slate-800">
                      {stats.avgHoursPerDay}h/日
                    </p>
                  </div>

                  {user.hourly_wage && (
                    <div className="bg-white p-3 rounded-lg border">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-slate-600">今月給与</span>
                      </div>
                      <p className="text-lg font-bold text-slate-800">
                        ¥{stats.totalWage.toLocaleString()}
                        {maxWage && (
                          <span className="text-xs font-normal text-slate-500 ml-1 block">
                            / ¥{Math.round(maxWage).toLocaleString()}
                          </span>
                        )}
                      </p>
                      {maxWage && (
                        <div className="mt-1 w-full bg-slate-200 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${stats.totalWage > maxWage ? 'bg-red-500' : 'bg-purple-500'}`}
                            style={{ width: `${Math.min((stats.totalWage / maxWage) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}