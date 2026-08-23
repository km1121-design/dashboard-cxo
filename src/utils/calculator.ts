/**
 * 計算エンジン（引き継ぎ指示書 5章／6章 準拠）
 *
 * すべて副作用のない純関数。UI からも Jest からも同じ関数を呼ぶ。
 * 数式は指示書の記載をコメントで併記している。
 */
import {
  BAR_CATEGORY,
  DEPT_BY_ID,
  DEPT_ID_BY_LABEL,
  DEPTS,
  FISCAL_START_MONTH,
  HALF_PL_CATEGORIES,
  HALF_PL_RATE,
  MEMBERS,
  RULES,
} from '@/constants/master';
import type {
  AnnualMemberSimulation,
  DailyProgressSummary,
  DeptInputRecord,
  DailyReportCarryOver,
  DailyReportComputed,
  DailyReportInput,
  DeptExpenseInput,
  DeptId,
  DeptPlRow,
  EventDeptResult,
  HrDeptResult,
  LogisticsDeptResult,
  MemberId,
  MemberPayout,
  MonthlySummary,
  PayoutLine,
  PlacementCounts,
  SaleRecord,
  TotalSummary,
} from '@/types';
import {
  countBusinessDaysInMonth,
  countRemainingBusinessDays,
  listFiscalMonths,
  toMonthKey,
} from '@/utils/date';

/* ============================================================================
 * 0. 小さなヘルパ
 * ========================================================================== */

/** 円未満を丸める（表示・支給額は 1 円単位） */
export function roundYen(value: number): number {
  return Math.round(value);
}

/** 負の値を 0 に丸める */
export function clampNonNegative(value: number): number {
  return value > 0 ? value : 0;
}

/** 数値でない入力を 0 に落とす（スプレッドシート由来の空セル対策） */
export function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * 上方丸め。`roundTo` の倍数に切り上げる。
 * `roundTo = 1` なら指示書の ⌈ ⌉ そのもの。
 */
export function ceilTo(value: number, roundTo = 1): number {
  if (roundTo <= 1) return Math.ceil(value);
  return Math.ceil(value / roundTo) * roundTo;
}

/* ============================================================================
 * 1. PL 計上率と実質売上（指示書 5.1）
 * ========================================================================== */

/**
 * カテゴリから PL 計上率を決める。
 * 「商材カテゴリが『転職支援』の場合、売上の 50% のみを計上。その他は100%」
 */
export function resolvePlRate(category: string): number {
  return (HALF_PL_CATEGORIES as readonly string[]).includes(category) ? HALF_PL_RATE : 1.0;
}

/**
 * 1 レコードの実質PL売上。
 * シート側に plRate が入っていればそれを優先し、無ければカテゴリから導出する。
 */
export function effectiveAmount(record: SaleRecord): number {
  const gross = num(record.gross);
  const rate = num(record.plRate) > 0 ? num(record.plRate) : resolvePlRate(record.category);
  return gross * rate;
}

export function sumGross(records: SaleRecord[]): number {
  return sum(records.map((r) => num(r.gross)));
}

export function sumEffective(records: SaleRecord[]): number {
  return sum(records.map(effectiveAmount));
}

/* ============================================================================
 * 2. フィルタ
 * ========================================================================== */

export function filterByMonth(records: SaleRecord[], monthKey: string): SaleRecord[] {
  return records.filter((r) => toMonthKey(r.date) === monthKey);
}

export function filterByDate(records: SaleRecord[], iso: string): SaleRecord[] {
  return records.filter((r) => r.date === iso);
}

/** 事業部で絞る。DeptId でもシート上の表示名でも受け付ける */
export function filterByDept(records: SaleRecord[], dept: DeptId | string): SaleRecord[] {
  const deptId = (DEPT_ID_BY_LABEL[dept] ?? dept) as DeptId;
  const label = DEPT_BY_ID[deptId]?.label ?? dept;
  return records.filter((r) => r.dept === label || r.dept === deptId);
}

export function filterByCategory(records: SaleRecord[], category: string): SaleRecord[] {
  return records.filter((r) => r.category === category);
}

export function filterByMember(records: SaleRecord[], memberName: string): SaleRecord[] {
  return records.filter((r) => r.member === memberName);
}

/** 月初からその日までの累計（当日を含む） */
export function cumulativeUpTo(records: SaleRecord[], iso: string): SaleRecord[] {
  const monthKey = toMonthKey(iso);
  return records.filter((r) => toMonthKey(r.date) === monthKey && r.date <= iso);
}

/** 当月「店舗運営(BAR)」売上総額（額面） */
export function calcBarSales(records: SaleRecord[]): number {
  return sumGross(filterByCategory(records, BAR_CATEGORY));
}

/* ============================================================================
 * 3. イベント営業事業部（指示書 5.1／責任者: 入舩 雄志）
 * ========================================================================== */

/**
 * 当月吐き出しインセンティブ。
 *
 * 「当月営業利益 ≥ 1,000,000 円の場合、当月の『店舗運営(BAR)』売上総額の 10% を
 *   翌月末に支給。100万円未満の場合は 0 円。」
 */
export function calcEventPayoutIncentive(operatingProfit: number, barSales: number): number {
  if (operatingProfit < RULES.payoutProfitThreshold) return 0;
  return roundYen(barSales * RULES.barPayoutRate);
}

export interface EventBonusPoolOptions {
  /**
   * 利益目標。指定した場合のみ「目標超過分は 20%」（指示書 2章マスタ）を適用する。
   * 未指定なら指示書 5.1 の数式どおり全額 10%。
   */
  profitTarget?: number;
}

/**
 * 半年ボーナス積立（プール金）。
 *
 * 「月次プール額 = max(0, (営業利益 × 10%) − 当月吐き出しインセンティブ)」
 */
export function calcEventBonusPool(
  operatingProfit: number,
  payoutIncentive: number,
  options: EventBonusPoolOptions = {},
): number {
  const profit = clampNonNegative(operatingProfit);
  const target = options.profitTarget;

  const share =
    target === undefined || profit <= target
      ? profit * RULES.eventPoolRate
      : target * RULES.eventPoolRate + (profit - target) * RULES.eventPoolExcessRate;

  return roundYen(clampNonNegative(share - payoutIncentive));
}

export interface EventDeptOptions extends EventBonusPoolOptions {
  /** 基本給を上書きする場合（既定 32万） */
  baseSalary?: number;
  /** 三田氏保守管理費を上書きする場合（既定 2万） */
  maintenanceFee?: number;
}

/**
 * イベント営業事業部の月次計算。
 *
 * 「営業利益 = 実質売上 − 経費 − 基本給(32万) − 三田氏保守管理費(2万)」
 *
 * @param records  当月・当事業部の売上ログ
 * @param expense  当月の経費入力
 */
export function calcEventDept(
  records: SaleRecord[],
  expense: DeptExpenseInput,
  options: EventDeptOptions = {},
): EventDeptResult {
  const baseSalary = options.baseSalary ?? RULES.eventBaseSalary;
  const maintenanceFee = options.maintenanceFee ?? RULES.maintenanceFeeFromEvent;

  const grossSales = sumGross(records);
  const effectiveSales = sumEffective(records);
  const barSales = calcBarSales(records);
  const expenseAmount = num(expense.directExpense);

  const operatingProfit = roundYen(effectiveSales - expenseAmount - baseSalary - maintenanceFee);
  const payoutIncentive = calcEventPayoutIncentive(operatingProfit, barSales);
  const bonusPoolAccrual = calcEventBonusPool(operatingProfit, payoutIncentive, options);

  return {
    grossSales,
    effectiveSales,
    barSales,
    expense: expenseAmount,
    baseSalary,
    maintenanceFee,
    operatingProfit,
    payoutIncentive,
    payoutUnlocked: operatingProfit >= RULES.payoutProfitThreshold,
    bonusPoolAccrual,
  };
}

/* ============================================================================
 * 4. 人材事業部（指示書 5.2／責任者: 中原 聖人）
 * ========================================================================== */

/** 決定手当 = 広告経由 × 10,000円 + リファーラル × 30,000円 */
export function calcPlacementAllowance(counts: PlacementCounts): number {
  return (
    num(counts.ad) * RULES.placementAllowanceAd +
    num(counts.referral) * RULES.placementAllowanceReferral
  );
}

/**
 * 段階プール。目標達成分までは `baseRate`、超過分には `excessRate` を適用する。
 * 人材事業部チームインセンプール（3% / 目標超過分 5%）に使用。
 */
export function calcTieredPool(
  profit: number,
  target: number,
  baseRate: number,
  excessRate: number,
): number {
  const p = clampNonNegative(profit);
  if (target <= 0) return roundYen(p * excessRate);
  if (p <= target) return roundYen(p * baseRate);
  return roundYen(target * baseRate + (p - target) * excessRate);
}

/**
 * 他部紹介（クロスセル）還元。
 * 「BAR顧客紹介（10万円以上）: 店舗売上の 10% を個人PLに還元」
 *
 * @param barRecords 紹介に紐づく店舗売上レコード。1 件あたり 10万円以上のものだけが対象。
 */
export function calcCrossSellIncentive(barRecords: SaleRecord[]): number {
  const eligible = barRecords.filter((r) => num(r.gross) >= RULES.crossSellMinAmount);
  return roundYen(sumGross(eligible) * RULES.crossSellRate);
}

export interface HrDeptOptions {
  baseSalary?: number;
  maintenanceFee?: number;
  /** チームプールの利益目標。既定は事業部マスタの monthlyProfitTarget */
  profitTarget?: number;
  /**
   * 個人PL利益を明示的に与える場合。
   * 未指定なら「中原氏本人のレコードの実質売上 − 個人直接経費」で算出する。
   */
  personalPlProfit?: number;
  /** 個人PL算出に用いる本人の直接経費 */
  personalDirectExpense?: number;
  /** 個人PL算出の対象となる担当者名（既定: 中原 聖人） */
  personalMemberName?: string;
  /** クロスセル対象の店舗売上レコード（人材事業部の売上ログには含まれないため別途渡す） */
  crossSellBarRecords?: SaleRecord[];
}

/**
 * 人材事業部の月次計算。
 *
 * 「営業利益 = 売上 − 直接経費(広告/コンサル費等) − 基本給(35万)
 *              − 概算固定費(10万/人) − 三田氏保守費(2万)」
 */
export function calcHrDept(
  records: SaleRecord[],
  expense: DeptExpenseInput,
  placements: PlacementCounts,
  options: HrDeptOptions = {},
): HrDeptResult {
  const baseSalary = options.baseSalary ?? RULES.hrBaseSalary;
  const maintenanceFee = options.maintenanceFee ?? RULES.maintenanceFeeFromHr;
  const profitTarget = options.profitTarget ?? DEPT_BY_ID.hr.monthlyProfitTarget;
  const personalMemberName = options.personalMemberName ?? '中原 聖人';

  const grossSales = sumGross(records);
  const effectiveSales = sumEffective(records);
  const directExpense = num(expense.directExpense);
  const estimatedFixedCost = num(expense.headcount) * RULES.hrEstimatedFixedCostPerHead;

  const operatingProfit = roundYen(
    effectiveSales - directExpense - baseSalary - estimatedFixedCost - maintenanceFee,
  );

  const placementAllowance = calcPlacementAllowance(placements);

  // 個人PL 15% 還元
  const personalPlProfit =
    options.personalPlProfit ??
    roundYen(
      sumEffective(filterByMember(records, personalMemberName)) -
        num(options.personalDirectExpense),
    );
  const personalPlIncentive = roundYen(
    clampNonNegative(personalPlProfit) * RULES.personalPlRate,
  );

  // 他部紹介（クロスセル）
  const crossSellIncentive = calcCrossSellIncentive(options.crossSellBarRecords ?? []);

  const teamPoolAccrual = calcTieredPool(
    operatingProfit,
    profitTarget,
    RULES.hrTeamPoolRate,
    RULES.hrTeamPoolExcessRate,
  );

  return {
    grossSales,
    effectiveSales,
    directExpense,
    baseSalary,
    estimatedFixedCost,
    maintenanceFee,
    operatingProfit,
    placementAllowance,
    personalPlProfit,
    personalPlIncentive,
    crossSellIncentive,
    teamPoolAccrual,
  };
}

/* ============================================================================
 * 5. 物流・バックヤード（指示書 5.3／責任者: 三田 航大）
 * ========================================================================== */

/**
 * 固定報酬 月額 400,000円。
 * 内訳: 物流固定費 ＋ 営業部(2万) ＋ 人材部(2万) ＋ 本部(1万) の保守費を徴収充当。
 */
export function calcLogisticsDept(): LogisticsDeptResult {
  const event = RULES.maintenanceFeeFromEvent;
  const hr = RULES.maintenanceFeeFromHr;
  const hq = RULES.maintenanceFeeFromHq;
  const total = event + hr + hq;

  return {
    fixedCompensation: RULES.logisticsFixedCompensation,
    maintenanceCollected: { event, hr, hq, total },
    logisticsFixedCost: RULES.logisticsFixedCompensation - total,
  };
}

/* ============================================================================
 * 6. メンバー別 当月支給見立て
 * ========================================================================== */

/** 入舩 雄志: 基本給32万 + BAR10%吐き出し（翌月末支給） */
export function buildEventMemberPayout(result: EventDeptResult): MemberPayout {
  const lines: PayoutLine[] = [
    {
      label: `BAR売上10%吐き出し`,
      amount: result.payoutIncentive,
      note: result.payoutUnlocked
        ? '翌月末支給'
        : `営業利益100万円未達のため0円（当月 ${result.operatingProfit.toLocaleString('ja-JP')}円）`,
    },
  ];

  return {
    memberId: 'M001',
    memberName: '入舩 雄志',
    deptId: 'event',
    baseSalary: result.baseSalary,
    breakdown: lines,
    totalPayout: result.baseSalary + sum(lines.map((l) => l.amount)),
    bonusPoolAccrual: result.bonusPoolAccrual,
    notes: [
      '転職支援売上はPL計上率50%。',
      `半年ボーナスプール積立: ${result.bonusPoolAccrual.toLocaleString('ja-JP')}円`,
    ],
  };
}

/** 中原 聖人: 基本給35万 + 決定手当 + 個人PL15% + BAR10% */
export function buildHrMemberPayout(result: HrDeptResult): MemberPayout {
  const lines: PayoutLine[] = [
    { label: '決定手当（広告1万/紹介3万）', amount: result.placementAllowance },
    { label: '個人PL 15%還元', amount: result.personalPlIncentive },
    { label: '他部紹介BAR売上10%', amount: result.crossSellIncentive },
  ];

  return {
    memberId: 'M002',
    memberName: '中原 聖人',
    deptId: 'hr',
    baseSalary: result.baseSalary,
    breakdown: lines,
    totalPayout: result.baseSalary + sum(lines.map((l) => l.amount)),
    bonusPoolAccrual: result.teamPoolAccrual,
    notes: [
      `個人PL利益: ${result.personalPlProfit.toLocaleString('ja-JP')}円`,
      `事業部チームインセンプール積立: ${result.teamPoolAccrual.toLocaleString('ja-JP')}円（目標まで3%／超過分5%）`,
    ],
  };
}

/** 三田 航大: 固定40万 */
export function buildLogisticsMemberPayout(result: LogisticsDeptResult): MemberPayout {
  return {
    memberId: 'M003',
    memberName: '三田 航大',
    deptId: 'logistics',
    baseSalary: result.fixedCompensation,
    breakdown: [],
    totalPayout: result.fixedCompensation,
    bonusPoolAccrual: 0,
    notes: [
      `保守管理費 徴収額 計 ${result.maintenanceCollected.total.toLocaleString('ja-JP')}円（営業2万/人材2万/本部1万）`,
      `物流固定費充当分: ${result.logisticsFixedCost.toLocaleString('ja-JP')}円`,
    ],
  };
}

/* ============================================================================
 * 7. 月次サマリ（指示書 3章「月別結果」）
 * ========================================================================== */

/** 事業部ごとの計画値（予実の「予」） */
export interface DeptBudget {
  /** 売上計画 */
  salesBudget: number;
  /** 営業利益計画 */
  profitBudget: number;
}

/** 月次計算に必要な、売上ログ外の手入力値 */
export interface MonthlyInputs {
  /** 事業部ごとの経費入力 */
  expenses?: Partial<Record<DeptId, DeptExpenseInput>>;
  /** 事業部ごとの計画値。未指定の事業部は予実を出さない */
  budgets?: Partial<Record<DeptId, DeptBudget>>;
  /** 人材事業部の決定件数 */
  placements?: PlacementCounts;
  /** 人材事業部 個人PL算出のための本人直接経費 */
  personalDirectExpense?: number;
  /** クロスセル対象の店舗売上レコード */
  crossSellBarRecords?: SaleRecord[];
  /** 月間売上目標（日別進捗の日割り計算に使用） */
  monthlySalesTarget?: number;
}

/**
 * スプレッドシートの月次入力（1行 = 1月 × 1事業部）を、計算エンジンが受け取る形に畳む。
 *
 * 決定件数と個人直接経費は人材事業部の行にしか入らないが、
 * 取りこぼしを避けるため全行を合算している。
 */
export function toMonthlyInputs(rows: DeptInputRecord[], monthKey: string): MonthlyInputs {
  const target = rows.filter((r) => r.month === monthKey);

  const expenses: Partial<Record<DeptId, DeptExpenseInput>> = {};
  const budgets: Partial<Record<DeptId, DeptBudget>> = {};
  let placementAd = 0;
  let placementReferral = 0;
  let personalDirectExpense = 0;
  let monthlySalesTarget = 0;

  for (const row of target) {
    const deptId = DEPT_ID_BY_LABEL[row.dept] ?? (row.dept as DeptId);
    if (DEPT_BY_ID[deptId]) {
      expenses[deptId] = {
        directExpense: num(row.directExpense),
        headcount: num(row.headcount),
      };
      budgets[deptId] = {
        salesBudget: num(row.salesBudget),
        profitBudget: num(row.profitBudget),
      };
    }

    placementAd += num(row.placementAd);
    placementReferral += num(row.placementReferral);
    personalDirectExpense += num(row.personalDirectExpense);
    monthlySalesTarget += num(row.salesTarget);
  }

  return {
    expenses,
    budgets,
    placements: { ad: placementAd, referral: placementReferral },
    personalDirectExpense,
    monthlySalesTarget,
  };
}

/** 月次入力を月キーごとにまとめる（通期の集計に渡す形） */
export function toMonthlyInputsByMonth(rows: DeptInputRecord[]): Record<string, MonthlyInputs> {
  const months = Array.from(new Set(rows.map((r) => r.month))).filter(Boolean);
  return months.reduce<Record<string, MonthlyInputs>>((acc, month) => {
    acc[month] = toMonthlyInputs(rows, month);
    return acc;
  }, {});
}

/** 事業部 1 つ分の月間売上目標を取り出す（個人ビューの日割り目標に使う） */
export function findDeptSalesTarget(
  rows: DeptInputRecord[],
  monthKey: string,
  deptId: DeptId,
): number {
  const label = DEPT_BY_ID[deptId]?.label;
  const row = rows.find((r) => r.month === monthKey && (r.dept === label || r.dept === deptId));
  return num(row?.salesTarget);
}

const EMPTY_EXPENSE: DeptExpenseInput = { directExpense: 0, headcount: 0 };
const EMPTY_PLACEMENTS: PlacementCounts = { ad: 0, referral: 0 };

function buildDeptRow(
  deptId: DeptId,
  records: SaleRecord[],
  expense: number,
  laborCost: number,
  operatingProfit: number,
  budget: DeptBudget = { salesBudget: 0, profitBudget: 0 },
): DeptPlRow {
  const dept = DEPT_BY_ID[deptId];
  const target = dept.monthlyProfitTarget;

  const salesBudget = num(budget.salesBudget);
  const profitBudget = num(budget.profitBudget);
  // 物流のように計画が赤字の事業部があるので、符号ではなく「何か入っているか」で見る
  const hasBudget = salesBudget !== 0 || profitBudget !== 0;

  return {
    deptId,
    deptLabel: dept.label,
    grossSales: sumGross(records),
    effectiveSales: sumEffective(records),
    expense,
    laborCost,
    operatingProfit,
    achievementRate: target > 0 ? operatingProfit / target : 0,
    hasBudget,
    salesBudget,
    profitBudget,
    // 計画が入っていない月に「実績ぶんの黒字」が出ないよう 0 のままにする
    profitVariance: hasBudget ? operatingProfit - profitBudget : 0,
  };
}

/** 当月の事業部別 PL とメンバー別支給見立てを一括算出 */
export function calcMonthlySummary(
  allRecords: SaleRecord[],
  monthKey: string,
  inputs: MonthlyInputs = {},
): MonthlySummary {
  const monthRecords = filterByMonth(allRecords, monthKey);

  const eventRecords = filterByDept(monthRecords, 'event');
  const hrRecords = filterByDept(monthRecords, 'hr');
  const logisticsRecords = filterByDept(monthRecords, 'logistics');
  const hqRecords = filterByDept(monthRecords, 'hq');

  const eventExpense = inputs.expenses?.event ?? EMPTY_EXPENSE;
  const hrExpense = inputs.expenses?.hr ?? EMPTY_EXPENSE;
  const logisticsExpense = inputs.expenses?.logistics ?? EMPTY_EXPENSE;

  const event = calcEventDept(eventRecords, eventExpense);
  const hr = calcHrDept(hrRecords, hrExpense, inputs.placements ?? EMPTY_PLACEMENTS, {
    personalDirectExpense: inputs.personalDirectExpense,
    crossSellBarRecords: inputs.crossSellBarRecords ?? filterByCategory(eventRecords, BAR_CATEGORY),
  });
  const logistics = calcLogisticsDept();

  const budgetOf = (deptId: DeptId): DeptBudget =>
    inputs.budgets?.[deptId] ?? { salesBudget: 0, profitBudget: 0 };

  const deptRows: DeptPlRow[] = [
    buildDeptRow(
      'event',
      eventRecords,
      event.expense,
      event.baseSalary + event.maintenanceFee,
      event.operatingProfit,
      budgetOf('event'),
    ),
    buildDeptRow(
      'hr',
      hrRecords,
      hr.directExpense,
      hr.baseSalary + hr.estimatedFixedCost + hr.maintenanceFee,
      hr.operatingProfit,
      budgetOf('hr'),
    ),
    buildDeptRow(
      'logistics',
      logisticsRecords,
      num(logisticsExpense.directExpense),
      logistics.fixedCompensation,
      roundYen(
        sumEffective(logisticsRecords) +
          logistics.maintenanceCollected.total -
          num(logisticsExpense.directExpense) -
          logistics.fixedCompensation,
      ),
      budgetOf('logistics'),
    ),
    buildDeptRow('hq', hqRecords, 0, 0, roundYen(sumEffective(hqRecords)), budgetOf('hq')),
  ];

  const payouts: MemberPayout[] = [
    buildEventMemberPayout(event),
    buildHrMemberPayout(hr),
    buildLogisticsMemberPayout(logistics),
  ];

  return {
    month: monthKey,
    grossSales: sumGross(monthRecords),
    effectiveSales: sumEffective(monthRecords),
    operatingProfit: sum(deptRows.map((r) => r.operatingProfit)),
    deptRows,
    payouts,
    bonusPoolAccrual: sum(payouts.map((p) => p.bonusPoolAccrual)),
    // 事業部の行を足し上げる。カードと表で数字が食い違わないよう、必ず同じ足し方にする
    salesBudget: sum(deptRows.map((r) => r.salesBudget)),
    profitBudget: sum(deptRows.map((r) => r.profitBudget)),
    profitVariance: sum(deptRows.map((r) => r.profitVariance)),
  };
}

/* ============================================================================
 * 8. 日別進捗（指示書 3章「日別進捗」）
 * ========================================================================== */

export interface DailyProgressOptions {
  /** 月間売上目標 */
  monthlySalesTarget?: number;
  /** 定休日の曜日番号 */
  closedWeekdays?: readonly number[];
}

export function calcDailyProgress(
  allRecords: SaleRecord[],
  iso: string,
  options: DailyProgressOptions = {},
): DailyProgressSummary {
  const monthKey = toMonthKey(iso);
  const monthlyTarget = num(options.monthlySalesTarget);
  const closedWeekdays = options.closedWeekdays;

  const dayRecords = filterByDate(allRecords, iso);
  const cumulativeRecords = cumulativeUpTo(allRecords, iso);

  const businessDays = countBusinessDaysInMonth(monthKey, { closedWeekdays });
  const remainingBusinessDays = countRemainingBusinessDays(iso, { closedWeekdays });

  const dailyGross = sumGross(dayRecords);
  const monthCumulative = sumGross(cumulativeRecords);
  const proratedTarget = businessDays > 0 ? roundYen(monthlyTarget / businessDays) : 0;

  return {
    date: iso,
    dailyGross,
    dailyEffective: sumEffective(dayRecords),
    monthCumulative,
    monthlyTarget,
    proratedTarget,
    proratedAchievementRate: proratedTarget > 0 ? dailyGross / proratedTarget : 0,
    remainingBusinessDays,
    dailyRequired: calcDailyRequired(monthlyTarget, monthCumulative, remainingBusinessDays),
    records: dayRecords,
  };
}

/* ============================================================================
 * 9. 通期サマリ（指示書 3章「総結果」）
 * ========================================================================== */

export function calcTotalSummary(
  allRecords: SaleRecord[],
  inputsByMonth: Record<string, MonthlyInputs> = {},
  fiscalStartMonth: string = FISCAL_START_MONTH,
): TotalSummary {
  const monthKeys = listFiscalMonths(fiscalStartMonth, 12);
  const months = monthKeys.map((m) => calcMonthlySummary(allRecords, m, inputsByMonth[m] ?? {}));

  const annualByMember: AnnualMemberSimulation[] = MEMBERS.filter((m) => m.id !== 'M004').map(
    (member) => {
      const monthly = months.map(
        (m) => m.payouts.find((p) => p.memberId === member.id) ?? null,
      );
      const annualBase = sum(monthly.map((p) => p?.baseSalary ?? 0));
      const annualIncentive = sum(
        monthly.map((p) => sum((p?.breakdown ?? []).map((l) => l.amount))),
      );
      const annualBonusPool = sum(monthly.map((p) => p?.bonusPoolAccrual ?? 0));

      return {
        memberId: member.id,
        memberName: member.name,
        annualBase,
        annualIncentive,
        annualBonusPool,
        annualTotal: annualBase + annualIncentive + annualBonusPool,
      };
    },
  );

  return {
    fiscalStartMonth,
    months,
    grossSales: sum(months.map((m) => m.grossSales)),
    effectiveSales: sum(months.map((m) => m.effectiveSales)),
    operatingProfit: sum(months.map((m) => m.operatingProfit)),
    bonusPoolTotal: sum(months.map((m) => m.bonusPoolAccrual)),
    annualByMember,
  };
}

/* ============================================================================
 * 10. BARROOTS 日報 自動計算（指示書 6章）
 * ========================================================================== */

/** 当日売り上げ = 現金 + クレカ + 電子マネー + QR */
export function calcDailySales(input: Pick<DailyReportInput, 'cash' | 'credit' | 'emoney' | 'qr'>): number {
  return num(input.cash) + num(input.credit) + num(input.emoney) + num(input.qr);
}

/**
 * 1日必達 = ⌈(月目標 − 当月累計売上) ÷ 残営業日⌉
 *
 * `roundTo` は丸め単位。指示書 6章のサンプル出力（20,300円）に合わせ、
 * 既定は 100 円単位の切り上げ。1 を渡せば数式どおりの円単位切り上げになる。
 */
export function calcDailyRequired(
  monthlyTarget: number,
  monthCumulative: number,
  remainingBusinessDays: number,
  roundTo: number = RULES.dailyRequiredRoundTo,
): number {
  const remaining = num(monthlyTarget) - num(monthCumulative);
  if (remaining <= 0) return 0;
  if (num(remainingBusinessDays) <= 0) return ceilTo(remaining, roundTo);
  return ceilTo(remaining / remainingBusinessDays, roundTo);
}

/**
 * 日報の自動計算一式。
 * `carryOver` に前日までの累計を渡す（`buildCarryOver` で売上ログから作れる）。
 */
export function calcDailyReport(
  input: DailyReportInput,
  carryOver: DailyReportCarryOver = { cumulativeSales: 0, cumulativeNewCustomers: 0 },
): DailyReportComputed {
  const dailySales = calcDailySales(input);
  const monthCumulative = num(carryOver.cumulativeSales) + dailySales;

  return {
    dailySales,
    totalCustomers: num(input.newCustomers) + num(input.existingCustomers),
    monthCumulative,
    dailyRequired: calcDailyRequired(
      num(input.monthlyTarget),
      monthCumulative,
      num(input.remainingBusinessDays),
    ),
    newCustomersCumulative: num(carryOver.cumulativeNewCustomers) + num(input.newCustomers),
  };
}

/**
 * 売上ログから「前日までの累計」を組み立てる。
 * 対象は同一月・当日より前の BAR カテゴリレコード。
 */
export function buildCarryOver(allRecords: SaleRecord[], iso: string): DailyReportCarryOver {
  const monthKey = toMonthKey(iso);
  const prior = allRecords.filter(
    (r) => toMonthKey(r.date) === monthKey && r.date < iso && r.category === BAR_CATEGORY,
  );
  return {
    cumulativeSales: sumGross(prior),
    cumulativeNewCustomers: sum(prior.map((r) => num(r.newCustomers))),
  };
}

/* ============================================================================
 * 11. 全社サマリの補助
 * ========================================================================== */

/** 全事業部の当月営業利益を DeptId 別に取り出す */
export function profitByDept(summary: MonthlySummary): Record<DeptId, number> {
  return DEPTS.reduce(
    (acc, d) => ({
      ...acc,
      [d.id]: summary.deptRows.find((r) => r.deptId === d.id)?.operatingProfit ?? 0,
    }),
    {} as Record<DeptId, number>,
  );
}

/* ============================================================================
 * 12. メンバー個人ビュー（自分の実績だけを見る画面用）
 * ========================================================================== */

/** 個人ビューの当月集計 */
export interface MemberMonthlyResult {
  /** `YYYY-MM` */
  month: string;
  memberId: MemberId;
  memberName: string;
  deptId: DeptId;
  deptLabel: string;
  /** 本人が担当のレコード（額面） */
  personalGross: number;
  /** 同 実質PL売上 */
  personalEffective: number;
  /** 本人が担当のレコード */
  personalRecords: SaleRecord[];
  /** 所属事業部の額面売上 */
  deptGross: number;
  /** 所属事業部の実質PL売上 */
  deptEffective: number;
  /** 所属事業部の営業利益（インセンティブ判定の根拠） */
  deptOperatingProfit: number;
  /** 所属事業部の月次利益目標 */
  deptProfitTarget: number;
  /** 目標達成率（目標が 0 のときは 0） */
  deptAchievementRate: number;
  /** 本人の当月支給見立て。対象外のメンバーは null */
  payout: MemberPayout | null;
}

/**
 * 本人と所属事業部の当月分だけを取り出す。
 *
 * 全社合計・他事業部の数字は返さない。個人ビューは
 * 「自分の売上」「自分の事業部の利益（＝インセンティブの根拠）」「自分の支給額」
 * の 3 つだけを扱う。
 */
export function calcMemberMonthly(
  allRecords: SaleRecord[],
  monthKey: string,
  memberId: MemberId,
  inputs: MonthlyInputs = {},
): MemberMonthlyResult {
  const member = MEMBERS.find((m) => m.id === memberId);
  if (!member) throw new Error(`unknown memberId: ${memberId}`);

  const summary = calcMonthlySummary(allRecords, monthKey, inputs);
  const deptRow = summary.deptRows.find((r) => r.deptId === member.deptId);
  const dept = DEPT_BY_ID[member.deptId];

  const monthRecords = filterByMonth(allRecords, monthKey);
  const personalRecords = filterByMember(monthRecords, member.name);

  return {
    month: monthKey,
    memberId: member.id,
    memberName: member.name,
    deptId: member.deptId,
    deptLabel: dept.label,
    personalGross: sumGross(personalRecords),
    personalEffective: sumEffective(personalRecords),
    personalRecords,
    deptGross: deptRow?.grossSales ?? 0,
    deptEffective: deptRow?.effectiveSales ?? 0,
    deptOperatingProfit: deptRow?.operatingProfit ?? 0,
    deptProfitTarget: dept.monthlyProfitTarget,
    deptAchievementRate: deptRow?.achievementRate ?? 0,
    payout: summary.payouts.find((p) => p.memberId === member.id) ?? null,
  };
}

/** 個人ビューの通期集計 */
export interface MemberAnnualResult {
  memberId: MemberId;
  memberName: string;
  fiscalStartMonth: string;
  /** 月別の内訳（12ヶ月） */
  months: MemberMonthlyResult[];
  /** 基本給・固定報酬の年間合計 */
  annualBase: number;
  /** インセンティブの年間合計 */
  annualIncentive: number;
  /** プール積立の年間合計 */
  annualBonusPool: number;
  /** 想定年収 */
  annualTotal: number;
  /** 本人担当売上の年間合計（額面） */
  personalGrossTotal: number;
}

/** 本人の通期（第5期 12ヶ月）を月別に積み上げる */
export function calcMemberAnnual(
  allRecords: SaleRecord[],
  memberId: MemberId,
  inputsByMonth: Record<string, MonthlyInputs> = {},
  fiscalStartMonth: string = FISCAL_START_MONTH,
): MemberAnnualResult {
  const months = listFiscalMonths(fiscalStartMonth, 12).map((m) =>
    calcMemberMonthly(allRecords, m, memberId, inputsByMonth[m] ?? {}),
  );

  const annualBase = sum(months.map((m) => m.payout?.baseSalary ?? 0));
  const annualIncentive = sum(
    months.map((m) => sum((m.payout?.breakdown ?? []).map((l) => l.amount))),
  );
  const annualBonusPool = sum(months.map((m) => m.payout?.bonusPoolAccrual ?? 0));

  return {
    memberId,
    memberName: months[0]?.memberName ?? '',
    fiscalStartMonth,
    months,
    annualBase,
    annualIncentive,
    annualBonusPool,
    annualTotal: annualBase + annualIncentive + annualBonusPool,
    personalGrossTotal: sum(months.map((m) => m.personalGross)),
  };
}
