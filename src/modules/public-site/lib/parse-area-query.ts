// `GET /api/areas?q=` (03 §6.3): the one query parameter, trimmed and capped; absent = "list all".
import type { AreaQuery } from "../types";

const MAX_QUERY = 40;

export function parseAreaQuery(searchParams: URLSearchParams): AreaQuery {
  const raw = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  return Object.freeze({ q: raw === "" ? null : raw });
}
