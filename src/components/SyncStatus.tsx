import { AlertCircle, Check, Loader2, RefreshCw } from 'lucide-react';
import type { SyncState } from '@/types';

interface Props {
  state: SyncState;
  error: string | null;
  lastSyncedAt: Date | null;
  autoSync: boolean;
  onToggleAutoSync: (value: boolean) => void;
  onSync: () => void;
  /** 自動同期が環境変数で有効になっているか */
  autoSyncAvailable: boolean;
}

export function SyncStatus({
  state,
  error,
  lastSyncedAt,
  autoSync,
  onToggleAutoSync,
  onSync,
  autoSyncAvailable,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        {state === 'loading' && <Loader2 size={13} className="animate-spin text-indigo-500" />}
        {state === 'success' && <Check size={13} className="text-emerald-500" />}
        {state === 'error' && <AlertCircle size={13} className="text-rose-500" />}
        {state === 'error'
          ? '同期エラー'
          : lastSyncedAt
            ? `最終同期 ${lastSyncedAt.toLocaleTimeString('ja-JP')}`
            : '未同期'}
      </span>

      {autoSyncAvailable && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => onToggleAutoSync(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          自動同期
        </label>
      )}

      <button
        type="button"
        onClick={onSync}
        disabled={state === 'loading'}
        className="btn-ghost !px-2.5 !py-1.5 !text-xs"
      >
        <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} />
        同期
      </button>

      {error && (
        <p className="w-full rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>
      )}
    </div>
  );
}
