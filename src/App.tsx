import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Store,
  UserRound,
} from 'lucide-react';
import { AccessSettingsDialog } from '@/components/AccessSettingsDialog';
import { SignInScreen } from '@/components/SignInScreen';
import { DailyReportModal } from '@/components/DailyReportModal';
import { DailyView } from '@/components/DailyView';
import { MonthlyView } from '@/components/MonthlyView';
import { PersonalView } from '@/components/PersonalView';
import { SyncStatus } from '@/components/SyncStatus';
import { TotalView } from '@/components/TotalView';
import { STORE_NAME } from '@/constants/master';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useMonthlyInputs } from '@/hooks/useMonthlyInputs';
import { useSalesData } from '@/hooks/useSalesData';
import { getStoredToken } from '@/lib/credentials';
import { isGasConfigured, SYNC_INTERVAL_MS } from '@/lib/env';
import {
  fromServerViewer,
  resolveInitialViewer,
  setStoredViewer,
  toViewer,
  type ViewerId,
} from '@/lib/viewer';
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
  const auth = useGoogleAuth();
  const signedIn = !auth.enabled || auth.status === 'signed-in';

  // 接続情報が未設定なら初回に設定ダイアログを開く。
  // Google 認証を使う構成では合言葉の入力は要らないので出さない。
  const [settingsOpen, setSettingsOpen] = useState(
    () => !auth.enabled && !getStoredToken() && !isGasConfigured(),
  );
  // 閲覧者。Google 認証が有効ならサーバーの判定、無効なら URL / localStorage で決まる
  const [localViewer, setLocalViewer] = useState(resolveInitialViewer);

  const sales = useSalesData({ idToken: auth.idToken, ready: signedIn });
  const { inputs, update, allInputs } = useMonthlyInputs(month);
  const dailyInputs = useMonthlyInputs(toMonthKey(date)).inputs;

  const changeViewer = useCallback((id: ViewerId) => {
    setStoredViewer(id, false);
    setLocalViewer(toViewer(id, false));
  }, []);

  // サーバーが本人を返してきたらそれが正。ローカルの切替は無視する
  const viewer = fromServerViewer(sales.serverViewer) ?? localViewer;
  const personal = viewer.scope === 'personal' ? viewer.member : null;
  const currentMonth = toMonthKey(toISODate(new Date()));
  // 日報は店舗を持つイベント営業部と管理者だけが登録する
  const canWriteReport = !personal || personal.deptId === 'event';

  // 期限切れなどでサインインが外れたら、下の画面ごと閉じる
  useEffect(() => {
    if (!signedIn) setSettingsOpen(false);
  }, [signedIn]);

  if (!signedIn) {
    return (
      <SignInScreen
        status={auth.status}
        error={auth.error}
        buttonRef={auth.buttonRef}
        onRetry={auth.promptSignIn}
      />
    );
  }

  // 初回の同期が終わるまでは、誰として見るかが確定しない。
  // 先に全社ビューを描いてから個人ビューに切り替わるのを避けるため待つ。
  if (auth.enabled && !sales.lastSyncedAt && sales.state !== 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin text-indigo-500" />
          データを読み込んでいます…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ------------------------------------------------------------ ヘッダ */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur print:static print:bg-white">
        <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-slate-800 sm:text-base">
                {personal
                  ? `${personal.name} さんの実績`
                  : 'Gooner 第5期 PL・インセンティブ管理ポータル'}
              </h1>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {personal
                  ? `合同会社Gooner 第5期 ／ ${personal.ruleNote.split('。')[0]}。`
                  : `合同会社Gooner ／ 事業部損益・支給見立て・${STORE_NAME} 日報`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 print:hidden">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="btn-ghost !px-2.5 sm:!px-3.5"
                title={auth.enabled ? 'アカウント' : '接続設定'}
                aria-label={auth.enabled ? 'アカウント' : '接続設定'}
              >
                {auth.enabled || personal ? <UserRound size={16} /> : <KeyRound size={16} />}
                <span className="hidden sm:inline">
                  {auth.enabled ? 'アカウント' : personal ? '表示設定' : '接続設定'}
                </span>
              </button>
              {canWriteReport && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="btn-primary !px-2.5 sm:!px-3.5"
                  aria-label={`${STORE_NAME} 日報`}
                >
                  <Store size={16} />
                  <span className="hidden sm:inline">{STORE_NAME} 日報</span>
                  <span className="sm:hidden">日報</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 print:hidden">
            <SyncStatus
              state={sales.state}
              error={sales.error}
              lastSyncedAt={sales.lastSyncedAt}
              autoSync={sales.autoSync}
              onToggleAutoSync={sales.setAutoSync}
              onSync={() => void sales.sync()}
              autoSyncAvailable={SYNC_INTERVAL_MS > 0}
            />
          </div>

          {/* ------------------------------------------------ 閲覧モード切替 */}
          {!personal && (
            <nav className="-mx-1 mt-2 overflow-x-auto px-1 print:hidden">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                {MODES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition sm:px-3.5 ${
                      mode === id
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* -------------------------------------------------------------- 本体 */}
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-5">
        {auth.enabled && sales.lastSyncedAt && !sales.serverViewer && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">GAS 側が Google 認証に対応していません。</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
                閲覧範囲がサーバー側で絞られていません。gas/Code.gs を最新版にデプロイし、
                スクリプトプロパティ <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_ID</code> と{' '}
                <code className="rounded bg-amber-100 px-1">MEMBER_EMAILS</code> を設定してください。
              </p>
            </div>
          </div>
        )}

        {!isGasConfigured() && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">GAS API URL が未設定です。</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
                右上の「接続設定」から URL とアクセストークンを入力してください。
                ローカル開発では <code className="rounded bg-amber-100 px-1">.env</code> の{' '}
                <code className="rounded bg-amber-100 px-1">VITE_GAS_API_URL</code>{' '}
                でも設定できます。設定するまでデータは空のまま表示されます。
              </p>
            </div>
          </div>
        )}

        {personal ? (
          <PersonalView
            member={personal}
            records={sales.records}
            month={month}
            onMonthChange={setMonth}
            inputs={inputs}
            onInputsChange={update}
            inputsByMonth={allInputs}
            currentMonth={currentMonth}
          />
        ) : (
          <>
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

            {mode === 'total' && (
              <TotalView
                records={sales.records}
                inputsByMonth={allInputs}
                currentMonth={currentMonth}
              />
            )}
          </>
        )}
      </main>

      <AccessSettingsDialog
        open={settingsOpen}
        dismissable={auth.enabled || isGasConfigured() || Boolean(getStoredToken())}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => void sales.sync()}
        viewer={viewer}
        onViewerChange={changeViewer}
        googleAuth={
          auth.enabled ? { email: auth.email, onSignOut: auth.signOut } : null
        }
      />

      {canWriteReport && (
        <DailyReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          records={sales.records}
          onSubmit={sales.addReport}
          submitting={sales.state === 'loading'}
          defaultMonthlyTarget={dailyInputs.monthlySalesTarget ?? 360_000}
          defaultMember={personal?.name}
        />
      )}
    </div>
  );
}
