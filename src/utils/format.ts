/** 表示用フォーマッタ */

/** 1,234,567 形式（円記号なし） */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}

/** ¥1,234,567 形式 */
export function formatYen(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}¥${formatNumber(Math.abs(value))}`;
}

/** 1,234,567円 形式（LINE 転送フォーマット用） */
export function formatYenSuffix(value: number): string {
  return `${formatNumber(value)}円`;
}

/** 万円表記（サマリカード用） */
export function formatManYen(value: number): string {
  const man = value / 10_000;
  const rounded = Math.abs(man) >= 100 ? Math.round(man) : Math.round(man * 10) / 10;
  return `${rounded.toLocaleString('ja-JP')}万`;
}

/** 0.873 → 87.3% */
export function formatPercent(rate: number, digits = 1): string {
  if (!Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}
