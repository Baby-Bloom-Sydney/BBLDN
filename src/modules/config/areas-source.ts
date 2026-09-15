// 01 §3.1 — the areas binding: provider from env `AREAS_SOURCE` (03 §6.3 `db | stub`), the table (02 §4.2 row 1
// `areas`) and the service-area name shown to users (ADR-028). Server-only through env.ts.
import { env } from "./env";

export const AREAS_SOURCE = Object.freeze({
  provider: env.server.AREAS_SOURCE,
  tableName: "areas",
  serviceAreaName: "Greater London",
});
