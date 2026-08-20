/**
 * 閲覧者（ビューア）の解決。
 *
 * 入舩・中原（役職 Manager）は全体ダッシュボードではなく自分の実績だけを見る。
 * 三田・本部（役職 Admin）は従来どおり全社を見る。
 *
 * ## 決め方は 2 通り
 *
 * 1. **Google アカウント認証（推奨）** — GAS が ID トークンから本人を判定し、
 *    レスポンスに `viewer` を載せて返す。Manager には自分の事業部の行しか
 *    返ってこないため、ブラウザ側を書き換えても他事業部は見られない。
 *    この場合 `fromServerViewer()` の結果が常に優先される。
 *
 * 2. **配布リンク／ローカル設定（従来）** — `?viewer=M001&lock=1` と localStorage で
 *    決める。こちらは**表示の切り分けであって権限の強制ではない**。
 *    保存値を書き換えれば全社ビューに戻れる（データ自体は全件返ってくる）。
 */
import { MEMBERS, MEMBER_BY_ID } from '@/constants/master';
import type { Member, MemberId, ServerViewer } from '@/types';

/** 閲覧者ID。`all` は全社ビュー */
export type ViewerId = 'all' | MemberId;

/** 閲覧できる範囲 */
export type ViewerScope = 'company' | 'personal';

export interface Viewer {
  id: ViewerId;
  scope: ViewerScope;
  /** 個人ビューの対象メンバー（`all` のときは null） */
  member: Member | null;
  /** 固定リンクで開かれ、画面から切り替えられない状態か */
  locked: boolean;
}

const VIEWER_KEY = 'gooner:viewer:v1';
const LOCK_KEY = 'gooner:viewerLocked:v1';

/** URL クエリのキー（`?viewer=M001&lock=1`） */
export const VIEWER_PARAM = 'viewer';
export const LOCK_PARAM = 'lock';

/** 個人ビューに閉じ込めるメンバー（＝役職 Manager） */
export function isPersonalOnly(memberId: MemberId): boolean {
  return MEMBER_BY_ID[memberId]?.role === 'Manager';
}

/** 閲覧者として選べるメンバー */
export const SELECTABLE_MEMBERS: Member[] = MEMBERS;

function isViewerId(value: string): value is ViewerId {
  return value === 'all' || Boolean(MEMBER_BY_ID[value]);
}

/** `ViewerId` から `Viewer` を組み立てる（純関数） */
export function toViewer(id: ViewerId, locked = false): Viewer {
  if (id === 'all') return { id, scope: 'company', member: null, locked };

  const member = MEMBER_BY_ID[id] ?? null;
  if (!member) return { id: 'all', scope: 'company', member: null, locked: false };

  return {
    id,
    scope: isPersonalOnly(id) ? 'personal' : 'company',
    member,
    locked,
  };
}

/**
 * `?viewer=M001&lock=1` を読む。
 * 不正な値・未指定なら null を返す（保存済みの値を使う）。
 */
export function parseViewerFromSearch(search: string): { id: ViewerId; locked: boolean } | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = (params.get(VIEWER_PARAM) ?? '').trim();
  if (!raw || !isViewerId(raw)) return null;

  const lock = (params.get(LOCK_PARAM) ?? '').trim();
  return { id: raw, locked: lock === '1' || lock === 'true' };
}

/** メンバーごとに配る URL を作る */
export function buildViewerLink(baseUrl: string, id: ViewerId, locked = true): string {
  const [path, query = ''] = baseUrl.split('?');
  const params = new URLSearchParams(query);
  params.set(VIEWER_PARAM, id);
  if (locked) params.set(LOCK_PARAM, '1');
  else params.delete(LOCK_PARAM);
  return `${path}?${params.toString()}`;
}

/**
 * GAS が返した閲覧者から `Viewer` を作る。
 *
 * サーバーの判定が最終的な正。マスタとサーバーで食い違った場合は
 * **狭い方（personal）に倒す**。
 */
export function fromServerViewer(server?: ServerViewer | null): Viewer | null {
  if (!server || server.mode !== 'google' || !server.memberId) return null;

  const base = toViewer(server.memberId, true);
  const scope: ViewerScope =
    server.scope === 'personal' || base.scope === 'personal' ? 'personal' : 'company';

  return { ...base, scope, locked: true };
}

/* ------------------------------------------------------------ 保存・読み出し */

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
    // 保存できなくてもその場の表示は続ける
  }
}

export function getStoredViewer(): { id: ViewerId; locked: boolean } {
  const raw = read(VIEWER_KEY).trim();
  return {
    id: isViewerId(raw) ? raw : 'all',
    locked: read(LOCK_KEY) === '1',
  };
}

export function setStoredViewer(id: ViewerId, locked: boolean): void {
  write(VIEWER_KEY, id === 'all' && !locked ? '' : id);
  write(LOCK_KEY, locked ? '1' : '');
}

/**
 * 起動時の閲覧者を決める。
 * URL クエリがあればそれを保存して優先し、アドレスバーからクエリを消す
 * （配布リンクがそのまま共有され続けるのを避ける）。
 */
export function resolveInitialViewer(): Viewer {
  const fromUrl =
    typeof window === 'undefined' ? null : parseViewerFromSearch(window.location.search);

  if (fromUrl) {
    setStoredViewer(fromUrl.id, fromUrl.locked);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(VIEWER_PARAM);
      url.searchParams.delete(LOCK_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // replaceState が使えない環境ではそのままにする
    }
    return toViewer(fromUrl.id, fromUrl.locked);
  }

  const stored = getStoredViewer();
  return toViewer(stored.id, stored.locked);
}
