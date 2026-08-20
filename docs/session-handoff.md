# セッション引き継ぎメモ

Claude Code の新規セッションで作業を再開するための現状まとめ。
**このファイルと `README.md` を読めば、過去の会話を辿らずに続けられる。**

最終更新: 2026-08-19 / 対象コミット: `2e6ed9c` ＋ 本セッションの変更

---

## 1. 何を作ったか

合同会社Gooner 第5期の「PL・インセンティブ管理 ＆ BARROOTS日報ポータル」。
仕様の原典は [`docs/claude_code_handoff.md`](claude_code_handoff.md)（配布された docx 指示書の書き起こし。
**原本では数式が画像だったため、読み取ってテキストに展開してある**）。

**構築は完了し、本番稼働している。**

| 項目 | 状態 |
| --- | --- |
| 公開サイト | https://km1121-design.github.io/dashboard-cxo/ （稼働中） |
| GAS 同期（GET/POST） | 疎通確認済み |
| トークン認証 | 実測で保護を確認（未トークン・誤トークンとも拒否） |
| `gas/` 変更 → Apps Script 自動デプロイ | 動作確認済み |
| `src/` 変更 → GitHub Pages 自動公開 | 動作確認済み |
| CI（型チェック・テスト・ビルド） | 通過（テスト 199 件） |
| 閲覧者の切り分け（個人ビュー） | 実装済み |
| Google アカウント認証 | コードは実装済み。**有効化には Google Cloud / Apps Script / GitHub の設定が必要**（docs/google-auth-setup.md） |

---

## 2. 構成

```
src/
├── types/index.ts          型定義（GAS レスポンス・計算入出力・日報）
├── lib/
│   ├── gasApi.ts           GAS Web API クライアント（環境非依存・テスト可能）
│   ├── env.ts              import.meta.env を閉じ込めた層
│   ├── credentials.ts      トークン・URL の localStorage 保管
│   ├── viewer.ts           閲覧者（全社／個人）の解決
│   └── reportDraft.ts      日報の下書き保存
├── utils/
│   ├── calculator.ts       計算エンジン（指示書 5章・6章 ＋ 個人集計）
│   ├── series.ts           グラフ用の系列組み立て（純関数）
│   ├── csv.ts              支給明細・年収シミュレーションの CSV
│   ├── lineFormat.ts       LINE 転送フォーマット生成（指示書 6章）
│   ├── date.ts             営業日・月キー
│   └── format.ts           金額・パーセント・軸ラベル表示
├── constants/master.ts     メンバー／事業部マスタ・報酬ルール定数
├── hooks/                  useSalesData（同期）/ useMonthlyInputs（月次手入力）
├── components/
│   ├── charts/             インライン SVG のグラフ（依存追加なし）
│   ├── PersonalView.tsx    個人実績ビュー（入舩・中原）
│   └── …                   全社3ビュー ＋ 日報モーダル ＋ 接続設定ダイアログ
└── __tests__/gasCode.test.ts   gas/Code.gs を GAS API スタブ上で検証

gas/
├── Code.gs                 GAS Web API（トークン認証・スタンドアロン対応込み）
└── appsscript.json         ウェブアプリ設定（access: ANYONE_ANONYMOUS）

.github/workflows/
├── ci.yml                  PR / main: typecheck → test → build
├── deploy.yml              main: GitHub Pages へ公開
└── deploy-gas.yml          gas/ 変更時: clasp push → redeploy

scripts/setup-gas-deploy.sh GAS 自動デプロイのセットアップ（対話式）
docs/gas-deploy-setup.md    その手順書（他プロジェクトへ流用可）
```

**報酬ルールの数値はすべて `src/constants/master.ts` の `RULES` に集約**してある。
金額の変更はここ 1 箇所で済む。

---

## 3. 稼働中の設定

### GitHub（Settings → Secrets and variables → Actions）

| 種別 | 名前 | 用途 |
| --- | --- | --- |
| Secret | `CLASP_CREDENTIALS` | clasp の認証情報（`~/.clasprc.json` の中身） |
| Variable | `GAS_SCRIPT_ID` | `1yvhTIC9Q6NM86DN5eFP33VKfZ5jYeBk8Exl9L_UPhQM1JM0LwiRJE0tR` |
| Variable | `GAS_DEPLOYMENT_ID` | `AKfycbz-6cvLPZS5Yfl_oz2bHLWRoOOcl8vT2-9N-N0HHEmo7OkKPLljJHMDLh9EygbgeR16` |
| Variable | `VITE_GAS_API_URL` | GAS の `/exec` URL（公開バンドルに埋め込まれる） |

### Apps Script（スクリプト プロパティ）

| 名前 | 用途 |
| --- | --- |
| `AUTH_TOKEN` | アクセストークン。**値は利用者のみが把握。リポジトリに書かないこと** |
| `SPREADSHEET_ID` | 任意。未設定なら `Code.gs` の `DEFAULT_SPREADSHEET_ID` を使う |

### 重要な前提

- Apps Script プロジェクトは**スタンドアロン**（スプレッドシートに紐づいていない）。
  そのため `Code.gs` は `getActiveSpreadsheet()` が null のとき `openById()` で開く。
- デプロイのアクセス範囲は **`ANYONE_ANONYMOUS`（全員）**。指示書 8章の要求であり、
  ブラウザから `fetch` するために必須。**アクセス制御はトークンで行っている。**
- トークンはビルドに埋め込まれない。利用者が画面の「接続設定」で入力し、
  そのブラウザの `localStorage` に保存される。

---

## 4. 未解決の確認事項（重要）

指示書に明記がなく、実装時に判断した箇所。**実データで金額を突き合わせて検証が必要。**
詳細は README の「仕様解釈のメモ」にある。

| # | 項目 | 現在の実装 | 影響 |
| --- | --- | --- | --- |
| 1 | 1日必達の丸め | 100円単位で切り上げ（サンプル `20,300円` を再現するため。数式は円単位） | 日報の表示 |
| 2 | 中原氏の他部紹介 BAR売上10% | 個人PL15%とは**別枠**の支給行として計上 | **支給額に直結** |
| 3 | イベント営業の半年プール率 | 一律 10%（`profitTarget` を渡した場合のみ超過分 20%） | プール積立額 |
| 4 | 事業部の月次利益目標 | 暫定 **100万円**（`DEPTS[].monthlyProfitTarget`） | **チームプール 3%/5% 判定** |
| 5 | 残営業日の数え方 | 日曜を定休日として除外 | 1日必達の算出 |
| 6 | 個人ビューの権限 | Google 認証が未設定の間は表示の切り分けのみ | 設定が済むまでは本人以外も全社を見られる |
| 7 | 月次入力の共有 | 端末ごとに `localStorage` 保存 | 端末間で経費の値がずれる |
| 8 | 通期の範囲 | `FISCAL_START_MONTH = '2025-08'` の 12ヶ月（〜2026-07） | 2026-08 以降は通期集計に入らない |

**2 と 4 は支給額に直結する。** 初回の月次締めで実際の数字と照合してほしい。
変更は `src/constants/master.ts` と `src/utils/calculator.ts` の該当関数のみで済む。

**6・7・8 は今回の実装で残した割り切り。** 詳細と対処案は README の「仕様解釈のメモ」6〜7 と
「閲覧者の切り分け」節にある。要点だけ:

- **6**: Google アカウント認証を実装済み。有効にすると GAS が ID トークンから本人を判定し、
  Manager には自分の事業部の行しか返さなくなる（ブラウザ側を書き換えても他部門は見られない）。
  **有効化には外部設定が必要** — 手順は `docs/google-auth-setup.md`。
  未設定の間は従来どおり `?viewer=M001&lock=1` の配布リンクと `localStorage` による表示の切り分けで動く。
- **7**: 経費を共有したいなら `t_monthly_inputs` 相当のシートを足して GAS 経由で読み書きする。
- **8**: 第6期に入るときは `FISCAL_START_MONTH` を更新する。

---

## 5. よく使うコマンド

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Jest 112 件
npm run typecheck
npm run build

# 閲覧者を切り替えて確認する（開発時）
#   http://localhost:5173/?viewer=M001&lock=1   入舩（個人ビュー・固定）
#   http://localhost:5173/?viewer=M002&lock=1   中原（個人ビュー・固定）
#   http://localhost:5173/?viewer=all           全社ダッシュボードに戻す

gh workflow run "Deploy GAS"              # Apps Script へ手動デプロイ
gh workflow run "Deploy to GitHub Pages"  # サイトを手動再公開
gh run watch
```

---

## 6. 環境固有の注意（今回つまずいた点。すべて対策済み）

利用者の環境は **ChromeOS の Linux（Crostini, ホスト名 `penguin`）**。

| 事象 | 対処（済） |
| --- | --- |
| `clasp login` でアカウントが切り替わらない | `clasp logout` してから `login`。スクリプトが対応済み |
| `invalid_rapt` / `invalid_grant` | 同上。Apps Script API の有効化は**アカウントごとに必要** |
| `unknown command "variable" for "gh"` | `gh` が 2.36 未満。スクリプトが `gh api` に自動フォールバック |
| `Parent ID not set` | スタンドアロン GAS。`Code.gs` が両対応済み |
| ブラウザ認証で URL 貼り付けを求められる | `--no-localhost` の仕様。**エラー画面のアドレスバーの URL 全体**を貼る |
| 複数 Google アカウントで取り違え | シークレットウィンドウで認証する |

`gas/` 配下は `clasp push` で Apps Script へ送られるため、**テストを `gas/` に置かないこと**
（`src/__tests__/gasCode.test.ts` に置いてある）。

---

## 7. 開発ルール

- 作業ブランチ: `claude/gooner-pl-incentive-portal-3axrre`（`main` から切り直して使う）
- `main` へは PR 経由。CI がグリーンになってからマージする
- コミットメッセージは日本語。末尾に `Co-Authored-By` を付ける
- マージ済み PR に追加コミットしない（`main` から新しく切り直す）

## 8. 経緯（PR 履歴）

| PR | 内容 |
| --- | --- |
| #1 | 初期実装（型定義・API クライアント・計算エンジン・UI・GAS） |
| #2 | GitHub Pages 自動デプロイ ＆ アクセストークン認証 |
| #3 | Apps Script 自動デプロイ（clasp） |
| #4 | 認証情報を Organization Secret で共有する手順 |
| #5 | アカウント切替の修正 ＆ スタンドアロン Apps Script 対応 |
| #6 | 古い `gh` でもリポジトリ変数を登録できるように |
| #7 | セッション引き継ぎメモを追加 |
| #8 | 個人ビュー切り分け・グラフ・日報改善・CSV／印刷・モバイル対応 |
| #9 | Google アカウント認証（サーバー側で閲覧範囲を強制） |

> リポジトリ所有者は **User アカウント**（Organization ではない）。
> そのため Organization Secret は現状使えない。手順は #4 で用意済み。
