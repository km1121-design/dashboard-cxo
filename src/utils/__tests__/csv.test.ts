/**
 * CSV 出力のテスト（Excel で開く前提のエスケープと CRLF を確認する）。
 */
import { BAR_CATEGORY } from '@/constants/master';
import type { MonthlySummary, SaleRecord, TotalSummary } from '@/types';
import {
  calcMemberAnnual,
  calcMemberMonthly,
  calcMonthlySummary,
  calcTotalSummary,
} from '@/utils/calculator';
import {
  buildAnnualCsv,
  buildDeptPlCsv,
  buildMemberAnnualCsv,
  buildMemberPayoutCsv,
  buildPayoutCsv,
  escapeCsvCell,
  toCsv,
} from '@/utils/csv';

function sale(partial: Partial<SaleRecord>): SaleRecord {
  return {
    id: 'DS1',
    date: '2026-08-12',
    dept: 'イベント営業',
    category: BAR_CATEGORY,
    member: '入舩 雄志',
    gross: 0,
    plRate: 1.0,
    cash: 0,
    credit: 0,
    emoney: 0,
    qr: 0,
    groups: 0,
    totalCustomers: 0,
    newCustomers: 0,
    existingCustomers: 0,
    comment: '',
    ...partial,
  };
}

const records = [sale({ date: '2026-08-05', gross: 1_500_000, comment: '通常営業' })];
const summary: MonthlySummary = calcMonthlySummary(records, '2026-08');
const total: TotalSummary = calcTotalSummary(records, {}, '2026-08');

describe('escapeCsvCell', () => {
  it('普通の値はそのまま', () => {
    expect(escapeCsvCell('入舩 雄志')).toBe('入舩 雄志');
    expect(escapeCsvCell(1234)).toBe('1234');
  });

  it('カンマ・引用符・改行を含む値は囲んでエスケープする', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('toCsv', () => {
  it('行は CRLF で区切る', () => {
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('a,b\r\n1,2');
  });
});

describe('buildPayoutCsv', () => {
  const csv = buildPayoutCsv(summary);
  const lines = csv.split('\r\n');

  it('見出し行を持つ', () => {
    expect(lines[0]).toBe('月,メンバーID,氏名,事業部,区分,項目,金額,備考');
  });

  it('メンバー3名分の基本給・合計・プール行が出る', () => {
    expect(csv.match(/基本給 \/ 固定報酬/g)).toHaveLength(3);
    expect(csv.match(/当月振込見立て/g)).toHaveLength(3);
    expect(csv.match(/半年プール積立/g)).toHaveLength(3);
  });

  it('営業利益100万超なので入舩氏のBAR10%が金額として入る', () => {
    expect(csv).toContain('BAR売上10%吐き出し,150000');
  });

  it('備考のカンマはエスケープされる（列がずれない）', () => {
    for (const line of lines) {
      // 引用符で囲まれていない部分のカンマ数 = 列数 − 1
      if (line.includes('"')) continue;
      expect(line.split(',')).toHaveLength(8);
    }
  });
});

describe('buildMemberPayoutCsv', () => {
  it('本人 1 名分だけを書き出す', () => {
    const result = calcMemberMonthly(records, '2026-08', 'M001');
    const csv = buildMemberPayoutCsv(result);

    expect(csv).toContain('入舩 雄志');
    expect(csv).not.toContain('中原 聖人');
    expect(csv.match(/基本給 \/ 固定報酬/g)).toHaveLength(1);
  });
});

describe('buildDeptPlCsv', () => {
  it('事業部 4 行＋見出しを書き出す', () => {
    const lines = buildDeptPlCsv(summary).split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('イベント営業');
  });
});

describe('buildAnnualCsv', () => {
  it('年収シミュレーションを 3 名分書き出す', () => {
    const lines = buildAnnualCsv(total).split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('想定年収');
  });
});

describe('buildMemberAnnualCsv', () => {
  it('12ヶ月＋見出し＋通期行になる', () => {
    const annual = calcMemberAnnual(records, 'M001', {}, '2026-08');
    const lines = buildMemberAnnualCsv(annual).split('\r\n');

    expect(lines).toHaveLength(14);
    expect(lines[13]).toContain('通期');
  });
});
