/**
 * 計算エンジンのテスト（引き継ぎ指示書 5章／6章 の数式・数値をそのまま検証）
 */
import { BAR_CATEGORY, FISCAL_START_MONTH, RULES } from '@/constants/master';
import type { DailyReportInput, SaleRecord } from '@/types';
import {
  buildCarryOver,
  buildEventMemberPayout,
  buildHrMemberPayout,
  buildLogisticsMemberPayout,
  calcBarSales,
  calcCrossSellIncentive,
  calcDailyProgress,
  calcDailyReport,
  calcDailyRequired,
  calcDailySales,
  calcEventBonusPool,
  calcEventDept,
  calcEventPayoutIncentive,
  calcHrDept,
  calcLogisticsDept,
  calcMemberAnnual,
  calcMemberMonthly,
  calcMonthlySummary,
  calcPlacementAllowance,
  calcTieredPool,
  calcTotalSummary,
  ceilTo,
  effectiveAmount,
  filterByDept,
  resolvePlRate,
  sumEffective,
  sumGross,
} from '@/utils/calculator';

/* ------------------------------------------------------------- テストデータ */

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

/* ============================================================================
 * 5.1 実質PL売上（転職支援は 50% 計上）
 * ========================================================================== */

describe('PL計上率（指示書 5.1）', () => {
  it('転職支援は 0.5、その他カテゴリは 1.0', () => {
    expect(resolvePlRate('転職支援')).toBe(0.5);
    expect(resolvePlRate('イベント')).toBe(1.0);
    expect(resolvePlRate(BAR_CATEGORY)).toBe(1.0);
    expect(resolvePlRate('')).toBe(1.0);
  });

  it('転職支援の売上は 50% だけ実質売上に計上される', () => {
    const record = sale({ category: '転職支援', gross: 1_000_000, plRate: 0.5 });
    expect(effectiveAmount(record)).toBe(500_000);
  });

  it('シートの plRate が空（0）でもカテゴリから率を導出する', () => {
    const record = sale({ category: '転職支援', gross: 800_000, plRate: 0 });
    expect(effectiveAmount(record)).toBe(400_000);
  });

  it('額面合計と実質合計を区別して集計する', () => {
    const records = [
      sale({ category: 'イベント', gross: 2_000_000 }),
      sale({ category: '転職支援', gross: 1_000_000, plRate: 0.5 }),
    ];
    expect(sumGross(records)).toBe(3_000_000);
    expect(sumEffective(records)).toBe(2_500_000);
  });
});

/* ============================================================================
 * 5.1 イベント営業事業部
 * ========================================================================== */

describe('イベント営業事業部（指示書 5.1）', () => {
  it('営業利益 = 実質売上 − 経費 − 基本給(32万) − 三田氏保守管理費(2万)', () => {
    const records = [sale({ category: 'イベント', gross: 3_000_000 })];
    const result = calcEventDept(records, { directExpense: 1_000_000 });

    // 3,000,000 − 1,000,000 − 320,000 − 20,000 = 1,660,000
    expect(result.effectiveSales).toBe(3_000_000);
    expect(result.baseSalary).toBe(320_000);
    expect(result.maintenanceFee).toBe(20_000);
    expect(result.operatingProfit).toBe(1_660_000);
  });

  it('転職支援を含む場合は 50% 計上後の実質売上で営業利益を出す', () => {
    const records = [
      sale({ category: 'イベント', gross: 1_000_000 }),
      sale({ category: '転職支援', gross: 2_000_000, plRate: 0.5 }),
    ];
    const result = calcEventDept(records, { directExpense: 0 });

    // 実質売上 1,000,000 + 1,000,000 = 2,000,000
    expect(result.grossSales).toBe(3_000_000);
    expect(result.effectiveSales).toBe(2_000_000);
    expect(result.operatingProfit).toBe(2_000_000 - 320_000 - 20_000);
  });

  describe('当月吐き出しインセンティブ', () => {
    it('営業利益 100万円以上で BAR売上の 10%', () => {
      expect(calcEventPayoutIncentive(1_000_000, 1_500_000)).toBe(150_000);
      expect(calcEventPayoutIncentive(2_500_000, 800_000)).toBe(80_000);
    });

    it('営業利益 100万円未満は 0 円', () => {
      expect(calcEventPayoutIncentive(999_999, 1_500_000)).toBe(0);
      expect(calcEventPayoutIncentive(0, 1_500_000)).toBe(0);
      expect(calcEventPayoutIncentive(-500_000, 1_500_000)).toBe(0);
    });

    it('閾値はちょうど 1,000,000 円で発動する（境界）', () => {
      expect(RULES.payoutProfitThreshold).toBe(1_000_000);
      expect(calcEventPayoutIncentive(1_000_000, 100_000)).toBe(10_000);
      expect(calcEventPayoutIncentive(999_999, 100_000)).toBe(0);
    });

    it('BAR売上は「店舗運営(BAR)」カテゴリの額面合計', () => {
      const records = [
        sale({ category: BAR_CATEGORY, gross: 300_000 }),
        sale({ category: BAR_CATEGORY, gross: 200_000 }),
        sale({ category: 'イベント', gross: 900_000 }),
      ];
      expect(calcBarSales(records)).toBe(500_000);
    });

    it('事業部計算に BAR売上の 10% が反映される', () => {
      const records = [
        sale({ category: 'イベント', gross: 2_000_000 }),
        sale({ category: BAR_CATEGORY, gross: 500_000 }),
      ];
      const result = calcEventDept(records, { directExpense: 0 });

      // 営業利益 2,500,000 − 320,000 − 20,000 = 2,160,000 ≧ 100万 → 発動
      expect(result.operatingProfit).toBe(2_160_000);
      expect(result.payoutUnlocked).toBe(true);
      expect(result.barSales).toBe(500_000);
      expect(result.payoutIncentive).toBe(50_000);
    });

    it('利益未達なら BAR売上があっても吐き出しは 0', () => {
      const records = [sale({ category: BAR_CATEGORY, gross: 500_000 })];
      const result = calcEventDept(records, { directExpense: 0 });

      // 500,000 − 320,000 − 20,000 = 160,000 < 100万
      expect(result.operatingProfit).toBe(160_000);
      expect(result.payoutUnlocked).toBe(false);
      expect(result.payoutIncentive).toBe(0);
    });
  });

  describe('半年ボーナス積立（プール金）', () => {
    it('月次プール額 = max(0, 営業利益×10% − 吐き出しインセンティブ)', () => {
      // 2,000,000 × 10% = 200,000 − 50,000 = 150,000
      expect(calcEventBonusPool(2_000_000, 50_000)).toBe(150_000);
    });

    it('吐き出しがプールを上回る場合は 0（負にならない）', () => {
      // 1,000,000 × 10% = 100,000 − 300,000 → 0
      expect(calcEventBonusPool(1_000_000, 300_000)).toBe(0);
    });

    it('営業利益が赤字なら 0', () => {
      expect(calcEventBonusPool(-800_000, 0)).toBe(0);
    });

    it('利益目標を渡した場合は超過分に 20% を適用する（指示書2章マスタ）', () => {
      // 目標100万まで 10% = 100,000、超過100万に 20% = 200,000 → 計 300,000
      expect(calcEventBonusPool(2_000_000, 0, { profitTarget: 1_000_000 })).toBe(300_000);
    });

    it('目標未達なら 10% のみ', () => {
      expect(calcEventBonusPool(500_000, 0, { profitTarget: 1_000_000 })).toBe(50_000);
    });
  });
});

/* ============================================================================
 * 5.2 人材事業部
 * ========================================================================== */

describe('人材事業部（指示書 5.2）', () => {
  it('営業利益 = 売上 − 直接経費 − 基本給(35万) − 概算固定費(10万/人) − 三田氏保守費(2万)', () => {
    const records = [sale({ dept: '人材', category: '人材紹介(広告)', gross: 2_000_000 })];
    const result = calcHrDept(records, { directExpense: 300_000, headcount: 2 }, { ad: 0, referral: 0 });

    // 2,000,000 − 300,000 − 350,000 − 200,000 − 20,000 = 1,130,000
    expect(result.estimatedFixedCost).toBe(200_000);
    expect(result.baseSalary).toBe(350_000);
    expect(result.maintenanceFee).toBe(20_000);
    expect(result.operatingProfit).toBe(1_130_000);
  });

  it('決定手当は 広告1万/件 + リファーラル3万/件', () => {
    expect(calcPlacementAllowance({ ad: 3, referral: 2 })).toBe(3 * 10_000 + 2 * 30_000);
    expect(calcPlacementAllowance({ ad: 0, referral: 0 })).toBe(0);
    expect(calcPlacementAllowance({ ad: 1, referral: 0 })).toBe(10_000);
    expect(calcPlacementAllowance({ ad: 0, referral: 1 })).toBe(30_000);
  });

  it('個人PL利益の 15% を還元する', () => {
    const records = [
      sale({ dept: '人材', member: '中原 聖人', category: '人材紹介(広告)', gross: 1_000_000 }),
      sale({ dept: '人材', member: '入舩 雄志', category: '人材紹介(広告)', gross: 500_000 }),
    ];
    const result = calcHrDept(records, { directExpense: 0, headcount: 0 }, { ad: 0, referral: 0 }, {
      personalDirectExpense: 200_000,
    });

    // 本人分 1,000,000 − 200,000 = 800,000 → 15% = 120,000
    expect(result.personalPlProfit).toBe(800_000);
    expect(result.personalPlIncentive).toBe(120_000);
  });

  it('個人PLが赤字なら還元は 0', () => {
    const result = calcHrDept([], { directExpense: 0 }, { ad: 0, referral: 0 }, {
      personalPlProfit: -400_000,
    });
    expect(result.personalPlIncentive).toBe(0);
  });

  describe('チームインセンプール（目標まで3%／超過分5%）', () => {
    it('目標未達なら 3%', () => {
      expect(calcTieredPool(500_000, 1_000_000, 0.03, 0.05)).toBe(15_000);
    });

    it('目標超過分には 5% を適用', () => {
      // 100万×3% = 30,000 + 超過100万×5% = 50,000 → 80,000
      expect(calcTieredPool(2_000_000, 1_000_000, 0.03, 0.05)).toBe(80_000);
    });

    it('ちょうど目標額なら全額 3%', () => {
      expect(calcTieredPool(1_000_000, 1_000_000, 0.03, 0.05)).toBe(30_000);
    });

    it('赤字なら 0', () => {
      expect(calcTieredPool(-100_000, 1_000_000, 0.03, 0.05)).toBe(0);
    });
  });

  describe('他部紹介（クロスセル）', () => {
    it('10万円以上の BAR売上のみ対象、店舗売上の 10% を還元', () => {
      const barRecords = [
        sale({ category: BAR_CATEGORY, gross: 150_000 }),
        sale({ category: BAR_CATEGORY, gross: 250_000 }),
      ];
      expect(calcCrossSellIncentive(barRecords)).toBe(40_000);
    });

    it('10万円未満のレコードは対象外', () => {
      const barRecords = [
        sale({ category: BAR_CATEGORY, gross: 99_999 }),
        sale({ category: BAR_CATEGORY, gross: 100_000 }),
      ];
      // 100,000 のみ対象 → 10,000
      expect(calcCrossSellIncentive(barRecords)).toBe(10_000);
    });

    it('対象なしなら 0', () => {
      expect(calcCrossSellIncentive([])).toBe(0);
    });
  });
});

/* ============================================================================
 * 5.3 物流・バックヤード
 * ========================================================================== */

describe('物流・バックヤード（指示書 5.3）', () => {
  it('固定報酬 40万円、保守費 営業2万/人材2万/本部1万 を徴収充当', () => {
    const result = calcLogisticsDept();
    expect(result.fixedCompensation).toBe(400_000);
    expect(result.maintenanceCollected).toEqual({
      event: 20_000,
      hr: 20_000,
      hq: 10_000,
      total: 50_000,
    });
    expect(result.logisticsFixedCost).toBe(350_000);
  });
});

/* ============================================================================
 * メンバー別 支給見立て
 * ========================================================================== */

describe('メンバー別 当月支給見立て', () => {
  it('入舩 雄志: 基本給32万 + BAR10%吐き出し', () => {
    const records = [
      sale({ category: 'イベント', gross: 2_000_000 }),
      sale({ category: BAR_CATEGORY, gross: 500_000 }),
    ];
    const payout = buildEventMemberPayout(calcEventDept(records, { directExpense: 0 }));

    expect(payout.memberId).toBe('M001');
    expect(payout.baseSalary).toBe(320_000);
    expect(payout.totalPayout).toBe(320_000 + 50_000);
    expect(payout.breakdown[0].note).toBe('翌月末支給');
  });

  it('入舩 雄志: 利益未達なら基本給のみ', () => {
    const records = [sale({ category: BAR_CATEGORY, gross: 500_000 })];
    const payout = buildEventMemberPayout(calcEventDept(records, { directExpense: 0 }));

    expect(payout.totalPayout).toBe(320_000);
    expect(payout.breakdown[0].note).toContain('未達');
  });

  it('中原 聖人: 基本給35万 + 決定手当 + 個人PL15% + BAR10%', () => {
    const records = [
      sale({ dept: '人材', member: '中原 聖人', category: '人材紹介(広告)', gross: 1_000_000 }),
    ];
    const result = calcHrDept(records, { directExpense: 0, headcount: 0 }, { ad: 2, referral: 1 }, {
      crossSellBarRecords: [sale({ category: BAR_CATEGORY, gross: 300_000 })],
    });
    const payout = buildHrMemberPayout(result);

    // 決定手当 20,000 + 30,000 = 50,000
    // 個人PL 1,000,000 × 15% = 150,000
    // クロスセル 300,000 × 10% = 30,000
    expect(payout.memberId).toBe('M002');
    expect(payout.baseSalary).toBe(350_000);
    expect(payout.breakdown.map((l) => l.amount)).toEqual([50_000, 150_000, 30_000]);
    expect(payout.totalPayout).toBe(350_000 + 50_000 + 150_000 + 30_000);
  });

  it('三田 航大: 固定40万のみ、インセンティブなし', () => {
    const payout = buildLogisticsMemberPayout(calcLogisticsDept());
    expect(payout.memberId).toBe('M003');
    expect(payout.totalPayout).toBe(400_000);
    expect(payout.breakdown).toHaveLength(0);
    expect(payout.bonusPoolAccrual).toBe(0);
  });
});

/* ============================================================================
 * 月次サマリ / 通期サマリ
 * ========================================================================== */

describe('月次サマリ', () => {
  const records = [
    sale({ id: 'A', date: '2026-08-03', dept: 'イベント営業', category: 'イベント', gross: 2_000_000 }),
    sale({ id: 'B', date: '2026-08-12', dept: 'イベント営業', category: BAR_CATEGORY, gross: 500_000 }),
    sale({
      id: 'C',
      date: '2026-08-20',
      dept: '人材',
      category: '人材紹介(広告)',
      member: '中原 聖人',
      gross: 1_500_000,
    }),
    // 対象外の月
    sale({ id: 'D', date: '2026-07-31', dept: 'イベント営業', category: 'イベント', gross: 9_000_000 }),
  ];

  it('当月のレコードのみ集計する', () => {
    const summary = calcMonthlySummary(records, '2026-08');
    expect(summary.month).toBe('2026-08');
    expect(summary.grossSales).toBe(4_000_000);
  });

  it('事業部別 PL 行を返す', () => {
    const summary = calcMonthlySummary(records, '2026-08');
    const event = summary.deptRows.find((r) => r.deptId === 'event');
    const hr = summary.deptRows.find((r) => r.deptId === 'hr');

    expect(event?.grossSales).toBe(2_500_000);
    expect(hr?.grossSales).toBe(1_500_000);
  });

  it('3 名分の支給見立てを返す', () => {
    const summary = calcMonthlySummary(records, '2026-08');
    expect(summary.payouts.map((p) => p.memberId)).toEqual(['M001', 'M002', 'M003']);
  });

  it('事業部フィルタは表示名と DeptId の両方を受け付ける', () => {
    expect(filterByDept(records, 'event')).toHaveLength(3);
    expect(filterByDept(records, 'イベント営業')).toHaveLength(3);
    expect(filterByDept(records, '人材')).toHaveLength(1);
  });
});

describe('通期サマリ（指示書 3章 総結果）', () => {
  it('期首月から 12 ヶ月分を集計する', () => {
    const total = calcTotalSummary([], {}, '2026-08');
    expect(total.months).toHaveLength(12);
    expect(total.months[0].month).toBe('2026-08');
    expect(total.months[11].month).toBe('2027-07');
  });

  it('年収シミュレーションは基本給 × 12 を下限に持つ', () => {
    const total = calcTotalSummary([], {}, '2026-08');
    const mita = total.annualByMember.find((m) => m.memberId === 'M003');
    expect(mita?.annualBase).toBe(400_000 * 12);
    expect(mita?.annualTotal).toBe(400_000 * 12);
  });

  it('本部（M004）は年収シミュレーションに含めない', () => {
    const total = calcTotalSummary([], {}, '2026-08');
    expect(total.annualByMember.map((m) => m.memberId)).toEqual(['M001', 'M002', 'M003']);
  });
});

/* ============================================================================
 * 6章 BARROOTS 日報 自動計算
 * ========================================================================== */

describe('BARROOTS 日報 自動計算（指示書 6章）', () => {
  it('当日売り上げ = 現金 + クレカ + 電子マネー + QR', () => {
    expect(calcDailySales({ cash: 15_000, credit: 0, emoney: 0, qr: 0 })).toBe(15_000);
    expect(calcDailySales({ cash: 12_000, credit: 8_000, emoney: 3_000, qr: 2_000 })).toBe(25_000);
  });

  describe('1日必達 = ⌈(月目標 − 当月累計売上) ÷ 残営業日⌉', () => {
    it('指示書サンプルの 20,300円 を再現する（100円単位で切り上げ）', () => {
      // (360,000 − 15,000) ÷ 17 = 20,294.1… → 100円単位切り上げ → 20,300
      expect(calcDailyRequired(360_000, 15_000, 17)).toBe(20_300);
    });

    it('丸め単位 1 なら数式どおりの円単位切り上げ', () => {
      expect(calcDailyRequired(360_000, 15_000, 17, 1)).toBe(20_295);
    });

    it('目標達成済みなら 0', () => {
      expect(calcDailyRequired(360_000, 360_000, 17)).toBe(0);
      expect(calcDailyRequired(360_000, 400_000, 17)).toBe(0);
    });

    it('残営業日が 0 なら残額をそのまま返す（0 除算を避ける）', () => {
      expect(calcDailyRequired(360_000, 15_000, 0)).toBe(345_000);
    });

    it('ceilTo は丸め単位の倍数に切り上げる', () => {
      expect(ceilTo(20_294.1, 100)).toBe(20_300);
      expect(ceilTo(20_300, 100)).toBe(20_300);
      expect(ceilTo(20_294.1, 1)).toBe(20_295);
      expect(ceilTo(20_294.1)).toBe(20_295);
    });
  });

  it('指示書サンプルの日報を丸ごと再現する', () => {
    const input: DailyReportInput = {
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
      comment: '急遽オープンの為準備何もしていなかったが、持ち前のカウンタースキルで皆を笑顔に出来きました✨️',
    };
    const computed = calcDailyReport(input, { cumulativeSales: 0, cumulativeNewCustomers: 0 });

    expect(computed.dailySales).toBe(15_000);
    expect(computed.totalCustomers).toBe(8);
    expect(computed.monthCumulative).toBe(15_000);
    expect(computed.dailyRequired).toBe(20_300);
    expect(computed.newCustomersCumulative).toBe(8);
  });

  it('当月累計売上 = 前日までの累計 + 当日売り上げ', () => {
    const input: DailyReportInput = {
      date: '2026-08-20',
      member: '入舩 雄志',
      monthlyTarget: 360_000,
      cash: 30_000,
      credit: 20_000,
      emoney: 0,
      qr: 0,
      groups: 6,
      newCustomers: 3,
      existingCustomers: 9,
      remainingBusinessDays: 10,
      comment: 'テスト',
    };
    const computed = calcDailyReport(input, {
      cumulativeSales: 150_000,
      cumulativeNewCustomers: 22,
    });

    expect(computed.dailySales).toBe(50_000);
    expect(computed.monthCumulative).toBe(200_000);
    expect(computed.newCustomersCumulative).toBe(25);
    expect(computed.totalCustomers).toBe(12);
    // (360,000 − 200,000) ÷ 10 = 16,000
    expect(computed.dailyRequired).toBe(16_000);
  });

  it('前日までの累計を売上ログから組み立てる（同一月・BARカテゴリ・当日より前）', () => {
    const records = [
      sale({ date: '2026-08-01', category: BAR_CATEGORY, gross: 50_000, newCustomers: 5 }),
      sale({ date: '2026-08-05', category: BAR_CATEGORY, gross: 70_000, newCustomers: 4 }),
      // 当日は含めない
      sale({ date: '2026-08-12', category: BAR_CATEGORY, gross: 15_000, newCustomers: 8 }),
      // 別カテゴリは含めない
      sale({ date: '2026-08-02', category: 'イベント', gross: 900_000, newCustomers: 99 }),
      // 前月は含めない
      sale({ date: '2026-07-30', category: BAR_CATEGORY, gross: 40_000, newCustomers: 3 }),
    ];
    const carry = buildCarryOver(records, '2026-08-12');

    expect(carry.cumulativeSales).toBe(120_000);
    expect(carry.cumulativeNewCustomers).toBe(9);
  });
});

/* ============================================================================
 * 日別進捗
 * ========================================================================== */

describe('日別進捗（指示書 3章）', () => {
  const records = [
    sale({ date: '2026-08-01', category: BAR_CATEGORY, gross: 100_000 }),
    sale({ date: '2026-08-12', category: BAR_CATEGORY, gross: 15_000 }),
    sale({ date: '2026-08-20', category: BAR_CATEGORY, gross: 80_000 }),
  ];

  it('当日売上・当月累計・残営業日を算出する', () => {
    const progress = calcDailyProgress(records, '2026-08-12', { monthlySalesTarget: 360_000 });

    expect(progress.dailyGross).toBe(15_000);
    // 8/1 と 8/12 の合計（8/20 は未来なので含めない）
    expect(progress.monthCumulative).toBe(115_000);
    // 2026-08-13〜08-31 のうち日曜(16/23/30)を除く = 16日
    expect(progress.remainingBusinessDays).toBe(16);
  });

  it('日割り目標と達成率を算出する', () => {
    const progress = calcDailyProgress(records, '2026-08-12', { monthlySalesTarget: 360_000 });
    // 2026年8月の営業日（日曜除く）= 31 − 5 = 26日
    expect(progress.proratedTarget).toBe(Math.round(360_000 / 26));
    expect(progress.proratedAchievementRate).toBeCloseTo(15_000 / progress.proratedTarget, 6);
  });

  it('目標未設定なら達成率は 0 で 0 除算しない', () => {
    const progress = calcDailyProgress(records, '2026-08-12');
    expect(progress.proratedTarget).toBe(0);
    expect(progress.proratedAchievementRate).toBe(0);
    expect(Number.isFinite(progress.dailyRequired)).toBe(true);
  });
});

/* ============================================================================
 * 個人ビュー（本人＋所属事業部だけを取り出す）
 * ========================================================================== */

describe('calcMemberMonthly', () => {
  const records = [
    sale({ id: 'A', date: '2026-08-05', category: BAR_CATEGORY, gross: 1_500_000 }),
    // 他事業部・他メンバーの行は個人集計に混ぜない
    sale({
      id: 'B',
      date: '2026-08-06',
      dept: '人材',
      category: '人材紹介(広告)',
      member: '中原 聖人',
      gross: 800_000,
    }),
  ];

  it('本人の担当売上と所属事業部の営業利益だけを返す', () => {
    const result = calcMemberMonthly(records, '2026-08', 'M001');

    expect(result.memberName).toBe('入舩 雄志');
    expect(result.deptLabel).toBe('イベント営業');
    expect(result.personalGross).toBe(1_500_000);
    expect(result.personalRecords).toHaveLength(1);

    // 営業利益 = 1,500,000 − 経費0 − 基本給320,000 − 保守費20,000
    expect(result.deptOperatingProfit).toBe(1_160_000);
    expect(result.deptProfitTarget).toBe(1_000_000);
    expect(result.deptAchievementRate).toBeCloseTo(1.16, 6);
  });

  it('本人の支給見立てを付ける（営業利益100万超なのでBAR10%が乗る）', () => {
    const result = calcMemberMonthly(records, '2026-08', 'M001');

    expect(result.payout?.memberId).toBe('M001');
    expect(result.payout?.baseSalary).toBe(RULES.eventBaseSalary);
    expect(result.payout?.breakdown[0].amount).toBe(150_000);
  });

  it('他メンバーを指定しても他人の行は混ざらない', () => {
    const result = calcMemberMonthly(records, '2026-08', 'M002');

    expect(result.memberName).toBe('中原 聖人');
    expect(result.personalGross).toBe(800_000);
    expect(result.deptLabel).toBe('人材');
  });

  it('存在しないメンバーIDは例外にする', () => {
    // @ts-expect-error 未定義のメンバーIDを渡した場合の防御
    expect(() => calcMemberMonthly(records, '2026-08', 'M999')).toThrow();
  });
});

describe('calcMemberAnnual', () => {
  const records = [sale({ date: '2026-09-10', category: BAR_CATEGORY, gross: 2_000_000 })];

  it('期首から12ヶ月分を月別に積み上げる', () => {
    const annual = calcMemberAnnual(records, 'M001', {}, '2026-08');

    expect(annual.months).toHaveLength(12);
    expect(annual.months[0].month).toBe('2026-08');
    expect(annual.months[11].month).toBe('2027-07');
    expect(annual.personalGrossTotal).toBe(2_000_000);
    // 基本給は 12 ヶ月分
    expect(annual.annualBase).toBe(RULES.eventBaseSalary * 12);
    expect(annual.annualTotal).toBe(
      annual.annualBase + annual.annualIncentive + annual.annualBonusPool,
    );
  });
});

/* ============================================================================
 * 期の範囲（第5期 = 2026-08 〜 2027-07）
 * ========================================================================== */

describe('第5期の集計範囲', () => {
  it('期首月は 2026-08', () => {
    expect(FISCAL_START_MONTH).toBe('2026-08');
  });

  it('既定の通期は 2026-08 から 2027-07 までの12ヶ月', () => {
    const total = calcTotalSummary([]);

    expect(total.fiscalStartMonth).toBe('2026-08');
    expect(total.months).toHaveLength(12);
    expect(total.months[0].month).toBe('2026-08');
    expect(total.months[11].month).toBe('2027-07');
  });

  it('期首月の売上が通期に入る', () => {
    const total = calcTotalSummary([
      sale({ date: '2026-08-15', category: BAR_CATEGORY, gross: 500_000 }),
    ]);
    expect(total.grossSales).toBe(500_000);
  });

  it('前期（2026-07 以前）の売上は通期に入らない', () => {
    const total = calcTotalSummary([
      sale({ date: '2026-07-31', category: BAR_CATEGORY, gross: 900_000 }),
    ]);
    expect(total.grossSales).toBe(0);
  });

  it('期末月（2027-07）の売上は通期に入る', () => {
    const total = calcTotalSummary([
      sale({ date: '2027-07-01', category: BAR_CATEGORY, gross: 300_000 }),
    ]);
    expect(total.grossSales).toBe(300_000);
  });

  it('翌期（2027-08 以降）の売上は通期に入らない', () => {
    const total = calcTotalSummary([
      sale({ date: '2027-08-01', category: BAR_CATEGORY, gross: 400_000 }),
    ]);
    expect(total.grossSales).toBe(0);
  });
});
