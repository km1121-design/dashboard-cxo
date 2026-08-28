/**
 * Deploy GAS の結果通知のテスト。
 *
 * 失敗時にしか動かない仕組みなので、動かないことに気づけない。
 * GitHub API をスタブして、実際に呼ばれる内容を検証しておく。
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const report = require('../../.github/scripts/report-gas-deploy.cjs') as ReportModule;

interface ReportModule {
  (api: { github: FakeGithub; context: FakeContext; core?: { info: (m: string) => void } },
   result: { succeeded: boolean; log?: string }): Promise<Record<string, unknown>>;
  ISSUE_TITLE: string;
  redact: (text: string) => string;
  tail: (text: string, lines?: number) => string;
  diagnose: (log: string) => string;
}

interface Issue {
  number: number;
  title: string;
  pull_request?: unknown;
}

interface Call {
  api: string;
  args: Record<string, unknown>;
}

interface FakeGithub {
  rest: {
    issues: {
      listForRepo: (a: unknown) => Promise<{ data: Issue[] }>;
      create: (a: Record<string, unknown>) => Promise<{ data: { number: number } }>;
      createComment: (a: Record<string, unknown>) => Promise<void>;
      update: (a: Record<string, unknown>) => Promise<void>;
    };
    repos: {
      listPullRequestsAssociatedWithCommit: (a: unknown) => Promise<{ data: { number: number }[] }>;
    };
  };
}

interface FakeContext {
  repo: { owner: string; repo: string };
  sha: string;
  runId: number;
}

function makeApi(options: { openIssues?: Issue[]; pulls?: number[]; pullsThrow?: boolean } = {}) {
  const calls: Call[] = [];
  const record = (api: string, args: Record<string, unknown>) => calls.push({ api, args });

  const github: FakeGithub = {
    rest: {
      issues: {
        listForRepo: async () => ({ data: options.openIssues ?? [] }),
        create: async (a) => {
          record('issues.create', a);
          return { data: { number: 42 } };
        },
        createComment: async (a) => {
          record('issues.createComment', a);
        },
        update: async (a) => {
          record('issues.update', a);
        },
      },
      repos: {
        listPullRequestsAssociatedWithCommit: async () => {
          if (options.pullsThrow) throw new Error('403');
          return { data: (options.pulls ?? []).map((number) => ({ number })) };
        },
      },
    },
  };

  const context: FakeContext = {
    repo: { owner: 'km1121-design', repo: 'dashboard-cxo' },
    sha: 'abc1234',
    runId: 999,
  };

  return { github, context, calls };
}

const FAIL_LOG = [
  'npm warn deprecated uuid@9.0.1',
  '{"error":"invalid_grant","error_description":"reauth related error (invalid_rapt)"}',
].join('\n');

describe('redact', () => {
  it('アクセストークンとリフレッシュトークンを伏せる', () => {
    expect(report.redact('token ya29.a0AfB_x-Yz123 end')).toBe('token [ACCESS_TOKEN] end');
    expect(report.redact('rt 1//0eXampleTokenValue end')).toBe('rt [REFRESH_TOKEN] end');
  });

  it('JSON の中のトークンも伏せる', () => {
    expect(report.redact('{"refresh_token":"secret-value","x":1}')).toBe(
      '{"refresh_token":"[REDACTED]","x":1}',
    );
  });

  it('普通のログはそのまま', () => {
    expect(report.redact('push した')).toBe('push した');
  });
});

describe('tail', () => {
  it('末尾の指定行だけを返す', () => {
    const text = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
    const result = report.tail(text, 3);

    expect(result).toBe('line27\nline28\nline29');
  });

  it('切り出したログもトークンを伏せてある', () => {
    expect(report.tail('ya29.secretvalue')).toBe('[ACCESS_TOKEN]');
  });
});

describe('diagnose', () => {
  it('invalid_rapt は再認証ポリシーを案内する', () => {
    expect(report.diagnose(FAIL_LOG)).toContain('再認証');
    expect(report.diagnose(FAIL_LOG)).toContain('Google Cloud セッションの管理');
  });

  it('invalid_grant 単独なら失効として案内する', () => {
    expect(report.diagnose('{"error":"invalid_grant"}')).toContain('失効');
  });

  it('Apps Script API 無効も見分ける', () => {
    expect(report.diagnose('User has not enabled the Apps Script API')).toContain(
      'Apps Script API',
    );
  });

  it('心当たりがなければ空文字（憶測を書かない）', () => {
    expect(report.diagnose('something else went wrong')).toBe('');
  });
});

describe('失敗したとき', () => {
  it('追跡 Issue を新しく立てる', async () => {
    const { github, context, calls } = makeApi();
    const result = await report({ github, context }, { succeeded: false, log: FAIL_LOG });

    expect(result).toMatchObject({ action: 'opened', issue: 42 });

    const created = calls.find((c) => c.api === 'issues.create');
    expect(created?.args.title).toBe(report.ISSUE_TITLE);
    expect(String(created?.args.body)).toContain('反映されていません');
    expect(String(created?.args.body)).toContain('invalid_rapt');
  });

  it('既に開いている Issue があれば作り直さずコメントする', async () => {
    const { github, context, calls } = makeApi({
      openIssues: [{ number: 7, title: report.ISSUE_TITLE }],
    });
    const result = await report({ github, context }, { succeeded: false, log: FAIL_LOG });

    expect(result).toMatchObject({ action: 'commented', issue: 7 });
    expect(calls.some((c) => c.api === 'issues.create')).toBe(false);
    expect(calls.find((c) => c.api === 'issues.createComment')?.args.issue_number).toBe(7);
  });

  it('同じ題名でも PR は追跡 Issue とみなさない', async () => {
    const { github, context, calls } = makeApi({
      openIssues: [{ number: 7, title: report.ISSUE_TITLE, pull_request: {} }],
    });
    await report({ github, context }, { succeeded: false, log: FAIL_LOG });

    expect(calls.some((c) => c.api === 'issues.create')).toBe(true);
  });

  it('変更を取り込んだ PR にもコメントする', async () => {
    const { github, context, calls } = makeApi({ pulls: [13] });
    const result = await report({ github, context }, { succeeded: false, log: FAIL_LOG });

    expect(result).toMatchObject({ pulls: [13] });

    const prComment = calls.find(
      (c) => c.api === 'issues.createComment' && c.args.issue_number === 13,
    );
    expect(String(prComment?.args.body)).toContain('#42');
  });

  it('PR が引けなくても Issue は立てる', async () => {
    const { github, context, calls } = makeApi({ pullsThrow: true });
    const result = await report({ github, context }, { succeeded: false, log: FAIL_LOG });

    expect(result).toMatchObject({ action: 'opened', pulls: [] });
    expect(calls.some((c) => c.api === 'issues.create')).toBe(true);
  });

  it('ログが取れなくても本文を作れる', async () => {
    const { github, context, calls } = makeApi();
    await report({ github, context }, { succeeded: false });

    expect(String(calls.find((c) => c.api === 'issues.create')?.args.body)).toContain(
      'ログを取得できませんでした',
    );
  });

  it('ログのトークンは本文に出さない', async () => {
    const { github, context, calls } = makeApi();
    await report({ github, context }, { succeeded: false, log: 'oops ya29.leaked-token' });

    const body = String(calls.find((c) => c.api === 'issues.create')?.args.body);
    expect(body).not.toContain('ya29.leaked-token');
    expect(body).toContain('[ACCESS_TOKEN]');
  });
});

describe('成功したとき', () => {
  it('開いている追跡 Issue を閉じる', async () => {
    const { github, context, calls } = makeApi({
      openIssues: [{ number: 7, title: report.ISSUE_TITLE }],
    });
    const result = await report({ github, context }, { succeeded: true });

    expect(result).toMatchObject({ action: 'closed', issue: 7 });
    expect(calls.find((c) => c.api === 'issues.update')?.args).toMatchObject({
      issue_number: 7,
      state: 'closed',
    });
    expect(String(calls.find((c) => c.api === 'issues.createComment')?.args.body)).toContain(
      '復旧しました',
    );
  });

  it('追跡中の失敗が無ければ何もしない', async () => {
    const { github, context, calls } = makeApi();
    const result = await report({ github, context }, { succeeded: true });

    expect(result).toMatchObject({ action: 'none' });
    expect(calls).toHaveLength(0);
  });

  it('無関係な Issue が開いていても触らない', async () => {
    const { github, context, calls } = makeApi({
      openIssues: [{ number: 3, title: 'べつの課題' }],
    });
    await report({ github, context }, { succeeded: true });

    expect(calls).toHaveLength(0);
  });
});
