/**
 * 月次の手入力（経費・決定件数・売上目標・計画値）。
 *
 * 保存先はスプレッドシートの `t_dept_inputs`。全員が同じ数字を見るため、
 * どの端末で開いても営業利益とインセンティブが一致する。
 *
 * GAS がシートに未対応（旧デプロイ）の場合だけ、従来どおり localStorage に退避する。
 * その状態は端末ごとに値がずれるので、画面側で警告を出している。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEPTS, DEPT_BY_ID } from '@/constants/master';
import type { DeptId, DeptInputRecord } from '@/types';
import {
  toMonthlyInputs,
  toMonthlyInputsByMonth,
  type MonthlyInputs,
} from '@/utils/calculator';

/** 旧実装（月キー → MonthlyInputs）の保存先。移行のためだけに読む */
const LEGACY_KEY = 'gooner:monthlyInputs:v1';
/** シート未対応時のフォールバック保存先 */
const FALLBACK_KEY = 'gooner:deptInputs:v1';

/** 空の 1 行 */
export function emptyDeptInput(month: string, deptId: DeptId): DeptInputRecord {
  return {
    month,
    dept: DEPT_BY_ID[deptId]?.label ?? deptId,
    directExpense: 0,
    headcount: 0,
    placementAd: 0,
    placementReferral: 0,
    personalDirectExpense: 0,
    salesTarget: 0,
    salesBudget: 0,
    profitBudget: 0,
  };
}

/* ------------------------------------------------------- ローカル退避（旧デプロイ用） */

function readLocalRows(): DeptInputRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) return JSON.parse(raw) as DeptInputRecord[];
  } catch {
    return [];
  }
  return migrateLegacyRows();
}

/**
 * 旧実装で localStorage に貯めた入力を、新しい行の形に読み替える。
 * 入力し直す手間を省くためだけの一方向の変換。
 */
function migrateLegacyRows(): DeptInputRecord[] {
  if (typeof localStorage === 'undefined') return [];

  let legacy: Record<string, MonthlyInputs>;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '{}') as Record<string, MonthlyInputs>;
  } catch {
    return [];
  }

  const rows: DeptInputRecord[] = [];

  for (const [month, inputs] of Object.entries(legacy)) {
    for (const dept of DEPTS) {
      const expense = inputs.expenses?.[dept.id];
      const isHr = dept.id === 'hr';
      const isEvent = dept.id === 'event';

      const row: DeptInputRecord = {
        ...emptyDeptInput(month, dept.id),
        directExpense: expense?.directExpense ?? 0,
        headcount: expense?.headcount ?? 0,
        // 決定件数と個人直接経費は人材、売上目標は店舗を持つイベント営業に寄せる
        placementAd: isHr ? (inputs.placements?.ad ?? 0) : 0,
        placementReferral: isHr ? (inputs.placements?.referral ?? 0) : 0,
        personalDirectExpense: isHr ? (inputs.personalDirectExpense ?? 0) : 0,
        salesTarget: isEvent ? (inputs.monthlySalesTarget ?? 0) : 0,
      };

      const hasValue =
        row.directExpense || row.headcount || row.placementAd ||
        row.placementReferral || row.personalDirectExpense || row.salesTarget;
      if (hasValue) rows.push(row);
    }
  }

  return rows;
}

function writeLocalRows(rows: DeptInputRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(rows));
  } catch {
    // 保存できなくても表示は続く
  }
}

/** 月 × 事業部で 1 行に畳む（同じキーは後勝ち） */
export function upsertRow(rows: DeptInputRecord[], record: DeptInputRecord): DeptInputRecord[] {
  const index = rows.findIndex((r) => r.month === record.month && r.dept === record.dept);
  if (index < 0) return [...rows, record];

  const next = rows.slice();
  next[index] = record;
  return next;
}

/* --------------------------------------------------------------------- フック */

export interface UseMonthlyInputsOptions {
  /** 対象月 `YYYY-MM` */
  month: string;
  /** GAS から届いた行。null なら未対応デプロイ（ローカル退避に切り替える） */
  serverRows: DeptInputRecord[] | null;
  /** 保存（GAS へ POST して再同期する） */
  onSave: (record: DeptInputRecord) => Promise<boolean>;
}

export interface UseMonthlyInputsResult {
  /** 対象月の計算用入力 */
  inputs: MonthlyInputs;
  /** 通期計算に渡す月別入力 */
  allInputs: Record<string, MonthlyInputs>;
  /** 対象月・事業部の行（未入力なら空の行） */
  rowFor: (deptId: DeptId) => DeptInputRecord;
  /** 1 行保存する */
  save: (record: DeptInputRecord) => Promise<boolean>;
  /** スプレッドシートに保存できているか。false ならこの端末だけの値 */
  serverBacked: boolean;
  saving: boolean;
}

export function useMonthlyInputs({
  month,
  serverRows,
  onSave,
}: UseMonthlyInputsOptions): UseMonthlyInputsResult {
  const serverBacked = serverRows !== null;

  const [localRows, setLocalRows] = useState<DeptInputRecord[]>(readLocalRows);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!serverBacked) writeLocalRows(localRows);
  }, [serverBacked, localRows]);

  const rows = serverRows ?? localRows;

  const inputs = useMemo(() => toMonthlyInputs(rows, month), [rows, month]);
  const allInputs = useMemo(() => toMonthlyInputsByMonth(rows), [rows]);

  const rowFor = useCallback(
    (deptId: DeptId): DeptInputRecord => {
      const label = DEPT_BY_ID[deptId]?.label;
      return (
        rows.find((r) => r.month === month && (r.dept === label || r.dept === deptId)) ??
        emptyDeptInput(month, deptId)
      );
    },
    [rows, month],
  );

  const save = useCallback(
    async (record: DeptInputRecord): Promise<boolean> => {
      if (!serverBacked) {
        setLocalRows((prev) => upsertRow(prev, record));
        return true;
      }

      setSaving(true);
      try {
        return await onSave(record);
      } finally {
        setSaving(false);
      }
    },
    [serverBacked, onSave],
  );

  return { inputs, allInputs, rowFor, save, serverBacked, saving };
}
