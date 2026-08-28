/**
 * Apps Script への自動デプロイの結果を GitHub 上に残す。
 *
 * サイト側（Deploy to GitHub Pages）は成功するため、この失敗は見落とされやすい。
 * 気づけるように、失敗したら変更を含む PR にコメントし、追跡用の Issue を立てる。
 * 直ったら同じ Issue を閉じる。
 *
 * actions/github-script から呼ぶ。テストしやすいよう github / context を引数で受ける。
 */

/** 追跡用 Issue の題名。同じものが開いていれば作り直さずコメントを足す */
const ISSUE_TITLE = 'Apps Script への自動デプロイが失敗しています';

/**
 * ログに混ざりうる資格情報を伏せる。
 * clasp は通常トークンを出力しないが、出力先が公開ログなので念のため落とす。
 */
function redact(text) {
  return String(text || '')
    .replace(/ya29\.[\w.\-]+/g, '[ACCESS_TOKEN]')
    .replace(/1\/\/[\w.\-]+/g, '[REFRESH_TOKEN]')
    .replace(/("(?:access|refresh|id)_token"\s*:\s*")[^"]+/g, '$1[REDACTED]');
}

/** 長いログの末尾だけを取り出す（コメントが読めなくなるのを避ける） */
function tail(text, lines = 20) {
  const all = redact(text).trimEnd().split('\n');
  return all.slice(-lines).join('\n');
}

/** よくある原因を、ログの内容から絞り込んで書き添える */
function diagnose(log) {
  const text = String(log || '');

  if (text.includes('invalid_rapt') || text.includes('reauth related error')) {
    return [
      '**原因: Google が再認証を要求しています（`invalid_rapt`）。**',
      'リフレッシュトークンがあっても通らない状態で、CI には人がいないので必ず失敗します。',
      '',
      '- 管理コンソール → セキュリティ → アクセスとデータ管理 → **Google Cloud セッションの管理**',
      '  の再認証ポリシーを確認してください（デプロイ用アカウントが属する OU の設定も要確認）',
      '- 同じページの **Google セッションの管理** も併せて確認してください',
    ].join('\n');
  }

  if (text.includes('invalid_grant')) {
    return [
      '**原因: 認証情報が失効しています（`invalid_grant`）。**',
      'パスワード変更やアクセス取り消しでも起きます。再ログインして登録し直してください。',
    ].join('\n');
  }

  if (text.includes('User has not enabled the Apps Script API')) {
    return [
      '**原因: Apps Script API が無効です。**',
      'https://script.google.com/home/usersettings で、デプロイ用アカウントの Apps Script API を ON にしてください。',
    ].join('\n');
  }

  return '';
}

/** 失敗時の本文 */
function buildFailureBody({ log, runUrl, sha }) {
  const cause = diagnose(log);

  return [
    '`gas/Code.gs` の変更が **Apps Script に反映されていません。**',
    'サイト側のデプロイは成功するため、放置すると気づかないまま古いコードが動き続けます。',
    '',
    cause,
    cause ? '' : null,
    '### 直近のログ',
    '```',
    tail(log) || '(ログを取得できませんでした)',
    '```',
    '',
    '### 対処',
    '',
    '1. **すぐ直す** — Apps Script エディタに `gas/Code.gs` を貼り付け、',
    '   「デプロイを管理」から既存デプロイを新バージョンで更新する',
    '2. **自動デプロイを直す** — 手元で次を実行して `CLASP_CREDENTIALS` を更新する',
    '',
    '```bash',
    'npx @google/clasp@3.3.0 logout',
    'npx @google/clasp@3.3.0 login --no-localhost',
    './scripts/setup-gas-deploy.sh',
    '```',
    '',
    `対象コミット: ${sha}`,
    `実行ログ: ${runUrl}`,
    '',
    '> このコメントは Deploy GAS ワークフローが自動で書いています。',
    '> 反映が済んだら、この Issue は次回のデプロイ成功時に自動で閉じます。',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** 開いている追跡 Issue を探す（題名で照合する。ラベルの有無に依存させない） */
async function findTrackingIssue({ github, owner, repo }) {
  const { data } = await github.rest.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    per_page: 100,
  });

  return data.find((issue) => issue.title === ISSUE_TITLE && !issue.pull_request) ?? null;
}

/** このコミットを取り込んだ PR（マージコミットなら通常 1 件） */
async function findAssociatedPulls({ github, owner, repo, sha }) {
  try {
    const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: sha,
    });
    return data.map((pull) => pull.number);
  } catch {
    // 関連 PR が引けなくても、Issue 側で気づけるので致命的ではない
    return [];
  }
}

/**
 * @param {{github: object, context: object, core?: object}} api
 * @param {{succeeded: boolean, log?: string}} result
 */
async function report({ github, context, core }, result) {
  const { owner, repo } = context.repo;
  const sha = context.sha;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const log = (core && core.info) || (() => undefined);

  const existing = await findTrackingIssue({ github, owner, repo });

  /* ------------------------------------------------------------ 成功した */
  if (result.succeeded) {
    if (!existing) {
      log('追跡中の失敗はありません。');
      return { action: 'none' };
    }

    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: existing.number,
      body: [
        `自動デプロイが復旧しました。\`gas/Code.gs\` は Apps Script に反映済みです。`,
        '',
        `対象コミット: ${sha}`,
        `実行ログ: ${runUrl}`,
      ].join('\n'),
    });

    await github.rest.issues.update({
      owner,
      repo,
      issue_number: existing.number,
      state: 'closed',
    });

    log(`Issue #${existing.number} を閉じました。`);
    return { action: 'closed', issue: existing.number };
  }

  /* ------------------------------------------------------------ 失敗した */
  const body = buildFailureBody({ log: result.log, runUrl, sha });

  let issueNumber;
  if (existing) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: existing.number,
      body,
    });
    issueNumber = existing.number;
  } else {
    const { data } = await github.rest.issues.create({
      owner,
      repo,
      title: ISSUE_TITLE,
      body,
    });
    issueNumber = data.number;
  }

  // 変更を取り込んだ PR にも同じ内容を残す（マージした本人が最初に見る場所）
  const pulls = await findAssociatedPulls({ github, owner, repo, sha });
  for (const number of pulls) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: [
        `この PR の \`gas/\` の変更が **Apps Script に反映されていません。**`,
        '',
        `詳細と対処: #${issueNumber}`,
        `実行ログ: ${runUrl}`,
      ].join('\n'),
    });
  }

  log(`Issue #${issueNumber} を更新しました（関連 PR: ${pulls.join(', ') || 'なし'}）。`);
  return { action: existing ? 'commented' : 'opened', issue: issueNumber, pulls };
}

module.exports = report;
module.exports.ISSUE_TITLE = ISSUE_TITLE;
module.exports.redact = redact;
module.exports.tail = tail;
module.exports.diagnose = diagnose;
