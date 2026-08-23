/**
 * 会議メモ（所感・決定事項）。
 *
 * 数字と同じ画面に決めたことを残すための欄。前月に決めたことを並べて出すので、
 * 翌月の会議で「先月なにを決めたか」から始められる。
 * 全社を見られる人だけが読み書きする（GAS 側でも制限している）。
 */
import { useEffect, useState } from 'react';
import { Check, ClipboardList, Loader2, Save } from 'lucide-react';
import type { MonthlyNoteRecord } from '@/types';

interface Props {
  month: string;
  /** 全期間のメモ */
  notes: MonthlyNoteRecord[];
  onSave: (record: MonthlyNoteRecord) => Promise<boolean>;
  /** 保存できるか（旧デプロイでは false） */
  editable: boolean;
}

/** `2026-08` の 1 つ前の月 */
function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const EMPTY: Omit<MonthlyNoteRecord, 'month'> = {
  summary: '',
  decision: '',
  owner: '',
  due: '',
};

export function MeetingNotePanel({ month, notes, onSave, editable }: Props) {
  const saved = notes.find((n) => n.month === month);
  const previous = notes.find((n) => n.month === previousMonth(month));

  const [draft, setDraft] = useState<MonthlyNoteRecord>({ month, ...EMPTY, ...saved });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDraft({ month, ...EMPTY, ...notes.find((n) => n.month === month) });
    setDone(false);
  }, [month, notes]);

  const dirty =
    draft.summary !== (saved?.summary ?? '') ||
    draft.decision !== (saved?.decision ?? '') ||
    draft.owner !== (saved?.owner ?? '') ||
    draft.due !== (saved?.due ?? '');

  const set = (key: keyof Omit<MonthlyNoteRecord, 'month'>, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await onSave(draft);
      if (ok) {
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 print:break-inside-avoid">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <ClipboardList size={15} className="text-slate-400" />
        会議メモ
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        この月の所感と、次までに何をするか。数字と一緒に残すので、翌月の会議の入口になる。
      </p>

      {!editable && (
        <p className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          GAS が会議メモのシートに対応していないため、まだ保存できません。
          gas/Code.gs を最新版にして再デプロイしてください。
        </p>
      )}

      {previous && (previous.decision || previous.summary) && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 print:hidden">
          <p className="text-xs font-medium text-slate-500">前月（{previous.month}）に決めたこと</p>
          {previous.decision && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{previous.decision}</p>
          )}
          {(previous.owner || previous.due) && (
            <p className="mt-1 text-xs text-slate-500">
              {previous.owner && `担当 ${previous.owner}`}
              {previous.owner && previous.due && ' ／ '}
              {previous.due && `期限 ${previous.due}`}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="note-summary" className="label">
            所感（この月に何が起きたか）
          </label>
          <textarea
            id="note-summary"
            rows={3}
            value={draft.summary}
            onChange={(e) => set('summary', e.target.value)}
            disabled={!editable}
            placeholder="例：イベント案件が想定より1件多く、BAR は雨天の影響で客数が伸びなかった。"
            className="input mt-1 resize-y disabled:bg-slate-50"
          />
        </div>

        <div>
          <label htmlFor="note-decision" className="label">
            決定事項（次までに何をするか）
          </label>
          <textarea
            id="note-decision"
            rows={3}
            value={draft.decision}
            onChange={(e) => set('decision', e.target.value)}
            disabled={!editable}
            placeholder="例：人材部の広告費を月20万まで引き上げ、決定単価を検証する。"
            className="input mt-1 resize-y disabled:bg-slate-50"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="note-owner" className="label">
              担当
            </label>
            <input
              id="note-owner"
              type="text"
              value={draft.owner}
              onChange={(e) => set('owner', e.target.value)}
              disabled={!editable}
              className="input mt-1 min-h-[40px] disabled:bg-slate-50"
            />
          </div>
          <div>
            <label htmlFor="note-due" className="label">
              期限
            </label>
            <input
              id="note-due"
              type="date"
              value={/^\d{4}-\d{2}-\d{2}$/.test(draft.due) ? draft.due : ''}
              onChange={(e) => set('due', e.target.value)}
              disabled={!editable}
              className="input mt-1 min-h-[40px] disabled:bg-slate-50"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 print:hidden">
        {done && !dirty && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check size={13} />
            保存しました
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!editable || !dirty || saving}
          className="btn-ghost !px-3 !py-1.5 !text-xs"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          保存
        </button>
      </div>
    </div>
  );
}
