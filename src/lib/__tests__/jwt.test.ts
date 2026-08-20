/**
 * ID トークン読み取りのテスト。
 * 署名検証はしない（本人確認は GAS 側）ので、ここではデコードと期限判定だけを見る。
 */
import { decodeJwtPayload, getTokenEmail, getTokenExpiryMs, isTokenExpired } from '@/lib/jwt';

/** テスト用に JWT 形式の文字列を組み立てる（署名はダミー） */
function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const NOW = 1_800_000_000_000; // 固定の現在時刻（ミリ秒）

describe('decodeJwtPayload', () => {
  it('ペイロードを取り出す', () => {
    const token = makeJwt({ email: 'irifune@gooner.space', exp: 1_800_000_060 });
    expect(decodeJwtPayload(token)).toEqual({
      email: 'irifune@gooner.space',
      exp: 1_800_000_060,
    });
  });

  it('マルチバイト文字を壊さない', () => {
    const token = makeJwt({ name: '入舩 雄志' });
    expect(decodeJwtPayload(token)?.name).toBe('入舩 雄志');
  });

  it('パディングが必要な長さでも読める', () => {
    const token = makeJwt({ email: 'a@b.co', hd: 'gooner.space', sub: '1234567890' });
    expect(decodeJwtPayload(token)?.hd).toBe('gooner.space');
  });

  it('壊れた入力では null を返す', () => {
    expect(decodeJwtPayload('')).toBeNull();
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });

  it('ペイロードが JSON オブジェクトでなければ null', () => {
    const token = `x.${Buffer.from('"文字列"', 'utf8').toString('base64url')}.y`;
    expect(decodeJwtPayload(token)).toBeNull();
  });
});

describe('getTokenExpiryMs', () => {
  it('exp を秒からミリ秒に直す', () => {
    expect(getTokenExpiryMs(makeJwt({ exp: 1_800_000_060 }))).toBe(1_800_000_060_000);
  });

  it('exp が無ければ 0', () => {
    expect(getTokenExpiryMs(makeJwt({ email: 'a@b.co' }))).toBe(0);
    expect(getTokenExpiryMs('broken')).toBe(0);
  });
});

describe('isTokenExpired', () => {
  it('期限まで十分あれば false', () => {
    const token = makeJwt({ exp: NOW / 1000 + 3600 });
    expect(isTokenExpired(token, 60_000, NOW)).toBe(false);
  });

  it('期限が過ぎていれば true', () => {
    const token = makeJwt({ exp: NOW / 1000 - 1 });
    expect(isTokenExpired(token, 60_000, NOW)).toBe(true);
  });

  it('余裕（既定60秒）の内側に入ったら切れた扱いにする', () => {
    const token = makeJwt({ exp: NOW / 1000 + 30 });
    expect(isTokenExpired(token, 60_000, NOW)).toBe(true);
    // 余裕を 0 にすればまだ有効
    expect(isTokenExpired(token, 0, NOW)).toBe(false);
  });

  it('exp が読めないトークンは切れた扱い', () => {
    expect(isTokenExpired('broken', 60_000, NOW)).toBe(true);
  });
});

describe('getTokenEmail', () => {
  it('メールアドレスを返す', () => {
    expect(getTokenEmail(makeJwt({ email: 'mita@gooner.space' }))).toBe('mita@gooner.space');
  });

  it('読めなければ空文字', () => {
    expect(getTokenEmail('broken')).toBe('');
  });
});
