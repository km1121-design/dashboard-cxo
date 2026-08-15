/**
 * 接続情報（GAS の URL とアクセストークン）の保管。
 *
 * トークンはビルドに埋め込まず、利用者が画面から入力してブラウザに保存する。
 * こうすることで、公開された JavaScript を読まれてもトークンは漏れない。
 * URL も画面から上書きでき、その場合はビルドに URL を含めずに運用できる。
 */
const TOKEN_KEY = 'gooner:gasToken:v1';
const URL_KEY = 'gooner:gasUrl:v1';

function read(key: string): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // プライベートモード等で保存できない場合は諦める（その場限りの利用になる）
  }
}

/** 保存済みのアクセストークン */
export function getStoredToken(): string {
  return read(TOKEN_KEY).trim();
}

export function setStoredToken(token: string): void {
  write(TOKEN_KEY, token.trim());
}

/** 画面から上書きした GAS URL（未設定なら空文字＝ビルド時の値を使う） */
export function getStoredUrl(): string {
  return read(URL_KEY).trim();
}

export function setStoredUrl(url: string): void {
  write(URL_KEY, url.trim());
}

/** 保存済みの接続情報をすべて消す */
export function clearCredentials(): void {
  write(TOKEN_KEY, '');
  write(URL_KEY, '');
}
