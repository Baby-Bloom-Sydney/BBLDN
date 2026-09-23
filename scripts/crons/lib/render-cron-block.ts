// Renders the `vercel.json` cron block from `config/crons.ts` (01 §4f; 06 §4.1 C). Vercel takes **UTC** expressions
// and a London wall-clock is not one UTC hour: it is UTC+0 through GMT and UTC+1 through BST. The inherited rule
// — "the UTC hour equals the London hour" — is a naive offset, right for twenty-one weeks of the year and an hour
// late for the other thirty-one, which is how a job declared "08:00 London morning" delivered at 09:00 all summer.
//
// So a daily or weekly London time renders **both** candidate UTC hours (`M H-1,H * * *`): one of them is the
// declared London time in GMT, the other is the declared London time in BST, and exactly one of the two is right
// on any given day. The due-gate in `src/app/api/_lib/cron-is-due.ts` discards the other before the handler is
// called, so the job fires twice in UTC and acts once per London day. The cron **count** is unchanged — a list in
// the hour field is one entry — which matters because Vercel caps them.
//
// Two London hours cannot be expressed this way and are refused rather than silently mis-scheduled (fail closed):
//   01:xx daily/weekly — the hour does not exist on the spring-forward day and happens twice on the fall-back day;
//   00:xx weekly       — the BST candidate is 23:xx UTC on the *previous* UTC day, i.e. the wrong weekday.
// Pure; the CLI writes or diffs.
import type { CronSpec } from "../../../src/modules/config/types.ts";

export type VercelCron = { readonly path: string; readonly schedule: string };

const HOURS_PER_DAY = 24;

/** The GMT candidate (`hour`) and the BST candidate (`hour - 1`), ascending, so the expression reads in clock order. */
function candidateUtcHours(hour: number): string {
  const bst = (hour + HOURS_PER_DAY - 1) % HOURS_PER_DAY;
  return [hour, bst].sort((a, b) => a - b).join(",");
}

function refuseUnschedulable(kind: "daily" | "weekly", hour: number): void {
  if (hour === 1)
    throw new Error(
      `config/crons.ts: a ${kind} cron cannot be declared at London 01:xx — 01 does not exist on the spring-forward day and occurs twice on the fall-back day. Move it to 00:xx or 02:xx.`,
    );
  if (kind === "weekly" && hour === 0)
    throw new Error(
      "config/crons.ts: a weekly cron cannot be declared at London 00:xx — through BST the UTC candidate is 23:xx on the previous UTC day, which is the wrong weekday. Move it to 02:xx.",
    );
}

function toUtcExpression(london: CronSpec["london"]): string {
  switch (london.kind) {
    case "every":
      return `*/${london.minutes} * * * *`;
    case "daily":
      refuseUnschedulable("daily", london.hour);
      return `${london.minute} ${candidateUtcHours(london.hour)} * * *`;
    case "weekly":
      refuseUnschedulable("weekly", london.hour);
      return `${london.minute} ${candidateUtcHours(london.hour)} * * ${london.weekday}`;
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
