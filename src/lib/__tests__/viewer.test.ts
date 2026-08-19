/**
 * 閲覧者の解決のテスト。
 * localStorage を触らない純関数だけを対象にする（テスト環境は node）。
 */
import {
  buildViewerLink,
  isPersonalOnly,
  parseViewerFromSearch,
  SELECTABLE_MEMBERS,
  toViewer,
} from '@/lib/viewer';

describe('isPersonalOnly', () => {
  it('役職 Manager（入舩・中原）は個人ビューに閉じる', () => {
    expect(isPersonalOnly('M001')).toBe(true);
    expect(isPersonalOnly('M002')).toBe(true);
  });

  it('役職 Admin（三田・本部）は全社を見られる', () => {
    expect(isPersonalOnly('M003')).toBe(false);
    expect(isPersonalOnly('M004')).toBe(false);
  });
});

describe('toViewer', () => {
  it('all は全社スコープでメンバーを持たない', () => {
    const viewer = toViewer('all');
    expect(viewer.scope).toBe('company');
    expect(viewer.member).toBeNull();
  });

  it('Manager は personal スコープになる', () => {
    const viewer = toViewer('M002');
    expect(viewer.scope).toBe('personal');
    expect(viewer.member?.name).toBe('中原 聖人');
  });

  it('Admin をメンバー指定しても company スコープのまま', () => {
    expect(toViewer('M003').scope).toBe('company');
  });

  it('固定フラグを保持する', () => {
    expect(toViewer('M001', true).locked).toBe(true);
  });
});

describe('parseViewerFromSearch', () => {
  it('?viewer=M001&lock=1 を読む', () => {
    expect(parseViewerFromSearch('?viewer=M001&lock=1')).toEqual({ id: 'M001', locked: true });
  });

  it('lock なしは固定しない', () => {
    expect(parseViewerFromSearch('?viewer=M002')).toEqual({ id: 'M002', locked: false });
  });

  it('先頭の ? は省略できる', () => {
    expect(parseViewerFromSearch('viewer=all')).toEqual({ id: 'all', locked: false });
  });

  it('未指定・不正な値は null（保存済みの値を使わせる）', () => {
    expect(parseViewerFromSearch('')).toBeNull();
    expect(parseViewerFromSearch('?foo=bar')).toBeNull();
    expect(parseViewerFromSearch('?viewer=M999')).toBeNull();
    expect(parseViewerFromSearch('?viewer=')).toBeNull();
  });
});

describe('buildViewerLink', () => {
  const base = 'https://km1121-design.github.io/dashboard-cxo/';

  it('既定では固定リンクを作る', () => {
    expect(buildViewerLink(base, 'M001')).toBe(`${base}?viewer=M001&lock=1`);
  });

  it('固定しないリンクも作れる', () => {
    expect(buildViewerLink(base, 'M002', false)).toBe(`${base}?viewer=M002`);
  });

  it('既存のクエリを壊さない', () => {
    expect(buildViewerLink(`${base}?a=1`, 'M001', false)).toBe(`${base}?a=1&viewer=M001`);
  });
});

describe('SELECTABLE_MEMBERS', () => {
  it('マスタの全メンバーを選べる', () => {
    expect(SELECTABLE_MEMBERS.map((m) => m.id)).toEqual(['M001', 'M002', 'M003', 'M004']);
  });
});
