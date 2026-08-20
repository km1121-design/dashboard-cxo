/**
 * Google アカウント認証の状態管理。
 *
 * `VITE_GOOGLE_CLIENT_ID` が未設定なら何もしない（従来の合言葉運用のまま）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, GOOGLE_HD, isGoogleAuthEnabled } from '@/lib/env';
import {
  clearStoredIdToken,
  disableGoogleAutoSelect,
  getStoredIdToken,
  initGoogleIdentity,
  promptGoogleSignIn,
  renderGoogleButton,
  setStoredIdToken,
} from '@/lib/googleAuth';
import { getTokenEmail, getTokenExpiryMs } from '@/lib/jwt';

export type AuthStatus =
  /** Google 認証を使わない構成 */
  | 'disabled'
  /** GIS の読み込み中 */
  | 'loading'
  /** サインイン待ち */
  | 'signed-out'
  | 'signed-in'
  | 'error';

export interface UseGoogleAuthResult {
  enabled: boolean;
  status: AuthStatus;
  /** GAS に渡す ID トークン */
  idToken: string;
  /** サインイン中のメールアドレス（表示用。信頼はしない） */
  email: string;
  error: string | null;
  /** サインインボタンを描画する要素に渡す */
  buttonRef: (node: HTMLDivElement | null) => void;
  signOut: () => void;
  /** 期限切れなどで再サインインを促す */
  promptSignIn: () => void;
}

/** 期限の何ミリ秒前に切れたものとして扱うか（通信中の失効を避ける余裕） */
const EXPIRY_MARGIN_MS = 60_000;

export function useGoogleAuth(): UseGoogleAuthResult {
  const enabled = isGoogleAuthEnabled();

  const [status, setStatus] = useState<AuthStatus>(enabled ? 'loading' : 'disabled');
  const [idToken, setIdToken] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // ボタンを描画する要素。サインイン画面が出たあとに現れるため ref コールバックで受ける
  const buttonNode = useRef<HTMLDivElement | null>(null);

  const drawButton = useCallback(() => {
    const node = buttonNode.current;
    if (!node) return;
    node.replaceChildren();
    try {
      renderGoogleButton(node, Math.min(320, Math.max(220, node.clientWidth || 280)));
    } catch {
      // 描画に失敗してもワンタップ側が使える
    }
  }, []);

  const buttonRef = useCallback(
    (node: HTMLDivElement | null) => {
      buttonNode.current = node;
      if (node) drawButton();
    },
    [drawButton],
  );

  const acceptToken = useCallback((token: string) => {
    setStoredIdToken(token);
    setIdToken(token);
    setError(null);
    setStatus('signed-in');
  }, []);

  // 初期化
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const stored = getStoredIdToken();
    if (stored) {
      setIdToken(stored);
      setStatus('signed-in');
    }

    initGoogleIdentity({
      clientId: GOOGLE_CLIENT_ID,
      hd: GOOGLE_HD || undefined,
      // 受け取り先は initGoogleIdentity 側で常に最新に差し替えられる。
      // ここで cancelled を見てしまうと、貼り直し後のサインインを取りこぼす。
      onCredential: acceptToken,
    })
      .then(() => {
        if (cancelled) return;
        if (getStoredIdToken()) return;
        setStatus('signed-out');
        // ワンタップが出せる状況なら黙って通す。出せなければボタンから入ってもらう
        promptGoogleSignIn();
        drawButton();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, acceptToken, drawButton]);

  // 有効期限が来たらサインインし直してもらう
  useEffect(() => {
    if (!enabled || !idToken) return;

    const expiry = getTokenExpiryMs(idToken);
    const delay = expiry - EXPIRY_MARGIN_MS - Date.now();

    const expire = () => {
      clearStoredIdToken();
      setIdToken('');
      setStatus('signed-out');
      promptGoogleSignIn();
      drawButton();
    };

    if (delay <= 0) {
      expire();
      return;
    }

    const timer = setTimeout(expire, delay);
    return () => clearTimeout(timer);
  }, [enabled, idToken, drawButton]);

  const signOut = useCallback(() => {
    disableGoogleAutoSelect();
    clearStoredIdToken();
    setIdToken('');
    setStatus('signed-out');
    drawButton();
  }, [drawButton]);

  const promptSignIn = useCallback(() => {
    promptGoogleSignIn();
    drawButton();
  }, [drawButton]);

  return {
    enabled,
    status,
    idToken,
    email: idToken ? getTokenEmail(idToken) : '',
    error,
    buttonRef,
    signOut,
    promptSignIn,
  };
}
