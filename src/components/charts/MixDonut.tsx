/**
 * 構成比ドーナツ（決済内訳・事業部別売上など）。
 *
 * ぱっと見の内訳把握用。近い値の比較には向かないので 6 分割までに抑え、
 * 凡例に必ず金額と比率を数字で併記する（低コントラストの色があるため、
 * 色だけに意味を持たせない）。
 */
import { useState } from 'react';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { CHROME, MARK, SERIES } from '@/components/charts/chartTheme';
import type { MixSegment } from '@/utils/series';
import { formatPercent, formatYen } from '@/utils/format';

const SIZE = 168;
const STROKE = 22;

interface Props {
  title: string;
  subtitle?: string;
  segments: MixSegment[];
  /** 中央に出す合計のラベル */
  totalLabel?: string;
}

export function MixDonut({ title, subtitle, segments, totalLabel = '合計' }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((a, s) => a + s.value, 0);

  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  // 隣接するセグメントは地色のすき間で分ける（境界線は引かない）
  const gap = visible.length > 1 ? MARK.surfaceGap : 0;

  let offset = 0;
  const arcs = visible.map((seg, i) => {
    const share = total > 0 ? seg.value / total : 0;
    const length = Math.max(0, circumference * share - gap);
    const arc = {
      ...seg,
      color: SERIES[i % SERIES.length],
      share,
      dash: `${length} ${circumference - length}`,
      offset,
    };
    offset += circumference * share;
    return arc;
  });

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <th className="px-4 py-2 text-left font-medium">項目</th>
          <th className="px-4 py-2 text-right font-medium">金額</th>
          <th className="px-4 py-2 text-right font-medium">構成比</th>
        </tr>
      </thead>
      <tbody>
        {arcs.map((a) => (
          <tr key={a.key} className="border-b border-slate-100 last:border-0">
            <td className="px-4 py-2 text-slate-700">{a.label}</td>
            <td className="tabular px-4 py-2 text-right text-slate-700">{formatYen(a.value)}</td>
            <td className="tabular px-4 py-2 text-right text-slate-500">{formatPercent(a.share)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
          <td className="px-4 py-2 text-slate-700">{totalLabel}</td>
          <td className="tabular px-4 py-2 text-right text-slate-800">{formatYen(total)}</td>
          <td className="px-4 py-2" />
        </tr>
      </tfoot>
    </table>
  );

  return (
    <ChartFrame title={title} subtitle={subtitle} table={table}>
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">この期間の内訳データはありません。</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`${title} の構成比`}
            className="shrink-0"
          >
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {arcs.map((a) => (
                <circle
                  key={a.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={radius}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={hover === a.key ? STROKE + 4 : STROKE}
                  strokeDasharray={a.dash}
                  strokeDashoffset={-a.offset}
                  opacity={hover === null || hover === a.key ? 1 : 0.5}
                  className="transition-[stroke-width,opacity] duration-150"
                />
              ))}
            </g>
            <text
              x={SIZE / 2}
              y={SIZE / 2 - 4}
              textAnchor="middle"
              fontSize={11}
              fill={CHROME.muted}
            >
              {totalLabel}
            </text>
            <text
              x={SIZE / 2}
              y={SIZE / 2 + 16}
              textAnchor="middle"
              fontSize={16}
              fontWeight={700}
              fill={CHROME.ink}
            >
              {formatYen(total)}
            </text>
          </svg>

          {/* 凡例が実質の表。金額と比率をここで読める */}
          <ul className="w-full space-y-1.5">
            {arcs.map((a) => (
              <li
                key={a.key}
                onPointerEnter={() => setHover(a.key)}
                onPointerLeave={() => setHover((v) => (v === a.key ? null : v))}
                className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50"
              >
                <span className="inline-flex min-w-0 items-center gap-2 text-slate-600">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: a.color }}
                  />
                  <span className="truncate">{a.label}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular font-medium text-slate-800">{formatYen(a.value)}</span>
                  <span className="tabular ml-2 text-xs text-slate-400">
                    {formatPercent(a.share, 0)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFrame>
  );
}
