import { CalendarRange, Download, PiggyBank, TrendingUp, Users } from 'lucide-react';
import { MixDonut } from '@/components/charts/MixDonut';
import { TrendChart } from '@/components/charts/TrendChart';
import { StatCard } from '@/components/StatCard';
import { FISCAL_START_MONTH } from '@/constants/master';
import type { SaleRecord } from '@/types';
import { calcTotalSummary, type MonthlyInputs } from '@/utils/calculator';
import { buildAnnualCsv, downloadCsv } from '@/utils/csv';
import { formatManYen, formatYen } from '@/utils/format';
import { buildCategoryMix, buildMonthlyTrend, trimToElapsedMonths } from '@/utils/series';

interface Props {
  records: SaleRecord[];
  inputsByMonth: Record<string, MonthlyInputs>;
  fiscalStartMonth?: string;
  /** 当月。未到来の月は推移グラフから落とす */
  currentMonth: string;
}

export function TotalView({
  records,
  inputsByMonth,
  fiscalStartMonth = FISCAL_START_MONTH,
  currentMonth,
}: Props) {
  const total = calcTotalSummary(records, inputsByMonth, fiscalStartMonth);
  const trend = trimToElapsedMonths(buildMonthlyTrend(total.months), currentMonth);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <TrendChart
        points={trend}
        title="第5期 月次推移"
        subtitle="当月までの実績。棒が額面売上、折れ線が全社営業利益。"
      />

      <MixDonut
        title="通期 カテゴリ別売上構成"
        subtitle="上位5カテゴリとその他。金額と構成比は凡例と表で読める。"
        segments={buildCategoryMix(records)}
        totalLabel="通期合計"
      />

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Users size={15} className="text-slate-400" />
            年収シミュレーション
          </h2>
          <button
            type="button"
            onClick={() => downloadCsv(`annual_${total.fiscalStartMonth}.csv`, buildAnnualCsv(total))}
            className="btn-ghost !px-2.5 !text-xs print:hidden"
          >
            <Download size={14} />
            CSV
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {total.annualByMember.map((m) => (
            <div key={m.memberId} className="card p-4">
              <div className="flex items-baseline justify-between gap-2">
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
