// 01 §3.1 — the one domain, read from env `NEXT_PUBLIC_APP_URL` (prod: the London domain — ADR-033; per environment
// 06 §2.2). Client-safe: built from the public reader.
import { publicEnv } from "./public-env";

export const DOMAIN: string = new URL(publicEnv.NEXT_PUBLIC_APP_URL).host;
