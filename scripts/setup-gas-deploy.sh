#!/usr/bin/env bash
#
# GAS 自動デプロイのセットアップ（Linux / macOS）
#
# clasp のログインから GitHub への登録までを一気に行う。
# 対話的に進むので、指示に従って入力すればよい。
#
#   bash scripts/setup-gas-deploy.sh
#   bash scripts/setup-gas-deploy.sh --org <Organization名>
#   bash scripts/setup-gas-deploy.sh --script-id <スクリプトID>
#
# --org を付けると、複数リポジトリで共有できる認証情報（CLASP_CREDENTIALS）を
# Organization の Secret として登録する。2 個目以降のリポジトリでは
# 認証情報の登録が不要になり、プロジェクト固有の ID 2 つだけで済む。
#
#   ※ Organization Secret は Organization アカウントでのみ利用できる。
#     個人（User）アカウントのリポジトリでは --org は使えないため、
#     リポジトリごとの登録になる。詳細は docs/gas-deploy-setup.md を参照。
#
# gh コマンド（GitHub CLI）が使える場合は Secrets / Variables の登録まで自動で行う。
# 無い場合は、画面に表示される内容を GitHub の設定画面に手で貼り付ける。

set -euo pipefail

CLASP_VERSION="3.3.0"
CLASP="npx --yes @google/clasp@${CLASP_VERSION}"
CLASPRC="${HOME}/.clasprc.json"

ORG=""
SCRIPT_ID=""

while [ $# -gt 0 ]; do
  case "$1" in
    --org)
      ORG="${2:-}"
      [ -z "${ORG}" ] && { echo "--org には Organization 名が必要です。" >&2; exit 1; }
      shift 2
      ;;
    --script-id)
      SCRIPT_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      # 先頭のコメントブロック（2行目〜最初の非コメント行の手前）をそのまま説明として出す
      awk 'NR>1 { if ($0 !~ /^#/) exit; sub(/^# ?/, ""); print }' "$0"
      exit 0
      ;;
    *)
      # 後方互換: 第 1 引数をスクリプト ID として受け取る
      [ -z "${SCRIPT_ID}" ] && SCRIPT_ID="$1"
      shift
      ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$1"; }
err()  { printf '\033[31m  x %s\033[0m\n' "$1" >&2; }
step() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$1" "$2"; }

# ---------------------------------------------------------------- 0. 前提確認

step 0 "実行環境の確認"

if ! command -v node >/dev/null 2>&1; then
  err "node が見つかりません。Node.js 18 以上をインストールしてください。"
  cat <<'EOS'

  Ubuntu / Debian の例（nvm を使う。sudo 不要で新しい版が入る）:

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
    nvm install --lts

  もしくは配布パッケージ:

    sudo apt update && sudo apt install -y nodejs npm

EOS
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt 18 ]; then
  err "Node.js 18 以上が必要です（現在: $(node -v)）。"
  exit 1
fi
info "Node.js $(node -v)"

# ------------------------------------------------ 1. Apps Script API の有効化

step 1 "Apps Script API を有効にする"
cat <<'EOS'
  ブラウザで次のページを開き、「Google Apps Script API」を オン にしてください。

      https://script.google.com/home/usersettings

  すでにオンになっていればそのまま進めます。
EOS
read -r -p "  オンにしましたか？ [Enter で次へ] " _

# ------------------------------------------------------------ 2. clasp ログイン

step 2 "clasp にログインする"

# アカウントを切り替えるには logout が必須。
# logout せずに login すると既存の認証情報が残り、別アカウントで許可しても
# 古いトークンが使われて invalid_grant / invalid_rapt になる。
do_login() {
  info "ブラウザで URL を開いて許可し、表示されたコードを貼り付けてください。"
  ${CLASP} login --no-localhost
}

CURRENT_USER=""
if [ -f "${CLASPRC}" ]; then
  CURRENT_USER="$(${CLASP} show-authorized-user 2>/dev/null | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1 || true)"
fi

if [ -n "${CURRENT_USER}" ]; then
  info "現在ログイン中のアカウント: ${CURRENT_USER}"
  echo
  info "1) このアカウントで進める"
  info "2) 別のアカウントに切り替える（logout してログインし直す）"
  read -r -p "  番号 [1]: " login_choice

  if [ "${login_choice:-1}" = "2" ]; then
    info "ログアウトします..."
    ${CLASP} logout || true
    rm -f "${CLASPRC}"
    do_login
  fi
elif [ -f "${CLASPRC}" ]; then
  # 認証ファイルはあるが有効なアカウントが取れない（期限切れ・破損など）
  warn "既存の認証情報が使えません。ログインし直します。"
  ${CLASP} logout || true
  rm -f "${CLASPRC}"
  do_login
else
  do_login
fi

# ログイン後に実際に使われるアカウントを表示して確認する
EFFECTIVE_USER="$(${CLASP} show-authorized-user 2>/dev/null | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1 || true)"
if [ -n "${EFFECTIVE_USER}" ]; then
  info "使用するアカウント: ${EFFECTIVE_USER}"
else
  warn "アカウント情報を取得できませんでした。このまま続行します。"
fi

if [ ! -f "${CLASPRC}" ]; then
  err "${CLASPRC} が作成されませんでした。ログインをやり直してください。"
  exit 1
fi

# 形式の妥当性を確認（中身は表示しない）
node -e "
  const s = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  const c = s.tokens && s.tokens.default;
  if (!c && !s.token && !s.access_token) {
    console.error('認証情報の形式が想定と異なります。');
    process.exit(1);
  }
  if (c && !c.refresh_token) {
    console.error('refresh_token がありません。ログインをやり直してください。');
    process.exit(1);
  }
" "${CLASPRC}"
info "認証情報を確認しました"

# --------------------------------------------------------- 3. スクリプト ID

step 3 "スクリプト ID を指定する"

if [ -z "${SCRIPT_ID}" ] && [ -f .clasp.json ]; then
  SCRIPT_ID="$(node -p "require('./.clasp.json').scriptId || ''" 2>/dev/null || echo '')"
  [ -n "${SCRIPT_ID}" ] && info ".clasp.json から取得: ${SCRIPT_ID}"
fi

if [ -z "${SCRIPT_ID}" ]; then
  cat <<'EOS'
  Apps Script エディタ → 左下の ⚙️ プロジェクトの設定 → 「スクリプト ID」
  をコピーして貼り付けてください。
EOS
  read -r -p "  スクリプト ID: " SCRIPT_ID
fi

[ -z "${SCRIPT_ID}" ] && { err "スクリプト ID が空です。"; exit 1; }

# ----------------------------------------------------------- 4. デプロイ ID

step 4 "更新対象のデプロイを選ぶ"

info "デプロイ一覧を取得しています..."
DEPLOY_OUT="$(${CLASP} list-deployments "${SCRIPT_ID}" 2>&1 || true)"
echo "${DEPLOY_OUT}" | sed 's/^/    /'

# API 呼び出し自体が失敗した場合は「デプロイが無い」と混同しないよう先に切り分ける。
if echo "${DEPLOY_OUT}" | grep -qE '"error"|invalid_grant|invalid_rapt|invalid_client|Unauthorized|not enabled'; then
  echo
  err "デプロイ一覧の取得に失敗しました（認証または権限のエラー）。"

  if echo "${DEPLOY_OUT}" | grep -qE 'invalid_rapt|invalid_grant'; then
    cat <<'EOS'

  原因: 認証情報が古い、または別アカウントのものが残っています。
        （invalid_rapt は Google が再認証を要求している状態）

  対処: ログアウトしてから、使いたいアカウントでログインし直してください。

      npx @google/clasp@3.3.0 logout
      npx @google/clasp@3.3.0 login --no-localhost

  そのあとこのスクリプトを再実行し、[2] で「1) このアカウントで進める」を選びます。
  ブラウザに複数の Google アカウントでログインしている場合は、
  許可画面でアカウントを取り違えないよう注意してください
  （シークレットウィンドウで開くと確実です）。

EOS
  elif echo "${DEPLOY_OUT}" | grep -q 'not enabled'; then
    cat <<'EOS'

  原因: Apps Script API が有効になっていません。

  対処: 次のページで「Google Apps Script API」をオンにしてください。
        ※ ログインしているアカウントごとに設定が必要です。
           いま clasp で使っているアカウントで開くこと。

      https://script.google.com/home/usersettings

EOS
  else
    cat <<'EOS'

  スクリプト ID が誤っている、またはそのアカウントに閲覧権限が無い可能性があります。
  Apps Script エディタ → ⚙️ プロジェクトの設定 → 「スクリプト ID」を確認してください。

EOS
  fi
  exit 1
fi

# "- <id> @<version>" 形式の行から ID を拾う。@HEAD は /dev 用なので除外する。
mapfile -t DEPLOY_IDS < <(echo "${DEPLOY_OUT}" \
  | grep -oE '^-[[:space:]]+[A-Za-z0-9_-]+[[:space:]]+@[A-Za-z0-9]+' \
  | grep -v '@HEAD' \
  | awk '{print $2}' || true)

if [ "${#DEPLOY_IDS[@]}" -eq 0 ]; then
  warn "バージョン付きのデプロイが見つかりませんでした。"
  cat <<'EOS'

  Apps Script エディタで「デプロイ → 新しいデプロイ → 種類: ウェブアプリ」
  （次のユーザーとして実行: 自分 / アクセスできるユーザー: 全員）を一度実行し、
  発行されたデプロイ ID を控えてから、このスクリプトを再実行してください。

  ※ @HEAD のデプロイは開発用（/dev URL）です。自動デプロイの対象にはできません。

EOS
  read -r -p "  デプロイ ID を手入力する場合はここに貼り付け（空欄で中断）: " DEPLOYMENT_ID
  [ -z "${DEPLOYMENT_ID}" ] && exit 1
elif [ "${#DEPLOY_IDS[@]}" -eq 1 ]; then
  DEPLOYMENT_ID="${DEPLOY_IDS[0]}"
  info "デプロイ ID: ${DEPLOYMENT_ID}"
else
  echo
  info "複数のデプロイがあります。更新したいものを選んでください。"
  for i in "${!DEPLOY_IDS[@]}"; do
    printf '    %d) %s\n' "$((i + 1))" "${DEPLOY_IDS[$i]}"
  done
  read -r -p "  番号: " choice
  DEPLOYMENT_ID="${DEPLOY_IDS[$((choice - 1))]}"
fi

# --------------------------------------------------------- 5. GitHub へ登録

step 5 "GitHub に登録する"

# 認証情報は複数プロジェクトで共有できるが、スクリプト ID とデプロイ ID は
# プロジェクトごとに異なる。そのため --org 指定時も ID 2 つはリポジトリに登録する。

# owner/repo を求める。gh で取れなければ git remote から導出する。
resolve_repo_slug() {
  local slug
  slug="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  if [ -n "${slug}" ]; then
    echo "${slug}"
    return 0
  fi
  # git@github.com:owner/repo.git / https://github.com/owner/repo.git の両方に対応
  git config --get remote.origin.url 2>/dev/null \
    | sed -E 's#^.*github\.com[:/]##; s#\.git$##'
}

# リポジトリ変数を設定する。
# `gh variable` は gh 2.36 以降のサブコマンドなので、
# 無い場合は REST API で作成（既存なら更新）する。
set_repo_variable() {
  local name="$1" value="$2" slug

  if gh variable set "${name}" --body "${value}" >/dev/null 2>&1; then
    return 0
  fi

  slug="$(resolve_repo_slug)"
  if [ -z "${slug}" ]; then
    err "リポジトリを特定できませんでした（${name} の登録に失敗）。"
    return 1
  fi

  # 新規作成 → 既に在れば更新
  if gh api --method POST "/repos/${slug}/actions/variables" \
       -f name="${name}" -f value="${value}" >/dev/null 2>&1; then
    return 0
  fi
  gh api --method PATCH "/repos/${slug}/actions/variables/${name}" \
    -f name="${name}" -f value="${value}" >/dev/null
}

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  if [ -n "${ORG}" ]; then
    info "認証情報を Organization「${ORG}」の Secret に登録します。"
    if gh secret set CLASP_CREDENTIALS --org "${ORG}" --visibility all < "${CLASPRC}"; then
      info "Organization Secret に登録しました（配下の全リポジトリで利用可）。"
    else
      err "Organization Secret の登録に失敗しました。"
      warn "Organization アカウントであること、権限があることを確認してください。"
      warn "個人アカウントの場合は --org を外して実行してください。"
      exit 1
    fi
  else
    info "認証情報をこのリポジトリの Secret に登録します。"
    gh secret set CLASP_CREDENTIALS < "${CLASPRC}"
  fi

  # ID はプロジェクト固有なので常にリポジトリ単位
  set_repo_variable GAS_SCRIPT_ID "${SCRIPT_ID}"
  set_repo_variable GAS_DEPLOYMENT_ID "${DEPLOYMENT_ID}"
  info "スクリプト ID / デプロイ ID をこのリポジトリに登録しました。"

  echo
  bold "次のコマンドで自動デプロイを試せます:"
  echo "    gh workflow run 'Deploy GAS'"
else
  warn "gh コマンドが無い（または未ログイン）ため、手動で登録してください。"

  if [ -n "${ORG}" ]; then
    cat <<EOS

  [1] 認証情報（Organization 全体で共有・1 回だけ）

      https://github.com/organizations/${ORG}/settings/secrets/actions
          New organization secret
          Name       : CLASP_CREDENTIALS
          Repository access : All repositories（または対象リポジトリを選択）
          Value      : 次のコマンドの出力をすべて貼り付け
                           cat ${CLASPRC}

EOS
  else
    cat <<EOS

  [1] 認証情報（このリポジトリ）

      リポジトリ → Settings → Secrets and variables → Actions
          [Secrets タブ] New repository secret
          Name : CLASP_CREDENTIALS
          Value: 次のコマンドの出力をすべて貼り付け
                     cat ${CLASPRC}

EOS
  fi

  cat <<EOS
  [2] プロジェクト固有の ID（リポジトリごとに必要）

      リポジトリ → Settings → Secrets and variables → Actions
          [Variables タブ] New repository variable
          Name : GAS_SCRIPT_ID
          Value: ${SCRIPT_ID}

          Name : GAS_DEPLOYMENT_ID
          Value: ${DEPLOYMENT_ID}

  登録後、Actions → Deploy GAS → Run workflow で動作確認できます。

EOS
  bold "GitHub CLI を入れておくと次回から自動化できます:"
  echo "    sudo apt install gh   （または https://cli.github.com/）"
  echo "    gh auth login"
fi

echo
bold "セットアップ完了"
