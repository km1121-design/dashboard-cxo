# Gooner 第5期 PL・インセンティブ管理 ＆ BARROOTS日報ポータル

合同会社Gooner 第5期の事業部損益（PL）・個人インセンティブ算出・Googleスプレッドシート連携・
BARROOTS 店舗日報／LINE転送を 1 つにまとめた Web アプリケーション。

仕様の原典は [`docs/claude_code_handoff.md`](docs/claude_code_handoff.md)（開発引き継ぎ指示書）。

## 技術スタック

| 領域 | 採用 |
| --- | --- |
| フロントエンド | React 18 + TypeScript + Vite |
| スタイル | Tailwind CSS（ライトモード: slate-50 / white / indigo / emerald / amber） |
| アイコン | Lucide React |
| バックエンド API | Google Apps Script Web App（`gas/Code.gs`） |
| データストア | Google Sheets（`t_sales`） |
| テスト | Jest + ts-jest |

## セットアップ

```bash
npm install
cp .env.example .env      # VITE_GAS_API_URL を設定
npm run dev               # http://localhost:5173
```

## GAS の自動デプロイ

`gas/` 配下を変更して `main` に入れると、GitHub Actions が Apps Script へ反映する
（`.github/workflows/deploy-gas.yml`）。**既存のデプロイを更新するため `/exec` URL は変わらない。**

`gas/appsscript.json` にウェブアプリの設定（実行ユーザー・アクセス範囲）も含めているので、
「アクセスできるユーザー: 全員」の設定もコード側で管理される。

### 一度だけ必要な準備

**1. Apps Script API を有効にする**

https://script.google.com/home/usersettings を開き、「Google Apps Script API」を **オン** にする。

**2. clasp の認証情報を取り出す**

ターミナルで次を実行する。ローカルに Node を入れたくない場合は
[Google Cloud Shell](https://shell.cloud.google.com/)（ブラウザだけで使える無料のターミナル）
で実行してもよい。

```bash
npx @google/clasp@3.3.0 login --no-localhost
```

表示された URL をブラウザで開いて許可し、戻ってきたコードを貼り付ける。
成功したら認証情報を表示する。

```bash
cat ~/.clasprc.json
```

**3. スクリプト ID とデプロイ ID を調べる**

| 値 | 調べ方 |
| --- | --- |
| スクリプト ID | Apps Script エディタ → ⚙️ プロジェクトの設定 → 「スクリプト ID」 |
| デプロイ ID | デプロイ → デプロイを管理 → 対象デプロイの「デプロイ ID」 |

**4. GitHub に登録する**

`Settings` → `Secrets and variables` → `Actions`

**Secrets** タブ（`New repository secret`）

| Name | Value |
| --- | --- |
| `CLASP_CREDENTIALS` | 手順2の `~/.clasprc.json` の中身をそのまま貼り付け |

**Variables** タブ（`New repository variable`）

| Name | Value |
| --- | --- |
| `GAS_SCRIPT_ID` | スクリプト ID |
| `GAS_DEPLOYMENT_ID` | デプロイ ID |

登録後、`Actions` → `Deploy GAS` → `Run workflow` で手動実行して動作を確認できる。

> `CLASP_CREDENTIALS` は Google アカウントの Apps Script プロジェクトへアクセスできる資格情報。
> 取り扱いに注意し、不要になったら `npx @google/clasp logout` と GitHub 側の削除を行うこと。
> このワークフローは `push`（main）と手動実行でのみ動き、Pull Request では動かないため、
> フォークからの PR にシークレットが渡ることはない。

### GAS の手動デプロイ（自動デプロイを使わない場合）

1. 対象スプレッドシート（`1lbLTY4HvNBeDsqqRmlzNmFSG_jAIR--VKgx0fd9pgTU`）を開き、
   **拡張機能 → Apps Script**
2. [`gas/Code.gs`](gas/Code.gs) の内容を貼り付けて保存
3. **デプロイ → 新しいデプロイ → 種類「ウェブアプリ」**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員 (Anyone)** ← 必須（指示書 8章）
4. 発行された `/exec` URL を `.env` の `VITE_GAS_API_URL` に設定

`VITE_SYNC_INTERVAL_MS` を設定すると自動同期が有効になる（未設定・0 なら手動同期のみ）。

## 公開（GitHub Pages）

ローカル環境を用意しなくても、GitHub 上の操作だけで公開できる。
`main` へのプッシュごとに自動でビルド・デプロイされる（`.github/workflows/deploy.yml`）。

### 初回だけ必要な設定（GitHub の画面で 2 箇所）

**1. GAS の URL を登録する**

`Settings` → `Secrets and variables` → `Actions` → `Variables` タブ → `New repository variable`

| Name | Value |
| --- | --- |
| `VITE_GAS_API_URL` | GAS ウェブアプリの `/exec` URL |
| `VITE_SYNC_INTERVAL_MS` | 自動同期の間隔（任意・例 `180000`。不要なら登録しない） |

**2. Pages を有効にする**

`Settings` → `Pages` → `Build and deployment` → `Source` を **GitHub Actions** に変更

以降、`Actions` タブでデプロイの進行を確認できる。完了すると次の URL で公開される。

```
https://<オーナー名>.github.io/<リポジトリ名>/
```

設定を変えた後に再デプロイしたいときは、`Actions` → `Deploy to GitHub Pages` → `Run workflow` で手動実行できる。

## 社内限定で使う（アクセストークン）

GAS のデプロイは仕様上「アクセスできるユーザー: 全員」にする必要があるため、
URL を知っていれば誰でもスプレッドシートを読み書きできてしまう。
これを防ぐため、GAS 側に合言葉（アクセストークン）による認証を用意している。

**トークンはビルドに埋め込まれない。** 利用者が画面から入力し、そのブラウザにだけ保存される。
公開ページの JavaScript を読まれてもトークンは含まれていないため、
トークンを知っている社内メンバーだけがデータへアクセスできる。

### 1. GAS 側でトークンを設定する

Apps Script エディタで `generateAuthToken()` を実行し、ログに出た文字列をコピーする。
（任意の推測されにくい文字列でもよい）

エディタ左メニューの **プロジェクトの設定**（歯車）→ **スクリプト プロパティ** →
**スクリプト プロパティを追加**

| プロパティ | 値 |
| --- | --- |
| `AUTH_TOKEN` | 生成した文字列 |

保存したら **再デプロイ**する（デプロイ → デプロイを管理 → 編集 → バージョン「新しいバージョン」→ デプロイ）。

> `AUTH_TOKEN` が未設定の間は、従来どおり誰でもアクセスできる状態のままになる。

### 2. 利用者が画面からトークンを入力する

公開ページを開き、右上の **接続設定** をクリック → トークンを貼り付けて **保存して接続**。
一度保存すれば、そのブラウザでは次回以降そのまま使える。

社内メンバーには「公開 URL」と「トークン」の 2 つを共有すればよい。
退職などでアクセスを止めたいときは、`AUTH_TOKEN` を作り直して再デプロイし、
新しいトークンを配り直す。

### 補足: 環境変数の扱い

`VITE_` 付きの環境変数は**ビルド時に JavaScript へ埋め込まれ、ブラウザから読み取れる**。
そのため `VITE_GAS_API_URL`（URL）はビルドに含めてよいが、トークンは含めていない。
URL すら公開したくない場合は、リポジトリ変数を設定せず、
利用者に「接続設定」画面から URL も入力してもらう運用にできる。

## npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ起動 |
| `npm run build` | 型チェック + 本番ビルド |
| `npm run typecheck` | 型チェックのみ |
| `npm test` | Jest 実行 |
| `npm run test:coverage` | カバレッジ付きで実行 |

## ディレクトリ構成

```
src/
├── types/index.ts            型定義（GAS レスポンス・計算入出力・日報）
├── lib/
│   ├── gasApi.ts             GAS Web API クライアント（環境非依存・テスト可能）
│   └── env.ts                import.meta.env の読み出しを閉じ込めた層
├── utils/
│   ├── calculator.ts         計算エンジン（指示書 5章／6章）
│   ├── lineFormat.ts         LINE 転送フォーマット生成（指示書 6章）
│   ├── date.ts               営業日・月キーなどの日付ユーティリティ
│   └── format.ts             金額・パーセント表示
├── constants/master.ts       メンバー／事業部マスタ・報酬ルール定数
├── hooks/
│   ├── useSalesData.ts       GAS 同期（手動・自動）
│   └── useMonthlyInputs.ts   経費・決定件数の月次手入力（localStorage）
├── components/               UI（3 ビュー + 日報モーダル + 共通部品）
└── App.tsx                   閲覧モード切替とレイアウト

gas/Code.gs                   GAS Web API（指示書 4章のコードそのまま）
docs/claude_code_handoff.md   開発引き継ぎ指示書
```

## 機能

### 閲覧モード（指示書 3章）

- **日別進捗 (Daily)** — 当日案件ログ、当日売上、当月累計、日割り目標達成率、1日必達
- **月別結果 (Monthly)** — メンバー別支給見立て、事業部別 PL、半年プール積立
- **総結果 (Total)** — 第5期 通期12ヶ月の推移、メンバー別 年収シミュレーション

### メンバー別 支給見立て

| メンバー | 構成 |
| --- | --- |
| 入舩 雄志 | 基本給 32万 ＋ BAR売上10%吐き出し（営業利益100万達成時・翌月末支給） |
| 中原 聖人 | 基本給 35万 ＋ 決定手当 ＋ 個人PL15%還元 ＋ 他部紹介BAR売上10% |
| 三田 航大 | 固定 40万（各事業部からの保守管理費 計5万を充当） |

### BARROOTS 日報 ＆ LINE転送

日報モーダルで入力すると、指示書 6章のフォーマットに完全準拠した LINE 転送テキストを
リアルタイム生成する。テキストのコピーと LINE 共有リンク、GAS 経由でのスプレッドシート
登録に対応。

## テスト

```
Test Suites: 4 passed, 4 total
Tests:       94 passed, 94 total
```

計算エンジンは指示書の数式・閾値・サンプル値をそのままテストケースにしている。
LINE フォーマットは指示書 6章のサンプル出力と **1 文字単位で一致** することを検証済み。

## 仕様解釈のメモ

指示書に明示がなく、実装上の判断が必要だった箇所を記録する。

### 1. 「1日必達」の丸め単位

指示書 6章の数式は `⌈(月目標 − 当月累計売上) ÷ 残営業日⌉`（円単位の切り上げ）だが、
同章のサンプル出力は 100 円単位に切り上げた値になっている。

```
(360,000 − 15,000) ÷ 17 = 20,294.11…
  円単位切り上げ  → 20,295円
  100円単位切上げ → 20,300円   ← サンプルの表記と一致
```

サンプル出力の再現を優先し、**LINE 転送フォーマットでは 100 円単位で切り上げる**
（`RULES.dailyRequiredRoundTo`）。`calcDailyRequired(..., 1)` を呼べば数式どおりの
円単位切り上げになる。

### 2. 残営業日の数え方

指示書ではサンプルの `残営業日 17日` が与えられた値として書かれている。
`8/12（水）` から月末まで **当日を含め、日曜を定休日として除外**すると 17 日となり
サンプルと一致するため、日報モーダルの初期値はこの数え方で算出している（手動で変更可）。
日別進捗ビューの残営業日は当日を含めない数え方（＝翌日以降）を用いる。

### 3. 中原氏の「他部紹介 BAR売上10%」の扱い

指示書 5.2 は「店舗売上の 10% を**個人PLに還元**」と書かれている一方、
7章のプロンプトはこれを支給内訳の 1 項目（`個人PL15%` とは別枠の `BAR10%`）として挙げている。
二重計上を避けるため、**クロスセル還元は個人PL利益には含めず、独立した支給行**として扱う。
個人PL利益に含める運用に変更する場合は `calcHrDept` の `personalPlProfit` に加算すればよい。

### 4. イベント営業の半年プール率

指示書 5.1 の数式は一律 10%、2章のマスタ表は「利益10%半年プール（**超過時20%**）」と記載。
既定は 5.1 の数式どおり一律 10% とし、`calcEventBonusPool` に `profitTarget` を渡した場合のみ
目標超過分へ 20% を適用する段階制に切り替わる。

### 5. 事業部の月次利益目標

`DEPTS[].monthlyProfitTarget` は目標達成率とチームプールの 3%/5% 判定に使う値。
指示書に具体的な金額の記載がないため、イベント営業・人材ともに
吐き出しインセンティブの閾値と同じ **100万円** を暫定値として置いている。
確定値が決まり次第 `src/constants/master.ts` を更新すること。

## GAS 通信の注意点（指示書 8章）

- POST は `Content-Type: text/plain;charset=utf-8` で送信し、CORS プリフライトを発生させない
  （GAS 側は `e.postData.contents` を `JSON.parse` するだけなので影響なし）
- それでも通らない環境向けに `GasApiConfig.noCors` を用意。`mode: 'no-cors'` では
  レスポンス本文を読めないため、送信できたことをもって成功とみなす
- GAS デプロイの「アクセスできるユーザー」が「全員」でない場合、GET がログイン画面の HTML を
  返す。クライアントはこれを検知して権限設定を促すエラーメッセージを表示する
