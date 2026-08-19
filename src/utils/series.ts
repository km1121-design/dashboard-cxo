/**
 * グラフ用の系列組み立て。
 *
 * 描画コンポーネントは受け取った系列をそのまま座標に落とすだけにしたいので、
 * 集計・並び・ラベルはすべてここで済ませる（純関数なのでテストできる）。
 */
import { BAR_CATEGORY } from '@/constants/master';
import type { DeptPlRow, MonthlySummary, SaleRecord } from '@/types';
import { filterByCategory, filterByMonth, num, sumEffective, sumGross } from '@/utils/calculator';
import { DEFAULT_CLOSED_WEEKDAYS, getWeekdayIndex, listDatesInMonth } from '@/utils/date';

/* -------------------------------------------------------------- 月次推移 */

export interface TrendPoint {
  /** `YYYY-MM` */
  month: string;
  /** 軸ラベル（`8月`） */
  label: string;
  grossSales: number;
  effectiveSales: number;
  operatingProfit: number;
}

/** `YYYY-MM` → `8月` */
export function monthAxisLabel(monthKey: string): string {
  const m = Number(monthKey.slice(5, 7));
  return Number.isFinite(m) && m > 0 ? `${m}月` : monthKey;
}

/**
 * 通期の月次サマリを推移グラフ用に並べ直す。
 * 額面売上と営業利益はどちらも円なので 1 つの軸に載せられる（2軸グラフは作らない）。
 */
export function buildMonthlyTrend(months: MonthlySummary[]): TrendPoint[] {
  return months.map((m) => ({
    month: m.month,
    label: monthAxisLabel(m.month),
    grossSales: m.grossSales,
    effectiveSales: m.effectiveSales,
    operatingProfit: m.operatingProfit,
  }));
}

/* ------------------------------------------------------------ 日次の売上 */

export interface DailyPoint {
  /** `YYYY-MM-DD` */
  date: string;
  /** 日（1–31） */
  day: number;
  /** 曜日番号（0=日 … 6=土） */
  weekday: number;
  /** 定休日か */
  closed: boolean;
  /** その日の額面売上 */
  gross: number;
  /** 月初からの累計（額面） */
  cumulative: number;
}

export interface DailySeriesOptions {
  /** 定休日の曜日番号。既定は日曜のみ */
  closedWeekdays?: readonly number[];
  /** 特定カテゴリだけを対象にする（BARROOTS の日次推移に使う） */
  category?: string;
  /** 特定の担当者だけを対象にする（個人ビューの日次推移に使う） */
  memberName?: string;
}

/** 月の全日を並べ、売上のない日も 0 として返す（欠測日で線が飛ばないようにする） */
export function buildDailySeries(
  records: SaleRecord[],
  monthKey: string,
  options: DailySeriesOptions = {},
): DailyPoint[] {
  const closed = options.closedWeekdays ?? DEFAULT_CLOSED_WEEKDAYS;
  let target = filterByMonth(records, monthKey);
  if (options.category) target = filterByCategory(target, options.category);
  if (options.memberName) target = target.filter((r) => r.member === options.memberName);

  const byDate = target.reduce<Record<string, number>>((acc, r) => {
    acc[r.date] = (acc[r.date] ?? 0) + num(r.gross);
    return acc;
  }, {});

  let running = 0;
  return listDatesInMonth(monthKey).map((date) => {
    const gross = byDate[date] ?? 0;
    running += gross;
    const weekday = getWeekdayIndex(date);
    return {
      date,
      day: Number(date.slice(8, 10)),
      weekday,
      closed: closed.includes(weekday),
      gross,
      cumulative: running,
    };
  });
}

/* ------------------------------------------------------------ 構成比（ドーナツ） */

export interface MixSegment {
  key: string;
  label: string;
  value: number;
}

/** 決済内訳（現金・クレカ・電子マネー・QR） */
export function buildPaymentMix(records: SaleRecord[]): MixSegment[] {
  const total = (pick: (r: SaleRecord) => number) => records.reduce((a, r) => a + num(pick(r)), 0);

  return [
    { key: 'cash', label: '現金', value: total((r) => r.cash) },
    { key: 'credit', label: 'クレカ', value: total((r) => r.credit) },
    { key: 'emoney', label: '電子マネー', value: total((r) => r.emoney) },
    { key: 'qr', label: 'QR', value: total((r) => r.qr) },
  ];
}

/** BARROOTS（店舗運営(BAR)）の当月決済内訳 */
export function buildBarPaymentMix(records: SaleRecord[], monthKey: string): MixSegment[] {
  return buildPaymentMix(filterByCategory(filterByMonth(records, monthKey), BAR_CATEGORY));
}

/** 事業部別の売上構成 */
export function buildDeptMix(rows: DeptPlRow[]): MixSegment[] {
  return rows
    .filter((r) => r.grossSales > 0)
    .map((r) => ({ key: r.deptId, label: r.deptLabel, value: r.grossSales }));
}

/** カテゴリ別の売上構成（上位 5 件 ＋ その他） */
export function buildCategoryMix(records: SaleRecord[], limit = 5): MixSegment[] {
  const totals = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + num(r.gross);
    return acc;
  }, {});

  const sorted = Object.entries(totals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const head = sorted.slice(0, limit).map(([key, value]) => ({ key, label: key, value }));
  const tail = sorted.slice(limit).reduce((a, [, v]) => a + v, 0);

  return tail > 0 ? [...head, { key: '__other', label: 'その他', value: tail }] : head;
}

/* ------------------------------------------------------------ 個人の月次推移 */

export interface MemberTrendPoint {
  month: string;
  label: string;
  /** 本人担当の額面売上 */
  personalGross: number;
  /** 本人担当の実質PL売上 */
  personalEffective: number;
}

/** 担当者名で絞った月次推移 */
export function buildMemberTrend(
  records: SaleRecord[],
  monthKeys: string[],
  memberName: string,
): MemberTrendPoint[] {
  const mine = records.filter((r) => r.member === memberName);
  return monthKeys.map((month) => {
    const monthly = filterByMonth(mine, month);
    return {
      month,
      label: monthAxisLabel(month),
      personalGross: sumGross(monthly),
      personalEffective: sumEffective(monthly),
    };
  });
}

/**
 * 未到来の月を落とす。
 *
 * 通期 12 ヶ月をそのまま描くと、売上ゼロの先月分も「固定費だけ引かれた大きな赤字」
 * として推移グラフに出てしまい、実績の推移が読めなくなる。当月までで切る。
 */
export function trimToElapsedMonths<T extends { month: string }>(
  points: T[],
  currentMonth: string,
): T[] {
  return points.filter((p) => p.month <= currentMonth);
}

/** 目盛の刻み幅を「切りのいい数」に丸める（1・2・2.5・5 × 10^n） */
export function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** 値域から目盛の配列を作る。0 を必ず含める */
export function buildTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0];

  const step = niceStep((hi - lo) / count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;

  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}
