/**
 * マスタ定義・報酬ルール定数（引き継ぎ指示書 2章／5章）
 * 数値はすべて指示書の記載値をそのまま置いている。変更はここ 1 箇所で行う。
 */
import type { Dept, DeptId, DeptLabel, Member } from '@/types';

/**
 * 第5期の開始月（`YYYY-MM`）。第5期は 2026-08 〜 2027-07。
 *
 * 通期ビューと年収シミュレーションはここから 12 ヶ月を集計する。
 * 指示書に期首月の記載がないため確認して確定した値。
 * 第6期に入るときはここだけ更新すればよい。
 */
export const FISCAL_START_MONTH = '2026-08';

/** 店舗名 */
export const STORE_NAME = 'BARROOTS';

/** BARROOTS の売上が入るカテゴリ名（t_sales「カテゴリ」列） */
export const BAR_CATEGORY = '店舗運営(BAR)';

/** PL 計上率 50% のカテゴリ（指示書 5.1「転職支援は売上の50%のみ計上」） */
export const HALF_PL_CATEGORIES = ['転職支援'] as const;

/** 転職支援の PL 計上率 */
export const HALF_PL_RATE = 0.5;

/* ---------------------------------------------------------------- 報酬ルール */

export const RULES = {
  /** 入舩氏 月額基本給（指示書 5.1） */
  eventBaseSalary: 320_000,
  /** 中原氏 月額基本給（指示書 5.2） */
  hrBaseSalary: 350_000,
  /** 三田氏 固定報酬（指示書 5.3） */
  logisticsFixedCompensation: 400_000,

  /** 三田氏保守管理費：営業部から徴収（指示書 5.1 / 5.3） */
  maintenanceFeeFromEvent: 20_000,
  /** 三田氏保守費：人材部から徴収（指示書 5.2 / 5.3） */
  maintenanceFeeFromHr: 20_000,
  /** 三田氏保守費：本部から徴収（指示書 5.3） */
  maintenanceFeeFromHq: 10_000,

  /** 吐き出しインセンティブの発動閾値：当月営業利益 ≥ 1,000,000 円（指示書 5.1） */
  payoutProfitThreshold: 1_000_000,
  /** 吐き出しインセンティブ率：BAR売上の 10%（指示書 5.1） */
  barPayoutRate: 0.1,

  /** イベント営業 半年ボーナスプール率：営業利益の 10%（指示書 5.1 数式） */
  eventPoolRate: 0.1,
  /** 同 目標超過分に適用する率 20%（指示書 2章 マスタ「超過時20%」） */
  eventPoolExcessRate: 0.2,

  /** 人材事業部 概算固定費：10万円/人（指示書 5.2） */
  hrEstimatedFixedCostPerHead: 100_000,
  /** 決定手当：広告経由 10,000円/件（指示書 5.2） */
  placementAllowanceAd: 10_000,
  /** 決定手当：リファーラル 30,000円/件（指示書 5.2） */
  placementAllowanceReferral: 30_000,
  /** 個人PL 還元率 15%（指示書 5.2） */
  personalPlRate: 0.15,
  /** 人材事業部 チームプール率：目標達成まで 3%（指示書 5.2） */
  hrTeamPoolRate: 0.03,
  /** 同 目標超過分 5%（指示書 5.2） */
  hrTeamPoolExcessRate: 0.05,

  /** クロスセル（BAR顧客紹介）の対象下限：10万円以上（指示書 5.2） */
  crossSellMinAmount: 100_000,
  /** クロスセル還元率：店舗売上の 10%（指示書 5.2） */
  crossSellRate: 0.1,

  /**
   * 「1日必達」の丸め単位（円）。
   * 指示書 6章の数式は ⌈…⌉（円単位の切り上げ）だが、
   * 同章のサンプル出力は 100 円単位に切り上げた値（20,300円）になっている。
   * LINE 転送フォーマットはサンプルに合わせて 100 円単位で切り上げる。
   */
  dailyRequiredRoundTo: 100,
} as const;

/* ------------------------------------------------------------------ 事業部 */

export const DEPTS: Dept[] = [
  {
    id: 'event',
    label: 'イベント営業',
    ownerId: 'M001',
    monthlyProfitTarget: 1_000_000,
    accent: 'indigo',
  },
  {
    id: 'hr',
    label: '人材',
    ownerId: 'M002',
    monthlyProfitTarget: 1_000_000,
    accent: 'emerald',
  },
  {
    id: 'logistics',
    label: '物流・バックヤード',
    ownerId: 'M003',
    monthlyProfitTarget: 0,
    accent: 'amber',
  },
  {
    id: 'hq',
    label: '本部',
    ownerId: 'M004',
    monthlyProfitTarget: 0,
    accent: 'slate',
  },
];

/* ------------------------------------------------------------------ メンバー */

export const MEMBERS: Member[] = [
  {
    id: 'M001',
    name: '入舩 雄志',
    deptId: 'event',
    role: 'Manager',
    baseSalary: RULES.eventBaseSalary,
    compensationModel: 'incentive',
    ruleNote:
      '営業利益100万達成時にBAR売上の10%当月支給。利益10%半年プール（超過時20%）。転職売上50%計上。',
  },
  {
    id: 'M002',
    name: '中原 聖人',
    deptId: 'hr',
    role: 'Manager',
    baseSalary: RULES.hrBaseSalary,
    compensationModel: 'incentive',
    ruleNote:
      '決定手当（広告1万/紹介3万）。事業部利益プール3%（目標超え5%）。個人PL15%還元。他部紹介バック。',
  },
  {
    id: 'M003',
    name: '三田 航大',
    deptId: 'logistics',
    role: 'Admin',
    baseSalary: RULES.logisticsFixedCompensation,
    compensationModel: 'fixed',
    ruleNote: '固定報酬モデル（各事業部から2万円/1万円の保守管理費を回収して充当）。',
  },
  {
    id: 'M004',
    name: 'u s',
    deptId: 'hq',
    role: 'Admin',
    baseSalary: 0,
    compensationModel: 'fixed',
    ruleNote: '全社統括・全権限。',
  },
];

/* -------------------------------------------------------------- ルックアップ */

export const DEPT_BY_ID: Record<DeptId, Dept> = DEPTS.reduce(
  (acc, d) => ({ ...acc, [d.id]: d }),
  {} as Record<DeptId, Dept>,
);

/** スプレッドシートの「事業部」表示名 → DeptId */
export const DEPT_ID_BY_LABEL: Record<string, DeptId> = DEPTS.reduce(
  (acc, d) => ({ ...acc, [d.label]: d.id }),
  {} as Record<string, DeptId>,
);

export const MEMBER_BY_ID = MEMBERS.reduce(
  (acc, m) => ({ ...acc, [m.id]: m }),
  {} as Record<string, Member>,
);

export const MEMBER_BY_NAME = MEMBERS.reduce(
  (acc, m) => ({ ...acc, [m.name]: m }),
  {} as Record<string, Member>,
);

/** カテゴリ選択肢（日報・売上入力のセレクト用） */
export const SALES_CATEGORIES: string[] = [
  'イベント',
  BAR_CATEGORY,
  '転職支援',
  '人材紹介(広告)',
  '人材紹介(リファーラル)',
  '物流',
  'その他',
];

export const DEPT_LABELS: DeptLabel[] = DEPTS.map((d) => d.label);
