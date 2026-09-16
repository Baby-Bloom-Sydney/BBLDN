// One request id per response (01 §4c: `requestId` on every envelope, `x-request-id` on every response). Honours
// the caller's own `x-request-id` when it sent one — that is how a Vercel cron invocation, a Stripe delivery and
// our log lines are correlated — and mints one otherwise.
import { newId } from "@/modules/platform";
import type { Uuid } from "@/modules/shared-types";

const HEADER = "x-request-id";
const MAX_LENGTH = 128;

export function requestIdOf(request: Request): string {
  const supplied = request.headers.get(HEADER);
  if (supplied !== null && supplied !== "" && supplied.length <= MAX_LENGTH)
    return supplied;
  return newId<Uuid>();
}
