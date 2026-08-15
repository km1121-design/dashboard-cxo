/**
 * Vite の環境変数アクセス。
 *
 * `import.meta.env` は ESM 専用構文で CommonJS（Jest）に変換できないため、
 * この 1 ファイルに閉じ込めてある。`gasApi.ts` は環境非依存に保ち、
 * 設定は呼び出し側から `GasApiConfig` として渡す。
 */
import { getStoredToken, getStoredUrl } from '@/lib/credentials';
import type { GasApiConfig } from '@/types';

const DEFAULT_TIMEOUT_MS = 15_000;

/** GAS ウェブアプリのデプロイ URL（/exec） */
export const GAS_API_URL: string = import.meta.env.VITE_GAS_API_URL ?? '';

/** 自動同期の間隔（ミリ秒）。0 以下なら自動同期しない */
export const SYNC_INTERVAL_MS: number = (() => {
  const raw = Number(import.meta.env.VITE_SYNC_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
})();

/**
 * 実際に使う GAS URL。
 * 画面から入力された値を優先し、無ければビルド時の環境変数を使う。
 */
export function resolveGasUrl(): string {
  return getStoredUrl() || GAS_API_URL;
}

/**
 * 現在の接続設定。
 * トークンはビルドに含めず、ブラウザに保存された値を都度読み出す。
 */
export function getDefaultConfig(): GasApiConfig {
  return {
    baseUrl: resolveGasUrl(),
    token: getStoredToken(),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    noCors: false,
  };
}

/** GAS URL が設定されているか */
export function isGasConfigured(): boolean {
  const url = resolveGasUrl().trim();
  return url.length > 0 && url.includes('/exec');
}
