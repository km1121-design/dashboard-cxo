import { AlertTriangle, Banknote, Download, PiggyBank, Printer, SlidersHorizontal, Target, TrendingUp } from 'lucide-react';
import { MixDonut } from '@/components/charts/MixDonut';
import { DeptInputCard } from '@/components/DeptInputCard';
import { DeptPLTable } from '@/components/DeptPLTable';
import { MeetingNotePanel } from '@/components/MeetingNotePanel';
import { MemberPayoutCard } from '@/components/MemberPayoutCard';
import { StatCard } from '@/components/StatCard';
import { DEPTS } from '@/constants/master';
import type { UseMonthlyInputsResult } from '@/hooks/useMonthlyInputs';
import type { MonthlyNoteRecord, SaleRecord } from '@/types';
import { calcMonthlySummary } from '@/utils/calculator';
import { buildDeptPlCsv, buildPayoutCsv, downloadCsv } from '@/utils/csv';
import { formatYen } from '@/utils/format';
import { buildDeptMix } from '@/utils/series';

interface Props {
  records: SaleRecord[];
  month: string;
  onMonthChange: (month: string) => void;
  /** 月次入力（スプレッドシート保存） */
  monthlyInputs: UseMonthlyInputsResult;
  /** 会議メモ */
  notes: MonthlyNoteRecord[];
  onSaveNote: (record: MonthlyNoteRecord) => Promise<boolean>;
}

/** 事業部ごとの月次入力をまとめたパネル */
function InputPanel({ monthlyInputs }: Pick<Props, 'monthlyInputs'>) {
  return (
    <div className="card p-4 print:hidden">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <SlidersHorizontal size={15} className="text-slate-400" />
        月次入力（売上ログ外の項目）
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        経費・決定件数・目標・計画はスプレッドシートに載らないため、ここで入力する。
        {monthlyInputs.serverBacked
          ? '保存するとスプレッドシートに書き込まれ、全員の画面に反映される。'
          : 'いまはこのブラウザにだけ保存されている。'}
      </p>

      {!monthlyInputs.serverBacked && (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            GAS が月次入力シートに対応していないため、入力がこの端末にしか残りません。
            端末ごとに営業利益と支給額がずれます。gas/Code.gs を最新版にして再デプロイしてください。
          </span>
        </p>
      )}

      <div className="mt-3 space-y-3">
        {DEPTS.filter((d) => d.id !== 'hq').map((dept) => (
          <DeptInputCard
            key={`${dept.id}-${monthlyInputs.rowFor(dept.id).month}`}
            deptId={dept.id}
            record={monthlyInputs.rowFor(dept.id)}
            onSave={monthlyInputs.save}
            saving={monthlyInputs.saving}
          />
        ))}
      </div>
    </div>
  );
}

export function MonthlyView({
  records,
  month,
  onMonthChange,
  monthlyInputs,
  notes,
  onSaveNote,
}: Props) {
  const summary = calcMonthlySummary(records, month, monthlyInputs.inputs);
  const totalPayout = summary.payouts.reduce((a, p) => a + p.totalPayout, 0);
  const hasBudget = summary.deptRows.some((r) => r.hasBudget);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
        <label htmlFor="monthly-month" className="text-sm font-medium text-slate-600">
          対象月
        </label>
        <input
          id="monthly-month"
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="input min-h-[40px] max-w-[160px]"
        />
        <div className="ml-auto flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => downloadCsv(`payout_${month}.csv`, buildPayoutCsv(summary))}
            className="btn-ghost"
          >
            <Download size={15} />
            支給<span className="hidden sm:inline">明細</span>CSV
          </button>
          <button
            type="button"
            onClick={() => downloadCsv(`dept_pl_${month}.csv`, buildDeptPlCsv(summary))}
            className="btn-ghost"
          >
            <Download size={15} />
            <span className="hidden sm:inline">事業部</span>PL CSV
          </button>
          <button type="button" onClick={() => window.print()} className="btn-ghost">
            <Printer size={15} />
            印刷
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        {hasBudget ? (
          <StatCard
            label="営業利益 予実差異"
            value={`${summary.profitVariance >= 0 ? '+' : ''}${formatYen(summary.profitVariance)}`}
            sub={`計画 ${formatYen(summary.profitBudget)}`}
            icon={Target}
            accent={summary.profitVariance >= 0 ? 'emerald' : 'rose'}
          />
        ) : (
          <StatCard
            label="半年プール積立（当月）"
            value={formatYen(summary.bonusPoolAccrual)}
            icon={PiggyBank}
            accent="amber"
          />
        )}
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

      <MixDonut
        title="事業部別 売上構成（当月）"
        subtitle="額面売上の構成比。金額と比率は凡例と表で読める。"
        segments={buildDeptMix(summary.deptRows)}
        totalLabel="当月合計"
      />

      <MeetingNotePanel
        month={month}
        notes={notes}
        onSave={onSaveNote}
        editable={monthlyInputs.serverBacked}
      />

      <InputPanel monthlyInputs={monthlyInputs} />
    </div>
  );
}
