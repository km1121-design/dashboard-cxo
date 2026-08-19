/**
 * gas/Code.gs のテスト。
 *
 * Apps Script のグローバル API をスタブに差し替えて Code.gs を評価し、
 * コンテナバインド / スタンドアロン両方で動作することを検証する。
 * （Code.gs は Apps Script 上で動くため、ここでは実行環境を模して確認している）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CODE_GS = readFileSync(join(__dirname, '../../gas/Code.gs'), 'utf8');

/** 引き継ぎ指示書 1.2 のスプレッドシート ID */
const SPEC_SPREADSHEET_ID = '1lbLTY4HvNBeDsqqRmlzNmFSG_jAIR--VKgx0fd9pgTU';

const HEADER = [
  'ID', '日付', '事業部', 'カテゴリ', '担当者', '額面売上', 'PL計上率',
  '現金', 'クレカ', '電子マネー', 'QR', '組数', '総客数', '新規客数',
  '既存客数', '総評・コメント', '登録日時',
];

interface FakeSpreadsheet {
  label: string;
  rows: unknown[][];
}

function makeSpreadsheet(label: string, rows: unknown[][] = [HEADER]): FakeSpreadsheet {
  return { label, rows };
}

function sheetOf(ss: FakeSpreadsheet) {
  return {
    appendRow: (r: unknown[]) => ss.rows.push(r),
    getDataRange: () => ({ getValues: () => ss.rows }),
    getRange: () => ({ setFontWeight: () => ({ setBackground: () => undefined }) }),
  };
}

function wrap(ss: FakeSpreadsheet) {
  const sheet = sheetOf(ss);
  return {
    label: ss.label,
    getSheetByName: (n: string) => (n === 't_sales' ? sheet : null),
    insertSheet: () => sheet,
  };
}

interface LoadOptions {
  /** getActiveSpreadsheet() の戻り値。null ならスタンドアロン相当 */
  active: FakeSpreadsheet | null;
  /** スクリプトプロパティ */
  props?: Record<string, string>;
  /** openById で開けるスプレッドシート */
  byId?: Record<string, FakeSpreadsheet>;
}

interface GasApi {
  doGet: (e: unknown) => { text: string };
  doPost: (e: unknown) => { text: string };
  getTargetSpreadsheet: () => { label: string };
  isAuthorized: (token: unknown) => boolean;
  generateAuthToken: () => string;
}

/** Code.gs をスタブ環境で評価して関数を取り出す */
function load(options: LoadOptions): { api: GasApi; opened: string[] } {
  const { active, props = {}, byId = {} } = options;
  const opened: string[] = [];

  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (active ? wrap(active) : null),
      openById: (id: string) => {
        opened.push(id);
        if (!byId[id]) throw new Error('No item with the given ID could be found: ' + id);
        return wrap(byId[id]);
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (t: string) => ({ text: t, setMimeType: () => ({ text: t }) }),
    },
    Logger: { log: () => undefined },
  };

  const keys = Object.keys(sandbox);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    ...keys,
    `${CODE_GS}\n;return { doGet, doPost, getTargetSpreadsheet, isAuthorized, generateAuthToken };`,
  );
  const api = factory(...keys.map((k) => sandbox[k as keyof typeof sandbox])) as GasApi;
  return { api, opened };
}

const parse = (r: { text: string }) => JSON.parse(r.text);

/* ========================================================================== */

describe('スプレッドシートの解決', () => {
  it('コンテナバインドならアクティブなスプレッドシートを使う', () => {
    const bound = makeSpreadsheet('bound');
    const { api, opened } = load({ active: bound });

    expect(api.getTargetSpreadsheet().label).toBe('bound');
    expect(opened).toHaveLength(0);
  });

  it('スタンドアロンなら指示書のスプレッドシート ID で開く', () => {
    const target = makeSpreadsheet('by-id');
    const { api, opened } = load({ active: null, byId: { [SPEC_SPREADSHEET_ID]: target } });

    expect(api.getTargetSpreadsheet().label).toBe('by-id');
    expect(opened).toEqual([SPEC_SPREADSHEET_ID]);
  });

  it('スクリプトプロパティ SPREADSHEET_ID が既定値より優先される', () => {
    const other = makeSpreadsheet('override');
    const { api, opened } = load({
      active: null,
      props: { SPREADSHEET_ID: 'OVERRIDE_ID' },
      byId: { OVERRIDE_ID: other },
    });

    expect(api.getTargetSpreadsheet().label).toBe('override');
    expect(opened).toEqual(['OVERRIDE_ID']);
  });
});

describe('doGet / doPost（スタンドアロン環境）', () => {
  it('取得と追記が一往復する', () => {
    const target = makeSpreadsheet('by-id');
    const { api } = load({ active: null, byId: { [SPEC_SPREADSHEET_ID]: target } });

    const initial = parse(api.doGet({ parameter: {} }));
    expect(initial.status).toBe('success');
    expect(initial.count).toBe(0);

    const posted = parse(
      api.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'addReport',
            data: { date: '2026-08-19', gross: 15000, category: '店舗運営(BAR)' },
          }),
        },
      }),
    );
    expect(posted.status).toBe('success');

    const after = parse(api.doGet({ parameter: {} }));
    expect(after.count).toBe(1);
    expect(after.sales[0].gross).toBe(15000);
    expect(after.sales[0].category).toBe('店舗運営(BAR)');
  });

  it('不明なアクションは error を返す', () => {
    const target = makeSpreadsheet('by-id');
    const { api } = load({ active: null, byId: { [SPEC_SPREADSHEET_ID]: target } });

    const res = parse(
      api.doPost({ postData: { contents: JSON.stringify({ action: 'unknown', data: {} }) } }),
    );
    expect(res.status).toBe('error');
  });

  it('スプレッドシートが開けない場合も例外で落ちず error を返す', () => {
    const { api } = load({ active: null, props: { SPREADSHEET_ID: 'MISSING' } });

    const res = parse(api.doGet({ parameter: {} }));
    expect(res.status).toBe('error');
    expect(res.message).toContain('MISSING');
  });
});

describe('アクセストークン認証', () => {
  const withToken = () => {
    const target = makeSpreadsheet('by-id');
    return load({
      active: null,
      props: { AUTH_TOKEN: 'secret' },
      byId: { [SPEC_SPREADSHEET_ID]: target },
    });
  };

  it('AUTH_TOKEN 未設定なら誰でも通る（後方互換）', () => {
    const target = makeSpreadsheet('by-id');
    const { api } = load({ active: null, byId: { [SPEC_SPREADSHEET_ID]: target } });

    expect(api.isAuthorized('')).toBe(true);
    expect(parse(api.doGet({ parameter: {} })).status).toBe('success');
  });

  it('GET は誤ったトークンを拒否する', () => {
    const { api } = withToken();
    const res = parse(api.doGet({ parameter: { token: 'bad' } }));

    expect(res.status).toBe('error');
    expect(res.message).toContain('アクセストークン');
  });

  it('GET は正しいトークンを通す', () => {
    const { api } = withToken();
    expect(parse(api.doGet({ parameter: { token: 'secret' } })).status).toBe('success');
  });

  it('POST は誤ったトークンを拒否する', () => {
    const { api } = withToken();
    const res = parse(
      api.doPost({
        postData: { contents: JSON.stringify({ action: 'addSale', token: 'bad', data: {} }) },
      }),
    );
    expect(res.status).toBe('error');
  });

  it('POST は正しいトークンを通す', () => {
    const { api } = withToken();
    const res = parse(
      api.doPost({
        postData: { contents: JSON.stringify({ action: 'addSale', token: 'secret', data: { gross: 1 } }) },
      }),
    );
    expect(res.status).toBe('success');
  });

  it('前後の空白は無視して比較する', () => {
    const { api } = withToken();
    expect(api.isAuthorized('  secret  ')).toBe(true);
    expect(api.isAuthorized('secret2')).toBe(false);
  });
});

describe('generateAuthToken', () => {
  it('32文字の英数字を返す', () => {
    const target = makeSpreadsheet('by-id');
    const { api } = load({ active: null, byId: { [SPEC_SPREADSHEET_ID]: target } });

    const token = api.generateAuthToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9]{32}$/);
  });
});
