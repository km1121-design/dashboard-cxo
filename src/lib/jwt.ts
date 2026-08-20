/**
 * ID トークン（JWT）の読み取り。
 *
 * **署名は検証しない。** ここで読むのは画面表示（サインイン中のメールアドレス）と
 * 有効期限の管理のためだけで、本人確認は GAS 側が Google の tokeninfo に問い合わせて行う。
 * ブラウザで読んだ値を信用してはいけない。
 */

export interface GoogleIdTokenPayload {
  /** 発行先のクライアント ID */
  aud?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  /** 組織ドメイン（Google Workspace） */
  hd?: string;
  /** 失効時刻（秒） */
  exp?: number;
}

/** base64url を UTF-8 文字列に戻す */
function base64UrlDecode(input: string): string {
  const padding = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** JWT のペイロードを取り出す。壊れていれば null */
export function decodeJwtPayload(token: string): GoogleIdTokenPayload | null {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(parts[1]));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

/** 失効時刻（ミリ秒）。読めなければ 0 */
export function getTokenExpiryMs(token: string): number {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : 0;
}

/**
 * 期限切れ（または期限が近い）か。
 *
 * @param skewMs 何ミリ秒手前で「切れた」とみなすか。既定 60 秒。
 *   通信中に切れて 401 になるのを避けるための余裕。
 */
export function isTokenExpired(token: string, skewMs = 60_000, now = Date.now()): boolean {
  const expiry = getTokenExpiryMs(token);
  if (!expiry) return true;
  return expiry - skewMs <= now;
}

/** 表示用のメールアドレス（読めなければ空文字） */
export function getTokenEmail(token: string): string {
  return String(decodeJwtPayload(token)?.email ?? '');
}
