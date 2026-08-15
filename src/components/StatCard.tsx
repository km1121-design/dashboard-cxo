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
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`tabular mt-1.5 truncate text-2xl font-bold ${styles.value}`}>{value}</p>
          {sub && <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>}
        </div>
        <span className={`shrink-0 rounded-lg p-2 ${styles.icon}`}>
          <Icon size={18} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}
