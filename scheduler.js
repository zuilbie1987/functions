/**
 * 返回 UTC+8 时区下"昨天"的起止时间戳（Unix 秒）
 * 例如今天 2024-03-15 UTC+8 → start: 2024-03-14 00:00:00 +08:00
 *                             → end:   2024-03-14 23:59:59 +08:00
 */
function getYesterdayRangeUTC8() {
  const now = new Date();

  // UTC+8 偏移量（毫秒）
  const OFFSET_MS = 8 * 60 * 60 * 1000;

  // 当前 UTC+8 时间
  const localNow = new Date(now.getTime() + OFFSET_MS);

  // 昨天日期（UTC+8）
  const yesterday = new Date(localNow);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // 昨天 00:00:00 UTC+8 → 转回 UTC
  const startLocal = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    0, 0, 0
  ));
  const startUTC = new Date(startLocal.getTime() - OFFSET_MS);

  // 昨天 23:59:59 UTC+8 → 转回 UTC
  const endLocal = new Date(Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate(),
    23, 59, 59
  ));
  const endUTC = new Date(endLocal.getTime() - OFFSET_MS);

  // 日期标签，用作 Sheet Tab 名称
  const dateLabel = `${yesterday.getUTCFullYear()}-${
    String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${
    String(yesterday.getUTCDate()).padStart(2, "0")}`;

  return {
    startTime: Math.floor(startUTC.getTime() / 1000),  // Unix 秒
    endTime:   Math.floor(endUTC.getTime()   / 1000),
    dateLabel,                                           // "2024-03-14"
  };
}

module.exports = { getYesterdayRangeUTC8 };