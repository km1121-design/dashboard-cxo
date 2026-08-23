/**
 * 個人実績ビュー（入舩・中原用）。
 *
 * 全社の数字は出さない。本人の担当売上・所属事業部の営業利益（＝インセンティブの
 * 根拠）・本人の支給見立てだけを扱う。他事業部と全社合計は含めない。
 */
import { Banknote, Download, PiggyBank, Printer, Store, TrendingUp, Wallet } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { AchievementMeter } from '@/components/charts/AchievementMeter';
import { DeptInputCard } from '@/components/DeptInputCard';
import { DailySalesChart } from '@/components/charts/DailySalesChart';
import { MixDonut } from '@/components/charts/MixDonut';
import { TrendChart } from '@/components/charts/TrendChart';
import { MemberPayoutCard } from '@/components/MemberPayoutCard';
import { StatCard } from '@/components/StatCard';
import { BAR_CATEGORY, STORE_NAME } from '@/constants/master';
import type { UseMonthlyInputsResult } from '@/hooks/useMonthlyInputs';
import type { Member, SaleRecord } from '@/types';
import { calcDailyProgress, calcMemberAnnual, calcMemberMonthly } from '@/utils/calculator';
import { buildMemberAnnualCsv, buildMemberPayoutCsv, downloadCsv } from '@/utils/csv';
import { formatPercent, formatYen } from '@/utils/format';
import {
  buildCategoryMix,
  buildDailySeries,
  buildPaymentMix,
  monthAxisLabel,
  trimToElapsedMonths,
} from '@/utils/series';

interface Props {
  member: Member;
  records: SaleRecord[];
  month: string;
  onMonthChange: (month: string) => void;
  /** 月次入力（スプレッドシート保存） */
  monthlyInputs: UseMonthlyInputsResult;
  /** 当月（未到来の月をグラフから落とすのに使う） */
  currentMonth: string;
}

/**
 * 自分の事業部に関わる手入力だけを出す。
 * 経費が入っていないと営業利益が過大に出てしまうため、本人が入れられるようにする。
 */
function OwnInputPanel({
  member,
  monthlyInputs,
}: Pick<Props, 'member' | 'monthlyInputs'>) {
  return (
    <div className="card p-4 print:hidden">
      <h2 className="text-sm font-bold text-slate-800">当月の入力（自分の事業部分）</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        経費と件数はスプレッドシートに載らないため、ここで入力する。
        {monthlyInputs.serverBacked
          ? '保存するとスプレッドシートに書き込まれ、締めの数字に反映される。'
          : 'いまはこのブラウザにだけ保存されている。'}
      </p>

      {!monthlyInputs.serverBacked && (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            入力がこの端末にしか残らない状態です。管理者に GAS の更新を依頼してください。
          </span>
        </p>
      )}

      <div className="mt-3">
        <DeptInputCard
          deptId={member.deptId}
          record={monthlyInputs.rowFor(member.deptId)}
          onSave={monthlyInputs.save}
          saving={monthlyInputs.saving}
          showHeading={false}
        />
      </div>
    </div>
  );
}

export function PersonalView({
  member,
  records,
  month,
  onMonthChange,
  monthlyInputs,
  currentMonth,
}: Props) {
  const result = calcMemberMonthly(records, month, member.id, monthlyInputs.inputs);
  const annual = calcMemberAnnual(records, member.id, monthlyInputs.allInputs);
  const payout = result.payout;

  const incentiveTotal = (payout?.breakdown ?? []).reduce((a, l) => a + l.amount, 0);
  // 自分の事業部に入れた月間売上目標
  const monthlySalesTarget = monthlyInputs.rowFor(member.deptId).salesTarget;

  // 本人担当売上を棒、所属事業部の営業利益を折れ線にする（どちらも円なので同じ軸）
  const trend = trimToElapsedMonths(
    annual.months.map((m) => ({
      month: m.month,
      label: monthAxisLabel(m.month),
      grossSales: m.personalGross,
      effectiveSales: m.personalEffective,
      operatingProfit: m.deptOperatingProfit,
    })),
    currentMonth,
  );

  const dailyPoints = buildDailySeries(records, month, { memberName: member.name });
  const progress = calcDailyProgress(records, `${month}-01`, { monthlySalesTarget });

  const isBarOwner = member.deptId === 'event';
  const mix = isBarOwner
    ? buildPaymentMix(result.personalRecords.filter((r) => r.category === BAR_CATEGORY))
    : buildCategoryMix(result.personalRecords);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ 操作行 */}
      <div className="card flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
        <label htmlFor="personal-month" className="text-sm font-medium text-slate-600">
          対象月
        </label>
        <input
          id="personal-month"
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="input min-h-[40px] max-w-[160px]"
        />
        <div className="ml-auto flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => downloadCsv(`payout_${member.id}_${month}.csv`, buildMemberPayoutCsv(result))}
            className="btn-ghost"
          >
            <Download size={15} />
            当月<span className="hidden sm:inline">明細</span>CSV
          </button>
          <button
            type="button"
            onClick={() => downloadCsv(`payout_${member.id}_annual.csv`, buildMemberAnnualCsv(annual))}
            className="btn-ghost"
          >
            <Download size={15} />
            通期CSV
          </button>
          <button type="button" onClick={() => window.print()} className="btn-ghost">
            <Printer size={15} />
            印刷
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------ 当月サマリ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="当月 振込見立て"
          value={formatYen(payout?.totalPayout ?? 0)}
          sub={`基本給 ${formatYen(payout?.baseSalary ?? 0)}`}
          icon={Wallet}
          accent="indigo"
        />
        <StatCard
          label="当月 インセンティブ"
          value={formatYen(incentiveTotal)}
          sub="内訳は下の支給カード"
          icon={Banknote}
          accent={incentiveTotal > 0 ? 'emerald' : 'slate'}
        />
        <StatCard
          label="自分の担当売上"
          value={formatYen(result.personalGross)}
          sub={`実質PL売上 ${formatYen(result.personalEffective)}`}
          icon={TrendingUp}
          accent="slate"
        />
        <StatCard
          label="プール積立（当月）"
          value={formatYen(payout?.bonusPoolAccrual ?? 0)}
          sub="当月は振り込まれない"
          icon={PiggyBank}
          accent="amber"
        />
      </div>

      {/* --------------------------------------------- 達成状況とメーター */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AchievementMeter
          label={`${result.deptLabel} 営業利益（当月）`}
          value={result.deptOperatingProfit}
          target={result.deptProfitTarget}
          note={
            isBarOwner
              ? '営業利益100万円以上でBAR売上10%の吐き出しが発動する'
              : '目標達成までチームプール3%、超過分5%'
          }
        />
        <AchievementMeter
          label="自分の担当売上（当月）"
          value={result.personalGross}
          target={monthlySalesTarget}
          note={
            monthlySalesTarget > 0
              ? `月間売上目標に対する比／日割り目標 ${formatYen(progress.proratedTarget)}`
              : '下の「月間売上目標」を入力すると達成率が出る'
          }
        />
      </div>

      {/* ------------------------------------------------------ 支給の内訳 */}
      {payout ? (
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-800">当月の支給内訳</h2>
          <div className="max-w-xl">
            <MemberPayoutCard payout={payout} />
          </div>
        </div>
      ) : (
        <p className="card px-4 py-6 text-center text-sm text-slate-400">
          このメンバーの支給ルールは設定されていません。
        </p>
      )}

      {/* -------------------------------------------------------- グラフ群 */}
      <TrendChart
        points={trend}
        title="自分の月次推移"
        subtitle="棒は自分の担当売上、折れ線は所属事業部の営業利益。どちらも円なので同じ軸に載せている。"
        seriesLabels={{ gross: '自分の担当売上', profit: `${result.deptLabel} 営業利益` }}
        tableLabels={{
          gross: '自分の担当売上',
          effective: '自分の実質PL売上',
          profit: '事業部営業利益',
        }}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DailySalesChart
          points={dailyPoints}
          proratedTarget={progress.proratedTarget}
          title="自分の日次売上（当月）"
          subtitle="棒は自分が担当した各日の額面売上。横線は日割り目標。"
        />
        <MixDonut
          title={isBarOwner ? `${STORE_NAME} 決済内訳（当月）` : '自分の売上カテゴリ内訳（当月）'}
          subtitle="金額と構成比は凡例と表で読める。"
          segments={mix}
          totalLabel="当月合計"
        />
      </div>

      {/* -------------------------------------------------------- 案件ログ */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">自分の案件ログ（当月）</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {result.personalRecords.length} 件 ／ 担当者名が「{member.name}」の行だけを表示
          </p>
        </div>

        {result.personalRecords.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            この月の登録データはありません。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 sm:hidden">
            {result.personalRecords.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-700">{r.date}</span>
                  <span className="tabular text-sm font-bold text-slate-800">
                    {formatYen(r.gross)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {r.category} ／ 計上率 {formatPercent(r.plRate, 0)}
                </p>
                {r.comment && <p className="mt-1 text-xs text-slate-500">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}

        {result.personalRecords.length > 0 && (
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-medium">日付</th>
                  <th className="px-4 py-2.5 text-left font-medium">カテゴリ</th>
                  <th className="px-4 py-2.5 text-right font-medium">額面売上</th>
                  <th className="px-4 py-2.5 text-right font-medium">計上率</th>
                  <th className="px-4 py-2.5 text-left font-medium">コメント</th>
                </tr>
              </thead>
              <tbody>
                {result.personalRecords.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-slate-600">{r.date}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.category}</td>
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

      {/* ------------------------------------------------------------ 通期 */}
      <div className="card p-4">
        <h2 className="text-sm font-bold text-slate-800">
          第5期 通期（{annual.fiscalStartMonth} 〜）自分の累計
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">基本給 累計</dt>
            <dd className="tabular mt-0.5 text-lg font-bold text-slate-800">
              {formatYen(annual.annualBase)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">インセンティブ 累計</dt>
            <dd className="tabular mt-0.5 text-lg font-bold text-emerald-700">
              {formatYen(annual.annualIncentive)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">プール積立 累計</dt>
            <dd className="tabular mt-0.5 text-lg font-bold text-amber-700">
              {formatYen(annual.annualBonusPool)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">想定年収</dt>
            <dd className="tabular mt-0.5 text-lg font-bold text-indigo-700">
              {formatYen(annual.annualTotal)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-slate-400">
          自分の担当売上 累計 {formatYen(annual.personalGrossTotal)}
          ／ 想定年収はプール積立を含む見立て
        </p>
      </div>

      {isBarOwner && (
        <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 print:hidden">
          <Store size={15} className="mt-0.5 shrink-0 text-indigo-500" />
          {STORE_NAME} の日報は右上の「{STORE_NAME} 日報」から登録できる。登録した売上はこの画面にも反映される。
        </p>
      )}

      <OwnInputPanel member={member} monthlyInputs={monthlyInputs} />
    </div>
  );
}
