/**
 * GAS API クライアントのテスト。fetch をモックして疎通を検証する。
 */
import type { GasApiConfig, SaleRecordInput } from '@/types';
import {
  fetchSales,
  generateRecordId,
  normalizeSaleRecord,
  postDailyReport,
  postSale,
} from '@/lib/gasApi';

const BASE_URL = 'https://script.google.com/macros/s/TEST/exec';

function jsonResponse(body: unknown, init: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    type: 'basic',
    text: async () => JSON.stringify(body),
    ...init,
  } as unknown as Response;
}

function makeConfig(fetchImpl: jest.Mock): GasApiConfig {
  return { baseUrl: BASE_URL, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const SAMPLE_ROW = {
  id: 'DS1',
  date: '2026-08-12',
  dept: 'イベント営業',
  category: '店舗運営(BAR)',
  member: '入舩 雄志',
  gross: 15000,
  plRate: 1,
  cash: 15000,
  credit: 0,
  emoney: 0,
  qr: 0,
  groups: 4,
  totalCustomers: 8,
  newCustomers: 8,
  existingCustomers: 0,
  comment: 'テスト',
  sheetRow: 2,
};

/* ============================================================================
 * normalizeSaleRecord
 * ========================================================================== */

describe('normalizeSaleRecord', () => {
  it('欠損フィールドを型どおりの既定値で埋める', () => {
    const record = normalizeSaleRecord({}, 0);
    expect(record.id).toBe('DS1');
    expect(record.date).toBe('');
    expect(record.gross).toBe(0);
    expect(record.plRate).toBe(1.0);
    expect(record.comment).toBe('');
  });

  it('スプレッドシートの空セル（空文字）を 0 に落とす', () => {
    const record = normalizeSaleRecord({
      gross: '' as unknown as number,
      cash: '' as unknown as number,
      groups: '' as unknown as number,
    });
    expect(record.gross).toBe(0);
    expect(record.cash).toBe(0);
    expect(record.groups).toBe(0);
  });

  it('plRate が 0 や欠損なら 1.0 に補正する', () => {
    expect(normalizeSaleRecord({ plRate: 0 }).plRate).toBe(1.0);
    expect(normalizeSaleRecord({ plRate: 0.5 }).plRate).toBe(0.5);
  });

  it('正常な行はそのまま保持する', () => {
    expect(normalizeSaleRecord(SAMPLE_ROW)).toEqual(SAMPLE_ROW);
  });
});

/* ============================================================================
 * fetchSales (GET)
 * ========================================================================== */

describe('fetchSales', () => {
  it('doGet の成功レスポンスを正規化して返す', async () => {
    const mock = jest.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        timestamp: '2026-08-12T00:00:00.000Z',
        count: 1,
        sales: [SAMPLE_ROW],
      }),
    );

    const result = await fetchSales(makeConfig(mock));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data.count).toBe(1);
    expect(result.data.sales[0].gross).toBe(15000);
    expect(result.data.timestamp).toBe('2026-08-12T00:00:00.000Z');
  });

  it('キャッシュ回避のクエリを付けて GET する', async () => {
    const mock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'success', timestamp: '', count: 0, sales: [] }));

    await fetchSales(makeConfig(mock));

    const [url, init] = mock.mock.calls[0];
    expect(String(url).startsWith(`${BASE_URL}?t=`)).toBe(true);
    expect(init.method).toBe('GET');
  });

  it('URL 未設定ならエラーを返す（例外は投げない）', async () => {
    const result = await fetchSales({ baseUrl: '' });
    expect(result).toEqual({
      ok: false,
      error: 'GAS API URL が未設定です（VITE_GAS_API_URL）。',
    });
  });

  it('GAS がエラーレスポンスを返したら error にする', async () => {
    const mock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'error', message: 'シートが見つかりません' }));

    const result = await fetchSales(makeConfig(mock));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('GAS: シートが見つかりません');
  });

  it('HTML（ログイン画面）が返ったらアクセス権のヒントを出す', async () => {
    const mock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      type: 'basic',
      text: async () => '<!DOCTYPE html><html>...',
    } as unknown as Response);

    const result = await fetchSales(makeConfig(mock));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('全員');
  });

  it('HTTP エラーを拾う', async () => {
    const mock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, type: 'basic' } as unknown as Response);

    const result = await fetchSales(makeConfig(mock));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toContain('500');
  });

  it('ネットワーク例外をメッセージに変換する', async () => {
    const mock = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await fetchSales(makeConfig(mock));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('Failed to fetch');
  });

  it('タイムアウト（AbortError）を専用メッセージにする', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const mock = jest.fn().mockRejectedValue(abort);

    const result = await fetchSales(makeConfig(mock));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('GAS API がタイムアウトしました。');
  });
});

/* ============================================================================
 * postSale (POST)
 * ========================================================================== */

describe('postSale', () => {
  const RECORD: SaleRecordInput = {
    id: 'DS1699999999999',
    date: '2026-08-12',
    dept: 'イベント営業',
    category: '店舗運営(BAR)',
    member: '入舩 雄志',
    gross: 15000,
    plRate: 1.0,
    cash: 15000,
    credit: 0,
    emoney: 0,
    qr: 0,
    groups: 4,
    totalCustomers: 8,
    newCustomers: 8,
    existingCustomers: 0,
    comment: 'テスト',
  };

  it('action と data を JSON ボディで送る', async () => {
    const mock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'success', message: 'スプレッドシートへ追記しました' }));

    const result = await postSale(makeConfig(mock), RECORD);

    expect(result.ok).toBe(true);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe(BASE_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ action: 'addSale', data: RECORD });
  });

  it('プリフライトを避けるため Content-Type は text/plain', async () => {
    const mock = jest.fn().mockResolvedValue(jsonResponse({ status: 'success', message: 'ok' }));

    await postSale(makeConfig(mock), RECORD);

    const [, init] = mock.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(init.redirect).toBe('follow');
  });

  it('postDailyReport は addReport アクションで送る', async () => {
    const mock = jest.fn().mockResolvedValue(jsonResponse({ status: 'success', message: 'ok' }));

    await postDailyReport(makeConfig(mock), RECORD);

    const [, init] = mock.mock.calls[0];
    expect(JSON.parse(init.body).action).toBe('addReport');
  });

  it('noCors 指定時は mode: no-cors で送り、送信できたことを成功とみなす', async () => {
    const mock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 0, type: 'opaque' } as unknown as Response);

    const result = await postSale(
      { baseUrl: BASE_URL, noCors: true, fetchImpl: mock as unknown as typeof fetch },
      RECORD,
    );

    expect(result.ok).toBe(true);
    const [, init] = mock.mock.calls[0];
    expect(init.mode).toBe('no-cors');
  });

  it('opaque レスポンスは noCors 未指定でも成功として扱う', async () => {
    const mock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 0, type: 'opaque' } as unknown as Response);

    const result = await postSale(makeConfig(mock), RECORD);
    expect(result.ok).toBe(true);
  });

  it('GAS がエラーを返したら error にする', async () => {
    const mock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'error', message: '不明なアクションです' }));

    const result = await postSale(makeConfig(mock), RECORD);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('GAS: 不明なアクションです');
  });

  it('URL 未設定ならエラーを返す', async () => {
    const result = await postSale({ baseUrl: '' }, RECORD);
    expect(result.ok).toBe(false);
  });
});

describe('generateRecordId', () => {
  it('GAS 側と同じ DS + epoch ミリ秒 形式', () => {
    expect(generateRecordId(1_700_000_000_000)).toBe('DS1700000000000');
  });
});
