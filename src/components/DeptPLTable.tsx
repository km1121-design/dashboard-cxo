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
    }),
    { grossSales: 0, effectiveSales: 0, expense: 0, laborCost: 0, operatingProfit: 0 },
  );

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-800">事業部別 損益（PL）</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          実質売上は転職支援を 50% 計上した金額。人件費には基本給・概算固定費・保守費を含む。
        </p>
      </div>

      <div className="overflow-x-auto">
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
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
