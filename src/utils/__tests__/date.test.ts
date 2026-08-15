import {
  countBusinessDaysInMonth,
  countElapsedBusinessDays,
  countRemainingBusinessDays,
  daysInMonth,
  formatReportDate,
  getWeekdayJa,
  listFiscalMonths,
  parseISODate,
  toISODate,
  toMonthKey,
} from '@/utils/date';

describe('日付ユーティリティ', () => {
  it('YYYY-MM-DD を UTC で往復できる（タイムゾーンでずれない）', () => {
    expect(toISODate(parseISODate('2026-08-12'))).toBe('2026-08-12');
    expect(toISODate(parseISODate('2026-01-01'))).toBe('2026-01-01');
    expect(toISODate(parseISODate('2026-12-31'))).toBe('2026-12-31');
  });

  it('月キーを取り出す', () => {
    expect(toMonthKey('2026-08-12')).toBe('2026-08');
  });

  it('曜日を日本語 1 文字で返す', () => {
    expect(getWeekdayJa('2026-08-12')).toBe('水');
    expect(getWeekdayJa('2026-08-16')).toBe('日');
  });

  it('指示書 6章のヘッダ表記を生成する', () => {
    expect(formatReportDate('2026-08-12')).toBe('8/12（水）');
    expect(formatReportDate('2026-12-01')).toBe('12/1（火）');
  });

  it('月の日数を返す（うるう年含む）', () => {
    expect(daysInMonth('2026-08')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
  });
});

describe('営業日計算', () => {
  it('日曜を定休日として月の営業日数を数える', () => {
    // 2026年8月は31日、日曜は 2/9/16/23/30 の 5 日 → 26日
    expect(countBusinessDaysInMonth('2026-08')).toBe(26);
  });

  it('定休日を指定できる', () => {
    // 日曜・月曜休み
    expect(countBusinessDaysInMonth('2026-08', { closedWeekdays: [0, 1] })).toBe(21);
    // 無休
    expect(countBusinessDaysInMonth('2026-08', { closedWeekdays: [] })).toBe(31);
  });

  it('当日を含めた残営業日が指示書サンプル（8/12 → 17日）と一致する', () => {
    expect(countRemainingBusinessDays('2026-08-12', { includeSelf: true })).toBe(17);
  });

  it('当日を含めない場合は 1 日少ない', () => {
    expect(countRemainingBusinessDays('2026-08-12')).toBe(16);
  });

  it('月末は残 0 日', () => {
    expect(countRemainingBusinessDays('2026-08-31')).toBe(0);
  });

  it('経過営業日は当日を含む', () => {
    // 8/1〜8/12 のうち日曜 8/2, 8/9 を除く = 10日
    expect(countElapsedBusinessDays('2026-08-12')).toBe(10);
  });
});

describe('期の月リスト', () => {
  it('期首月から 12 ヶ月を年跨ぎで列挙する', () => {
    const months = listFiscalMonths('2026-08', 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-08');
    expect(months[4]).toBe('2026-12');
    expect(months[5]).toBe('2027-01');
    expect(months[11]).toBe('2027-07');
  });
});
