import { useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, LayoutDashboard, Store } from 'lucide-react';
import { DailyReportModal } from '@/components/DailyReportModal';
import { DailyView } from '@/components/DailyView';
import { MonthlyView } from '@/components/MonthlyView';
import { SyncStatus } from '@/components/SyncStatus';
import { TotalView } from '@/components/TotalView';
import { STORE_NAME } from '@/constants/master';
import { useMonthlyInputs } from '@/hooks/useMonthlyInputs';
import { useSalesData } from '@/hooks/useSalesData';
import { isGasConfigured, SYNC_INTERVAL_MS } from '@/lib/env';
import type { ViewMode } from '@/types';
import { toISODate, toMonthKey } from '@/utils/date';

const MODES: { id: ViewMode; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'daily', label: '日別進捗', icon: CalendarDays },
  { id: 'monthly', label: '月別結果', icon: LayoutDashboard },
  { id: 'total', label: '総結果', icon: BarChart3 },
];

export default function App() {
  const [mode, setMode] = useState<ViewMode>('daily');
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [month, setMonth] = useState(() => toMonthKey(toISODate(new Date())));
  const [reportOpen, setReportOpen] = useState(false);

  const sales = useSalesData();
  const { inputs, update, allInputs } = useMonthlyInputs(month);
  const dailyInputs = useMonthlyInputs(toMonthKey(date)).inputs;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ------------------------------------------------------------ ヘッダ */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-slate-800">
                Gooner 第5期 PL・インセンティブ管理ポータル
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                合同会社Gooner ／ 事業部損益・支給見立て・{STORE_NAME} 日報
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SyncStatus
                state={sales.state}
                error={sales.error}
                lastSyncedAt={sales.lastSyncedAt}
                autoSync={sales.autoSync}
                onToggleAutoSync={sales.setAutoSync}
                onSync={() => void sales.sync()}
                autoSyncAvailable={SYNC_INTERVAL_MS > 0}
              />
              <button type="button" onClick={() => setReportOpen(true)} className="btn-primary">
                <Store size={15} />
                {STORE_NAME} 日報
              </button>
            </div>
          </div>

          {/* ------------------------------------------------ 閲覧モード切替 */}
          <nav className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                  mode === id
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* -------------------------------------------------------------- 本体 */}
      <main className="mx-auto max-w-7xl px-4 py-5">
        {!isGasConfigured() && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">GAS API URL が未設定です。</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
                <code className="rounded bg-amber-100 px-1">.env</code> に{' '}
                <code className="rounded bg-amber-100 px-1">VITE_GAS_API_URL</code>{' '}
                （ウェブアプリの /exec URL）を設定して再起動してください。設定するまでデータは空のまま表示されます。
              </p>
            </div>
          </div>
        )}

        {mode === 'daily' && (
          <DailyView
            records={sales.records}
            date={date}
            onDateChange={setDate}
            monthlySalesTarget={dailyInputs.monthlySalesTarget ?? 0}
          />
        )}

        {mode === 'monthly' && (
          <MonthlyView
            records={sales.records}
            month={month}
            onMonthChange={setMonth}
            inputs={inputs}
            onInputsChange={update}
          />
        )}

        {mode === 'total' && <TotalView records={sales.records} inputsByMonth={allInputs} />}
      </main>

      <DailyReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        records={sales.records}
        onSubmit={sales.addReport}
        submitting={sales.state === 'loading'}
        defaultMonthlyTarget={dailyInputs.monthlySalesTarget ?? 360_000}
      />
    </div>
  );
}
