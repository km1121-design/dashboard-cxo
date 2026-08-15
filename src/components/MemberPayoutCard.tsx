import { PiggyBank, Wallet } from 'lucide-react';
import { DEPT_BY_ID } from '@/constants/master';
import type { MemberPayout } from '@/types';
import { formatYen } from '@/utils/format';

const ACCENT_RING = {
  indigo: 'border-indigo-200 bg-indigo-50/50',
  emerald: 'border-emerald-200 bg-emerald-50/50',
  amber: 'border-amber-200 bg-amber-50/50',
  slate: 'border-slate-200 bg-slate-50',
} as const;

const ACCENT_TEXT = {
  indigo: 'text-indigo-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  slate: 'text-slate-700',
} as const;

export function MemberPayoutCard({ payout }: { payout: MemberPayout }) {
  const dept = DEPT_BY_ID[payout.deptId];
  const accent = dept?.accent ?? 'slate';

  return (
    <div className="card overflow-hidden">
      <div className={`border-b px-4 py-3 ${ACCENT_RING[accent]}`}>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">{payout.memberName}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {payout.memberId} ／ {dept?.label}
            </p>
          </div>
          <span className={`tabular text-xl font-bold ${ACCENT_TEXT[accent]}`}>
            {formatYen(payout.totalPayout)}
          </span>
        </div>
      </div>

      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <Wallet size={14} className="text-slate-400" />
            基本給 / 固定報酬
          </span>
          <span className="tabular font-medium text-slate-800">{formatYen(payout.baseSalary)}</span>
        </div>

        {payout.breakdown.map((line) => (
          <div key={line.label} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 text-slate-600">
              {line.label}
              {line.note && <span className="mt-0.5 block text-xs text-slate-400">{line.note}</span>}
            </span>
            <span
              className={`tabular shrink-0 font-medium ${
                line.amount > 0 ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {line.amount > 0 ? '+' : ''}
              {formatYen(line.amount)}
            </span>
          </div>
        ))}

        {payout.bonusPoolAccrual > 0 && (
          <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <PiggyBank size={14} className="text-amber-500" />
              半年プール積立（当月）
            </span>
            <span className="tabular font-medium text-amber-600">
              {formatYen(payout.bonusPoolAccrual)}
            </span>
          </div>
        )}
      </div>

      {payout.notes.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
          {payout.notes.map((note) => (
            <li key={note} className="text-xs leading-relaxed text-slate-500">
              ・{note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
