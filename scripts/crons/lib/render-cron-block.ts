// Renders the `vercel.json` cron block from `config/crons.ts` (01 §4f; 06 §4.1 C). Vercel takes UTC expressions;
// the UTC hour equals the intended London hour, so a job fires at H (GMT) or H+1 (BST) — same London date, inside
// the window; handlers that need the exact hour gate on London time. Pure; the CLI writes or diffs.
import type { CronSpec } from "../../../src/modules/config/types.ts";

export type VercelCron = { readonly path: string; readonly schedule: string };

function toUtcExpression(london: CronSpec["london"]): string {
  switch (london.kind) {
    case "every":
      return `*/${london.minutes} * * * *`;
    case "daily":
      return `${london.minute} ${london.hour} * * *`;
    case "weekly":
      return `${london.minute} ${london.hour} * * ${london.weekday}`;
  }
}

export function renderCronBlock(
  crons: ReadonlyArray<CronSpec>,
): ReadonlyArray<VercelCron> {
  return crons.map((cron) => ({
    path: cron.path,
    schedule: toUtcExpression(cron.london),
  }));
}
