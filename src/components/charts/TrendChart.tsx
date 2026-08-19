/**
 * 月次推移（額面売上＝棒／営業利益＝折れ線）。
 *
 * 売上と利益はどちらも円なので同じ 1 本の軸に載せる（2軸グラフは作らない）。
 */
import { useState } from 'react';
import { ChartFrame, ChartTooltip, TooltipRow } from '@/components/charts/ChartFrame';
import { CHROME, MARK, SERIES } from '@/components/charts/chartTheme';
import { useChartWidth } from '@/components/charts/useChartWidth';
import type { TrendPoint } from '@/utils/series';
import { buildTicks } from '@/utils/series';
import { formatAxisYen, formatYen } from '@/utils/format';

const HEIGHT = 260;
const PAD = { top: 14, right: 14, bottom: 28, left: 54 };

const GROSS_COLOR = SERIES[0];
const PROFIT_COLOR = SERIES[1];

interface Props {
  points: TrendPoint[];
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** 系列名。個人ビューでは「自分の担当売上」「事業部の営業利益」に読み替える */
  seriesLabels?: { gross: string; profit: string };
  /** 表の列見出し（`seriesLabels` に合わせる） */
  tableLabels?: { gross: string; effective: string; profit: string };
}

export function TrendChart({
  points,
  title = '月次推移',
  subtitle = '額面売上と営業利益。どちらも円なので同じ軸に載せている。',
  action,
  seriesLabels = { gross: '額面売上', profit: '営業利益' },
  tableLabels = { gross: '額面売上', effective: '実質PL売上', profit: '営業利益' },
}: Props) {
  const { ref, width } = useChartWidth();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(80, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const ticks = buildTicks(
    Math.min(0, ...points.map((p) => p.operatingProfit)),
    Math.max(0, ...points.map((p) => Math.max(p.grossSales, p.operatingProfit))),
  );
  const yMin = Math.min(...ticks, 0);
  const yMax = Math.max(...ticks, 0);
  const span = yMax - yMin || 1;

  const y = (value: number) => PAD.top + plotH - ((value - yMin) / span) * plotH;
  const band = points.length > 0 ? plotW / points.length : plotW;
  const cx = (i: number) => PAD.left + band * (i + 0.5);
  const barW = Math.min(MARK.maxBarWidth, Math.max(4, band - MARK.surfaceGap * 4));
  const zeroY = y(0);

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(p.operatingProfit).toFixed(1)}`)
    .join(' ');

  const last = points.length - 1;
  const hovered = hover === null ? null : points[hover];
  // 帯が狭いと月ラベルが重なるので間引く（末尾は必ず出す）
  const labelStep = band < 26 ? 2 : 1;

  const table = (
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <th className="px-4 py-2 text-left font-medium">月</th>
          <th className="px-4 py-2 text-right font-medium">{tableLabels.gross}</th>
          <th className="px-4 py-2 text-right font-medium">{tableLabels.effective}</th>
          <th className="px-4 py-2 text-right font-medium">{tableLabels.profit}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.month} className="border-b border-slate-100 last:border-0">
            <td className="px-4 py-2 font-medium text-slate-700">{p.month}</td>
            <td className="tabular px-4 py-2 text-right text-slate-600">{formatYen(p.grossSales)}</td>
            <td className="tabular px-4 py-2 text-right text-slate-600">
              {formatYen(p.effectiveSales)}
            </td>
            <td className="tabular px-4 py-2 text-right text-slate-700">
              {formatYen(p.operatingProfit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      action={action}
      legend={[
        { label: seriesLabels.gross, color: GROSS_COLOR, kind: 'rect' },
        { label: seriesLabels.profit, color: PROFIT_COLOR, kind: 'line' },
      ]}
      table={table}
    >
      <div ref={ref} className="relative">
        {points.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">表示できるデータがありません。</p>
        ) : (
          <>
            <svg width={width} height={HEIGHT} role="img" aria-label={`${title} のグラフ`}>
              {/* 目盛（実線のヘアライン） */}
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + plotW}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={t === 0 ? CHROME.baseline : CHROME.grid}
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y(t) + 3.5}
                    textAnchor="end"
                    className="tabular"
                    fontSize={10}
                    fill={CHROME.muted}
                  >
                    {formatAxisYen(t)}
                  </text>
                </g>
              ))}

              {/* 棒：額面売上。データ端だけ角丸、基線側は角なし */}
              {points.map((p, i) => {
                const top = y(Math.max(p.grossSales, 0));
                const h = Math.max(0, zeroY - top);
                const r = Math.min(MARK.barRadius, h);
                const x0 = cx(i) - barW / 2;
                if (p.grossSales <= 0) return null;
                return (
                  <path
                    key={p.month}
                    d={`M${x0},${zeroY} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} L${x0 + barW - r},${top} Q${x0 + barW},${top} ${x0 + barW},${top + r} L${x0 + barW},${zeroY} Z`}
                    fill={GROSS_COLOR}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                );
              })}

              {/* 折れ線：営業利益 */}
              <path
                d={linePath}
                fill="none"
                stroke={PROFIT_COLOR}
                strokeWidth={MARK.lineWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {last >= 0 && (
                <circle
                  cx={cx(last)}
                  cy={y(points[last].operatingProfit)}
                  r={MARK.markerRadius}
                  fill={PROFIT_COLOR}
                  stroke={CHROME.surface}
                  strokeWidth={2}
                />
              )}

              {/* 月ラベル */}
              {points.map((p, i) =>
                i % labelStep === 0 || i === last || hover === i ? (
                  <text
                    key={p.month}
                    x={cx(i)}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    fontSize={10}
                    fill={hover === i ? CHROME.inkSecondary : CHROME.muted}
                  >
                    {p.label}
                  </text>
                ) : null,
              )}

              {/* 十字線とホバーの当たり判定（帯ごと。マークを狙わせない） */}
              {hover !== null && (
                <line
                  x1={cx(hover)}
                  x2={cx(hover)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke={CHROME.baseline}
                  strokeWidth={1}
                />
              )}
              {points.map((p, i) => (
                <rect
                  key={p.month}
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.month} ${seriesLabels.gross} ${formatYen(p.grossSales)} ${seriesLabels.profit} ${formatYen(p.operatingProfit)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((v) => (v === i ? null : v))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((v) => (v === i ? null : v))}
                />
              ))}
            </svg>

            {hovered && hover !== null && (
              <ChartTooltip x={cx(hover)} y={PAD.top} width={width}>
                <p className="mb-1 font-medium text-slate-500">{hovered.month}</p>
                <TooltipRow
                  color={GROSS_COLOR}
                  label={seriesLabels.gross}
                  value={formatYen(hovered.grossSales)}
                />
                <TooltipRow
                  color={PROFIT_COLOR}
                  label={seriesLabels.profit}
                  value={formatYen(hovered.operatingProfit)}
                />
              </ChartTooltip>
            )}
          </>
        )}
      </div>
    </ChartFrame>
  );
}
