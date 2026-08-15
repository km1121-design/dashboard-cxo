/**
 * BARROOTS 店舗日報 LINE 転送フォーマット生成（引き継ぎ指示書 6章）
 *
 * 指示書に記載されたサンプルと 1 文字単位で一致する出力を作る。
 * 空白の数・全角括弧・`└` の位置・『総評』の改行位置はサンプル準拠のため変更しないこと。
 *
 *   日付  8/12（水）
 *   月目標 360,000円
 *   当日売り上げ  15,000円
 *   内訳
 *   └現金  15,000円
 *   └クレカ 0円
 *   └電子マネー 0円
 *   └QR  0円
 *   来客数  4組  8名
 *   内訳
 *   └新規  8名
 *   └既存  0名
 *   当月累計売上  15,000円
 *   残営業日 17日
 *   1日必達  20,300円
 *   新規累計  8名
 *   『総評』
 *   （コメント本文）
 */
import type { DailyReportCarryOver, DailyReportComputed, DailyReportInput } from '@/types';
import { calcDailyReport } from '@/utils/calculator';
import { formatReportDate } from '@/utils/date';
import { formatYenSuffix } from '@/utils/format';

/**
 * LINE 転送テキストを生成する。
 *
 * @param input     日報の入力値
 * @param carryOver 前日までの累計（売上・新規人数）
 * @param computed  事前に計算済みの値。省略時は `calcDailyReport` で算出する。
 */
export function buildLineReportText(
  input: DailyReportInput,
  carryOver: DailyReportCarryOver = { cumulativeSales: 0, cumulativeNewCustomers: 0 },
  computed: DailyReportComputed = calcDailyReport(input, carryOver),
): string {
  const lines = [
    `日付  ${formatReportDate(input.date)}`,
    `月目標 ${formatYenSuffix(input.monthlyTarget)}`,
    `当日売り上げ  ${formatYenSuffix(computed.dailySales)}`,
    '内訳',
    `└現金  ${formatYenSuffix(input.cash)}`,
    `└クレカ ${formatYenSuffix(input.credit)}`,
    `└電子マネー ${formatYenSuffix(input.emoney)}`,
    `└QR  ${formatYenSuffix(input.qr)}`,
    `来客数  ${input.groups}組  ${computed.totalCustomers}名`,
    '内訳',
    `└新規  ${input.newCustomers}名`,
    `└既存  ${input.existingCustomers}名`,
    `当月累計売上  ${formatYenSuffix(computed.monthCumulative)}`,
    `残営業日 ${input.remainingBusinessDays}日`,
    `1日必達  ${formatYenSuffix(computed.dailyRequired)}`,
    `新規累計  ${computed.newCustomersCumulative}名`,
    '『総評』',
    input.comment,
  ];

  return lines.join('\n');
}

/** LINE アプリの共有リンク（テキストを URL エンコードして渡す） */
export function buildLineShareUrl(text: string): string {
  return `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
}
