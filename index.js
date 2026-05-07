/* eslint-disable */
const { onRequest } = require("firebase-functions/v2/https");
const axios = require("axios");
const ALLOWED_ORIGINS = [
  "https://dramacomb.com",  // 你的正式域名
  "https://dramacomb.web.app", // Firebase 默认托管域名
  "http://dramacomb.firebaseapp.com",        // 本地开发调试地址
  "https://dramacomb.com/",
  "dramacomb.com"
];

// 定时任务：每天凌晨1点（UTC+8）执行
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getYesterdayRangeUTC8 }  = require("./scheduler");
const { fetchIncomingUSDT }       = require("./apiClient");
const { appendRecordsToSheet }    = require("./sheetsClient");

// ── 功能一：每日 TRC20 USDT 转入抓取 ──────────────────────────

exports.dailyTRC20Fetch = onSchedule(
  {
    schedule: "0 17 * * *",   // UTC 17:00 = UTC+8 01:00
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 300,
    secrets: ["GOOGLE_SERVICE_ACCOUNT_KEY", "SPREADSHEET_ID", "TOKENVIEW_API_KEY",],
  },
  async () => {
    console.log("=== 每日 TRC20 USDT 转入抓取开始 ===");
    const { startTime, endTime, dateLabel } = getYesterdayRangeUTC8();

    const records = await fetchIncomingUSDT(startTime, endTime);
    await appendRecordsToSheet(records, dateLabel);

    console.log("=== Done ===");
  }
);

// ── 功能二：提供 TRC20 USDT 转入数据的 API 接口 ──────────────────────────
exports.getTRC20Data = onRequest({ secrets: ["TOKENVIEW_API_KEY"] }, async (req, res) => {
    // 1. 获取请求来源 (Origin)
    const origin = req.headers.origin;

    // 2. 跨域安全检查
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
        // 允许直接从浏览器地址栏访问（方便调试），生产环境可删掉此行
        res.set("Access-Control-Allow-Origin", "*");
    } else {
        return res.status(403).json({ error: "Access denied: Domain not allowed" });
    }

    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    // 处理浏览器发出的 OPTIONS 预检请求
    if (req.method === "OPTIONS") {
        return res.status(204).send("");
    }

    // 3. 业务逻辑
    const apiKey = process.env.TOKENVIEW_API_KEY;
    const address = req.query.address || "TNpNc8uhgkXovazM2czTPVeFt5UBtHJAji";
    const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    if (!apiKey) {
        return res.status(500).json({ error: "Internal Config Error: API Key missing" });
    }

    try {
        // 使用你 curl 成功的准确路径
        const url = `https://services.tokenview.io/vipapi/trx/address/tokentrans/${address}/${usdtContract}/1/50?apikey=${apiKey}`;

        console.log(`Calling Tokenview for address: ${address}`);

        const response = await axios.get(url, { timeout: 8000 });

        // 直接转发 Tokenview 的结果
        res.status(200).json(response.data);

    } catch (error) {
        console.error("Fetch Error:", error.message);

        const status = error.response ? error.response.status : 500;
        const detail = error.response ? error.response.data : error.message;

        res.status(status).json({
            error: "Tokenview Request Failed",
            status: status,
            detail: detail
        });
    }
});