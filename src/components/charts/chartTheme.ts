/**
 * グラフの配色と描画寸法。
 *
 * 配色は dataviz スキルの検証済みパレット（light）をそのまま使っている。
 * カード地色 `#ffffff` に対して検証済み：
 *
 *   node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100" \
 *     --mode light --surface "#ffffff"
 *   → 明度帯 PASS / 彩度下限 PASS / 色覚分離 PASS（最悪隣接 ΔE 9.1）
 *     / 通常視下限 PASS（ΔE 22.9）/ コントラスト WARN（aqua 2.82・yellow 2.17）
 *
 * コントラストが 3:1 を切る 2 色があるため、**凡例に必ず実数値を併記する**
 * （色だけに意味を持たせない）。系列を増やすときは同じ検証を通してから足すこと。
 */

/** カテゴリ系列（この順に固定して使う。順序を入れ替えたり循環させたりしない） */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const;

/** 状態色。系列色としては使わない。必ずアイコンとラベルを添える */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/** 目盛・軸・文字 */
export const CHROME = {
  surface: '#ffffff',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  /** 連続量スケールの淡いステップ（メーターのトラックなど） */
  trackLight: '#cde2fb',
} as const;

/** マーク寸法（dataviz スキルの固定仕様） */
export const MARK = {
  /** 棒の最大太さ */
  maxBarWidth: 24,
  /** 隣接するマークを分ける地色のすき間 */
  surfaceGap: 2,
  /** 線の太さ */
  lineWidth: 2,
  /** 端点マーカーの半径（直径 8px 以上） */
  markerRadius: 4,
  /** データ端の角丸 */
  barRadius: 4,
  /** ホバーの当たり判定の最小幅 */
  minHitSize: 24,
} as const;
