/**
 * GAS API との同期フック。
 * 手動同期（`sync`）と、一定間隔での自動同期に対応する（指示書 3章）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultConfig, SYNC_INTERVAL_MS } from '@/lib/env';
import { fetchSales, postDailyReport, postSale } from '@/lib/gasApi';
import type { GasApiConfig, SaleRecord, SaleRecordInput, SyncState } from '@/types';

export interface UseSalesDataResult {
  records: SaleRecord[];
  state: SyncState;
  error: string | null;
  /** 最終同期時刻 */
  lastSyncedAt: Date | null;
  /** 手動同期 */
  sync: () => Promise<void>;
  /** 売上ログを 1 件追記して再同期する */
  addSale: (record: SaleRecordInput) => Promise<boolean>;
  /** BARROOTS 日報を 1 件追記して再同期する */
  addReport: (record: SaleRecordInput) => Promise<boolean>;
  /** 自動同期の ON/OFF */
  autoSync: boolean;
  setAutoSync: (value: boolean) => void;
}

/**
 * @param config 省略時は毎回 `getDefaultConfig()` を読み直す。
 *   接続設定（トークン・URL）は画面から変更できるため、
 *   固定した設定を保持せず、同期のたびに最新の値を取得する。
 */
export function useSalesData(config?: GasApiConfig): UseSalesDataResult {
  const [records, setRecords] = useState<SaleRecord[]>([]);
  const [state, setState] = useState<SyncState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [autoSync, setAutoSync] = useState<boolean>(SYNC_INTERVAL_MS > 0);

  // 明示的に渡された設定は ref に保持し、無ければ都度 getDefaultConfig() を読む
  const configRef = useRef(config);
  configRef.current = config;

  const resolveConfig = useCallback((): GasApiConfig => configRef.current ?? getDefaultConfig(), []);

  const sync = useCallback(async () => {
    setState('loading');
    setError(null);

    const result = await fetchSales(resolveConfig());

    if (result.ok) {
      setRecords(result.data.sales);
      setLastSyncedAt(new Date());
      setState('success');
    } else {
      setError(result.error);
      setState('error');
    }
  }, [resolveConfig]);

  const post = useCallback(
    async (record: SaleRecordInput, kind: 'sale' | 'report'): Promise<boolean> => {
      setState('loading');
      setError(null);

      const send = kind === 'report' ? postDailyReport : postSale;
      const result = await send(resolveConfig(), record);

      if (!result.ok) {
        setError(result.error);
        setState('error');
        return false;
      }

      // 追記が反映された状態を取り直す
      await sync();
      return true;
    },
    [sync, resolveConfig],
  );

  const addSale = useCallback((r: SaleRecordInput) => post(r, 'sale'), [post]);
  const addReport = useCallback((r: SaleRecordInput) => post(r, 'report'), [post]);

  // 初回ロード
  useEffect(() => {
    void sync();
  }, [sync]);

  // 自動同期
  useEffect(() => {
    if (!autoSync || SYNC_INTERVAL_MS <= 0) return;
    const timer = setInterval(() => void sync(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoSync, sync]);

  return {
    records,
    state,
    error,
    lastSyncedAt,
    sync,
    addSale,
    addReport,
    autoSync,
    setAutoSync,
  };
}
