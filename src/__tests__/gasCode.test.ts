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
  /** シート名 → 行。`t_sales` 以外は Code.gs が必要に応じて作る */
  sheets: Record<string, unknown[][]>;
}

function makeSpreadsheet(label: string, rows: unknown[][] = [HEADER]): FakeSpreadsheet {
  return { label, sheets: { t_sales: rows } };
}

/** シート 1 枚分のスタブ。upsert のための setValues も持たせる */
function sheetOf(ss: FakeSpreadsheet, name: string) {
  const rows = () => ss.sheets[name];
  return {
    appendRow: (r: unknown[]) => rows().push(r),
    getDataRange: () => ({ getValues: () => rows() }),
    getRange: (row: number, col: number, _numRows: number, numCols: number) => ({
      setFontWeight: () => ({ setBackground: () => undefined }),
      setValues: (values: unknown[][]) => {
        const target = rows()[row - 1];
        for (let i = 0; i < numCols; i++) target[col - 1 + i] = values[0][i];
      },
    }),
  };
}

function wrap(ss: FakeSpreadsheet) {
  return {
    label: ss.label,
    getSheetByName: (n: string) => (ss.sheets[n] ? sheetOf(ss, n) : null),
    insertSheet: (n: string) => {
      ss.sheets[n] = [];
      return sheetOf(ss, n);
    },
  };
}

/** tokeninfo が返す JWT のペイロード相当 */
interface FakeTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string;
  hd?: string;
  /** 秒。省略時は 1 時間後 */
  exp?: number;
}

interface LoadOptions {
  /** getActiveSpreadsheet() の戻り値。null ならスタンドアロン相当 */
  active: FakeSpreadsheet | null;
  /** スクリプトプロパティ */
  props?: Record<string, string>;
  /** openById で開けるスプレッドシート */
  byId?: Record<string, FakeSpreadsheet>;
  /** ID トークン文字列 → tokeninfo のレスポンス。未登録のトークンは 400 を返す */
  tokenInfo?: Record<string, FakeTokenInfo>;
}

interface GasApi {
  doGet: (e: unknown) => { text: string };
  doPost: (e: unknown) => { text: string };
  getTargetSpreadsheet: () => { label: string };
  isAuthorized: (token: unknown) => boolean;
  generateAuthToken: () => string;
  resolveIdentity: (idToken: unknown, token: unknown) => Record<string, unknown>;
}

/** Code.gs をスタブ環境で評価して関数を取り出す */
function load(options: LoadOptions): { api: GasApi; opened: string[]; fetched: string[] } {
  const { active, props = {}, byId = {}, tokenInfo = {} } = options;
  const opened: string[] = [];
  const fetched: string[] = [];

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
    // Google の tokeninfo を模す。登録のない ID トークンは 400 を返す
    UrlFetchApp: {
      fetch: (url: string) => {
        fetched.push(url);
        const raw = decodeURIComponent(url.split('id_token=')[1] ?? '');
        const info = tokenInfo[raw];
        if (!info) return { getResponseCode: () => 400, getContentText: () => '{}' };
        const body = {
          email_verified: 'true',
          exp: String(Math.floor(Date.now() / 1000) + 3600),
          ...info,
        };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
      },
    },
    // CacheService は使わない構成でも動く必要があるため undefined のままにする
  };

  const keys = Object.keys(sandbox);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    ...keys,
    `${CODE_GS}\n;return { doGet, doPost, getTargetSpreadsheet, isAuthorized, generateAuthToken, resolveIdentity };`,
  );
  const api = factory(...keys.map((k) => sandbox[k as keyof typeof sandbox])) as GasApi;
  return { api, opened, fetched };
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

/* ==========================================================================
 * Google アカウント認証
 * ========================================================================== */

const CLIENT_ID = '1234567890-abcdefg.apps.googleusercontent.com';

const GOOGLE_PROPS = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  MEMBER_EMAILS: JSON.stringify({
    'irifune@gooner.space': 'M001',
    'Nakahara@Gooner.space': 'M002',
    'mita@gooner.space': 'M003',
  }),
};

/** t_sales の 1 行を作る（17 列） */
function row(id: string, dept: string, category: string, member: string, gross: number) {
  return [id, '2026-08-12', dept, category, member, gross, 1, 0, 0, 0, 0, 0, 0, 0, 0, '', ''];
}

const SALES_ROWS = [
  HEADER,
  row('E1', 'イベント営業', '店舗運営(BAR)', '入舩 雄志', 100_000),
  row('E2', 'イベント営業', 'イベント', '入舩 雄志', 800_000),
  row('H1', '人材', '人材紹介(広告)', '中原 聖人', 600_000),
  row('L1', '物流・バックヤード', '物流', '三田 航大', 180_000),
];

function loadWithGoogle(tokenInfo: Record<string, FakeTokenInfo>, extraProps: Record<string, string> = {}) {
  return load({
    active: makeSpreadsheet('bound', SALES_ROWS.map((r) => [...r])),
    props: { ...GOOGLE_PROPS, ...extraProps },
    tokenInfo,
  });
}

describe('Google アカウント認証（GOOGLE_CLIENT_ID 未設定なら従来動作）', () => {
  it('未設定なら AUTH_TOKEN 方式のまま動く', () => {
    const { api, fetched } = load({
      active: makeSpreadsheet('bound', [HEADER]),
      props: { AUTH_TOKEN: 'secret' },
    });

    expect(parse(api.doGet({ parameter: { token: 'secret' } })).status).toBe('success');
    // Google には一切問い合わせない
    expect(fetched).toHaveLength(0);
  });

  it('未設定のときの viewer は全社スコープ', () => {
    const { api } = load({ active: makeSpreadsheet('bound', [HEADER]) });
    const body = parse(api.doGet({ parameter: {} }));

    expect(body.viewer).toEqual({
      mode: 'token',
      memberId: null,
      name: '',
      email: '',
      dept: '',
      role: 'Admin',
      scope: 'company',
    });
  });
});

describe('Google アカウント認証（有効時）', () => {
  it('ID トークンが無ければ拒否する', () => {
    const { api } = loadWithGoogle({});
    const body = parse(api.doGet({ parameter: {} }));

    expect(body.status).toBe('error');
    expect(body.message).toContain('サインイン');
  });

  it('AUTH_TOKEN だけのリクエストは通らない（合言葉では入れない）', () => {
    const { api } = loadWithGoogle({}, { AUTH_TOKEN: 'secret' });
    expect(parse(api.doGet({ parameter: { token: 'secret' } })).status).toBe('error');
  });

  it('Google が検証できないトークンは拒否する', () => {
    const { api } = loadWithGoogle({ good: { aud: CLIENT_ID, email: 'irifune@gooner.space' } });
    expect(parse(api.doGet({ parameter: { idToken: 'forged' } })).status).toBe('error');
  });

  it('他アプリ向けのトークン（aud 不一致）は拒否する', () => {
    const { api } = loadWithGoogle({
      other: { aud: 'someone-else.apps.googleusercontent.com', email: 'irifune@gooner.space' },
    });
    const body = parse(api.doGet({ parameter: { idToken: 'other' } }));

    expect(body.status).toBe('error');
    expect(body.message).toContain('このアプリ向け');
  });

  it('期限切れのトークンは拒否する', () => {
    const { api } = loadWithGoogle({
      stale: {
        aud: CLIENT_ID,
        email: 'irifune@gooner.space',
        exp: Math.floor(Date.now() / 1000) - 60,
      },
    });
    const body = parse(api.doGet({ parameter: { idToken: 'stale' } }));

    expect(body.status).toBe('error');
    expect(body.message).toContain('有効期限');
  });

  it('メール未確認のアカウントは拒否する', () => {
    const { api } = loadWithGoogle({
      unverified: { aud: CLIENT_ID, email: 'irifune@gooner.space', email_verified: 'false' },
    });
    expect(parse(api.doGet({ parameter: { idToken: 'unverified' } })).status).toBe('error');
  });

  it('名簿に無いメールアドレスは拒否する', () => {
    const { api } = loadWithGoogle({
      stranger: { aud: CLIENT_ID, email: 'stranger@example.com' },
    });
    const body = parse(api.doGet({ parameter: { idToken: 'stranger' } }));

    expect(body.status).toBe('error');
    expect(body.message).toContain('登録されていません');
  });

  it('ALLOWED_HD を設定すると組織外のアカウントを弾く', () => {
    const { api } = loadWithGoogle(
      { outside: { aud: CLIENT_ID, email: 'irifune@gooner.space', hd: 'example.com' } },
      { ALLOWED_HD: 'gooner.space' },
    );
    const body = parse(api.doGet({ parameter: { idToken: 'outside' } }));

    expect(body.status).toBe('error');
    expect(body.message).toContain('gooner.space');
  });

  it('ALLOWED_HD が一致すれば通る', () => {
    const { api } = loadWithGoogle(
      { inside: { aud: CLIENT_ID, email: 'irifune@gooner.space', hd: 'gooner.space' } },
      { ALLOWED_HD: 'gooner.space' },
    );
    expect(parse(api.doGet({ parameter: { idToken: 'inside' } })).status).toBe('success');
  });

  it('名簿のメールは大文字小文字を区別せず引ける', () => {
    const { api } = loadWithGoogle({
      nakahara: { aud: CLIENT_ID, email: 'nakahara@gooner.space' },
    });
    const body = parse(api.doGet({ parameter: { idToken: 'nakahara' } }));

    expect(body.status).toBe('success');
    expect(body.viewer.memberId).toBe('M002');
  });
});

describe('Google 認証 — 役職ごとに返す行を絞る', () => {
  it('Manager（入舩）にはイベント営業の行だけを返す', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'irifune@gooner.space' } });
    const body = parse(api.doGet({ parameter: { idToken: 't' } }));

    expect(body.viewer).toMatchObject({
      mode: 'google',
      memberId: 'M001',
      role: 'Manager',
      scope: 'personal',
      dept: 'イベント営業',
    });
    expect(body.sales.map((r: { id: string }) => r.id)).toEqual(['E1', 'E2']);
  });

  it('Manager（中原）には人材の行と BAR の行だけを返す（クロスセル計算に必要）', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'nakahara@gooner.space' } });
    const body = parse(api.doGet({ parameter: { idToken: 't' } }));

    // 人材の行と BAR の行は来るが、イベント案件（E2）と物流（L1）は来ない
    expect(body.sales.map((r: { id: string }) => r.id).sort()).toEqual(['E1', 'H1']);
    expect(body.count).toBe(2);
  });

  it('Admin（三田）には全行を返す', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'mita@gooner.space' } });
    const body = parse(api.doGet({ parameter: { idToken: 't' } }));

    expect(body.viewer).toMatchObject({ memberId: 'M003', role: 'Admin', scope: 'company' });
    expect(body.sales).toHaveLength(4);
  });
});

describe('Google 認証 — 書き込みの制限', () => {
  const record = (dept: string) => ({
    id: 'NEW1',
    date: '2026-08-20',
    dept,
    category: 'イベント',
    member: '入舩 雄志',
    gross: 1000,
  });

  const post = (api: GasApi, idToken: string, dept: string) =>
    parse(
      api.doPost({
        postData: { contents: JSON.stringify({ action: 'addSale', idToken, data: record(dept) }) },
      }),
    );

  it('Manager は自分の事業部の行を追記できる', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'irifune@gooner.space' } });
    expect(post(api, 't', 'イベント営業').status).toBe('success');
  });

  it('Manager は他事業部の行を追記できない', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'irifune@gooner.space' } });
    const body = post(api, 't', '人材');

    expect(body.status).toBe('error');
    expect(body.message).toContain('イベント営業 以外');
  });

  it('Admin はどの事業部の行でも追記できる', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'mita@gooner.space' } });
    expect(post(api, 't', '人材').status).toBe('success');
  });

  it('サインインしていない POST は拒否する', () => {
    const { api } = loadWithGoogle({});
    const body = parse(
      api.doPost({
        postData: { contents: JSON.stringify({ action: 'addSale', data: record('イベント営業') }) },
      }),
    );
    expect(body.status).toBe('error');
  });
});

describe('resolveIdentity', () => {
  it('同じトークンでの連続アクセスでも tokeninfo は毎回呼ばれる（キャッシュ無効環境）', () => {
    const { api, fetched } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'mita@gooner.space' } });

    api.doGet({ parameter: { idToken: 't' } });
    api.doGet({ parameter: { idToken: 't' } });

    // CacheService が使える本番では 2 回目はキャッシュに当たる
    expect(fetched).toHaveLength(2);
    expect(fetched[0]).toContain('id_token=t');
  });
});

/* ==========================================================================
 * 月次の手入力（t_dept_inputs）と会議メモ（t_monthly_notes）
 * ========================================================================== */

const DEPT_INPUT_HEADER = [
  '月', '事業部', '経費', '人数', '決定件数_広告', '決定件数_リファーラル',
  '個人直接経費', '売上目標', '売上計画', '営業利益計画', '更新日時',
];

function deptInput(month: string, dept: string, over: Record<string, unknown> = {}) {
  return {
    month,
    dept,
    directExpense: 0,
    headcount: 0,
    placementAd: 0,
    placementReferral: 0,
    personalDirectExpense: 0,
    salesTarget: 0,
    salesBudget: 0,
    profitBudget: 0,
    ...over,
  };
}

function postAs(api: GasApi, idToken: string, action: string, data: unknown) {
  return parse(api.doPost({ postData: { contents: JSON.stringify({ action, idToken, data }) } }));
}

describe('月次の手入力シート', () => {
  it('シートが無ければ見出し付きで作られ、空で返る', () => {
    const ss = makeSpreadsheet('bound', [HEADER]);
    const { api } = load({ active: ss, props: GOOGLE_PROPS, tokenInfo: { t: { aud: CLIENT_ID, email: 'mita@gooner.space' } } });

    const body = parse(api.doGet({ parameter: { idToken: 't' } }));

    expect(body.deptInputs).toEqual([]);
    expect(body.notes).toEqual([]);
    expect(ss.sheets['t_dept_inputs'][0]).toEqual(DEPT_INPUT_HEADER);
    expect(ss.sheets['t_monthly_notes'][0]).toEqual(['月', '所感', '決定事項', '担当', '期限', '更新日時']);
  });

  it('保存した入力が読み出せる', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'mita@gooner.space' } });

    const saved = postAs(api, 't', 'saveDeptInput', deptInput('2026-08', 'イベント営業', {
      directExpense: 120_000,
      salesBudget: 3_000_000,
      profitBudget: 1_200_000,
    }));
    expect(saved.status).toBe('success');

    const body = parse(api.doGet({ parameter: { idToken: 't' } }));
    expect(body.deptInputs).toHaveLength(1);
    expect(body.deptInputs[0]).toMatchObject({
      month: '2026-08',
      dept: 'イベント営業',
      directExpense: 120_000,
      salesBudget: 3_000_000,
      profitBudget: 1_200_000,
    });
  });

  it('同じ月・同じ事業部は上書きされ、行が増えない', () => {
    const ss = makeSpreadsheet('bound', [HEADER]);
    const { api } = load({ active: ss, props: GOOGLE_PROPS, tokenInfo: { t: { aud: CLIENT_ID, email: 'mita@gooner.space' } } });

    postAs(api, 't', 'saveDeptInput', deptInput('2026-08', 'イベント営業', { directExpense: 100 }));
    postAs(api, 't', 'saveDeptInput', deptInput('2026-08', 'イベント営業', { directExpense: 999 }));

    // 見出し + 1 行
    expect(ss.sheets['t_dept_inputs']).toHaveLength(2);

    const body = parse(api.doGet({ parameter: { idToken: 't' } }));
    expect(body.deptInputs).toHaveLength(1);
    expect(body.deptInputs[0].directExpense).toBe(999);
  });

  it('月が違えば別の行になる', () => {
    const { api } = loadWithGoogle({ t: { aud: CLIENT_ID, email: 'mita@gooner.space' } });

    postAs(api, 't', 'saveDeptInput', deptInput('2026-08', 'イベント営業', { directExpense: 100 }));
    postAs(api, 't', 'saveDeptInput', deptInput('2026-09', 'イベント営業', { directExpense: 200 }));

    const body = parse(api.doGet({ parameter: { idToken: 't' } }));
    expect(body.deptInputs.map((r: { month: string }) => r.month)).toEqual(['2026-08', '2026-09']);
  });

  it('日付セルとして入っていても YYYY-MM として読む', () => {
    const ss = makeSpreadsheet('bound', [HEADER]);
    ss.sheets['t_dept_inputs'] = [
      DEPT_INPUT_HEADER,
      [new Date(2026, 7, 1), 'イベント営業', 50_000, 0, 0, 0, 0, 0, 0, 0, ''],
    ];
    const { api } = load({ active: ss, props: GOOGLE_PROPS, tokenInfo: { t: { aud: CLIENT_ID, email: 'mita@gooner.space' } } });

    const body = parse(api.doGet({ parameter: { idToken: 't' } }));
    expect(body.deptInputs[0].month).toBe('2026-08');
  });

  it('空行は読み飛ばす', () => {
    const ss = makeSpreadsheet('bound', [HEADER]);
    ss.sheets['t_dept_inputs'] = [
      DEPT_INPUT_HEADER,
      ['', '', '', '', '', '', '', '', '', '', ''],
      ['2026-08', '人材', 10, 1, 0, 0, 0, 0, 0, 0, ''],
    ];
    const { api } = load({ active: ss, props: GOOGLE_PROPS, tokenInfo: { t: { aud: CLIENT_ID, email: 'mita@gooner.space' } } });

    expect(parse(api.doGet({ parameter: { idToken: 't' } })).deptInputs).toHaveLength(1);
  });
});

describe('月次入力の権限', () => {
  function seeded() {
    const ss = makeSpreadsheet('bound', [HEADER]);
    ss.sheets['t_dept_inputs'] = [
      DEPT_INPUT_HEADER,
      ['2026-08', 'イベント営業', 100, 0, 0, 0, 0, 0, 0, 0, ''],
      ['2026-08', '人材', 200, 1, 0, 0, 0, 0, 0, 0, ''],
    ];
    ss.sheets['t_monthly_notes'] = [
      ['月', '所感', '決定事項', '担当', '期限', '更新日時'],
      ['2026-08', '好調', '来月は広告費を増やす', '中原', '2026-09-30', ''],
    ];
    return ss;
  }

  const tokens = {
    admin: { aud: CLIENT_ID, email: 'mita@gooner.space' },
    irifune: { aud: CLIENT_ID, email: 'irifune@gooner.space' },
    nakahara: { aud: CLIENT_ID, email: 'nakahara@gooner.space' },
  };

  function api(ss: FakeSpreadsheet) {
    return load({ active: ss, props: GOOGLE_PROPS, tokenInfo: tokens }).api;
  }

  it('Admin は全事業部の入力と会議メモを読める', () => {
    const body = parse(api(seeded()).doGet({ parameter: { idToken: 'admin' } }));

    expect(body.deptInputs).toHaveLength(2);
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].decision).toBe('来月は広告費を増やす');
  });

  it('Manager は自分の事業部の入力しか読めない', () => {
    const body = parse(api(seeded()).doGet({ parameter: { idToken: 'irifune' } }));

    expect(body.deptInputs).toHaveLength(1);
    expect(body.deptInputs[0].dept).toBe('イベント営業');
  });

  it('Manager には会議メモを渡さない', () => {
    const body = parse(api(seeded()).doGet({ parameter: { idToken: 'nakahara' } }));
    expect(body.notes).toEqual([]);
  });

  it('Manager は自分の事業部の入力を保存できる', () => {
    const body = postAs(api(seeded()), 'irifune', 'saveDeptInput',
      deptInput('2026-09', 'イベント営業', { directExpense: 300 }));
    expect(body.status).toBe('success');
  });

  it('Manager は他事業部の入力を保存できない', () => {
    const body = postAs(api(seeded()), 'irifune', 'saveDeptInput',
      deptInput('2026-09', '人材', { directExpense: 300 }));

    expect(body.status).toBe('error');
    expect(body.message).toContain('イベント営業 以外');
  });

  it('Manager は会議メモを保存できない', () => {
    const body = postAs(api(seeded()), 'irifune', 'saveNote',
      { month: '2026-08', summary: 'かってに書く' });

    expect(body.status).toBe('error');
    expect(body.message).toContain('権限がありません');
  });

  it('Admin は会議メモを上書きできる', () => {
    const ss = seeded();
    const body = postAs(api(ss), 'admin', 'saveNote', {
      month: '2026-08',
      summary: '差し替え',
      decision: '継続',
      owner: '入舩',
      due: '2026-09-15',
    });

    expect(body.status).toBe('success');
    // 見出し + 1 行のまま
    expect(ss.sheets['t_monthly_notes']).toHaveLength(2);

    const after = parse(api(ss).doGet({ parameter: { idToken: 'admin' } }));
    expect(after.notes[0]).toMatchObject({ summary: '差し替え', owner: '入舩', due: '2026-09-15' });
  });

  it('月が無い入力は保存できない', () => {
    const body = postAs(api(seeded()), 'admin', 'saveDeptInput', deptInput('', 'イベント営業'));
    expect(body.status).toBe('error');
  });
});
