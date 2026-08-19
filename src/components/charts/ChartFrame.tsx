/**
 * グラフの外枠。見出し・凡例・「表で見る」切替を共通化する。
 *
 * ツールチップは補助であって唯一の読み方にはしない。どのグラフも表で全数値を
 * 読めるようにするため、`table` を必ず渡す。
 */
import { useId, useState } from 'react';
import { Table2 } from 'lucide-react';
import type { ReactNode } from 'react';

export interface LegendItem {
  label: string;
  color: string;
  /** 棒・面は矩形、折れ線は線のキーで示す */
  kind?: 'rect' | 'line';
  /** 凡例に併記する実数値（色だけに意味を持たせないための保険） */
  value?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  /** 「表で見る」で開く表 */
  table: ReactNode;
  /** 見出し右に置く操作（月セレクタなど） */
  action?: ReactNode;
  children: ReactNode;
}

export function ChartFrame({ title, subtitle, legend, table, action, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            aria-controls={tableId}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <Table2 size={14} />
            {showTable ? 'グラフで見る' : '表で見る'}
          </button>
        </div>
      </header>

      {legend && legend.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-slate-100 px-4 py-2">
          {legend.map((item) => (
            <li key={item.label} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              {item.kind === 'line' ? (
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              ) : (
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
              )}
              {item.label}
              {item.value && <span className="tabular text-slate-500">{item.value}</span>}
            </li>
          ))}
        </ul>
      )}

      {showTable ? (
        <div id={tableId} className="overflow-x-auto">
          {table}
        </div>
      ) : (
        <div className="px-2 py-3 sm:px-4">{children}</div>
      )}
    </section>
  );
}

/** ツールチップの吹き出し。SVG の上に絶対配置する */
export function ChartTooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  /** 描画領域の幅。右端で吹き出しがはみ出さないよう寄せる */
  width: number;
  children: ReactNode;
}) {
  const flip = x > width * 0.6;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg"
      style={{
        left: flip ? undefined : x + 10,
        right: flip ? width - x + 10 : undefined,
        top: Math.max(0, y - 8),
      }}
    >
      {children}
    </div>
  );
}

/** ツールチップの 1 行。値を主、系列名を従にする */
export function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <span
          aria-hidden
          className="inline-block h-0.5 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="tabular font-bold text-slate-800">{value}</span>
    </div>
  );
}
