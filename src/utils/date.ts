/**
 * 日付ユーティリティ。
 * `YYYY-MM-DD` 文字列を扱う際は必ず UTC で組み立て／取り出しし、
 * 実行環境のタイムゾーンで日付がずれないようにしている。
 */

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** `YYYY-MM-DD` → UTC 基準の Date */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Date → `YYYY-MM-DD`（UTC 基準） */
export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` → `YYYY-MM` */
export function toMonthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** 曜日番号（0=日 … 6=土、UTC 基準） */
export function getWeekdayIndex(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

/** 曜日の日本語 1 文字 */
export function getWeekdayJa(iso: string): string {
  return WEEKDAY_JA[getWeekdayIndex(iso)];
}

/**
 * 指示書 6章 のヘッダ表記 `8/12（水）` を生成する。
 * 月日は 0 埋めせず、括弧は全角。
 */
export function formatReportDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${getWeekdayJa(iso)}）`;
}

/** その月の日数 */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `YYYY-MM` の全日付を `YYYY-MM-DD` で列挙 */
export function listDatesInMonth(monthKey: string): string[] {
  const total = daysInMonth(monthKey);
  return Array.from({ length: total }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
}

/** 定休日の既定値：日曜（0） */
export const DEFAULT_CLOSED_WEEKDAYS: readonly number[] = [0];

export interface BusinessDayOptions {
  /** 定休日の曜日番号（0=日 … 6=土）。既定は日曜のみ */
  closedWeekdays?: readonly number[];
}

/** 月内の営業日数 */
export function countBusinessDaysInMonth(monthKey: string, options: BusinessDayOptions = {}): number {
  const closed = options.closedWeekdays ?? DEFAULT_CLOSED_WEEKDAYS;
  return listDatesInMonth(monthKey).filter((d) => !closed.includes(getWeekdayIndex(d))).length;
}

export interface RemainingBusinessDayOptions extends BusinessDayOptions {
  /**
   * 当日を残営業日に含めるか。
   * 指示書 6章のサンプル（8/12（水）→ 残営業日 17日）は当日を含めた数え方と一致するため、
   * 日報モーダルの初期値は `true` で算出する。
   */
  includeSelf?: boolean;
}

/** 指定日から月末までの残営業日数 */
export function countRemainingBusinessDays(
  iso: string,
  options: RemainingBusinessDayOptions = {},
): number {
  const closed = options.closedWeekdays ?? DEFAULT_CLOSED_WEEKDAYS;
  const includeSelf = options.includeSelf ?? false;
  const monthKey = toMonthKey(iso);
  return listDatesInMonth(monthKey)
    .filter((d) => (includeSelf ? d >= iso : d > iso))
    .filter((d) => !closed.includes(getWeekdayIndex(d))).length;
}

/** 月初からその日までの経過営業日数（当日を含む） */
export function countElapsedBusinessDays(iso: string, options: BusinessDayOptions = {}): number {
  const closed = options.closedWeekdays ?? DEFAULT_CLOSED_WEEKDAYS;
  return listDatesInMonth(toMonthKey(iso))
    .filter((d) => d <= iso)
    .filter((d) => !closed.includes(getWeekdayIndex(d))).length;
}

/** 期首月から 12 ヶ月分の `YYYY-MM` を列挙（第5期 通期） */
export function listFiscalMonths(startMonth: string, count = 12): string[] {
  const [y, m] = startMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
