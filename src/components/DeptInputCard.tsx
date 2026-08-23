/**
 * 事業部 1 つ分の月次入力（経費・件数・目標・計画）。
 *
 * スプレッドシートの 1 行に対応する。保存すると全員の画面に反映される。
 * 月別結果（管理者）と個人ビュー（本人）の両方から同じ部品を使う。
 */
import { useEffect, useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { NumberField } from '@/components/NumberField';
import { DEPT_BY_ID } from '@/constants/master';
import type { DeptId, DeptInputRecord } from '@/types';

interface Props {
  deptId: DeptId;
  /** 保存済みの行（未入力なら空の行） */
  record: DeptInputRecord;
  onSave: (record: DeptInputRecord) => Promise<boolean>;
  saving: boolean;
  /** 見出しを出すか（個人ビューでは外側に見出しがあるので省く） */
  showHeading?: boolean;
}

/** 事業部ごとに意味のある欄だけを出す */
function fieldsFor(deptId: DeptId) {
  return {
    headcount: deptId === 'hr',
    placements: deptId === 'hr',
    personalExpense: deptId === 'hr',
    // 売上目標は日割り進捗に使う。店舗を持つイベント営業以外でも置けるようにしておく
    salesTarget: deptId !== 'hq',
  };
}

export function DeptInputCard({ deptId, record, onSave, saving, showHeading = true }: Props) {
  const [draft, setDraft] = useState<DeptInputRecord>(record);
  const [savedAt, setSavedAt] = useState(false);

  // 月の切り替えや再同期で保存済みの値が変わったら、編集中の内容を作り直す
  useEffect(() => {
    setDraft(record);
    setSavedAt(false);
  }, [record]);

  const set = (key: keyof DeptInputRecord, value: number) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const dirty = (Object.keys(draft) as (keyof DeptInputRecord)[]).some(
    (k) => draft[k] !== record[k],
  );

  const show = fieldsFor(deptId);

  const handleSave = async () => {
    const ok = await onSave(draft);
    if (ok) {
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2500);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3.5">
      {showHeading && (
        <h3 className="text-sm font-bold text-slate-700">{DEPT_BY_ID[deptId]?.label ?? deptId}</h3>
      )}

      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          label={deptId === 'hr' ? '直接経費（広告/コンサル）' : '経費'}
          value={draft.directExpense}
          onChange={(v) => set('directExpense', v)}
          suffix="円"
        />

        {show.headcount && (
          <NumberField
            label="人数（概算固定費 10万/人）"
            value={draft.headcount}
            onChange={(v) => set('headcount', v)}
            suffix="人"
          />
        )}

        {show.placements && (
          <>
            <NumberField
              label="決定件数 広告経由（1万/件）"
              value={draft.placementAd}
              onChange={(v) => set('placementAd', v)}
              suffix="件"
            />
            <NumberField
              label="決定件数 リファーラル（3万/件）"
              value={draft.placementReferral}
              onChange={(v) => set('placementReferral', v)}
              suffix="件"
            />
          </>
        )}

        {show.personalExpense && (
          <NumberField
            label="個人直接経費（個人PL用）"
            value={draft.personalDirectExpense}
            onChange={(v) => set('personalDirectExpense', v)}
            suffix="円"
          />
        )}

        {show.salesTarget && (
          <NumberField
            label="月間売上目標"
            value={draft.salesTarget}
            onChange={(v) => set('salesTarget', v)}
            suffix="円"
          />
        )}

        <NumberField
          label="売上計画（予実の計画値）"
          value={draft.salesBudget}
          onChange={(v) => set('salesBudget', v)}
          suffix="円"
        />
        <NumberField
          label="営業利益計画（予実の計画値）"
          value={draft.profitBudget}
          onChange={(v) => set('profitBudget', v)}
          suffix="円"
          // 物流のように構造的に赤字の事業部があるため、マイナスを許す
          allowNegative
        />
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {savedAt && !dirty && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check size={13} />
            保存しました
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="btn-ghost !px-3 !py-1.5 !text-xs"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          保存
        </button>
      </div>
    </div>
  );
}
