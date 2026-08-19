import type { LucideIcon } from 'lucide-react';

const ACCENTS = {
  indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-indigo-700' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
  slate: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-800' },
  rose: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-700' },
} as const;

export type StatAccent = keyof typeof ACCENTS;

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  accent?: StatAccent;
}

export function StatCard({ label, value, sub, icon: Icon, accent = 'slate' }: Props) {
  const styles = ACCENTS[accent];

  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
          {/* 狭い画面では金額が省略されないよう文字を一段小さくする */}
          <p className={`tabular mt-1 truncate text-lg font-bold sm:mt-1.5 sm:text-2xl ${styles.value}`}>
            {value}
          </p>
          {sub && <p className="mt-1 truncate text-[11px] text-slate-400 sm:text-xs">{sub}</p>}
        </div>
        {/* アイコンは装飾。場所が要る狭い画面では出さない */}
        <span className={`hidden shrink-0 rounded-lg p-2 sm:block ${styles.icon}`}>
          <Icon size={18} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}
