/**
 * 月次入力フックのうち、純粋な部分のテスト。
 * （React の描画を伴う部分はここでは扱わない）
 */
import { emptyDeptInput, upsertRow } from '@/hooks/useMonthlyInputs';
import type { DeptInputRecord } from '@/types';

describe('emptyDeptInput', () => {
  it('事業部の表示名を入れた空の行を作る', () => {
    expect(emptyDeptInput('2026-08', 'event')).toEqual({
      month: '2026-08',
      dept: 'イベント営業',
      directExpense: 0,
      headcount: 0,
      placementAd: 0,
      placementReferral: 0,
      personalDirectExpense: 0,
      salesTarget: 0,
      salesBudget: 0,
      profitBudget: 0,
    });
  });

  it('事業部ごとに表示名が変わる', () => {
    expect(emptyDeptInput('2026-08', 'hr').dept).toBe('人材');
    expect(emptyDeptInput('2026-08', 'logistics').dept).toBe('物流・バックヤード');
  });
});

describe('upsertRow', () => {
  const base: DeptInputRecord = emptyDeptInput('2026-08', 'event');

  it('無ければ追加する', () => {
    expect(upsertRow([], base)).toEqual([base]);
  });

  it('同じ月・同じ事業部なら差し替える', () => {
    const updated = { ...base, directExpense: 500 };
    const rows = upsertRow([base], updated);

    expect(rows).toHaveLength(1);
    expect(rows[0].directExpense).toBe(500);
  });

  it('月が違えば別の行になる', () => {
    const other = emptyDeptInput('2026-09', 'event');
    expect(upsertRow([base], other)).toHaveLength(2);
  });

  it('事業部が違えば別の行になる', () => {
    const other = emptyDeptInput('2026-08', 'hr');
    expect(upsertRow([base], other)).toHaveLength(2);
  });

  it('元の配列を書き換えない', () => {
    const rows = [base];
    upsertRow(rows, { ...base, directExpense: 999 });
    expect(rows[0].directExpense).toBe(0);
  });
});
