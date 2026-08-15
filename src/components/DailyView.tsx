import { CalendarDays, Target, TrendingUp, Zap } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import type { SaleRecord } from '@/types';
import { calcDailyProgress } from '@/utils/calculator';
import { formatPercent, formatYen } from '@/utils/format';

interface Props {
  records: SaleRecord[];
  date: string;
  onDateChange: (date: string) => void;
  monthlySalesTarget: number;
}

export function DailyView({ records, date, onDateChange, monthlySalesTarget }: Props) {
  const progress = calcDailyProgress(records, date, { monthlySalesTarget });
  const achieved = progress.proratedAchievementRate >= 1;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
          <CalendarDays size={16} className="text-slate-400" />
          対象日
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="input max-w-[180px]"
        />
        <span className="text-xs text-slate-400">
          当日ログ {progress.records.length} 件 ／ 残営業日 {progress.remainingBusinessDays} 日
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="当日売上（額面）"
          value={formatYen(progress.dailyGross)}
          sub={`実質PL売上 ${formatYen(progress.dailyEffective)}`}
          icon={TrendingUp}
          accent="indigo"
        />
        <StatCard
          label="当月累計売上"
          value={formatYen(progress.monthCumulative)}
          sub={`月間目標 ${formatYen(progress.monthlyTarget)}`}
          icon={Target}
          accent="emerald"
        />
        <StatCard
          label="日割り目標達成率"
          value={progress.proratedTarget > 0 ? formatPercent(progress.proratedAchievementRate) : '—'}
          sub={`日割り目標 ${formatYen(progress.proratedTarget)}`}
          icon={Zap}
          accent={achieved ? 'emerald' : 'amber'}
        />
        <StatCard
          label="1日必達"
          value={formatYen(progress.dailyRequired)}
          sub={`残営業日 ${progress.remainingBusinessDays} 日`}
          icon={Target}
          accent="amber"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">当日の案件ログ</h2>
        </div>

        {progress.records.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            この日の登録データはありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-medium">事業部</th>
                  <th className="px-4 py-2.5 text-left font-medium">カテゴリ</th>
                  <th className="px-4 py-2.5 text-left font-medium">担当者</th>
                  <th className="px-4 py-2.5 text-right font-medium">額面売上</th>
                  <th className="px-4 py-2.5 text-right font-medium">計上率</th>
                  <th className="px-4 py-2.5 text-left font-medium">コメント</th>
                </tr>
              </thead>
              <tbody>
                {progress.records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-slate-600">{r.dept}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.category}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.member}</td>
                    <td className="tabular px-4 py-2.5 text-right font-medium text-slate-800">
                      {formatYen(r.gross)}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-slate-500">
                      {formatPercent(r.plRate, 0)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-slate-500">{r.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
