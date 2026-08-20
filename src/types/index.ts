/**
 * Gooner 第5期 PL・インセンティブ管理 ＆ BARROOTS日報ポータル
 * 型定義（引き継ぎ指示書 2章／4章／5章／6章 準拠）
 */

/* ============================================================================
 * 1. マスタ／列挙
 * ========================================================================== */

/** 事業部ID */
export type DeptId = 'event' | 'hr' | 'logistics' | 'hq';

/** スプレッドシート「事業部」列に入る表示名（GAS と往復する値） */
export type DeptLabel = 'イベント営業' | '人材' | '物流・バックヤード' | '本部';

/** 役職 / ロール（指示書 2章） */
export type MemberRole = 'Manager' | 'Admin';

/** メンバーID（指示書 2章 マスタ） */
export type MemberId = 'M001' | 'M002' | 'M003' | 'M004';

/**
 * 報酬モデル
 * - `incentive` : 基本給＋インセンティブ（入舩・中原）
 * - `fixed`     : 固定報酬（三田・本部）
 */
export type CompensationModel = 'incentive' | 'fixed';

/**
 * 商材カテゴリ。スプレッドシート t_sales「カテゴリ」列の値。
 * `転職支援` のみ PL 計上率 50%（指示書 5.1）。
 */
export type SalesCategory =
  | 'イベント'
  | '店舗運営(BAR)'
  | '転職支援'
  | '人材紹介(広告)'
  | '人材紹介(リファーラル)'
  | '物流'
  | 'その他';

/** 人材事業部の決定経路（決定手当の単価が変わる／指示書 5.2） */
export type PlacementChannel = 'ad' | 'referral';

/** 閲覧モード（指示書 3章） */
export type ViewMode = 'daily' | 'monthly' | 'total';

/** 同期状態 */
export type SyncState = 'idle' | 'loading' | 'success' | 'error';

/* ============================================================================
 * 2. マスタレコード
 * ========================================================================== */

/** 事業部マスタ */
export interface Dept {
  id: DeptId;
  /** スプレッドシートと往復する表示名 */
  label: DeptLabel;
  /** 責任者のメンバーID */
  ownerId: MemberId | null;
  /** 月次営業利益目標（円）。プールの 3%/5%・10%/20% 判定に使用 */
  monthlyProfitTarget: number;
  /** Tailwind のアクセントカラーキー */
  accent: 'indigo' | 'emerald' | 'amber' | 'slate';
}

/** メンバーマスタ（m_members 相当／指示書 2章） */
export interface Member {
  id: MemberId;
  /** 氏名（t_sales「担当者」列と一致させる） */
  name: string;
  /** 主所属事業部 */
  deptId: DeptId;
  role: MemberRole;
  /** 月額基本給 / 固定報酬（円） */
  baseSalary: number;
  compensationModel: CompensationModel;
  /** 主なインセンティブ・保守ルール（指示書 2章の説明文をそのまま保持） */
  ruleNote: string;
}

/* ============================================================================
 * 3. GAS API（指示書 4章 Code.gs と 1:1 対応）
 * ========================================================================== */

/**
 * t_sales の 1 行 = 売上ログ／日報レコード。
 * フィールド名・順序は Code.gs の `getSheetDataAsJson` / `doPost` と一致。
 */
export interface SaleRecord {
  /** 例: `DS1699999999999` */
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** 事業部（表示名） */
  dept: string;
  /** カテゴリ */
  category: string;
  /** 担当者氏名 */
  member: string;
  /** 額面売上（円） */
  gross: number;
  /** PL計上率。転職支援 = 0.5、その他 = 1.0（指示書 5.1） */
  plRate: number;
  /** 決済内訳（円）— BARROOTS 日報で使用 */
  cash: number;
  credit: number;
  emoney: number;
  qr: number;
  /** 組数 */
  groups: number;
  /** 総客数 */
  totalCustomers: number;
  /** 新規客数 */
  newCustomers: number;
  /** 既存客数 */
  existingCustomers: number;
  /** 総評・コメント */
  comment: string;
  /** スプレッドシート上の行番号（GET のみ／POST では送らない） */
  sheetRow?: number;
}

/** POST 時に送る 1 レコード（sheetRow を持たない） */
export type SaleRecordInput = Omit<SaleRecord, 'sheetRow'>;

/**
 * GAS が返す閲覧者情報。
 *
 * 誰としてアクセスしているかは**サーバーが決める**。Google 認証が有効なときは
 * ID トークンから解決され、`scope: 'personal'` のメンバーには自分の事業部の行しか
 * 返ってこない（ブラウザ側を書き換えても他事業部は見られない）。
 */
export interface ServerViewer {
  /** `google` = Google アカウント認証 / `token` = 従来の合言葉（全社閲覧） */
  mode: 'google' | 'token';
  memberId: MemberId | null;
  name: string;
  email: string;
  /** 所属事業部の表示名 */
  dept: string;
  role: MemberRole;
  scope: 'company' | 'personal';
}

/** doGet の成功レスポンス */
export interface GasGetSuccess {
  status: 'success';
  /** ISO8601 */
  timestamp: string;
  count: number;
  sales: SaleRecord[];
  /** 閲覧者。Google 認証を入れる前のデプロイでは返ってこない */
  viewer?: ServerViewer;
}

/** doGet / doPost のエラーレスポンス */
export interface GasErrorResponse {
  status: 'error';
  message: string;
}

/** doPost の成功レスポンス */
export interface GasPostSuccess {
  status: 'success';
  message: string;
}

export type GasGetResponse = GasGetSuccess | GasErrorResponse;
export type GasPostResponse = GasPostSuccess | GasErrorResponse;

/** doPost が受け付けるアクション（Code.gs 準拠） */
export type GasAction = 'addSale' | 'addReport';

/** doPost のリクエストボディ */
export interface GasPostBody {
  action: GasAction;
  data: SaleRecordInput;
  /** アクセストークン。GAS 側で AUTH_TOKEN が設定されている場合に必須 */
  token?: string;
  /** Google の ID トークン。GAS 側で GOOGLE_CLIENT_ID が設定されている場合に必須 */
  idToken?: string;
}

/** gasApi のクライアント設定 */
export interface GasApiConfig {
  /** ウェブアプリのデプロイ URL（/exec） */
  baseUrl: string;
  /**
   * アクセストークン（GAS の スクリプトプロパティ AUTH_TOKEN と一致させる）。
   * ビルドには埋め込まず、利用者が画面から入力した値を渡す。
   */
  token?: string;
  /**
   * Google アカウント認証の ID トークン（JWT）。
   * GAS 側で GOOGLE_CLIENT_ID が設定されているときはこれが本人確認に使われる。
   */
  idToken?: string;
  /** タイムアウト（ミリ秒）。既定 15000 */
  timeoutMs?: number;
  /**
   * POST を `mode: 'no-cors'` で送るか（指示書 8章）。
   * true の場合レスポンス本文が読めないため、成功は「送信できたこと」で判定する。
   */
  noCors?: boolean;
  /** テスト・SSR 用の fetch 差し替え */
  fetchImpl?: typeof fetch;
}

/** API 呼び出し結果（例外を投げずに扱うためのラッパー） */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ============================================================================
 * 4. 計算エンジンの入出力（指示書 5章）
 * ========================================================================== */

/** 経費入力（売上ログに含まれない、月次で手入力・別管理する費用） */
export interface DeptExpenseInput {
  /** 直接経費（広告費・コンサル費・仕入・イベント経費 等） */
  directExpense: number;
  /**
   * 概算固定費（10万円/人）。人材事業部の営業利益式で使用（指示書 5.2）。
   * 人数分を掛けたあとの合計額ではなく「人数」を渡す。
   */
  headcount?: number;
}

/** イベント営業事業部の月次計算結果（指示書 5.1） */
export interface EventDeptResult {
  /** 額面売上合計 */
  grossSales: number;
  /** 実質PL売上（転職支援は 50% 計上） */
  effectiveSales: number;
  /** 当月「店舗運営(BAR)」売上総額 */
  barSales: number;
  /** 経費 */
  expense: number;
  /** 基本給（32万） */
  baseSalary: number;
  /** 三田氏保守管理費（2万） */
  maintenanceFee: number;
  /** 営業利益 = 実質売上 − 経費 − 基本給 − 保守管理費 */
  operatingProfit: number;
  /** 当月吐き出しインセンティブ（営業利益 ≥ 100万 で BAR売上の10%、未満は0） */
  payoutIncentive: number;
  /** 吐き出しインセンティブの支給トリガーを満たしたか */
  payoutUnlocked: boolean;
  /** 半年ボーナス積立額 = max(0, 営業利益×10% − 吐き出しインセンティブ) */
  bonusPoolAccrual: number;
}

/** 人材事業部の決定件数 */
export interface PlacementCounts {
  /** 広告経由決定 件数（10,000円/件） */
  ad: number;
  /** リファーラル決定 件数（30,000円/件） */
  referral: number;
}

/** 人材事業部の月次計算結果（指示書 5.2） */
export interface HrDeptResult {
  /** 売上合計 */
  grossSales: number;
  /** 実質PL売上（転職支援 50% 計上を反映） */
  effectiveSales: number;
  /** 直接経費（広告/コンサル費 等） */
  directExpense: number;
  /** 基本給（35万） */
  baseSalary: number;
  /** 概算固定費（10万/人 × 人数） */
  estimatedFixedCost: number;
  /** 三田氏保守費（2万） */
  maintenanceFee: number;
  /** 営業利益 */
  operatingProfit: number;
  /** 決定手当（広告1万 + 紹介3万） */
  placementAllowance: number;
  /** 個人PL利益 */
  personalPlProfit: number;
  /** 個人PL 15% 還元額 */
  personalPlIncentive: number;
  /** 他部紹介（クロスセル）還元額 = 対象BAR売上の10% */
  crossSellIncentive: number;
  /** 事業部チームインセンプール（目標まで3%／超過分5%） */
  teamPoolAccrual: number;
}

/** 物流・バックヤードの月次計算結果（指示書 5.3） */
export interface LogisticsDeptResult {
  /** 固定報酬 400,000円 */
  fixedCompensation: number;
  /** 徴収する保守管理費の内訳 */
  maintenanceCollected: {
    event: number;
    hr: number;
    hq: number;
    total: number;
  };
  /** 固定報酬のうち保守費で充当されない部分（物流固定費） */
  logisticsFixedCost: number;
}

/** メンバー別 当月支給見立て */
export interface MemberPayout {
  memberId: MemberId;
  memberName: string;
  deptId: DeptId;
  /** 基本給 / 固定報酬 */
  baseSalary: number;
  /** 内訳（基本給を除く加算項目） */
  breakdown: PayoutLine[];
  /** 当月振込見立て合計 */
  totalPayout: number;
  /** 半年ボーナスプール積立額（当月分） */
  bonusPoolAccrual: number;
  /** 支給に関する注記（翌月末支給・未達 等） */
  notes: string[];
}

/** 支給内訳の 1 行 */
export interface PayoutLine {
  label: string;
  amount: number;
  /** 翌月末支給などの補足 */
  note?: string;
}

/** 事業部 PL の 1 行（月別結果ビューの表） */
export interface DeptPlRow {
  deptId: DeptId;
  deptLabel: string;
  grossSales: number;
  effectiveSales: number;
  expense: number;
  laborCost: number;
  operatingProfit: number;
  /** 目標に対する達成率（0–1 以上） */
  achievementRate: number;
}

/** 月次サマリ（月別結果ビュー） */
export interface MonthlySummary {
  /** `YYYY-MM` */
  month: string;
  grossSales: number;
  effectiveSales: number;
  operatingProfit: number;
  deptRows: DeptPlRow[];
  payouts: MemberPayout[];
  /** 当月の半年プール積立合計 */
  bonusPoolAccrual: number;
}

/** 日別進捗サマリ（日別進捗ビュー） */
export interface DailyProgressSummary {
  /** `YYYY-MM-DD` */
  date: string;
  /** 当日売上（額面） */
  dailyGross: number;
  /** 当日実質PL売上 */
  dailyEffective: number;
  /** 当月累計売上（当日を含む） */
  monthCumulative: number;
  /** 月間目標 */
  monthlyTarget: number;
  /** 日割り目標（月間目標 ÷ 月の営業日数） */
  proratedTarget: number;
  /** 日割り目標達成率 */
  proratedAchievementRate: number;
  /** 残営業日 */
  remainingBusinessDays: number;
  /** 1日必達額 */
  dailyRequired: number;
  /** 当日のログ */
  records: SaleRecord[];
}

/** 通期サマリ（総結果ビュー） */
export interface TotalSummary {
  /** 期の開始月 `YYYY-MM` */
  fiscalStartMonth: string;
  months: MonthlySummary[];
  grossSales: number;
  effectiveSales: number;
  operatingProfit: number;
  /** 半年プール積立合計 */
  bonusPoolTotal: number;
  /** メンバー別 年収シミュレーション */
  annualByMember: AnnualMemberSimulation[];
}

/** 年収シミュレーション */
export interface AnnualMemberSimulation {
  memberId: MemberId;
  memberName: string;
  /** 基本給・固定報酬の年間合計 */
  annualBase: number;
  /** インセンティブの年間合計 */
  annualIncentive: number;
  /** 半年プール積立の年間合計 */
  annualBonusPool: number;
  /** 想定年収 */
  annualTotal: number;
}

/* ============================================================================
 * 5. BARROOTS 日報（指示書 6章）
 * ========================================================================== */

/** 日報の入力値 */
export interface DailyReportInput {
  /** `YYYY-MM-DD` */
  date: string;
  /** 担当者氏名 */
  member: string;
  /** 月目標（円） */
  monthlyTarget: number;
  /** 決済内訳 */
  cash: number;
  credit: number;
  emoney: number;
  qr: number;
  /** 組数 */
  groups: number;
  /** 新規人数 */
  newCustomers: number;
  /** 既存人数 */
  existingCustomers: number;
  /** 残営業日 */
  remainingBusinessDays: number;
  /** 総評 */
  comment: string;
}

/** 日報の計算結果（指示書 6章 自動計算ロジック） */
export interface DailyReportComputed {
  /** 当日売り上げ = 現金 + クレカ + 電子マネー + QR */
  dailySales: number;
  /** 総客数 = 新規 + 既存 */
  totalCustomers: number;
  /** 当月累計売上 = 前日までの累計 + 当日売り上げ */
  monthCumulative: number;
  /** 1日必達 = ⌈(月目標 − 当月累計売上) ÷ 残営業日⌉ */
  dailyRequired: number;
  /** 新規累計 = 前日までの新規累計 + 本日新規人数 */
  newCustomersCumulative: number;
}

/** 前日までの累計（日報計算の前提値） */
export interface DailyReportCarryOver {
  /** 前日までの当月累計売上 */
  cumulativeSales: number;
  /** 前日までの新規累計 */
  cumulativeNewCustomers: number;
}
