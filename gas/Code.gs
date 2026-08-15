/**
 * Gooner PL・インセンティブ管理ポータル用 GAS Web API
 *
 * 引き継ぎ指示書 4章のコードをそのまま配置している。
 *
 * ■ デプロイ手順
 *  1. 対象スプレッドシート
 *     https://docs.google.com/spreadsheets/d/1lbLTY4HvNBeDsqqRmlzNmFSG_jAIR--VKgx0fd9pgTU/edit
 *     を開き、拡張機能 → Apps Script を選ぶ
 *  2. このファイルの内容を Code.gs に貼り付けて保存
 *  3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *       次のユーザーとして実行 : 自分
 *       アクセスできるユーザー : 全員 (Anyone)   ← 必須（指示書 8章）
 *  4. 発行された /exec URL を フロント側の .env の VITE_GAS_API_URL に設定する
 */
const SHEET_NAME_SALES = 't_sales';

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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const salesSheet = getOrCreateSalesSheet(ss);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('リクエストボディが空です');
    }

    const postData = JSON.parse(e.postData.contents);

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
