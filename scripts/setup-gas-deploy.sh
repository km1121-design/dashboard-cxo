#!/usr/bin/env bash
#
# GAS 自動デプロイのセットアップ（Linux / macOS）
#
# clasp のログインから GitHub への登録までを一気に行う。
# 対話的に進むので、指示に従って入力すればよい。
#
#   bash scripts/setup-gas-deploy.sh
#
# gh コマンド（GitHub CLI）が使える場合は Secrets / Variables の登録まで自動で行う。
# 無い場合は、画面に表示される内容を GitHub の設定画面に手で貼り付ける。

set -euo pipefail

CLASP_VERSION="3.3.0"
CLASP="npx --yes @google/clasp@${CLASP_VERSION}"
CLASPRC="${HOME}/.clasprc.json"

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

if [ -f "${CLASPRC}" ] && ${CLASP} show-authorized-user >/dev/null 2>&1; then
  info "ログイン済みです（${CLASPRC}）"
  read -r -p "  ログインし直しますか？ [y/N] " relogin
  [ "${relogin:-N}" = "y" ] && ${CLASP} login --no-localhost
else
  info "ブラウザで URL を開いて許可し、表示されたコードを貼り付けてください。"
  ${CLASP} login --no-localhost
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

SCRIPT_ID="${1:-}"
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

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  info "GitHub CLI で登録します。"
  gh secret set CLASP_CREDENTIALS < "${CLASPRC}"
  gh variable set GAS_SCRIPT_ID --body "${SCRIPT_ID}"
  gh variable set GAS_DEPLOYMENT_ID --body "${DEPLOYMENT_ID}"
  info "登録しました。"
  echo
  bold "次のコマンドで自動デプロイを試せます:"
  echo "    gh workflow run 'Deploy GAS'"
else
  warn "gh コマンドが無い（または未ログイン）ため、手動で登録してください。"
  cat <<EOS

  GitHub のリポジトリ → Settings → Secrets and variables → Actions

  [Secrets タブ] New repository secret
      Name : CLASP_CREDENTIALS
      Value: 次のコマンドの出力をすべて貼り付け
                 cat ${CLASPRC}

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
