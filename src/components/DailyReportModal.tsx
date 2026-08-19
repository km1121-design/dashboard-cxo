/**
 * BARROOTS 店舗日報 作成 ＆ LINE転送フォーマット自動生成モーダル（指示書 6章）
 *
 * 入力は日付ごとに下書き保存され、当月の登録済み日報を読み込んで
 * LINE 転送テキストを作り直すこともできる。
 * GAS 側は行の追記しかできないため、同じ日に再登録すると行が増える。
 * その旨は登録前に警告する。
 */
import { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  History,
  Loader2,
  Send,
  Share2,
  Store,
  X,
} from 'lucide-react';
import { NumberField } from '@/components/NumberField';
import { BAR_CATEGORY, DEPT_BY_ID, STORE_NAME } from '@/constants/master';
import { generateRecordId } from '@/lib/gasApi';
import { clearReportDraft, getReportDraft, saveReportDraft } from '@/lib/reportDraft';
import type { DailyReportInput, SaleRecord, SaleRecordInput } from '@/types';
import { buildCarryOver, calcDailyReport, filterByCategory, filterByMonth } from '@/utils/calculator';
import { countRemainingBusinessDays, formatReportDate, toISODate, toMonthKey } from '@/utils/date';
import { formatYen } from '@/utils/format';
import { buildLineReportText, buildLineShareUrl } from '@/utils/lineFormat';

interface Props {
  open: boolean;
  onClose: () => void;
  records: SaleRecord[];
  /** GAS へ日報を送信する。成功したら true */
  onSubmit: (record: SaleRecordInput) => Promise<boolean>;
  submitting: boolean;
  defaultMonthlyTarget: number;
  /** 既定の担当者名（個人ビューでは本人） */
  defaultMember?: string;
}

const today = () => toISODate(new Date());

function makeInitialInput(monthlyTarget: number, member: string): DailyReportInput {
  const date = today();
  return {
    date,
    member,
    monthlyTarget,
    cash: 0,
    credit: 0,
    emoney: 0,
    qr: 0,
    groups: 0,
    newCustomers: 0,
    existingCustomers: 0,
    // 指示書 6章のサンプル（8/12 → 17日）と同じ数え方で初期値を出す
    remainingBusinessDays: countRemainingBusinessDays(date, { includeSelf: true }),
    comment: '',
  };
}

export function DailyReportModal({
  open,
  onClose,
  records,
  onSubmit,
  submitting,
  defaultMonthlyTarget,
  defaultMember = '入舩 雄志',
}: Props) {
  const [input, setInput] = useState<DailyReportInput>(() =>
    getReportDraft(today()) ?? makeInitialInput(defaultMonthlyTarget, defaultMember),
  );
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const dateId = useId();
  const memberId = useId();
  const commentId = useId();

  const carryOver = useMemo(() => buildCarryOver(records, input.date), [records, input.date]);
  const computed = useMemo(() => calcDailyReport(input, carryOver), [input, carryOver]);
  const lineText = useMemo(
    () => buildLineReportText(input, carryOver, computed),
    [input, carryOver, computed],
  );

  /** 当月の登録済み日報（新しい順） */
  const monthReports = useMemo(
    () =>
      filterByCategory(filterByMonth(records, toMonthKey(input.date)), BAR_CATEGORY)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [records, input.date],
  );

  /** 選択中の日付に既に登録がある場合の重複警告 */
  const duplicates = monthReports.filter((r) => r.date === input.date);

  // 入力のたびに下書きを保存する（開いている間だけ）
  useEffect(() => {
    if (!open) return;
    saveReportDraft(input);
  }, [open, input]);

  if (!open) return null;

  const set = <K extends keyof DailyReportInput>(key: K, value: DailyReportInput[K]) => {
    setLoadedFrom(null);
    setInput((prev) => {
      const next = { ...prev, [key]: value };
      // 日付を変えたら残営業日を再計算し、その日の下書きがあれば復元する
      if (key === 'date') {
        const draft = getReportDraft(value as string);
        if (draft) return draft;
        next.remainingBusinessDays = countRemainingBusinessDays(value as string, {
          includeSelf: true,
        });
      }
      return next;
    });
  };

  /** 登録済みの行を入力欄へ読み込む（LINE テキストを作り直すため） */
  const loadRecord = (record: SaleRecord) => {
    setInput((prev) => ({
      ...prev,
      date: record.date,
      member: record.member || prev.member,
      cash: record.cash,
      credit: record.credit,
      emoney: record.emoney,
      qr: record.qr,
      groups: record.groups,
      newCustomers: record.newCustomers,
      existingCustomers: record.existingCustomers,
      comment: record.comment,
      remainingBusinessDays: countRemainingBusinessDays(record.date, { includeSelf: true }),
    }));
    setLoadedFrom(record.date);
    setHistoryOpen(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lineText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleSubmit = async () => {
    if (
      duplicates.length > 0 &&
      !window.confirm(
        `${formatReportDate(input.date)} の日報は既に ${duplicates.length} 件登録されています。\n` +
          'スプレッドシートは行の追記のみで上書きできないため、登録すると売上が二重に計上されます。\n' +
          'それでも登録しますか？',
      )
    ) {
      return;
    }

    const record: SaleRecordInput = {
      id: generateRecordId(),
      date: input.date,
      dept: DEPT_BY_ID.event.label,
      category: BAR_CATEGORY,
      member: input.member,
      gross: computed.dailySales,
      plRate: 1.0,
      cash: input.cash,
      credit: input.credit,
      emoney: input.emoney,
      qr: input.qr,
      groups: input.groups,
      totalCustomers: computed.totalCustomers,
      newCustomers: input.newCustomers,
      existingCustomers: input.existingCustomers,
      comment: input.comment,
    };

    const ok = await onSubmit(record);
    if (ok) {
      clearReportDraft(input.date);
      onClose();
    }
  };

  // 客単価と新規率は指示書の必須項目ではないが、総評を書くときの手がかりになる
  const perCustomer =
    computed.totalCustomers > 0 ? Math.round(computed.dailySales / computed.totalCustomers) : 0;
  const newRate =
    computed.totalCustomers > 0 ? Math.round((input.newCustomers / computed.totalCustomers) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm sm:p-4">
      <div className="card min-h-screen w-full max-w-4xl rounded-none sm:my-4 sm:min-h-0 sm:rounded-xl">
        <header className="sticky top-0 z-10 flex items-center justify-between rounded-t-none border-b border-slate-200 bg-white px-4 py-3 sm:rounded-t-xl sm:px-5 sm:py-3.5">
          <h2 className="inline-flex items-center gap-2 text-base font-bold text-slate-800">
            <Store size={18} className="text-indigo-600" />
            {STORE_NAME} 店舗日報
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </header>

        {/* ------------------------------------------------------ 状態バナー */}
        <div className="space-y-2 px-4 pt-3 sm:px-5">
          {duplicates.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                {formatReportDate(input.date)} の日報は既に {duplicates.length} 件登録されています
                （合計 {formatYen(duplicates.reduce((a, r) => a + r.gross, 0))}）。
                上書きはできないため、登録すると売上が二重に計上されます。
                LINE テキストを作り直すだけなら登録は不要です。
              </span>
            </p>
          )}
          {loadedFrom && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {formatReportDate(loadedFrom)} の登録済み日報を読み込みました。
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-2">
          {/* -------------------------------------------------- 入力フォーム */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={dateId} className="label">
                  日付
                </label>
                <input
                  id={dateId}
                  type="date"
                  value={input.date}
                  onChange={(e) => set('date', e.target.value)}
                  className="input mt-1 min-h-[40px]"
                />
              </div>
              <div>
                <label htmlFor={memberId} className="label">
                  担当者
                </label>
                <input
                  id={memberId}
                  type="text"
                  value={input.member}
                  onChange={(e) => set('member', e.target.value)}
                  className="input mt-1 min-h-[40px]"
                />
              </div>
              <NumberField
                label="月目標"
                value={input.monthlyTarget}
                onChange={(v) => set('monthlyTarget', v)}
                suffix="円"
              />
              <NumberField
                label="残営業日"
                value={input.remainingBusinessDays}
                onChange={(v) => set('remainingBusinessDays', v)}
                suffix="日"
              />
            </div>

            <fieldset>
              <legend className="text-xs font-bold text-slate-600">決済内訳</legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <NumberField label="現金" value={input.cash} onChange={(v) => set('cash', v)} suffix="円" />
                <NumberField
                  label="クレカ"
                  value={input.credit}
                  onChange={(v) => set('credit', v)}
                  suffix="円"
                />
                <NumberField
                  label="電子マネー"
                  value={input.emoney}
                  onChange={(v) => set('emoney', v)}
                  suffix="円"
                />
                <NumberField label="QR" value={input.qr} onChange={(v) => set('qr', v)} suffix="円" />
              </div>
              <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                当日売り上げ <span className="tabular font-bold">{formatYen(computed.dailySales)}</span>
              </p>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-bold text-slate-600">来客数</legend>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
                <NumberField
                  label="組数"
                  value={input.groups}
                  onChange={(v) => set('groups', v)}
                  suffix="組"
                />
                <NumberField
                  label="新規"
                  value={input.newCustomers}
                  onChange={(v) => set('newCustomers', v)}
                  suffix="名"
                />
                <NumberField
                  label="既存"
                  value={input.existingCustomers}
                  onChange={(v) => set('existingCustomers', v)}
                  suffix="名"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                総客数 <span className="tabular font-medium">{computed.totalCustomers}名</span>
                {computed.totalCustomers > 0 && (
                  <>
                    　客単価 <span className="tabular font-medium">{formatYen(perCustomer)}</span>
                    　新規率 <span className="tabular font-medium">{newRate}%</span>
                  </>
                )}
              </p>
            </fieldset>

            <div>
              <label htmlFor={commentId} className="label">
                総評
              </label>
              <textarea
                id={commentId}
                rows={3}
                value={input.comment}
                onChange={(e) => set('comment', e.target.value)}
                placeholder="本日の総評を入力"
                className="input mt-1 resize-y"
              />
            </div>
          </div>

          {/* ------------------------------------------- LINE転送プレビュー */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <p className="text-[11px] text-slate-500">当月累計</p>
                <p className="tabular mt-0.5 text-sm font-bold text-slate-800">
                  {formatYen(computed.monthCumulative)}
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 px-2 py-2">
                <p className="text-[11px] text-amber-700">1日必達</p>
                <p className="tabular mt-0.5 text-sm font-bold text-amber-700">
                  {formatYen(computed.dailyRequired)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-2 py-2">
                <p className="text-[11px] text-emerald-700">新規累計</p>
                <p className="tabular mt-0.5 text-sm font-bold text-emerald-700">
                  {computed.newCustomersCumulative}名
                </p>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">LINE転送フォーマット</span>
                <span className="text-[11px] text-slate-400">
                  前日まで累計 {formatYen(carryOver.cumulativeSales)}
                </span>
              </div>
              <pre className="h-[280px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 sm:h-[320px]">
                {lineText}
              </pre>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={handleCopy} className="btn-ghost">
                {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                {copied ? 'コピーしました' : 'テキストをコピー'}
              </button>
              <a
                href={buildLineShareUrl(lineText)}
                target="_blank"
                rel="noreferrer"
                className="btn-emerald"
              >
                <Share2 size={15} />
                LINEで送る
              </a>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ 当月の登録済み日報 */}
        <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <History size={15} className="text-slate-400" />
              当月の登録済み日報（{monthReports.length} 件）
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-400 transition ${historyOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {historyOpen && (
            <>
              <p className="mt-1.5 text-xs text-slate-500">
                読み込むと入力欄に反映され、LINE 転送テキストを作り直せます（登録はされません）。
              </p>
              {monthReports.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  この月の登録はまだありません。
                </p>
              ) : (
                <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto">
                  {monthReports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700">
                          {formatReportDate(r.date)}
                          <span className="tabular ml-2 font-normal text-slate-500">
                            {formatYen(r.gross)}
                          </span>
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {r.groups}組 {r.totalCustomers}名
                          {r.comment ? ` ／ ${r.comment}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadRecord(r)}
                        className="btn-ghost shrink-0 !px-2.5 !py-1.5 !text-xs"
                      >
                        読み込む
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:rounded-b-xl sm:px-5">
          <button type="button" onClick={onClose} className="btn-ghost">
            キャンセル
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting} className="btn-primary">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            スプレッドシートへ登録
          </button>
        </footer>
      </div>
    </div>
  );
}
