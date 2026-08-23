import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** 入力欄の右端に薄く表示する単位（円・名・日 など） */
  suffix?: string;
  min?: number;
  /**
   * マイナスを許すか。既定は 0 以上（金額・件数はマイナスにならない）。
   * 営業利益計画のように赤字を置く欄でだけ true にする。
   */
  allowNegative?: boolean;
}

/** ラベルと input を id で紐づけた数値入力欄 */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  allowNegative = false,
}: Props) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type="number"
          min={allowNegative ? undefined : min}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`input ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
