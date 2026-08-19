/**
 * グラフ用系列組み立てのテスト。
 */
import { BAR_CATEGORY } from '@/constants/master';
import type { SaleRecord } from '@/types';
import { getWeekdayIndex } from '@/utils/date';
import {
  buildCategoryMix,
  buildDailySeries,
  buildDeptMix,
  buildMemberTrend,
  buildMonthlyTrend,
  buildPaymentMix,
  buildTicks,
  monthAxisLabel,
  niceStep,
  trimToElapsedMonths,
} from '@/utils/series';

function sale(partial: Partial<SaleRecord>): SaleRecord {
  return {
    id: 'DS1',
    date: '2026-08-12',
    dept: 'イベント営業',
    category: 'イベント',
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

describe('monthAxisLabel', () => {
  it('YYYY-MM を「8月」にする', () => {
    expect(monthAxisLabel('2026-08')).toBe('8月');
    expect(monthAxisLabel('2025-12')).toBe('12月');
  });

  it('壊れた値はそのまま返す', () => {
    expect(monthAxisLabel('----')).toBe('----');
  });
});

describe('buildDailySeries', () => {
  const records = [
    sale({ id: 'A', date: '2026-08-03', gross: 10_000 }),
    sale({ id: 'B', date: '2026-08-03', gross: 5_000 }),
    sale({ id: 'C', date: '2026-08-10', gross: 20_000 }),
    sale({ id: 'D', date: '2026-07-31', gross: 999_999 }),
  ];

  it('月の全日を並べ、売上のない日も 0 で埋める', () => {
    const points = buildDailySeries(records, '2026-08');
    expect(points).toHaveLength(31);
    expect(points[0].gross).toBe(0);
  });

  it('同じ日の複数行は合算する', () => {
    const points = buildDailySeries(records, '2026-08');
    expect(points.find((p) => p.date === '2026-08-03')?.gross).toBe(15_000);
  });

  it('累計は月初からの積み上げ', () => {
    const points = buildDailySeries(records, '2026-08');
    expect(points.find((p) => p.date === '2026-08-10')?.cumulative).toBe(35_000);
    expect(points[30].cumulative).toBe(35_000);
  });

  it('他の月の行は混ぜない', () => {
    const points = buildDailySeries(records, '2026-08');
    expect(points.reduce((a, p) => a + p.gross, 0)).toBe(35_000);
  });

  it('日曜を定休日として印を付ける', () => {
    const points = buildDailySeries(records, '2026-08');
    for (const p of points) {
      expect(p.closed).toBe(getWeekdayIndex(p.date) === 0);
    }
  });

  it('カテゴリと担当者で絞れる', () => {
    const mixed = [
      sale({ id: 'A', date: '2026-08-03', category: BAR_CATEGORY, gross: 10_000 }),
      sale({ id: 'B', date: '2026-08-04', category: 'イベント', gross: 7_000 }),
      sale({ id: 'C', date: '2026-08-05', member: '中原 聖人', gross: 3_000 }),
    ];

    const bar = buildDailySeries(mixed, '2026-08', { category: BAR_CATEGORY });
    expect(bar.reduce((a, p) => a + p.gross, 0)).toBe(10_000);

    const mine = buildDailySeries(mixed, '2026-08', { memberName: '入舩 雄志' });
    expect(mine.reduce((a, p) => a + p.gross, 0)).toBe(17_000);
  });
});

describe('buildPaymentMix', () => {
  it('決済手段ごとに合算する', () => {
    const mix = buildPaymentMix([
      sale({ cash: 1_000, credit: 2_000, emoney: 300, qr: 700 }),
      sale({ cash: 500 }),
    ]);

    expect(mix.map((m) => [m.key, m.value])).toEqual([
      ['cash', 1_500],
      ['credit', 2_000],
      ['emoney', 300],
      ['qr', 700],
    ]);
  });
});

describe('buildCategoryMix', () => {
  it('金額の多い順に並べ、上限を超えた分は「その他」にまとめる', () => {
    const records = [
      sale({ category: 'A', gross: 100 }),
      sale({ category: 'B', gross: 300 }),
      sale({ category: 'C', gross: 200 }),
      sale({ category: 'D', gross: 50 }),
    ];

    const mix = buildCategoryMix(records, 2);
    expect(mix.map((m) => m.label)).toEqual(['B', 'C', 'その他']);
    expect(mix[2].value).toBe(150);
  });

  it('上限内なら「その他」は付けない', () => {
    const mix = buildCategoryMix([sale({ category: 'A', gross: 100 })], 5);
    expect(mix).toHaveLength(1);
  });

  it('売上 0 のカテゴリは含めない', () => {
    const mix = buildCategoryMix([sale({ category: 'A', gross: 0 })]);
    expect(mix).toHaveLength(0);
  });
});

describe('buildDeptMix', () => {
  it('売上のある事業部だけを返す', () => {
    const mix = buildDeptMix([
      {
        deptId: 'event',
        deptLabel: 'イベント営業',
        grossSales: 100,
        effectiveSales: 100,
        expense: 0,
        laborCost: 0,
        operatingProfit: 0,
        achievementRate: 0,
      },
      {
        deptId: 'hq',
        deptLabel: '本部',
        grossSales: 0,
        effectiveSales: 0,
        expense: 0,
        laborCost: 0,
        operatingProfit: 0,
        achievementRate: 0,
      },
    ]);

    expect(mix.map((m) => m.key)).toEqual(['event']);
  });
});

describe('buildMonthlyTrend / buildMemberTrend', () => {
  it('月次サマリを推移点に写す', () => {
    const points = buildMonthlyTrend([
      {
        month: '2026-08',
        grossSales: 100,
        effectiveSales: 90,
        operatingProfit: -10,
        deptRows: [],
        payouts: [],
        bonusPoolAccrual: 0,
      },
    ]);

    expect(points).toEqual([
      { month: '2026-08', label: '8月', grossSales: 100, effectiveSales: 90, operatingProfit: -10 },
    ]);
  });

  it('担当者で絞った月次推移を作る', () => {
    const records = [
      sale({ date: '2026-08-01', gross: 100 }),
      sale({ date: '2026-09-01', gross: 200, category: '転職支援', plRate: 0.5 }),
      sale({ date: '2026-09-02', gross: 999, member: '中原 聖人' }),
    ];

    const points = buildMemberTrend(records, ['2026-08', '2026-09'], '入舩 雄志');
    expect(points[0].personalGross).toBe(100);
    expect(points[1].personalGross).toBe(200);
    // 転職支援は 50% 計上
    expect(points[1].personalEffective).toBe(100);
  });
});

describe('trimToElapsedMonths', () => {
  it('当月より後の月を落とす', () => {
    const points = [{ month: '2026-07' }, { month: '2026-08' }, { month: '2026-09' }];
    expect(trimToElapsedMonths(points, '2026-08')).toEqual([{ month: '2026-07' }, { month: '2026-08' }]);
  });
});

describe('niceStep / buildTicks', () => {
  it('刻みを切りのいい数に丸める', () => {
    expect(niceStep(7)).toBe(10);
    expect(niceStep(1.4)).toBe(2);
    expect(niceStep(230_000)).toBe(250_000);
    expect(niceStep(0)).toBe(1);
  });

  it('0 を必ず含み昇順で返す', () => {
    const ticks = buildTicks(0, 1_000_000);
    expect(ticks).toContain(0);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(1_000_000);
  });

  it('マイナス側にも目盛を伸ばす', () => {
    const ticks = buildTicks(-340_000, 500_000);
    expect(Math.min(...ticks)).toBeLessThanOrEqual(-340_000);
    expect(ticks).toContain(0);
  });

  it('値が無い場合も 0 を返して壊れない', () => {
    expect(buildTicks(0, 0)).toEqual([0]);
  });
});
