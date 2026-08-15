import { Banknote, PiggyBank, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { DeptPLTable } from '@/components/DeptPLTable';
import { MemberPayoutCard } from '@/components/MemberPayoutCard';
import { NumberField } from '@/components/NumberField';
import { StatCard } from '@/components/StatCard';
import type { SaleRecord } from '@/types';
import { calcMonthlySummary, type MonthlyInputs } from '@/utils/calculator';
import { formatYen } from '@/utils/format';

interface Props {
  records: SaleRecord[];
  month: string;
  onMonthChange: (month: string) => void;
  inputs: MonthlyInputs;
  onInputsChange: (patch: Partial<MonthlyInputs>) => void;
}

/** 経費・決定件数など、シートに載らない手入力項目のパネル */
function InputPanel({ inputs, onInputsChange }: Pick<Props, 'inputs' | 'onInputsChange'>) {
  const expenses = inputs.expenses ?? {};
  const placements = inputs.placements ?? { ad: 0, referral: 0 };

  const setExpense = (dept: 'event' | 'hr', patch: Partial<{ directExpense: number; headcount: number }>) => {
    onInputsChange({
      expenses: {
        ...expenses,
        [dept]: { directExpense: 0, headcount: 0, ...expenses[dept], ...patch },
      },
    });
  };

  return (
    <div className="card p-4">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <SlidersHorizontal size={15} className="text-slate-400" />
        月次入力（売上ログ外の項目）
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        経費・決定件数はスプレッドシートに載らないため、ここで入力する（ブラウザに月別保存）。
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <NumberField
          label="イベント営業 経費"
          value={expenses.event?.directExpense ?? 0}
          onChange={(v) => setExpense('event', { directExpense: v })}
          suffix="円"
        />
        <NumberField
          label="人材 直接経費（広告/コンサル）"
          value={expenses.hr?.directExpense ?? 0}
          onChange={(v) => setExpense('hr', { directExpense: v })}
          suffix="円"
        />
        <NumberField
          label="人材 人数（概算固定費 10万/人）"
          value={expenses.hr?.headcount ?? 0}
          onChange={(v) => setExpense('hr', { headcount: v })}
          suffix="人"
        />
        <NumberField
          label="決定件数 広告経由（1万/件）"
          value={placements.ad}
          onChange={(v) => onInputsChange({ placements: { ...placements, ad: v } })}
          suffix="件"
        />
        <NumberField
          label="決定件数 リファーラル（3万/件）"
          value={placements.referral}
          onChange={(v) => onInputsChange({ placements: { ...placements, referral: v } })}
          suffix="件"
        />
        <NumberField
          label="中原氏 個人直接経費"
          value={inputs.personalDirectExpense ?? 0}
          onChange={(v) => onInputsChange({ personalDirectExpense: v })}
          suffix="円"
        />
        <NumberField
          label="月間売上目標（日別進捗用）"
          value={inputs.monthlySalesTarget ?? 0}
          onChange={(v) => onInputsChange({ monthlySalesTarget: v })}
          suffix="円"
        />
      </div>
    </div>
  );
}

export function MonthlyView({ records, month, onMonthChange, inputs, onInputsChange }: Props) {
  const summary = calcMonthlySummary(records, month, inputs);
  const totalPayout = summary.payouts.reduce((a, p) => a + p.totalPayout, 0);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="text-sm font-medium text-slate-600">対象月</label>
        <input
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="input max-w-[180px]"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="当月 額面売上"
          value={formatYen(summary.grossSales)}
          sub={`実質PL売上 ${formatYen(summary.effectiveSales)}`}
          icon={TrendingUp}
          accent="indigo"
        />
        <StatCard
          label="全社 営業利益"
          value={formatYen(summary.operatingProfit)}
          icon={TrendingUp}
          accent={summary.operatingProfit >= 0 ? 'emerald' : 'rose'}
        />
        <StatCard
          label="当月 支給見立て合計"
          value={formatYen(totalPayout)}
          sub="基本給＋当月インセンティブ"
          icon={Banknote}
          accent="slate"
        />
        <StatCard
          label="半年プール積立（当月）"
          value={formatYen(summary.bonusPoolAccrual)}
          icon={PiggyBank}
          accent="amber"
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-800">メンバー別 当月支給見立て</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {summary.payouts.map((p) => (
            <MemberPayoutCard key={p.memberId} payout={p} />
          ))}
        </div>
      </div>

      <DeptPLTable rows={summary.deptRows} />

      <InputPanel inputs={inputs} onInputsChange={onInputsChange} />
    </div>
  );
}
