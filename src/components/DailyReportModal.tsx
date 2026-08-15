/**
 * BARROOTS 店舗日報 作成 ＆ LINE転送フォーマット自動生成モーダル（指示書 6章）
 */
import { useId, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Send, Share2, Store, X } from 'lucide-react';
import { NumberField } from '@/components/NumberField';
import { BAR_CATEGORY, DEPT_BY_ID, STORE_NAME } from '@/constants/master';
import { generateRecordId } from '@/lib/gasApi';
import type { DailyReportInput, SaleRecordInput } from '@/types';
import { buildCarryOver, calcDailyReport } from '@/utils/calculator';
import { countRemainingBusinessDays, toISODate } from '@/utils/date';
import { formatYen } from '@/utils/format';
import { buildLineReportText, buildLineShareUrl } from '@/utils/lineFormat';
import type { SaleRecord } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  records: SaleRecord[];
  /** GAS へ日報を送信する。成功したら true */
  onSubmit: (record: SaleRecordInput) => Promise<boolean>;
  submitting: boolean;
  defaultMonthlyTarget: number;
}

const today = () => toISODate(new Date());

function makeInitialInput(monthlyTarget: number): DailyReportInput {
  const date = today();
  return {
    date,
    member: '入舩 雄志',
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
}: Props) {
  const [input, setInput] = useState<DailyReportInput>(() =>
    makeInitialInput(defaultMonthlyTarget),
  );
  const [copied, setCopied] = useState(false);
  const dateId = useId();
  const memberId = useId();
  const commentId = useId();

  const carryOver = useMemo(() => buildCarryOver(records, input.date), [records, input.date]);
  const computed = useMemo(() => calcDailyReport(input, carryOver), [input, carryOver]);
  const lineText = useMemo(
    () => buildLineReportText(input, carryOver, computed),
    [input, carryOver, computed],
  );

  if (!open) return null;

  const set = <K extends keyof DailyReportInput>(key: K, value: DailyReportInput[K]) => {
    setInput((prev) => {
      const next = { ...prev, [key]: value };
      // 日付を変えたら残営業日を再計算する
      if (key === 'date') {
        next.remainingBusinessDays = countRemainingBusinessDays(value as string, {
          includeSelf: true,
        });
      }
      return next;
    });
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
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card my-4 w-full max-w-4xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="inline-flex items-center gap-2 text-base font-bold text-slate-800">
            <Store size={18} className="text-indigo-600" />
            {STORE_NAME} 店舗日報
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
          {/* -------------------------------------------------- 入力フォーム */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={dateId} className="label">
                  日付
                </label>
                <input
                  id={dateId}
                  type="date"
                  value={input.date}
                  onChange={(e) => set('date', e.target.value)}
                  className="input mt-1"
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
                  className="input mt-1"
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
              <div className="mt-2 grid grid-cols-3 gap-3">
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
              <pre className="h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
                {lineText}
              </pre>
            </div>

            <div className="grid grid-cols-2 gap-2">
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

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            スプレッドシートへ登録
          </button>
        </footer>
      </div>
    </div>
  );
}
