/**
 * 閲覧者の解決のテスト。
 * localStorage を触らない純関数だけを対象にする（テスト環境は node）。
 */
import {
  buildViewerLink,
  fromServerViewer,
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

describe('fromServerViewer', () => {
  const base = {
    mode: 'google' as const,
    name: '入舩 雄志',
    email: 'irifune@gooner.space',
    dept: 'イベント営業',
  };

  it('Google 認証の判定を Viewer に写し、固定扱いにする', () => {
    const viewer = fromServerViewer({
      ...base,
      memberId: 'M001',
      role: 'Manager',
      scope: 'personal',
    });

    expect(viewer).toMatchObject({ id: 'M001', scope: 'personal', locked: true });
    expect(viewer?.member?.name).toBe('入舩 雄志');
  });

  it('Admin は全社スコープになる', () => {
    const viewer = fromServerViewer({
      mode: 'google',
      memberId: 'M003',
      name: '三田 航大',
      email: 'mita@gooner.space',
      dept: '物流・バックヤード',
      role: 'Admin',
      scope: 'company',
    });

    expect(viewer).toMatchObject({ id: 'M003', scope: 'company', locked: true });
  });

  it('サーバーとマスタが食い違ったら狭い方（personal）に倒す', () => {
    // サーバーは全社と言っているが、マスタ上は Manager
    const viewer = fromServerViewer({
      ...base,
      memberId: 'M001',
      role: 'Admin',
      scope: 'company',
    });
    expect(viewer?.scope).toBe('personal');

    // 逆にサーバーが personal と言えばそちらに従う
    const admin = fromServerViewer({
      mode: 'google',
      memberId: 'M003',
      name: '三田 航大',
      email: 'mita@gooner.space',
      dept: '物流・バックヤード',
      role: 'Manager',
      scope: 'personal',
    });
    expect(admin?.scope).toBe('personal');
  });

  it('合言葉モード・未指定では null（ローカル設定に任せる）', () => {
    expect(fromServerViewer(null)).toBeNull();
    expect(fromServerViewer(undefined)).toBeNull();
    expect(
      fromServerViewer({
        mode: 'token',
        memberId: null,
        name: '',
        email: '',
        dept: '',
        role: 'Admin',
        scope: 'company',
      }),
    ).toBeNull();
  });
});
