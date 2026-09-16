// A cron route resolves its own spec out of `config/crons.ts` rather than restating its name or its schedule
// (L4 — 01 §3.2 rule 1; 01 §4f). `vercel.json` is generated from the same list, so a route that cannot find
// itself here is a route Vercel will never call — which is why the lookup returns `undefined` and the caller
// treats it as a 500 rather than running unscheduled work.
import { CRONS } from "@/modules/config";
import type { CronSpec } from "@/modules/config";

export function cronSpecFor(path: string): CronSpec | undefined {
  return CRONS.find((spec) => spec.path === path);
}
