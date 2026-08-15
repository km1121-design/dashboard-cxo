/**
 * LINE 転送フォーマットのテスト。
 * 指示書 6章に記載されたサンプル出力と 1 文字単位で一致することを確認する。
 */
import type { DailyReportInput } from '@/types';
import { buildLineReportText, buildLineShareUrl } from '@/utils/lineFormat';

/** 指示書 6章のサンプル入力 */
const SAMPLE_INPUT: DailyReportInput = {
  date: '2026-08-12',
  member: '入舩 雄志',
  monthlyTarget: 360_000,
  cash: 15_000,
  credit: 0,
  emoney: 0,
  qr: 0,
  groups: 4,
  newCustomers: 8,
  existingCustomers: 0,
  remainingBusinessDays: 17,
  comment:
    '急遽オープンの為準備何もしていなかったが、持ち前のカウンタースキルで皆を笑顔に出来きました✨️',
};

/** 指示書 6章のサンプル出力（そのまま） */
const SAMPLE_OUTPUT = [
  '日付  8/12（水）',
  '月目標 360,000円',
  '当日売り上げ  15,000円',
  '内訳',
  '└現金  15,000円',
  '└クレカ 0円',
  '└電子マネー 0円',
  '└QR  0円',
  '来客数  4組  8名',
  '内訳',
  '└新規  8名',
  '└既存  0名',
  '当月累計売上  15,000円',
  '残営業日 17日',
  '1日必達  20,300円',
  '新規累計  8名',
  '『総評』',
  '急遽オープンの為準備何もしていなかったが、持ち前のカウンタースキルで皆を笑顔に出来きました✨️',
].join('\n');

describe('buildLineReportText（指示書 6章）', () => {
  it('指示書のサンプル出力と完全一致する', () => {
    const text = buildLineReportText(SAMPLE_INPUT);
    expect(text).toBe(SAMPLE_OUTPUT);
  });

  it('日付は M/D（曜）形式・全角括弧', () => {
    const text = buildLineReportText(SAMPLE_INPUT);
    expect(text.split('\n')[0]).toBe('日付  8/12（水）');
  });

  it('金額は 3 桁区切り + 「円」', () => {
    const text = buildLineReportText({ ...SAMPLE_INPUT, cash: 1_234_567 });
    expect(text).toContain('└現金  1,234,567円');
  });

  it('決済内訳の合計が当日売り上げになる', () => {
    const text = buildLineReportText({
      ...SAMPLE_INPUT,
      cash: 10_000,
      credit: 5_000,
      emoney: 3_000,
      qr: 2_000,
    });
    expect(text).toContain('当日売り上げ  20,000円');
  });

  it('来客数は 組数 + 総客数（新規 + 既存）', () => {
    const text = buildLineReportText({
      ...SAMPLE_INPUT,
      groups: 7,
      newCustomers: 5,
      existingCustomers: 9,
    });
    expect(text).toContain('来客数  7組  14名');
    expect(text).toContain('└新規  5名');
    expect(text).toContain('└既存  9名');
  });

  it('前日までの累計を反映して当月累計・新規累計・1日必達を出す', () => {
    const text = buildLineReportText(SAMPLE_INPUT, {
      cumulativeSales: 200_000,
      cumulativeNewCustomers: 40,
    });
    // 累計 200,000 + 15,000 = 215,000 / 残 (360,000 − 215,000) ÷ 17 = 8,529.4… → 8,600
    expect(text).toContain('当月累計売上  215,000円');
    expect(text).toContain('新規累計  48名');
    expect(text).toContain('1日必達  8,600円');
  });

  it('月目標を達成済みなら 1日必達は 0円', () => {
    const text = buildLineReportText(SAMPLE_INPUT, {
      cumulativeSales: 400_000,
      cumulativeNewCustomers: 0,
    });
    expect(text).toContain('1日必達  0円');
  });

  it('総評が空でも『総評』行は残る', () => {
    const text = buildLineReportText({ ...SAMPLE_INPUT, comment: '' });
    const lines = text.split('\n');
    expect(lines[lines.length - 2]).toBe('『総評』');
    expect(lines[lines.length - 1]).toBe('');
  });

  it('行数はサンプルと同じ 18 行', () => {
    expect(buildLineReportText(SAMPLE_INPUT).split('\n')).toHaveLength(18);
  });
});

describe('buildLineShareUrl', () => {
  it('LINE 共有スキームにテキストを URL エンコードして載せる', () => {
    const url = buildLineShareUrl('日付  8/12（水）\n月目標 360,000円');
    expect(url.startsWith('https://line.me/R/msg/text/?')).toBe(true);
    expect(decodeURIComponent(url.split('?')[1])).toBe('日付  8/12（水）\n月目標 360,000円');
  });
});
