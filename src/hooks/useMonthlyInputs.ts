/**
 * 経費・決定件数など、スプレッドシートの売上ログに含まれない月次の手入力値を
 * localStorage に保持する。月キー（`YYYY-MM`）ごとに独立して保存する。
 */
import { useCallback, useEffect, useState } from 'react';
import type { MonthlyInputs } from '@/utils/calculator';

const STORAGE_KEY = 'gooner:monthlyInputs:v1';

export const DEFAULT_MONTHLY_INPUTS: MonthlyInputs = {
  expenses: {
    event: { directExpense: 0, headcount: 0 },
    hr: { directExpense: 0, headcount: 1 },
    logistics: { directExpense: 0, headcount: 0 },
  },
  placements: { ad: 0, referral: 0 },
  personalDirectExpense: 0,
  monthlySalesTarget: 360_000,
};

type Store = Record<string, MonthlyInputs>;

function readStore(): Store {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

export function useMonthlyInputs(monthKey: string) {
  const [store, setStore] = useState<Store>(readStore);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // 保存できなくても表示は継続する
    }
  }, [store]);

  const inputs = store[monthKey] ?? DEFAULT_MONTHLY_INPUTS;

  const update = useCallback(
    (patch: Partial<MonthlyInputs>) => {
      setStore((prev) => ({
        ...prev,
        [monthKey]: { ...(prev[monthKey] ?? DEFAULT_MONTHLY_INPUTS), ...patch },
      }));
    },
    [monthKey],
  );

  return { inputs, update, allInputs: store };
}
