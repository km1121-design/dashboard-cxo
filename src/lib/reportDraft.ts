/**
 * BARROOTS 日報の下書き保存。
 *
 * 入力途中でブラウザを閉じても消えないように、日付ごとに localStorage へ保存する。
 * 登録に成功した日付の下書きは捨てる。
 */
import type { DailyReportInput } from '@/types';

const STORAGE_KEY = 'gooner:reportDrafts:v1';

type Store = Record<string, DailyReportInput>;

function readStore(): Store {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 保存できなくても入力は続けられる
  }
}

/** 日付の下書きを読む */
export function getReportDraft(date: string): DailyReportInput | null {
  return readStore()[date] ?? null;
}

/** 下書きを保存する（入力のたびに呼ばれるので副作用は最小限） */
export function saveReportDraft(input: DailyReportInput): void {
  const store = readStore();
  store[input.date] = input;
  writeStore(store);
}

/** 登録済みになった日付の下書きを捨てる */
export function clearReportDraft(date: string): void {
  const store = readStore();
  if (!(date in store)) return;
  delete store[date];
  writeStore(store);
}

/** 下書きが残っている日付（新しい順） */
export function listDraftDates(): string[] {
  return Object.keys(readStore()).sort((a, b) => b.localeCompare(a));
}
