/**
 * サインイン画面。
 *
 * Google アカウント認証が有効なとき、サインインが済むまでこれだけを出す。
 * ボタンは Google 提供のものを `buttonRef` の中に描画する。
 */
import { AlertCircle, Loader2, LockKeyhole } from 'lucide-react';
import { STORE_NAME } from '@/constants/master';
import { GOOGLE_HD } from '@/lib/env';
import type { AuthStatus } from '@/hooks/useGoogleAuth';

interface Props {
  status: AuthStatus;
  error: string | null;
  buttonRef: (node: HTMLDivElement | null) => void;
  onRetry: () => void;
}

export function SignInScreen({ status, error, buttonRef, onRetry }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
            <LockKeyhole size={20} />
          </span>
          <div>
            <h1 className="text-base font-bold text-slate-800">
              Gooner 第5期 PL・インセンティブ管理ポータル
            </h1>
            <p className="text-xs text-slate-500">
              合同会社Gooner ／ 事業部損益・支給見立て・{STORE_NAME} 日報
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-slate-600">
          社内メンバー専用です。
          {GOOGLE_HD ? (
            <>
              <span className="font-medium">{GOOGLE_HD}</span> の Google アカウントでサインインしてください。
            </>
          ) : (
            '登録済みの Google アカウントでサインインしてください。'
          )}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          サインインした人に応じて、見られる範囲がサーバー側で決まります。
        </p>

        {status === 'loading' && (
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin text-indigo-500" />
            サインインの準備をしています…
          </p>
        )}

        {status === 'error' && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-500" />
            <div className="text-xs leading-relaxed text-rose-700">
              <p className="font-medium">サインインを開始できませんでした。</p>
              {error && <p className="mt-0.5">{error}</p>}
            </div>
          </div>
        )}

        {/* Google のサインインボタンはこの中に描画される */}
        <div ref={buttonRef} className="mt-6 flex justify-center" />

        <button
          type="button"
          onClick={onRetry}
          className="btn-ghost mt-3 w-full justify-center text-xs"
        >
          サインイン画面が出ないときはこちら
        </button>

        <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-400">
          サインインできない場合は、Google アカウントが利用者名簿に登録されているか
          管理者に確認してください。
        </p>
      </div>
    </div>
  );
}
