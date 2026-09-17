// 03 §7.4's `precheck-nanny` batch, composed at boot — the one place that may hold both `matching`'s port and
// `comms`' connector, because 01 §2.3 gives `matching` no arrow to `comms` (its allowed imports are `positions` ·
// `scoring` · `areas` · `platform`, enforced by `lint:boundaries`). The same inversion `wire-connections.ts`
// performs for the `AdvanceFn`.
//
// **ADR-136 is what makes this possible at all.** `1e` pinned the blast `it.fails` because a `Recipient` needed
// an `Email` and 07 §5.2 keeps a nanny's address out of `nanny_public` by design. Now the message names her:
// `{ userId }`, resolved inside `comms`' own send. So this adapter reads **one identifier** per ranked nanny —
// `nannies.user_id`, the same column `dbNannyFacts` reads for `connections` — and never an address. Nothing
// here can obtain one, which is the property the ruling exists to create.
//
// **`sendMany` is the contract's own batch call** (03 §7.4, §8.1), and a dedupe key per nanny per wave makes a
// re-fired wave idempotent: the waves sweep re-runs a position whose blast fell over, and a nanny must not be
// mailed twice for the same wave.
import type { DataAccessPort } from "@/modules/auth";
import { comms } from "@/modules/comms";
import type { Message } from "@/modules/comms";
import { ok } from "@/modules/platform";
import type { PrecheckBlast } from "@/modules/matching";
import type { NannyId, Result, Uuid } from "@/modules/shared-types";

const TEMPLATE = "precheck-nanny" as const;

const userIdOf = (
  port: DataAccessPort,
  nannyId: NannyId,
): Promise<Result<Uuid | null>> =>
  port.run(
    {
      name: "matching.readNannyUserId",
      exec: async (q) =>
        (
          (await q.from("nannies").eq("id", nannyId).single()) as {
            readonly user_id: string;
          } | null
        )?.user_id as Uuid | null,
    },
    { scope: "service" },
  );

export function precheckBlast(port: DataAccessPort): PrecheckBlast {
  return async ({ positionId, nannyIds, wave }) => {
    const messages: Message[] = [];
    for (const nannyId of nannyIds) {
      const userId = await userIdOf(port, nannyId);
      if (!userId.ok) return userId;
      // A ranked nanny with no `nannies` row cannot be mailed and is not guessed at; the count reports it.
      if (userId.value === null) continue;
      messages.push({
        channel: "email",
        templateId: TEMPLATE,
        to: { userId: userId.value },
        data: {},
        dedupeKey: `precheck:${positionId as string}:${nannyId as string}:${String(wave)}`,
      });
    }
    if (messages.length === 0) return ok({ notified: 0 });
    const sent = await comms.sendMany(messages);
    return sent.ok ? ok({ notified: messages.length }) : sent;
  };
}
