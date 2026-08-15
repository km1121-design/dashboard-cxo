/**
 * Google Apps Script Web API クライアント（引き継ぎ指示書 4章／8章）
 *
 * - GET  : t_sales 全件取得（`doGet` → `{ status, timestamp, count, sales }`）
 * - POST : 日報・売上を 1 件追記（`doPost` → `{ action: 'addSale' | 'addReport', data }`）
 *
 * 指示書 8章の注意点への対応:
 *  1. GAS は POST を 302 で /echo にリダイレクトする。fetch は `redirect: 'follow'` で
 *     追従するが、追従先で CORS プリフライトが失敗するケースがあるため、
 *     Content-Type は `text/plain;charset=utf-8` にしてプリフライトを発生させない
 *     （GAS 側は `e.postData.contents` を JSON.parse するだけなので問題ない）。
 *  2. それでも通らない環境向けに `noCors: true` を用意。
 *     `mode: 'no-cors'` ではレスポンス本文が読めないため、送信できたことを成功とみなす。
 */
import type {
  ApiResult,
  GasApiConfig,
  GasGetResponse,
  GasGetSuccess,
  GasPostBody,
  GasPostResponse,
  SaleRecord,
  SaleRecordInput,
} from '@/types';

const DEFAULT_TIMEOUT_MS = 15_000;

function resolveFetch(config: GasApiConfig): typeof fetch {
  const impl = config.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!impl) throw new Error('fetch が利用できません。fetchImpl を指定してください。');
  return impl;
}

/** AbortSignal によるタイムアウト付き fetch */
async function fetchWithTimeout(
  config: GasApiConfig,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await resolveFetch(config)(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'GAS API がタイムアウトしました。';
    return error.message;
  }
  return String(error);
}

/**
 * 数値・文字列を型に沿って正規化する。
 * スプレッドシートの空セルは `''` で返るため、number 列は 0 に落とす。
 */
export function normalizeSaleRecord(raw: Partial<SaleRecord>, index = 0): SaleRecord {
  const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const plRate = toNum(raw.plRate);

  return {
    id: String(raw.id ?? `DS${index + 1}`),
    date: String(raw.date ?? ''),
    dept: String(raw.dept ?? ''),
    category: String(raw.category ?? ''),
    member: String(raw.member ?? ''),
    gross: toNum(raw.gross),
    plRate: plRate > 0 ? plRate : 1.0,
    cash: toNum(raw.cash),
    credit: toNum(raw.credit),
    emoney: toNum(raw.emoney),
    qr: toNum(raw.qr),
    groups: toNum(raw.groups),
    totalCustomers: toNum(raw.totalCustomers),
    newCustomers: toNum(raw.newCustomers),
    existingCustomers: toNum(raw.existingCustomers),
    comment: String(raw.comment ?? ''),
    sheetRow: raw.sheetRow === undefined ? undefined : toNum(raw.sheetRow),
  };
}

/* ============================================================================
 * GET: 売上ログ取得
 * ========================================================================== */

/**
 * t_sales を全件取得する。
 * GAS 側がエラーを返した場合も含め、例外を投げずに `ApiResult` で返す。
 */
export async function fetchSales(config: GasApiConfig): Promise<ApiResult<GasGetSuccess>> {
  if (!config.baseUrl) {
    return { ok: false, error: 'GAS API URL が未設定です（VITE_GAS_API_URL）。' };
  }

  try {
    // キャッシュ回避のためタイムスタンプを付与する
    const url = `${config.baseUrl}${config.baseUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const res = await fetchWithTimeout(config, url, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!res.ok) {
      return { ok: false, error: `GAS API が HTTP ${res.status} を返しました。` };
    }

    const text = await res.text();
    let body: GasGetResponse;
    try {
      body = JSON.parse(text) as GasGetResponse;
    } catch {
      // GAS がログイン画面の HTML を返した場合はここに来る
      return {
        ok: false,
        error:
          'GAS のレスポンスが JSON ではありません。デプロイの「アクセスできるユーザー」が「全員」になっているか確認してください。',
      };
    }

    if (body.status === 'error') {
      return { ok: false, error: `GAS: ${body.message}` };
    }

    const sales = (body.sales ?? []).map((r, i) => normalizeSaleRecord(r, i));
    return {
      ok: true,
      data: { status: 'success', timestamp: body.timestamp, count: sales.length, sales },
    };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/* ============================================================================
 * POST: 日報・売上の追記
 * ========================================================================== */

/**
 * t_sales に 1 行追記する。
 *
 * @param action `addSale`（売上ログ）/ `addReport`（BARROOTS 日報）。GAS 側の扱いは同一。
 */
export async function postSale(
  config: GasApiConfig,
  record: SaleRecordInput,
  action: GasPostBody['action'] = 'addSale',
): Promise<ApiResult<GasPostResponse>> {
  if (!config.baseUrl) {
    return { ok: false, error: 'GAS API URL が未設定です（VITE_GAS_API_URL）。' };
  }

  const body: GasPostBody = { action, data: record };

  try {
    const res = await fetchWithTimeout(config, config.baseUrl, {
      method: 'POST',
      // プリフライトを発生させないため text/plain を使う（GAS 側は JSON.parse するだけ）
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      ...(config.noCors ? { mode: 'no-cors' as RequestMode } : {}),
    });

    // no-cors では opaque レスポンスになり status も body も読めない。
    // 送信自体は成功しているため、ここでは成功として扱う（指示書 8章）。
    if (config.noCors || res.type === 'opaque') {
      return {
        ok: true,
        data: { status: 'success', message: '送信しました（no-cors のため結果未確認）' },
      };
    }

    if (!res.ok) {
      return { ok: false, error: `GAS API が HTTP ${res.status} を返しました。` };
    }

    const text = await res.text();
    let parsed: GasPostResponse;
    try {
      parsed = JSON.parse(text) as GasPostResponse;
    } catch {
      return { ok: false, error: 'GAS のレスポンスが JSON ではありません。' };
    }

    if (parsed.status === 'error') {
      return { ok: false, error: `GAS: ${parsed.message}` };
    }

    return { ok: true, data: parsed };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** BARROOTS 日報の登録（`addReport` アクション） */
export function postDailyReport(
  config: GasApiConfig,
  record: SaleRecordInput,
): Promise<ApiResult<GasPostResponse>> {
  return postSale(config, record, 'addReport');
}

/** レコード ID を生成する（GAS 側の既定と同じ `DS` + epoch ミリ秒） */
export function generateRecordId(now: number = Date.now()): string {
  return `DS${now}`;
}
