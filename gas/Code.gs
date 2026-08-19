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
 */
const SHEET_NAME_SALES = 't_sales';
const AUTH_TOKEN_PROPERTY = 'AUTH_TOKEN';
const SPREADSHEET_ID_PROPERTY = 'SPREADSHEET_ID';

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
function unauthorizedResponse() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'error', message: 'アクセストークンが正しくありません。' })
  ).setMimeType(ContentService.MimeType.JSON);
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
    // クエリパラメータ ?token=... を検証する
    if (!isAuthorized(e && e.parameter ? e.parameter.token : '')) {
      return unauthorizedResponse();
    }

    const ss = getTargetSpreadsheet();
    const salesSheet = getOrCreateSalesSheet(ss);
    const salesData = getSheetDataAsJson(salesSheet);

    const result = {
      status: 'success',
      timestamp: new Date().toISOString(),
      count: salesData.length,
      sales: salesData
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

    // ボディの token を検証する
    if (!isAuthorized(postData.token)) {
      return unauthorizedResponse();
    }

    if (postData.action === 'addSale' || postData.action === 'addReport') {
      const record = postData.data || {};

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
