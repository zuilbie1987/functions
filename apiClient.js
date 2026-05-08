const axios = require("axios");


const BASE_URL = "https://services.tokenview.io/vipapi";

// 固定值
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TARGET_ADDRESS      = "TPhfG1eoFp652ctsftobZJqMVwkZ1KAVv3";
const PAGE_SIZE = 50;

/**
 * 将 Unix 时间戳（秒）转为 UTC+8 可读字符串
 * 用于写入 Google Sheets
 */
function toUTC8String(unixSec) {
  if (!unixSec) return "";
  const d = new Date(Number(unixSec) * 1000 + 8 * 3600 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19) + " +08:00";
}

/**
 * 抓取目标地址的 TRC20 USDT 转入记录
 *
 * Tokenview 接口：
 * GET /vipapi/trx/tokenaddresstx/{tokenContract}/{address}/{page}/{pageSize}?apikey=
 *
 * 返回的每条记录包含：
 *   txid, from, to, value (原始单位，需 /1e6), time (Unix秒), block_no, confirmations
 *
 * 策略：
 *   - 翻页直到 record.time < startTimestamp（数据按时间倒序排列）
 *   - 只保留 to === TARGET_ADDRESS 且时间在 [start, end] 内的记录
 *
 * @param {number} startTimestamp  昨日 00:00:00 UTC+8 的 Unix 秒
 * @param {number} endTimestamp    昨日 23:59:59 UTC+8 的 Unix 秒
 */
async function fetchIncomingUSDT(startTimestamp, endTimestamp) {
    // API Key 直接写入（Firebase Function 内部运行，不对外暴露）
const TOKENVIEW_API_KEY = process.env.TOKENVIEW_API_KEY;
if (!TOKENVIEW_API_KEY) throw new Error("Missing TOKENVIEW_API_KEY");

  const results = [];
  let page = 1;

  console.log(`开始抓取 ${TARGET_ADDRESS} 的 TRC20 USDT 转入记录`);
  console.log(`时间范围: ${toUTC8String(startTimestamp)} ~ ${toUTC8String(endTimestamp)}`);

  while (true) {
    const url = `${BASE_URL}/trx/address/tokentrans/${TARGET_ADDRESS}/${USDT_TRC20_CONTRACT}/${page}/${PAGE_SIZE}?apikey=${TOKENVIEW_API_KEY}`;

    let data;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      // 接口返回结构：{ code: 1, data: [ ...records ] }
      if (res.data?.code !== 1 || !Array.isArray(res.data?.data)) {
        console.warn(`第 ${page} 页返回异常:`, JSON.stringify(res.data).slice(0, 200));
        break;
      }
      data = res.data.data;
    } catch (err) {
      console.error(`第 ${page} 页请求失败:`, err.message);
      throw err;
    }

    if (data.length === 0) {
      console.log(`第 ${page} 页为空，停止`);
      break;
    }

    let reachedBeforeRange = false;

    for (const record of data) {
      const ts = Number(record.time);

      // 数据按时间倒序，遇到早于昨天的直接停止翻页
      if (ts < startTimestamp) {
        reachedBeforeRange = true;
        break;
      }

      // 跳过今天的数据（晚于昨天 23:59:59）
      if (ts > endTimestamp) continue;

      // 只保留转入目标地址的记录
      if (record.to !== TARGET_ADDRESS) continue;

      results.push({
        txid:          record.txid          ?? "",
        time_utc8:     toUTC8String(ts),
        from:          record.from          ?? "",
        to:            record.to            ?? "",
        amount_usdt:   (Number(record.value ?? 0) / 1e6).toFixed(6),
        block_no:      record.block_no      ?? "",
        confirmations: record.confirmations ?? "",
      });
    }

    console.log(`第 ${page} 页: 共 ${data.length} 条，当日转入累计 ${results.length} 条`);

    if (reachedBeforeRange) {
      console.log("已到达昨日数据前边界，停止翻页");
      break;
    }

    // 已到最后一页
    if (data.length < PAGE_SIZE) {
      console.log("已到最后一页");
      break;
    }

    // FAQ 提示：基础版最多 50 页
    if (page >= 50) {
      console.warn("已达基础版上限 50 页（2500 条），如需更多请升级套餐");
      break;
    }

    page++;
    // 避免触发频率限制（300次/分钟），每页间隔 300ms
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`抓取完成，共 ${results.length} 条转入记录`);
  return results;
}

module.exports = { fetchIncomingUSDT };