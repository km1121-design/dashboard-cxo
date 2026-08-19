# GAS 自動デプロイ セットアップ手順（Linux）

Google Apps Script のコードを GitHub から自動デプロイするための手順。
**このドキュメントと `.github/workflows/deploy-gas.yml`、`scripts/setup-gas-deploy.sh` の
3点セットは、他のプロジェクトにもそのまま流用できる**（末尾の「他プロジェクトへの流用」を参照）。

---

## 最初に決めること: 認証情報をどこに置くか

`CLASP_CREDENTIALS`（Google の認証情報）は**複数のプロジェクトで使い回せる**。
一方 `GAS_SCRIPT_ID` と `GAS_DEPLOYMENT_ID` は**プロジェクトごとに異なる**ので、
どちらの方式でもリポジトリ単位で登録する。

| 置き場所 | 2 個目以降のリポジトリで必要な作業 | 条件 |
| --- | --- | --- |
| **Organization Secret** | ID 2 つの登録のみ（`clasp login` 不要） | Organization アカウントが必要 |
| リポジトリ Secret | 認証情報 ＋ ID 2 つの登録 | 条件なし |

複数リポジトリで GAS を使うなら Organization 方式が楽。**次章を先に読むこと。**

---

## Organization にまとめる場合

### 前提: Organization アカウントが必要

**Organization Secret は Organization アカウントでのみ使える。**
個人（User）アカウントのリポジトリには Organization Secret を設定できない
（GitHub には「ユーザーレベルの Secret」という仕組みが存在しない）。

自分のアカウントがどちらかは、次で確認できる。

```bash
gh api users/【自分のアカウント名】 --jq .type
# → "Organization" なら Organization、"User" なら個人アカウント
```

### Organization を作る（無料）

1. https://github.com/organizations/plan を開く
2. **Free** プランを選ぶ
3. Organization 名・連絡先メールを入力して作成

### 既存リポジトリを Organization へ移す

リポジトリ → **Settings** → 最下部の **Danger Zone** → **Transfer ownership**
→ 移転先に Organization 名を指定

> 移転後も元の URL からリダイレクトされ、`git remote` の設定を変えなくても動く。
> ただし手元のクローンは `git remote set-url` で新 URL に更新しておくのが無難。

### 認証情報を Organization に登録する

```bash
bash scripts/setup-gas-deploy.sh --org 【Organization名】
```

`gh` が使えない場合は画面から:

`https://github.com/organizations/【Organization名】/settings/secrets/actions`
→ **New organization secret**

| 項目 | 値 |
| --- | --- |
| Name | `CLASP_CREDENTIALS` |
| Repository access | **All repositories**（または対象リポジトリを選択） |
| Value | `cat ~/.clasprc.json` の出力を全文 |

### 2 個目以降のリポジトリ

認証情報は Organization から自動で引き継がれるので、**ID 2 つを登録するだけ**。

```bash
gh variable set GAS_SCRIPT_ID     --body "【スクリプトID】"
gh variable set GAS_DEPLOYMENT_ID --body "【デプロイID】"
```

セットアップスクリプトを `--org` 付きで実行しても同じ結果になる
（認証情報は上書き登録され、ID はリポジトリに登録される）。

> **プランについての注意**: Free プランの Organization Secret は
> **パブリックリポジトリでは無制限に使える**が、プライベートリポジトリで使う場合は
> 有料プラン（Team 以上）が必要になることがある。
> プライベートで運用する予定がある場合は、実際に登録して動作を確認してから
> 本格移行するのが安全。動かない場合はリポジトリ Secret 方式にすればよい。

---

## かんたん手順（スクリプトを使う）

リポジトリのルートで次を実行し、指示に従うだけ。

```bash
# リポジトリごとに認証情報を持つ場合
bash scripts/setup-gas-deploy.sh

# Organization に認証情報をまとめる場合
bash scripts/setup-gas-deploy.sh --org 【Organization名】
```

スクリプトが行うこと:

1. Node.js の有無とバージョンを確認
2. Apps Script API の有効化を促す
3. `clasp login`（ブラウザ認証）
4. スクリプト ID の確認
5. デプロイ一覧から更新対象を選択（`@HEAD` は自動で除外）
6. GitHub への登録（`gh` があれば自動、無ければ貼り付け内容を表示）

以降は手動でやる場合の詳細。

---

## 事前に必要なもの

| 必要なもの | 確認コマンド | 無い場合 |
| --- | --- | --- |
| Node.js 18 以上 | `node -v` | 下記「Node.js の導入」 |
| Google アカウント | — | スプレッドシートの所有者アカウント |
| GitHub CLI（任意） | `gh --version` | `sudo apt install gh` |

### Node.js の導入（Ubuntu / Debian）

nvm を使う方法（sudo 不要・新しい版が入るのでおすすめ）:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install --lts
node -v
```

配布パッケージを使う方法:

```bash
sudo apt update && sudo apt install -y nodejs npm
node -v    # 18 未満なら nvm を使うこと
```

---

## 手動手順

### 1. Apps Script API を有効にする

ブラウザで https://script.google.com/home/usersettings を開き、
**「Google Apps Script API」を オン** にする。

> これを忘れると、後の `clasp push` が権限エラーで失敗する。

### 2. clasp にログインする

```bash
npx @google/clasp@3.3.0 login --no-localhost
```

- 表示された URL をブラウザで開く
- Google アカウントでログインし、アクセスを許可する
- 表示されたコードをターミナルに貼り付ける

成功すると `~/.clasprc.json` が作られる。中身を確認する:

```bash
cat ~/.clasprc.json
```

次のような形をしていれば正しい（`refresh_token` があること）:

```json
{
  "tokens": {
    "default": {
      "type": "authorized_user",
      "client_id": "...",
      "client_secret": "...",
      "refresh_token": "...",
      "access_token": "...",
      "expiry_date": 1234567890
    }
  }
}
```

### 3. スクリプト ID を調べる

Apps Script エディタ → 左下の **⚙️ プロジェクトの設定** → **「スクリプト ID」**

エディタの URL からも読み取れる:

```
https://script.google.com/home/projects/【ここがスクリプトID】/edit
```

### 4. デプロイ ID を調べる

Apps Script エディタ → **デプロイ** → **デプロイを管理** → 対象デプロイの **「デプロイ ID」**

コマンドでも一覧できる:

```bash
npx @google/clasp@3.3.0 list-deployments 【スクリプトID】
```

```
2 Deployments.
- AKfycbxxxxxxxxxxxx @HEAD          ← 開発用（/dev URL）。使わない
- AKfycbzzzzzzzzzzzz @1 - 初回      ← これを使う
```

> **`@HEAD` は選ばないこと。** 開発用の `/dev` URL に対応するもので、
> ウェブアプリの `/exec` URL とは別物。バージョン番号（`@1`, `@2` …）が付いた方を使う。

まだウェブアプリのデプロイを作っていない場合は、先に
**デプロイ → 新しいデプロイ → 種類「ウェブアプリ」**
（次のユーザーとして実行: **自分** / アクセスできるユーザー: **全員**）を一度実行する。

### 5. GitHub に登録する

#### GitHub CLI を使う場合

```bash
gh auth login          # 初回のみ
gh secret   set CLASP_CREDENTIALS < ~/.clasprc.json
gh variable set GAS_SCRIPT_ID     --body "【スクリプトID】"
gh variable set GAS_DEPLOYMENT_ID --body "【デプロイID】"
```

`unknown command "variable" for "gh"` と出る場合は `gh` が古い
（`gh variable` は 2.36 以降）。REST API 経由なら古い版でも設定できる。

```bash
SLUG=$(gh repo view --json nameWithOwner -q .nameWithOwner)

gh api --method POST "/repos/${SLUG}/actions/variables" \
  -f name='GAS_SCRIPT_ID' -f value='【スクリプトID】'

gh api --method POST "/repos/${SLUG}/actions/variables" \
  -f name='GAS_DEPLOYMENT_ID' -f value='【デプロイID】'

# 既に登録済みで 409 になる場合は更新する
gh api --method PATCH "/repos/${SLUG}/actions/variables/GAS_SCRIPT_ID" \
  -f name='GAS_SCRIPT_ID' -f value='【スクリプトID】'

# 確認
gh api "/repos/${SLUG}/actions/variables"
```

`gh` を新しくするなら https://cli.github.com/ の手順に従う
（`apt` 版は古いことが多い）。セットアップスクリプトは
`gh variable` が無い環境では自動的に API 経由に切り替わる。

#### 画面から登録する場合

リポジトリ → **Settings** → **Secrets and variables** → **Actions**

**Secrets** タブ → `New repository secret`

| Name | Value |
| --- | --- |
| `CLASP_CREDENTIALS` | `cat ~/.clasprc.json` の出力を**全文**貼り付け |

**Variables** タブ → `New repository variable`

| Name | Value |
| --- | --- |
| `GAS_SCRIPT_ID` | 手順3のスクリプト ID |
| `GAS_DEPLOYMENT_ID` | 手順4のデプロイ ID |

### 6. 動作確認

```bash
gh workflow run "Deploy GAS"
gh run watch
```

または GitHub の **Actions** タブ → **Deploy GAS** → **Run workflow**。

以降は `gas/` 配下を変更して `main` に入れるたびに自動デプロイされる。

---

## 仕組み

```
gas/ を変更して main へ push
        │
        ▼
.github/workflows/deploy-gas.yml
        │
        ├─ CLASP_CREDENTIALS を .clasprc.json に書き出し（形式を検証）
        ├─ GAS_SCRIPT_ID から .clasp.json を生成
        ├─ clasp push --force          … gas/ の中身を Apps Script へ反映
        ├─ clasp redeploy $ID          … 既存デプロイを更新（/exec URL は不変）
        └─ 認証ファイルを削除
```

`clasp deploy`（新規作成）ではなく **`clasp redeploy <デプロイID>`（既存の更新）**
を使うため、**ウェブアプリの `/exec` URL は変わらない**。
フロント側の設定を毎回変え直す必要はない。

`gas/appsscript.json` にウェブアプリ設定を含めているため、
「実行ユーザー」「アクセスできるユーザー: 全員」もデプロイのたびに保証される。

---

## つまずきやすい点

| 症状 | 原因と対処 |
| --- | --- |
| `User has not enabled the Apps Script API` | 手順1が未実施。https://script.google.com/home/usersettings でオンにする |
| `invalid_client` / `invalid_grant` | 認証情報が古い・不正。**`clasp logout` してから** `clasp login` をやり直す（下記「アカウントを切り替えたい」参照） |
| `invalid_rapt` / `reauth related error` | Google が再認証を要求している。`clasp logout` → `clasp login --no-localhost` でやり直す |
| `CLASP_CREDENTIALS が JSON として不正です` | 貼り付け時に一部が欠けている。`cat ~/.clasprc.json` の**全文**を貼る |
| デプロイしても `/exec` の内容が変わらない | `GAS_DEPLOYMENT_ID` に `@HEAD` のデプロイを指定している。バージョン付きの方に変更する |
| `Requested entity was not found` | `GAS_SCRIPT_ID` か `GAS_DEPLOYMENT_ID` の値が誤っている |
| `Parent ID not set, unable to open document`（`open-container` 実行時） | そのスクリプトはスタンドアロン（スプレッドシートに紐づいていない）。`Code.gs` は両対応なのでそのまま使えるが、対象スプレッドシートは `DEFAULT_SPREADSHEET_ID`（またはスクリプトプロパティ `SPREADSHEET_ID`）で決まる |
| `No item with the given ID could be found` | `SPREADSHEET_ID` が誤っている、またはそのアカウントに対象スプレッドシートの権限が無い |
| ワークフローが起動しない | `gas/` 配下を変更していない。手動実行するか `paths` を確認する |
| `CLASP_CREDENTIALS(シークレット)` が未登録と言われる | Organization Secret の「Repository access」に対象リポジトリが含まれていない。`All repositories` にするか対象を追加する |
| `--org` で登録が失敗する | 個人（User）アカウントには Organization Secret を設定できない。Organization を作るか、`--org` を外してリポジトリ単位で登録する |
| `unknown command "variable" for "gh"` | `gh` が 2.36 より古い。上記の `gh api` 経由で登録するか、`gh` を更新する |

---

## アカウントを切り替えたい（個人用 → 仕事用など）

**`clasp login` だけではアカウントは切り替わらない。** 既存の認証情報が残るため、
別アカウントで許可しても古いトークンが使われ、`invalid_grant` / `invalid_rapt` になる。
必ず先に `logout` する。

```bash
npx @google/clasp@3.3.0 logout
npx @google/clasp@3.3.0 login --no-localhost
```

セットアップスクリプトは現在のアカウントを表示し、切り替えるかを選べる。

```
[2] clasp にログインする
  現在ログイン中のアカウント: personal@gmail.com

  1) このアカウントで進める
  2) 別のアカウントに切り替える（logout してログインし直す）
  番号 [1]:
```

### 切り替え時の注意

- **Apps Script API の有効化はアカウントごとに必要。**
  切り替えたら、新しいアカウントで
  https://script.google.com/home/usersettings を開いてオンにする。
- **ブラウザで複数の Google アカウントにログインしていると取り違えやすい。**
  許可画面でアカウントを選び間違えないよう、**シークレットウィンドウで開くと確実**。
- 現在どのアカウントで認証されているかは次で確認できる。

  ```bash
  npx @google/clasp@3.3.0 show-authorized-user
  ```

---

## セキュリティ上の注意

- `CLASP_CREDENTIALS` は **Google アカウントの Apps Script プロジェクトへアクセスできる資格情報**。
  GitHub の Secret に入れると管理者は値を読めない（更新のみ可能）が、扱いには注意すること。
- ワークフローは `main` への push と手動実行でのみ動き、**Pull Request では動かない**。
  フォークからの PR にシークレットが渡ることはない。
- 実行後に認証ファイルを削除し、資格情報の中身はログに出さない設計にしている。
- 不要になったら次の両方を行う。

  ```bash
  npx @google/clasp@3.3.0 logout      # ローカルの認証情報を削除
  gh secret delete CLASP_CREDENTIALS  # GitHub 側を削除
  ```

---

## 他プロジェクトへの流用

この仕組みはプロジェクト固有の値をすべて GitHub の変数に逃がしてあるため、
次の 3 ファイルをコピーするだけで別プロジェクトでも動く。

```
.github/workflows/deploy-gas.yml   ← そのままコピー（変更不要）
scripts/setup-gas-deploy.sh        ← そのままコピー（変更不要）
docs/gas-deploy-setup.md           ← この手順書
```

加えて、対象プロジェクト側に次を用意する。

1. **`gas/` ディレクトリ** — `.gs` ファイルと `appsscript.json` を置く
   （ディレクトリ名を変える場合はワークフロー内の `rootDir` と `paths` を合わせる）
2. **`.gitignore`** に以下を追加

   ```
   .clasprc.json
   .clasp.json
   ```

3. `bash scripts/setup-gas-deploy.sh` を実行して GitHub に登録

`appsscript.json` の雛形（ウェブアプリとして公開する場合）:

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

### 2 個目以降の流れ（Organization にまとめている場合）

```bash
# 1. 3 ファイルをコピー
cp -r ../dashboard-cxo/.github/workflows/deploy-gas.yml .github/workflows/
cp    ../dashboard-cxo/scripts/setup-gas-deploy.sh      scripts/
cp    ../dashboard-cxo/docs/gas-deploy-setup.md         docs/

# 2. gas/ を用意（appsscript.json は上の雛形を使う）
mkdir -p gas

# 3. .gitignore に追記
printf '.clasprc.json\n.clasp.json\n' >> .gitignore

# 4. ID 2 つを登録（認証情報は Organization から引き継がれる）
bash scripts/setup-gas-deploy.sh --org 【Organization名】
```

`clasp login` は初回に一度済ませていれば省略できる
（スクリプトはログイン済みを検出してスキップする）。
