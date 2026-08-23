/**
 * CSV 出力（支給明細・年収シミュレーション・事業部PL）。
 *
 * 生成は純関数、ダウンロードだけが DOM に触る。
 * Excel で開いたときに文字化けしないよう、書き出し時に UTF-8 BOM を付ける。
 */
import { DEPT_BY_ID } from '@/constants/master';
import type { MonthlySummary, TotalSummary } from '@/types';
import type { MemberAnnualResult, MemberMonthlyResult } from '@/utils/calculator';

export type CsvValue = string | number;

/** 1 セルをエスケープする。カンマ・引用符・改行を含む値は `"` で囲む */
export function escapeCsvCell(value: CsvValue): string {
  const s = typeof value === 'number' ? String(value) : value;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 行の配列を CSV 文字列にする。改行は Excel に合わせて CRLF */
export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/* ---------------------------------------------------------------- 支給明細 */

const PAYOUT_HEADER = [
  '月',
  'メンバーID',
  '氏名',
  '事業部',
  '区分',
  '項目',
  '金額',
  '備考',
] as const;

/**
 * 月次の支給明細。1 行 = 1 支給項目。
 * 各メンバーごとに「基本給 → 内訳 → プール積立 → 当月振込見立て（合計）」の順に並べる。
 */
export function buildPayoutCsv(summary: MonthlySummary): string {
  const rows: CsvValue[][] = [[...PAYOUT_HEADER]];

  for (const p of summary.payouts) {
    const dept = DEPT_BY_ID[p.deptId]?.label ?? p.deptId;
    const head = [summary.month, p.memberId, p.memberName, dept];

    rows.push([...head, '基本給', '基本給 / 固定報酬', p.baseSalary, '']);

    for (const line of p.breakdown) {
      rows.push([...head, 'インセンティブ', line.label, line.amount, line.note ?? '']);
    }

    rows.push([
      ...head,
      '合計',
      '当月振込見立て',
      p.totalPayout,
      '基本給＋当月インセンティブ',
    ]);

    rows.push([
      ...head,
      'プール積立',
      '半年プール積立（当月分）',
      p.bonusPoolAccrual,
      '当月は振り込まれない積立額',
    ]);
  }

  return toCsv(rows);
}

/** 個人ビュー用。自分の分だけを同じ列構成で書き出す */
export function buildMemberPayoutCsv(result: MemberMonthlyResult): string {
  const rows: CsvValue[][] = [[...PAYOUT_HEADER]];
  const p = result.payout;
  if (!p) return toCsv(rows);

  const head = [result.month, p.memberId, p.memberName, result.deptLabel];

  rows.push([...head, '基本給', '基本給 / 固定報酬', p.baseSalary, '']);
  for (const line of p.breakdown) {
    rows.push([...head, 'インセンティブ', line.label, line.amount, line.note ?? '']);
  }
  rows.push([...head, '合計', '当月振込見立て', p.totalPayout, '基本給＋当月インセンティブ']);
  rows.push([
    ...head,
    'プール積立',
    '半年プール積立（当月分）',
    p.bonusPoolAccrual,
    '当月は振り込まれない積立額',
  ]);

  return toCsv(rows);
}

/* ------------------------------------------------------------ 事業部PL */

export function buildDeptPlCsv(summary: MonthlySummary): string {
  const rows: CsvValue[][] = [
    [
      '月', '事業部', '額面売上', '実質PL売上', '経費', '人件費', '営業利益',
      '目標達成率', '売上計画', '営業利益計画', '予実差異',
    ],
  ];

  for (const r of summary.deptRows) {
    rows.push([
      summary.month,
      r.deptLabel,
      r.grossSales,
      r.effectiveSales,
      r.expense,
      r.laborCost,
      r.operatingProfit,
      r.achievementRate > 0 ? r.achievementRate.toFixed(4) : '',
      r.salesBudget,
      r.profitBudget,
      r.hasBudget ? r.profitVariance : '',
    ]);
  }

  return toCsv(rows);
}

/* ------------------------------------------------ 年収シミュレーション */

export function buildAnnualCsv(total: TotalSummary): string {
  const rows: CsvValue[][] = [
    ['期首月', 'メンバーID', '氏名', '基本給 年間', 'インセンティブ 年間', 'プール積立 年間', '想定年収'],
  ];

  for (const m of total.annualByMember) {
    rows.push([
      total.fiscalStartMonth,
      m.memberId,
      m.memberName,
      m.annualBase,
      m.annualIncentive,
      m.annualBonusPool,
      m.annualTotal,
    ]);
  }

  return toCsv(rows);
}

/** 個人ビュー用。自分の月別内訳を 12 行で書き出す */
export function buildMemberAnnualCsv(annual: MemberAnnualResult): string {
  const rows: CsvValue[][] = [
    ['月', '氏名', '担当売上（額面）', '事業部営業利益', '基本給', 'インセンティブ', 'プール積立', '当月振込見立て'],
  ];

  for (const m of annual.months) {
    const incentive = (m.payout?.breakdown ?? []).reduce((a, l) => a + l.amount, 0);
    rows.push([
      m.month,
      m.memberName,
      m.personalGross,
      m.deptOperatingProfit,
      m.payout?.baseSalary ?? 0,
      incentive,
      m.payout?.bonusPoolAccrual ?? 0,
      m.payout?.totalPayout ?? 0,
    ]);
  }

  rows.push([
    '通期',
    annual.memberName,
    annual.personalGrossTotal,
    '',
    annual.annualBase,
    annual.annualIncentive,
    annual.annualBonusPool,
    annual.annualBase + annual.annualIncentive,
  ]);

  return toCsv(rows);
}

/* ---------------------------------------------------------------- 書き出し */

/** UTF-8 BOM。付けないと Excel が Shift_JIS と誤認して文字化けする */
const BOM = '﻿';

/** CSV をファイルとしてダウンロードさせる */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
