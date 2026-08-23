import type { DeptPlRow } from '@/types';
import { formatPercent, formatYen } from '@/utils/format';

export function DeptPLTable({ rows }: { rows: DeptPlRow[] }) {
  const total = rows.reduce(
    (acc, r) => ({
      grossSales: acc.grossSales + r.grossSales,
      effectiveSales: acc.effectiveSales + r.effectiveSales,
      expense: acc.expense + r.expense,
      laborCost: acc.laborCost + r.laborCost,
      operatingProfit: acc.operatingProfit + r.operatingProfit,
      profitBudget: acc.profitBudget + r.profitBudget,
      profitVariance: acc.profitVariance + r.profitVariance,
    }),
    {
      grossSales: 0,
      effectiveSales: 0,
      expense: 0,
      laborCost: 0,
      operatingProfit: 0,
      profitBudget: 0,
      profitVariance: 0,
    },
  );

  /** 計画が 1 つも入っていない月は、予実の列を出さない */
  const hasBudget = rows.some((r) => r.hasBudget);

  const variance = (value: number) => (
    <span className={value >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
      {value >= 0 ? '+' : ''}
      {formatYen(value)}
    </span>
  );

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-800">事業部別 損益（PL）</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          実質売上は転職支援を 50% 計上した金額。人件費には基本給・概算固定費・保守費を含む。
          {hasBudget
            ? '差異は営業利益の実績 − 計画。'
            : '月次入力に営業利益計画を入れると、予実の差異が出る。'}
        </p>
      </div>

      {/* スマホでは横スクロールさせず、事業部ごとのカードで読ませる */}
      <ul className="divide-y divide-slate-100 sm:hidden">
        {rows.map((row) => (
          <li key={row.deptId} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">{row.deptLabel}</span>
              <span
                className={`tabular text-sm font-bold ${
                  row.operatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {formatYen(row.operatingProfit)}
              </span>
            </div>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <div className="flex justify-between">
                <dt>額面売上</dt>
                <dd className="tabular text-slate-600">{formatYen(row.grossSales)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>実質PL売上</dt>
                <dd className="tabular text-slate-600">{formatYen(row.effectiveSales)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>経費</dt>
                <dd className="tabular text-slate-600">{formatYen(row.expense)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>人件費</dt>
                <dd className="tabular text-slate-600">{formatYen(row.laborCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>目標達成率</dt>
                <dd className="tabular text-slate-600">
                  {row.achievementRate > 0 ? formatPercent(row.achievementRate) : '—'}
                </dd>
              </div>
              {hasBudget && (
                <>
                  <div className="flex justify-between">
                    <dt>利益計画</dt>
                    <dd className="tabular text-slate-600">
                      {row.hasBudget ? formatYen(row.profitBudget) : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>予実差異</dt>
                    <dd className="tabular">
                      {row.hasBudget ? variance(row.profitVariance) : '—'}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-2 bg-slate-50 px-4 py-3">
          <span className="text-sm font-bold text-slate-700">全社合計 営業利益</span>
          <span
            className={`tabular text-sm font-bold ${
              total.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatYen(total.operatingProfit)}
          </span>
        </li>
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="px-4 py-2.5 text-left font-medium">事業部</th>
              <th className="px-4 py-2.5 text-right font-medium">額面売上</th>
              <th className="px-4 py-2.5 text-right font-medium">実質PL売上</th>
              <th className="px-4 py-2.5 text-right font-medium">経費</th>
              <th className="px-4 py-2.5 text-right font-medium">人件費</th>
              <th className="px-4 py-2.5 text-right font-medium">営業利益</th>
              <th className="px-4 py-2.5 text-right font-medium">目標達成率</th>
              {hasBudget && (
                <>
                  <th className="px-4 py-2.5 text-right font-medium">利益計画</th>
                  <th className="px-4 py-2.5 text-right font-medium">予実差異</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.deptId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-700">{row.deptLabel}</td>
                <td className="tabular px-4 py-2.5 text-right text-slate-600">
                  {formatYen(row.grossSales)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-slate-800">
                  {formatYen(row.effectiveSales)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-slate-500">
                  {formatYen(row.expense)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-slate-500">
                  {formatYen(row.laborCost)}
                </td>
                <td
                  className={`tabular px-4 py-2.5 text-right font-bold ${
                    row.operatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {formatYen(row.operatingProfit)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-slate-500">
                  {row.achievementRate > 0 ? formatPercent(row.achievementRate) : '—'}
                </td>
                {hasBudget && (
                  <>
                    <td className="tabular px-4 py-2.5 text-right text-slate-500">
                      {row.hasBudget ? formatYen(row.profitBudget) : '—'}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-medium">
                      {row.hasBudget ? variance(row.profitVariance) : '—'}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
              <td className="px-4 py-2.5 text-slate-700">全社合計</td>
              <td className="tabular px-4 py-2.5 text-right text-slate-700">
                {formatYen(total.grossSales)}
              </td>
              <td className="tabular px-4 py-2.5 text-right text-slate-800">
                {formatYen(total.effectiveSales)}
              </td>
              <td className="tabular px-4 py-2.5 text-right text-slate-600">
                {formatYen(total.expense)}
              </td>
              <td className="tabular px-4 py-2.5 text-right text-slate-600">
                {formatYen(total.laborCost)}
              </td>
              <td
                className={`tabular px-4 py-2.5 text-right ${
                  total.operatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatYen(total.operatingProfit)}
              </td>
              <td className="px-4 py-2.5" />
              {hasBudget && (
                <>
                  <td className="tabular px-4 py-2.5 text-right text-slate-600">
                    {formatYen(total.profitBudget)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right">
                    {variance(total.profitVariance)}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
