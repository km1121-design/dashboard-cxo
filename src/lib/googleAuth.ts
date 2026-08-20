/**
 * Google Identity Services（GIS）でのサインイン。
 *
 * 得られるのは ID トークン（JWT）1 本だけで、これを GAS に渡す。
 * **本人確認は GAS 側が Google に問い合わせて行う**。ここは
 * 「トークンを取ってくる・保持する・切れたら取り直す」係に徹する。
 *
 * トークンは sessionStorage に置く。リロードではサインインが続くが、
 * タブを閉じれば消える（共有端末で開きっぱなしにならないように）。
 */
import { isTokenExpired } from '@/lib/jwt';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_KEY = 'gooner:googleIdToken:v1';

/* ------------------------------------------------------ GIS の型（最小限） */

interface CredentialResponse {
  credential?: string;
}

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    hd?: string;
    cancel_on_tap_outside?: boolean;
    itp_support?: boolean;
  }) => void;
  prompt: () => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'small' | 'medium' | 'large';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
      locale?: string;
    },
  ) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

function getIdApi(): GoogleIdApi | null {
  return window.google?.accounts?.id ?? null;
}

/* ------------------------------------------------------------ スクリプト読込 */

let loadPromise: Promise<void> | null = null;

/** GIS のスクリプトを 1 回だけ読み込む */
export function loadGoogleIdentity(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('ブラウザ環境ではありません。'));
  }
  if (getIdApi()) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');

    const done = () => (getIdApi() ? resolve() : reject(new Error('Google のサインインを初期化できませんでした。')));

    script.addEventListener('load', done, { once: true });
    script.addEventListener(
      'error',
      () => {
        loadPromise = null;
        reject(new Error('Google のサインイン用スクリプトを読み込めませんでした。ネットワークを確認してください。'));
      },
      { once: true },
    );

    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else if (getIdApi()) {
      done();
    }
  });

  return loadPromise;
}

/* ------------------------------------------------------------------ 初期化 */

export interface InitOptions {
  clientId: string;
  /** 組織ドメインを指定すると、そのドメインのアカウントだけが候補に出る */
  hd?: string;
  /** サインインが成立したときに ID トークンを受け取る */
  onCredential: (idToken: string) => void;
}

let initialized = false;

/**
 * 資格情報の受け取り先。
 *
 * GIS への `initialize` は 1 回きりにしたいが、React はコンポーネントを
 * 貼り直すことがある（開発時の StrictMode を含む）。初回に渡したコールバックを
 * 握り続けると、貼り直したあとのサインインが古い呼び出し先に飛んで捨てられるため、
 * 受け取り先はここで差し替えられるようにしておく。
 */
let credentialHandler: ((idToken: string) => void) | null = null;

/** GIS を初期化する。2 回目以降は受け取り先の差し替えだけを行う */
export async function initGoogleIdentity(options: InitOptions): Promise<void> {
  await loadGoogleIdentity();

  credentialHandler = options.onCredential;
  if (initialized) return;

  const api = getIdApi();
  if (!api) throw new Error('Google のサインインを初期化できませんでした。');

  api.initialize({
    client_id: options.clientId,
    // 一度サインインしていれば、次回からは黙って通す
    auto_select: true,
    cancel_on_tap_outside: false,
    itp_support: true,
    ...(options.hd ? { hd: options.hd } : {}),
    callback: (response) => {
      const credential = String(response?.credential ?? '');
      if (credential && credentialHandler) credentialHandler(credential);
    },
  });

  initialized = true;
}

/** ワンタップのサインインを促す */
export function promptGoogleSignIn(): void {
  getIdApi()?.prompt();
}

/** サインインボタンを描画する */
export function renderGoogleButton(parent: HTMLElement, width?: number): void {
  getIdApi()?.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    locale: 'ja',
    ...(width ? { width } : {}),
  });
}

/** 自動サインインを解除する（サインアウト時） */
export function disableGoogleAutoSelect(): void {
  getIdApi()?.disableAutoSelect();
}

/* -------------------------------------------------------------- トークン保管 */

function readSession(key: string): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeSession(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // 保存できなくてもその場のセッションは続く
  }
}

/** 保存済みの ID トークン。期限切れなら空文字を返して捨てる */
export function getStoredIdToken(): string {
  const token = readSession(TOKEN_KEY);
  if (!token) return '';
  if (isTokenExpired(token)) {
    writeSession(TOKEN_KEY, '');
    return '';
  }
  return token;
}

export function setStoredIdToken(token: string): void {
  writeSession(TOKEN_KEY, token);
}

export function clearStoredIdToken(): void {
  writeSession(TOKEN_KEY, '');
}
