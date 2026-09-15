// 01 §3.1 — Katie's daily cost cap (02 §4.6 chat_cost_daily; 07 §4 row 4.38). USD: Gemini bills in USD (01 §1.2).
// Server-only through env.ts.
import { env } from "./env";

export const KATIE = Object.freeze({
  dailyLimitUsd: env.server.KATIE_DAILY_LIMIT_USD,
});
