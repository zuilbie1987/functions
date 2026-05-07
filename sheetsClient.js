const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// 表头列定义（只记录转入数据）
const HEADERS = [
  "交易哈希(txid)",
  "时间(UTC+8)",
  "转出方地址(from)",
  "转入方地址(to)",
  "金额(USDT)",
  "区块高度",
  "确认数",
];

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureSheetTab(sheets, tabName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === tabName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }]
      },
    });
    // 写表头
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
    console.log(`已创建 Sheet Tab: ${tabName}`);
  }
}

async function appendRecordsToSheet(records, dateLabel) {
  if (records.length === 0) {
    console.log(`${dateLabel} 无转入数据`);
    return;
  }

  const sheets = await getSheetsClient();
  await ensureSheetTab(sheets, dateLabel);

  const rows = records.map(r => [
    r.txid,
    r.time_utc8,
    r.from,
    r.to,
    r.amount_usdt,
    r.block_no,
    r.confirmations,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${dateLabel}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });

  console.log(`已写入 ${rows.length} 条转入记录 → Sheet: ${dateLabel}`);
}

module.exports = { appendRecordsToSheet };