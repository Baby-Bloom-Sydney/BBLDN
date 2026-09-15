// 01 §3.1 — the seven SenderKeys (03 §8.1), each a mailbox on DOMAIN; `admin` / `support` come from env
// (`ADMIN_EMAIL` / `SUPPORT_INBOX` — 01 §3.2 rule 2). Server-only through env.ts.
import { BRAND } from "./brand";
import { DOMAIN } from "./domain";
import { env } from "./env";
import type { Sender, SenderKey } from "./types";

const mailbox = (local: string, name: string): Sender =>
  Object.freeze({ address: `${local}@${DOMAIN}`, name });

export const SENDERS: Readonly<Record<SenderKey, Sender>> = Object.freeze({
  noreply: mailbox("noreply", BRAND.name),
  hello: mailbox("hello", BRAND.name),
  support: Object.freeze({
    address: env.server.SUPPORT_INBOX,
    name: `${BRAND.name} Support`,
  }),
  admin: Object.freeze({
    address: env.server.ADMIN_EMAIL,
    name: `${BRAND.name} Admin`,
  }),
  parents: mailbox("parents", BRAND.name),
  nannies: mailbox("nannies", BRAND.name),
  verification: mailbox("verification", `${BRAND.name} Verification`),
});
