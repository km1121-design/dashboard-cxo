/**
 * 達成率メーター（単一の値なのでゲージ 1 本で示す）。
 *
 * 塗りが状態（達成／要注意／未達）を持ち、トラックは同じ青ランプの淡いステップ。
 * 状態色は必ずアイコンとラベルを添えて、色だけに意味を持たせない。
 */
import { AlertTriangle, CheckCircle2, TriangleAlert } from 'lucide-react';
import { CHROME, STATUS } from '@/components/charts/chartTheme';
import { formatPercent, formatYen } from '@/utils/format';

/** 達成率から状態を決める */
export function resolveAchievementStatus(rate: number): 'good' | 'warning' | 'critical' {
  if (rate >= 1) return 'good';
  if (rate >= 0.7) return 'warning';
  return 'critical';
}

const STATUS_LABEL = {
  good: '達成',
  warning: 'あと少し',
  critical: '未達',
} as const;

const STATUS_ICON = {
  good: CheckCircle2,
  warning: TriangleAlert,
  critical: AlertTriangle,
} as const;

interface Props {
  label: string;
  /** 実績 */
  value: number;
  /** 目標。0 以下なら達成率を出さずに実績だけ見せる */
  target: number;
  /** 補足行 */
  note?: string;
}

export function AchievementMeter({ label, value, target, note }: Props) {
  const hasTarget = target > 0;
  const rate = hasTarget ? value / target : 0;
  const status = resolveAchievementStatus(rate);
  const Icon = STATUS_ICON[status];

  // 半円ゲージ。180° を 100% として、超過分は満杯で止める
  const filled = Math.max(0, Math.min(1, rate));
  const width = 208;
  const height = 116;
  const cx = width / 2;
  const cy = 100;
  const r = 84;
  const stroke = 12;

  const arc = (from: number, to: number) => {
    const point = (t: number) => {
      const angle = Math.PI * (1 - t);
      return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
    };
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    const large = to - from > 0.5 ? 1 : 0;
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };

  return (
    <div className="card flex flex-col items-center p-4">
      <p className="self-start text-xs font-medium text-slate-500">{label}</p>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label} ${hasTarget ? formatPercent(rate) : formatYen(value)}`}
        className="mt-1"
      >
        <path
          d={arc(0, 1)}
          fill="none"
          stroke={CHROME.trackLight}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {filled > 0 && (
          <path
            d={arc(0, filled)}
            fill="none"
            stroke={STATUS[status]}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy - 22}
          textAnchor="middle"
          fontSize={28}
          fontWeight={700}
          fill={CHROME.ink}
        >
          {hasTarget ? formatPercent(rate, 0) : '—'}
        </text>
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={11} fill={CHROME.muted}>
          {hasTarget ? `目標 ${formatYen(target)}` : '目標なし'}
        </text>
      </svg>

      <p className="tabular -mt-1 text-lg font-bold text-slate-800">{formatYen(value)}</p>

      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Icon size={14} style={{ color: STATUS[status] }} aria-hidden />
        {hasTarget ? STATUS_LABEL[status] : '実績のみ'}
      </p>

      {note && <p className="mt-1 text-center text-xs text-slate-400">{note}</p>}
    </div>
  );
}
