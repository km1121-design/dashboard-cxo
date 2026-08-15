import { CalendarRange, PiggyBank, TrendingUp, Users } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { FISCAL_START_MONTH } from '@/constants/master';
import type { SaleRecord } from '@/types';
import { calcTotalSummary, type MonthlyInputs } from '@/utils/calculator';
import { formatManYen, formatYen } from '@/utils/format';

interface Props {
  records: SaleRecord[];
  inputsByMonth: Record<string, MonthlyInputs>;
  fiscalStartMonth?: string;
}

export function TotalView({ records, inputsByMonth, fiscalStartMonth = FISCAL_START_MONTH }: Props) {
  const total = calcTotalSummary(records, inputsByMonth, fiscalStartMonth);
  const maxProfit = Math.max(...total.months.map((m) => Math.abs(m.operatingProfit)), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="通期 額面売上"
          value={formatYen(total.grossSales)}
          sub={`実質PL売上 ${formatYen(total.effectiveSales)}`}
          icon={TrendingUp}
          accent="indigo"
        />
        <StatCard
          label="通期 営業利益"
          value={formatYen(total.operatingProfit)}
          icon={TrendingUp}
          accent={total.operatingProfit >= 0 ? 'emerald' : 'rose'}
        />
        <StatCard
          label="半年プール積立 合計"
          value={formatYen(total.bonusPoolTotal)}
          icon={PiggyBank}
          accent="amber"
        />
        <StatCard
          label="対象期間"
          value={`${total.fiscalStartMonth} 〜`}
          sub={`第5期 全12ヶ月（${total.months[11]?.month} まで）`}
          icon={CalendarRange}
          accent="slate"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">第5期 月次推移</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">月</th>
                <th className="px-4 py-2.5 text-right font-medium">額面売上</th>
                <th className="px-4 py-2.5 text-right font-medium">実質PL売上</th>
                <th className="px-4 py-2.5 text-right font-medium">営業利益</th>
                <th className="px-4 py-2.5 text-left font-medium">推移</th>
              </tr>
            </thead>
            <tbody>
              {total.months.map((m) => (
                <tr key={m.month} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-700">{m.month}</td>
                  <td className="tabular px-4 py-2 text-right text-slate-600">
                    {formatYen(m.grossSales)}
                  </td>
                  <td className="tabular px-4 py-2 text-right text-slate-600">
                    {formatYen(m.effectiveSales)}
                  </td>
                  <td
                    className={`tabular px-4 py-2 text-right font-medium ${
                      m.operatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {formatYen(m.operatingProfit)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          m.operatingProfit >= 0 ? 'bg-emerald-400' : 'bg-rose-400'
                        }`}
                        style={{ width: `${(Math.abs(m.operatingProfit) / maxProfit) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Users size={15} className="text-slate-400" />
          年収シミュレーション
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {total.annualByMember.map((m) => (
            <div key={m.memberId} className="card p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-bold text-slate-800">{m.memberName}</h3>
                <span className="tabular text-xl font-bold text-indigo-700">
                  {formatManYen(m.annualTotal)}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">基本給 年間</dt>
                  <dd className="tabular text-slate-700">{formatYen(m.annualBase)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">インセンティブ 年間</dt>
                  <dd className="tabular text-emerald-600">{formatYen(m.annualIncentive)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">ボーナスプール 年間</dt>
                  <dd className="tabular text-amber-600">{formatYen(m.annualBonusPool)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
