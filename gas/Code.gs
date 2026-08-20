/**
 * Gooner PL・インセンティブ管理ポータル用 GAS Web API
 *
 * 引き継ぎ指示書 4章のコードをそのまま配置している。
 *
 * ■ 対応するスクリプトの種類
 *  - コンテナバインド（スプレッドシートの「拡張機能 → Apps Script」で作ったもの）
 *  - スタンドアロン（単独で作った Apps Script プロジェクト）
 *  どちらでも動く。スタンドアロンの場合は下記 DEFAULT_SPREADSHEET_ID の
 *  スプレッドシートを ID で開く（スクリプトプロパティ SPREADSHEET_ID で変更可）。
 *
 * ■ デプロイ手順
 *  1. 対象スプレッドシート
 *     https://docs.google.com/spreadsheets/d/1lbLTY4HvNBeDsqqRmlzNmFSG_jAIR--VKgx0fd9pgTU/edit
 *     を開き、拡張機能 → Apps Script を選ぶ
 *     （スタンドアロンで運用する場合はこの手順は不要）
 *  2. このファイルの内容を Code.gs に貼り付けて保存
 *  3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *       次のユーザーとして実行 : 自分
 *       アクセスできるユーザー : 全員 (Anyone)   ← 必須（指示書 8章）
 *  4. 発行された /exec URL を フロント側の .env の VITE_GAS_API_URL に設定する
 *
 * ■ 社内限定にする（アクセストークンの設定）
 *  デプロイの「アクセスできるユーザー」は仕様上「全員」にする必要があるため、
 *  URL を知っていれば誰でも読み書きできてしまう。これを防ぐには合言葉を設定する。
 *
 *  Apps Script エディタ → 左メニュー「プロジェクトの設定」（歯車）
 *    → 「スクリプト プロパティ」→「スクリプト プロパティを追加」
 *        プロパティ : AUTH_TOKEN
 *        値         : 推測されにくい文字列（例: 32文字程度のランダムな英数字）
 *
 *  設定するとトークンが一致するリクエストしか受け付けなくなる。
 *  未設定の場合は従来どおり誰でもアクセスできる（後方互換のため）。
 *  トークンを作るには、このエディタで generateAuthToken() を実行して
 *  実行ログに出た文字列を使うとよい。
 *
 * ■ Google アカウント認証（メンバーごとに見える範囲を分ける）
 *  合言葉は「知っていれば誰でも全部見られる」ため、メンバーごとに分けたい場合は
 *  Google アカウント認証を使う。フロントで Google にサインインして得た ID トークン
 *  （JWT）をこの API に渡し、ここで Google に問い合わせて本人を確認する。
 *  役職 Manager（入舩・中原）には**自分の事業部の行しか返さない**ので、
 *  ブラウザ側を書き換えても他事業部の数字は見られない。
 *
 *  スクリプトプロパティに次を設定すると有効になる:
 *    GOOGLE_CLIENT_ID : Google Cloud で発行した OAuth クライアント ID
 *                       （末尾が .apps.googleusercontent.com のもの）
 *    MEMBER_EMAILS    : メールアドレスとメンバーIDの対応（JSON）
 *                       例: {"irifune@gooner.space":"M001","nakahara@gooner.space":"M002"}
 *    ALLOWED_HD       : 任意。組織ドメインを入れると社外アカウントを弾く（例: gooner.space）
 *
 *  GOOGLE_CLIENT_ID を設定した時点で Google 認証が必須になり、AUTH_TOKEN だけの
 *  リクエストは通らなくなる。設定しなければ従来どおり AUTH_TOKEN 方式で動く。
 *  検証には外部リクエストを使うため、初回実行時に承認を求められる。
 */
const SHEET_NAME_SALES = 't_sales';
const AUTH_TOKEN_PROPERTY = 'AUTH_TOKEN';
const SPREADSHEET_ID_PROPERTY = 'SPREADSHEET_ID';
const GOOGLE_CLIENT_ID_PROPERTY = 'GOOGLE_CLIENT_ID';
const MEMBER_EMAILS_PROPERTY = 'MEMBER_EMAILS';
const ALLOWED_HD_PROPERTY = 'ALLOWED_HD';

/** Google の ID トークン検証エンドポイント */
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

/** BARROOTS の売上が入るカテゴリ（フロントの master.ts と同じ値） */
const BAR_CATEGORY = '店舗運営(BAR)';

/**
 * メンバー名簿（フロントの src/constants/master.ts と同じ内容）。
 *
 * 役職 Manager は自分の事業部だけを見る。Admin は全社を見る。
 * メールアドレスはここには持たず、スクリプトプロパティ MEMBER_EMAILS で対応づける
 * （個人のメールアドレスをリポジトリに置かないため）。
 */
const MEMBER_DIRECTORY = {
  M001: { name: '入舩 雄志', dept: 'イベント営業', role: 'Manager' },
  M002: { name: '中原 聖人', dept: '人材', role: 'Manager' },
  M003: { name: '三田 航大', dept: '物流・バックヤード', role: 'Admin' },
  M004: { name: 'u s', dept: '本部', role: 'Admin' }
};

/**
 * 対象スプレッドシートの既定 ID（引き継ぎ指示書 1.2）。
 * スクリプトプロパティ SPREADSHEET_ID を設定すればそちらが優先される。
 */
const DEFAULT_SPREADSHEET_ID = '1lbLTY4HvNBeDsqqRmlzNmFSG_jAIR--VKgx0fd9pgTU';

/**
 * 操作対象のスプレッドシートを取得する。
 *
 * スプレッドシートに紐づいた（コンテナバインドの）スクリプトなら
 * getActiveSpreadsheet() で取得できるが、スタンドアロンのスクリプトでは
 * null が返るため、その場合は ID で開く。
 * これによりバインド・スタンドアロンのどちらでも動作する。
 */
function getTargetSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const id =
    PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY) ||
    DEFAULT_SPREADSHEET_ID;

  if (!id) {
    throw new Error(
      'スプレッドシートを特定できません。スクリプトプロパティ SPREADSHEET_ID を設定してください。'
    );
  }
  return SpreadsheetApp.openById(id);
}

/**
 * スクリプトプロパティに設定されたトークンを返す。未設定なら空文字。
 */
function getExpectedToken() {
  const value = PropertiesService.getScriptProperties().getProperty(AUTH_TOKEN_PROPERTY);
  return value ? String(value).trim() : '';
}

/**
 * リクエストのトークンを検証する。
 * トークン未設定時は認証なしで通す（後方互換）。
 */
function isAuthorized(token) {
  const expected = getExpectedToken();
  if (!expected) return true;
  return String(token || '').trim() === expected;
}

/** 認証エラーのレスポンス */
function unauthorizedResponse(message) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'error',
      message: message || 'アクセストークンが正しくありません。'
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
 * Google アカウント認証
 * ========================================================================== */

function getScriptProperty(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value ? String(value).trim() : '';
}

/** OAuth クライアント ID。設定されていれば Google 認証モードになる */
function getGoogleClientId() {
  return getScriptProperty(GOOGLE_CLIENT_ID_PROPERTY);
}

function isGoogleAuthEnabled() {
  return getGoogleClientId() !== '';
}

/** 許可する組織ドメイン（未設定なら制限しない） */
function getAllowedHd() {
  return getScriptProperty(ALLOWED_HD_PROPERTY).toLowerCase();
}

/**
 * メールアドレス → メンバーID の対応を読む。
 * 大文字小文字の違いで外れないよう、キーは小文字に正規化する。
 */
function getMemberEmailMap() {
  const raw = getScriptProperty(MEMBER_EMAILS_PROPERTY);
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('スクリプトプロパティ MEMBER_EMAILS が JSON として読めません: ' + err);
  }

  const map = {};
  Object.keys(parsed).forEach(function (email) {
    map[String(email).trim().toLowerCase()] = String(parsed[email]).trim();
  });
  return map;
}

/** CacheService が使えない環境（テストなど）では null を返す */
function getAuthCache() {
  try {
    return typeof CacheService === 'undefined' ? null : CacheService.getScriptCache();
  } catch (err) {
    return null;
  }
}

/**
 * Google の ID トークン（JWT）を検証してメールアドレスを取り出す。
 *
 * 署名の検証は Google の tokeninfo エンドポイントに任せる。
 * 同じトークンで何度も往復しないよう、成功結果だけ短時間キャッシュする。
 */
function verifyGoogleIdToken(idToken) {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return { ok: false, message: 'Google 認証が設定されていません。' };
  }

  const raw = String(idToken || '').trim();
  if (!raw) {
    return { ok: false, message: 'Google のサインインが必要です。' };
  }

  const cache = getAuthCache();
  let cacheKey = '';
  if (cache) {
    cacheKey =
      'gidt_' +
      Utilities.base64EncodeWebSafe(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)
      );
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  }

  let payload;
  try {
    const res = UrlFetchApp.fetch(TOKENINFO_URL + encodeURIComponent(raw), {
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      return {
        ok: false,
        message: 'Google の認証情報を確認できませんでした。もう一度サインインしてください。'
      };
    }
    payload = JSON.parse(res.getContentText());
  } catch (err) {
    return { ok: false, message: 'Google の認証情報を確認できませんでした: ' + err };
  }

  // 他のアプリ向けに発行されたトークンを使い回されないよう aud を必ず照合する
  if (String(payload.aud || '') !== clientId) {
    return { ok: false, message: 'このアプリ向けの認証情報ではありません。' };
  }

  const expMs = Number(payload.exp) * 1000;
  if (!expMs || expMs <= Date.now()) {
    return { ok: false, message: 'サインインの有効期限が切れました。もう一度サインインしてください。' };
  }

  if (String(payload.email_verified) !== 'true') {
    return { ok: false, message: 'メールアドレスが確認されていない Google アカウントです。' };
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) {
    return { ok: false, message: 'Google アカウントのメールアドレスを取得できませんでした。' };
  }

  const allowedHd = getAllowedHd();
  if (allowedHd && String(payload.hd || '').trim().toLowerCase() !== allowedHd) {
    return {
      ok: false,
      message: allowedHd + ' のアカウントでサインインしてください。'
    };
  }

  const result = { ok: true, email: email, exp: expMs };

  if (cache && cacheKey) {
    // トークンの残り寿命の範囲で、長くても 10 分だけキャッシュする
    const ttl = Math.min(600, Math.floor((expMs - Date.now()) / 1000) - 30);
    if (ttl > 0) cache.put(cacheKey, JSON.stringify(result), ttl);
  }

  return result;
}

/**
 * リクエストの本人を確定する。
 *
 * - Google 認証が有効: ID トークンを検証し、メールからメンバーを引く
 * - 無効（従来運用）: AUTH_TOKEN を検証し、全社を見られる扱いにする
 */
function resolveIdentity(idToken, token) {
  if (!isGoogleAuthEnabled()) {
    if (!isAuthorized(token)) {
      return { ok: false, message: 'アクセストークンが正しくありません。' };
    }
    return {
      ok: true,
      mode: 'token',
      memberId: '',
      name: '',
      email: '',
      dept: '',
      role: 'Admin',
      scope: 'company'
    };
  }

  const verified = verifyGoogleIdToken(idToken);
  if (!verified.ok) return { ok: false, message: verified.message };

  const memberId = getMemberEmailMap()[verified.email] || '';
  const member = MEMBER_DIRECTORY[memberId];
  if (!member) {
    return {
      ok: false,
      message: verified.email + ' は利用者として登録されていません。管理者に連絡してください。'
    };
  }

  return {
    ok: true,
    mode: 'google',
    memberId: memberId,
    name: member.name,
    email: verified.email,
    dept: member.dept,
    role: member.role,
    scope: member.role === 'Manager' ? 'personal' : 'company'
  };
}

/** レスポンスに載せる閲覧者情報（フロントはこれを見て画面を決める） */
function toViewerPayload(identity) {
  return {
    mode: identity.mode,
    memberId: identity.memberId || null,
    name: identity.name || '',
    email: identity.email || '',
    dept: identity.dept || '',
    role: identity.role,
    scope: identity.scope
  };
}

/**
 * その行を読ませてよいか。
 *
 * Manager には自分の事業部の行だけを返す。ただし BARROOTS（店舗運営(BAR)）の行は
 * 中原氏の他部紹介バック（クロスセル）の計算に必要なため、事業部を問わず渡す。
 * 店舗の売上行であり、個人が特定される情報は含まない。
 */
function canReadRow(identity, row) {
  if (identity.scope !== 'personal') return true;
  if (String(row.dept || '') === identity.dept) return true;
  return String(row.category || '') === BAR_CATEGORY;
}

/** その行を書かせてよいか。Manager は自分の事業部の行しか追記できない */
function canWriteRecord(identity, record) {
  if (identity.scope !== 'personal') return true;
  return String((record && record.dept) || '') === identity.dept;
}

/**
 * ランダムなトークンを生成してログに出力する（初期設定用のユーティリティ）。
 * エディタ上でこの関数を実行し、出力された文字列を
 * スクリプトプロパティ AUTH_TOKEN に貼り付けて使う。
 */
function generateAuthToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  Logger.log('AUTH_TOKEN に設定する値: ' + token);
  return token;
}

function getOrCreateSalesSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME_SALES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_SALES);
    sheet.appendRow([
      'ID', '日付', '事業部', 'カテゴリ', '担当者', '額面売上', 'PL計上率',
      '現金', 'クレカ', '電子マネー', 'QR', '組数', '総客数', '新規客数',
      '既存客数', '総評・コメント', '登録日時'
    ]);
    sheet.getRange(1, 1, 1, 17).setFontWeight('bold').setBackground('#f3f4f6');
  }
  return sheet;
}

function doGet(e) {
  try {
    // ?idToken=...（Google 認証）または ?token=...（従来の合言葉）で本人を確定する
    const params = e && e.parameter ? e.parameter : {};
    const identity = resolveIdentity(params.idToken, params.token);
    if (!identity.ok) {
      return unauthorizedResponse(identity.message);
    }

    const ss = getTargetSpreadsheet();
    const salesSheet = getOrCreateSalesSheet(ss);
    const salesData = getSheetDataAsJson(salesSheet).filter(function (row) {
      return canReadRow(identity, row);
    });

    const result = {
      status: 'success',
      timestamp: new Date().toISOString(),
      count: salesData.length,
      sales: salesData,
      viewer: toViewerPayload(identity)
    };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const ss = getTargetSpreadsheet();
    const salesSheet = getOrCreateSalesSheet(ss);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('リクエストボディが空です');
    }

    const postData = JSON.parse(e.postData.contents);

    // ボディの idToken（Google 認証）または token（従来の合言葉）で本人を確定する
    const identity = resolveIdentity(postData.idToken, postData.token);
    if (!identity.ok) {
      return unauthorizedResponse(identity.message);
    }

    if (postData.action === 'addSale' || postData.action === 'addReport') {
      const record = postData.data || {};

      // 自分の事業部以外の行は書かせない
      if (!canWriteRecord(identity, record)) {
        return unauthorizedResponse(
          identity.dept + ' 以外の事業部の行は登録できません。'
        );
      }

      salesSheet.appendRow([
        record.id || 'DS' + new Date().getTime(),
        record.date || new Date().toISOString().split('T')[0],
        record.dept || '',
        record.category || '',
        record.member || '',
        Number(record.gross) || 0,
        Number(record.plRate) || 1.0,
        Number(record.cash) || 0,
        Number(record.credit) || 0,
        Number(record.emoney) || 0,
        Number(record.qr) || 0,
        Number(record.groups) || 0,
        Number(record.totalCustomers) || 0,
        Number(record.newCustomers) || 0,
        Number(record.existingCustomers) || 0,
        record.comment || '',
        new Date().toLocaleString('ja-JP')
      ]);

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'スプレッドシートへ追記しました' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: '不明なアクションです' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetDataAsJson(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const rows = data.slice(1);
  return rows.map((row, index) => ({
    id: row[0] || 'DS' + (index + 1),
    date: row[1] ? formatDate(row[1]) : '',
    dept: row[2] || '',
    category: row[3] || '',
    member: row[4] || '',
    gross: Number(row[5]) || 0,
    plRate: Number(row[6]) || 1.0,
    cash: Number(row[7]) || 0,
    credit: Number(row[8]) || 0,
    emoney: Number(row[9]) || 0,
    qr: Number(row[10]) || 0,
    groups: Number(row[11]) || 0,
    totalCustomers: Number(row[12]) || 0,
    newCustomers: Number(row[13]) || 0,
    existingCustomers: Number(row[14]) || 0,
    comment: row[15] || '',
    sheetRow: index + 2
  }));
}

function formatDate(dateVal) {
  if (dateVal instanceof Date) {
    const y = dateVal.getFullYear();
    const m = ('0' + (dateVal.getMonth() + 1)).slice(-2);
    const d = ('0' + dateVal.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }
  return String(dateVal);
}
