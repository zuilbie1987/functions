/* eslint-disable */
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const axios = require("axios");

const { getYesterdayRangeUTC8 } = require("./scheduler");
const { fetchIncomingUSDT }      = require("./apiClient");
const { appendRecordsToSheet }   = require("./sheetsClient");

const ALLOWED_ORIGINS = [
  "https://dramacomb.com",
  "https://dramacomb.web.app",
  "https://dramacomb.firebaseapp.com",
  "https://dramacomb.com/",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "dramacomb.com",
];

// ── 功能一：每日 TRC20 USDT 转入抓取（定时任务）──────────────────
exports.dailyTRC20Fetch = onSchedule(
  {
    schedule: "0 17 * * *", // UTC 17:00 = UTC+8 01:00
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 300,
    secrets: ["GOOGLE_SERVICE_ACCOUNT_KEY", "SPREADSHEET_ID", "TOKENVIEW_API_KEY"],
  },
  async () => {
    console.log("=== 每日 TRC20 USDT 转入抓取开始 ===");
    const { startTime, endTime, dateLabel } = getYesterdayRangeUTC8();
    const records = await fetchIncomingUSDT(startTime, endTime);
    await appendRecordsToSheet(records, dateLabel);
    console.log("=== Done ===");
  }
);

// ── 功能二：提供 TRC20 USDT 转入数据的 API 接口（HTTP）───────────
exports.getTRC20Data = onRequest(
  { secrets: ["TOKENVIEW_API_KEY"] },
  async (req, res) => {
    // 跨域处理
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
      res.set("Access-Control-Allow-Origin", "*");
    } else {
      return res.status(403).json({ error: "Access denied: Domain not allowed" });
    }
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).send("");

    // 业务逻辑
    const apiKey = process.env.TOKENVIEW_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Internal Config Error: API Key missing" });

    const address = req.query.address || "TNpNc8uhgkXovazM2czTPVeFt5UBtHJAji";
    const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    const url = `https://services.tokenview.io/vipapi/trx/address/tokentrans/${address}/${usdtContract}/1/50?apikey=${apiKey}`;

    try {
      console.log(`Calling Tokenview for address: ${address}`);
      const response = await axios.get(url, { timeout: 8000 });
      return res.status(200).json(response.data);

    } catch (error) {
      console.error("Fetch Error:", error.message);

      const status = error.response?.status ?? 500;

      // ✅ 修复点：error 对象本身含循环引用不能直接序列化
      // 只取 response.data（普通对象）或 message（字符串），两者都是安全的
      const detail = error.response?.data ?? error.message;

      return res.status(status).json({
        error: "Tokenview Request Failed",
        status,
        detail,
      });
    }
  }
);