/**
 * 当月の日次売上（1 系列なので凡例は置かない。見出しが系列名を兼ねる）。
 *
 * 日割り目標を 1 本の基準線として重ね、最大の日だけ直接ラベルを付ける。
 * すべての値はホバーと「表で見る」から読める。
 */
import { useState } from 'react';
import { ChartFrame, ChartTooltip, TooltipRow } from '@/components/charts/ChartFrame';
import { CHROME, MARK, SERIES, STATUS } from '@/components/charts/chartTheme';
import { useChartWidth } from '@/components/charts/useChartWidth';
import type { DailyPoint } from '@/utils/series';
import { buildTicks } from '@/utils/series';
import { getWeekdayJa } from '@/utils/date';
import { formatAxisYen, formatYen } from '@/utils/format';

const HEIGHT = 200;
const PAD = { top: 18, right: 14, bottom: 24, left: 54 };
const BAR_COLOR = SERIES[0];

interface Props {
  points: DailyPoint[];
  /** 日割り目標（0 なら基準線を描かない） */
  proratedTarget?: number;
  /** 強調したい日（`YYYY-MM-DD`）。日別進捗ビューの対象日 */
  highlightDate?: string;
  title?: string;
  subtitle?: string;
}

export function DailySalesChart({
  points,
  proratedTarget = 0,
  highlightDate,
  title = '日次売上（当月）',
  subtitle = '棒は各日の額面売上。横線は日割り目標。',
}: Props) {
  const { ref, width } = useChartWidth();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(80, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const maxValue = Math.max(...points.map((p) => p.gross), proratedTarget, 0);
  const ticks = buildTicks(0, maxValue, 3);
  const yMax = Math.max(...ticks, 1);

  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const band = points.length > 0 ? plotW / points.length : plotW;
  const barW = Math.min(MARK.maxBarWidth, Math.max(3, band - MARK.surfaceGap));
  const cx = (i: number) => PAD.left + band * (i + 0.5);
  const baseline = PAD.top + plotH;

  // 直接ラベルは最大の 1 日だけ。全点に数字は置かない
  const peak = points.reduce((best, p, i) => (p.gross > (points[best]?.gross ?? 0) ? i : best), 0);
  const hovered = hover === null ? null : points[hover];

  const table = (
    <table className="w-full min-w-[420px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <th className="px-4 py-2 text-left font-medium">日</th>
          <th className="px-4 py-2 text-left font-medium">曜日</th>
          <th className="px-4 py-2 text-right font-medium">売上</th>
          <th className="px-4 py-2 text-right font-medium">累計</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.date} className="border-b border-slate-100 last:border-0">
            <td className="px-4 py-1.5 font-medium text-slate-700">{p.day}日</td>
            <td className="px-4 py-1.5 text-slate-500">
              {getWeekdayJa(p.date)}
              {p.closed && <span className="ml-1 text-xs text-slate-400">定休</span>}
            </td>
            <td className="tabular px-4 py-1.5 text-right text-slate-700">{formatYen(p.gross)}</td>
            <td className="tabular px-4 py-1.5 text-right text-slate-500">
              {formatYen(p.cumulative)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame title={title} subtitle={subtitle} table={table}>
      <div ref={ref} className="relative">
        {points.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">表示できるデータがありません。</p>
        ) : (
          <>
            <svg width={width} height={HEIGHT} role="img" aria-label={`${title} のグラフ`}>
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

              {points.map((p, i) => {
                if (p.gross <= 0) return null;
                const top = y(p.gross);
                const h = Math.max(1, baseline - top);
                const r = Math.min(MARK.barRadius, h, barW / 2);
                const x0 = cx(i) - barW / 2;
                const isTarget = highlightDate === p.date;
                return (
                  <path
                    key={p.date}
                    d={`M${x0},${baseline} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} L${x0 + barW - r},${top} Q${x0 + barW},${top} ${x0 + barW},${top + r} L${x0 + barW},${baseline} Z`}
                    fill={isTarget ? CHROME.ink : BAR_COLOR}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                );
              })}

              {/* 日割り目標の基準線 */}
              {proratedTarget > 0 && (
                <>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + plotW}
                    y1={y(proratedTarget)}
                    y2={y(proratedTarget)}
                    stroke={STATUS.warning}
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left + plotW}
                    y={y(proratedTarget) - 5}
                    textAnchor="end"
                    fontSize={10}
                    fill={CHROME.inkSecondary}
                  >
                    日割り目標 {formatAxisYen(proratedTarget)}
                  </text>
                </>
              )}

              {/* 最大の日だけ直接ラベル */}
              {points[peak] && points[peak].gross > 0 && (
                <text
                  x={cx(peak)}
                  y={y(points[peak].gross) - 6}
                  textAnchor="middle"
                  className="tabular"
                  fontSize={10}
                  fontWeight={700}
                  fill={CHROME.inkSecondary}
                >
                  {formatAxisYen(points[peak].gross)}
                </text>
              )}

              {/* 目盛ラベルは 5 日ごと（詰まると読めない） */}
              {points.map((p, i) =>
                p.day % 5 === 0 || p.day === 1 ? (
                  <text
                    key={p.date}
                    x={cx(i)}
                    y={HEIGHT - 7}
                    textAnchor="middle"
                    fontSize={10}
                    fill={CHROME.muted}
                  >
                    {p.day}
                  </text>
                ) : null,
              )}

              {/* 当たり判定は帯ごとに広く取る */}
              {points.map((p, i) => (
                <rect
                  key={p.date}
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={Math.max(band, 1)}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.day}日 ${formatYen(p.gross)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((v) => (v === i ? null : v))}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover((v) => (v === i ? null : v))}
                />
              ))}
            </svg>

            {hovered && hover !== null && (
              <ChartTooltip x={cx(hover)} y={PAD.top} width={width}>
                <p className="mb-1 font-medium text-slate-500">
                  {hovered.day}日（{getWeekdayJa(hovered.date)}）
                  {hovered.closed && ' 定休'}
                </p>
                <TooltipRow color={BAR_COLOR} label="売上" value={formatYen(hovered.gross)} />
                <TooltipRow color={CHROME.muted} label="累計" value={formatYen(hovered.cumulative)} />
              </ChartTooltip>
            )}
          </>
        )}
      </div>
    </ChartFrame>
  );
}
