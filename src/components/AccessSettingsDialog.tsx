/**
 * 接続設定ダイアログ。
 *
 * GAS の URL とアクセストークンをブラウザに保存する。
 * トークンをビルドに埋め込まないことで、公開ページの JavaScript を
 * 読まれてもスプレッドシートへアクセスされないようにする。
 */
import { useEffect, useId, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Trash2, Users, X } from 'lucide-react';
import {
  clearCredentials,
  getStoredToken,
  getStoredUrl,
  setStoredToken,
  setStoredUrl,
} from '@/lib/credentials';
import { GAS_API_URL } from '@/lib/env';
import {
  buildViewerLink,
  isPersonalOnly,
  SELECTABLE_MEMBERS,
  type Viewer,
  type ViewerId,
} from '@/lib/viewer';

interface Props {
  open: boolean;
  /** 未設定で初回に自動表示された場合は閉じるボタンを出さない */
  dismissable?: boolean;
  onClose: () => void;
  /** 保存後に再同期させる */
  onSaved: () => void;
  /** 現在の閲覧者 */
  viewer: Viewer;
  onViewerChange: (id: ViewerId) => void;
}

/** メンバーごとの配布リンクを作ってコピーするパネル */
function ViewerLinkPanel() {
  const [copied, setCopied] = useState<ViewerId | null>(null);

  const base =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${window.location.pathname}`;

  const copy = async (id: ViewerId) => {
    try {
      await navigator.clipboard.writeText(buildViewerLink(base, id));
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const personal = SELECTABLE_MEMBERS.filter((m) => isPersonalOnly(m.id));

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-600">個人ビューの配布リンク</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
        このリンクで開くと、本人の実績だけが表示され、画面から閲覧者を切り替えられなくなる。
      </p>
      <ul className="mt-2 space-y-1.5">
        {personal.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-slate-600">{m.name}</span>
            <button
              type="button"
              onClick={() => void copy(m.id)}
              className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-600 transition hover:bg-slate-50"
            >
              {copied === m.id ? (
                <Check size={13} className="text-emerald-600" />
              ) : (
                <Copy size={13} />
              )}
              {copied === m.id ? 'コピー済み' : 'リンクをコピー'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccessSettingsDialog({
  open,
  dismissable = true,
  onClose,
  onSaved,
  viewer,
  onViewerChange,
}: Props) {
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [reveal, setReveal] = useState(false);
  const tokenId = useId();
  const urlId = useId();
  const viewerId = useId();

  // 開くたびに保存済みの値を読み込む
  useEffect(() => {
    if (!open) return;
    setToken(getStoredToken());
    setUrl(getStoredUrl());
    setReveal(false);
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    setStoredToken(token);
    setStoredUrl(url);
    onSaved();
    onClose();
  };

  const handleClear = () => {
    clearCredentials();
    setToken('');
    setUrl('');
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="card my-8 w-full max-w-lg">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="inline-flex items-center gap-2 text-base font-bold text-slate-800">
            <KeyRound size={17} className="text-indigo-600" />
            接続設定
          </h2>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          )}
        </header>

        <div className="space-y-4 p-5">
          <p className="rounded-lg bg-indigo-50 px-3 py-2.5 text-xs leading-relaxed text-indigo-800">
            アクセストークンを入力すると、このブラウザにだけ保存されます。
            公開ページの中身にトークンは含まれないため、
            トークンを知っている人だけがデータを閲覧・登録できます。
          </p>

          <div>
            <label htmlFor={tokenId} className="label">
              アクセストークン
            </label>
            <div className="relative mt-1">
              <input
                id={tokenId}
                type={reveal ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                placeholder="GAS の AUTH_TOKEN と同じ文字列"
                className="input pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={reveal ? 'トークンを隠す' : 'トークンを表示する'}
              >
                {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Apps Script の「プロジェクトの設定 → スクリプト プロパティ」で設定した
              <code className="mx-1 rounded bg-slate-100 px-1">AUTH_TOKEN</code>
              の値を入力してください。
            </p>
          </div>

          <div>
            <label htmlFor={urlId} className="label">
              GAS ウェブアプリ URL（任意）
            </label>
            <input
              id={urlId}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={GAS_API_URL || 'https://script.google.com/macros/s/.../exec'}
              className="input mt-1 font-mono text-xs"
            />
            <p className="mt-1 text-xs text-slate-500">
              {GAS_API_URL
                ? '空欄のままなら、ビルド時に設定された URL を使います。'
                : 'ビルド時の URL が未設定です。ここに /exec URL を入力してください。'}
            </p>
          </div>
          {/* -------------------------------------------------------- 閲覧者 */}
          <div className="border-t border-slate-200 pt-4">
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700">
              <Users size={15} className="text-slate-400" />
              閲覧者
            </p>

            {viewer.locked ? (
              <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                このブラウザは <span className="font-medium">{viewer.member?.name}</span>{' '}
                の個人ビューに固定されています。切り替えが必要な場合は管理者に連絡してください。
              </p>
            ) : (
              <>
                <label htmlFor={viewerId} className="label mt-1.5">
                  この端末で表示する内容
                </label>
                <select
                  id={viewerId}
                  value={viewer.id}
                  onChange={(e) => onViewerChange(e.target.value as ViewerId)}
                  className="input mt-1"
                >
                  <option value="all">全社ダッシュボード（管理者）</option>
                  {SELECTABLE_MEMBERS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {isPersonalOnly(m.id) ? '（個人実績のみ）' : '（全社を閲覧）'}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  表示の切り分けであって権限の制御ではありません。データ取得のトークンは共通のため、
                  この設定を変えれば全社ビューにも戻れます。
                </p>
                <div className="mt-2.5">
                  <ViewerLinkPanel />
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={handleClear}
            className="btn-ghost !text-rose-600 hover:!bg-rose-50"
          >
            <Trash2 size={15} />
            保存内容を消去
          </button>
          <div className="flex gap-2">
            {dismissable && (
              <button type="button" onClick={onClose} className="btn-ghost">
                キャンセル
              </button>
            )}
            <button type="button" onClick={handleSave} className="btn-primary">
              保存して接続
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
