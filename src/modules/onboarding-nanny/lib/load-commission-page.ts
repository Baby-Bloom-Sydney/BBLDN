// S-N-02's one server read (05 §7 rule 5 — the route file stays thin): her own row, the live calendar and the
// time she may already have picked, in one answer.
//
// **The calendar is reached through `call-layer` and never through `scheduling`** (03 §3.2 / §3.6 R3: "
// `onboarding-nanny` and `public-site` reach S-N-02 through `call-layer.listSlots` / `openNannyCall`"). The two
// reads are injected so this file can be tested without a calendar; boot's real ones are the defaults, which is
// the same shape `loadNannyHub` uses for its hrefs.
//
// A failed calendar read is **not** a failed page: 04 §6.2's L·E·E says the room is never empty, so `days` is
// `null`, the picker says it could not load the times and offers a retry, and the explainer — the part of the
// page that is actually the pitch — still renders.
import { callLayer, groupSlotsByDay, slotRange } from "@/modules/call-layer";
import { log, nowInstant } from "@/modules/platform";
import type { E164, ISO } from "@/modules/shared-types";
import type { NannyCommissionLoad, SlotDay } from "../types";
import { loadNannyProfile } from "./load-nanny-profile";

type Reads = {
  readonly listSlots: () => Promise<
    | { readonly ok: true; readonly value: ReadonlyArray<SlotDay> }
    | { readonly ok: false; readonly error: { readonly code: string } }
  >;
  readonly findBooking: () => Promise<
    | {
        readonly ok: true;
        readonly value: { readonly start: ISO; readonly end: ISO } | null;
      }
    | { readonly ok: false; readonly error: { readonly code: string } }
  >;
};

export async function loadCommissionPage(
  reads?: Reads,
): Promise<NannyCommissionLoad> {
  const profile = await loadNannyProfile();
  if (profile === null) return { kind: "no-nanny" };
  if (profile.isIsolated) return { kind: "isolated" };

  const listSlots =
    reads?.listSlots ??
    (async () => {
      const slots = await callLayer.listSlots(
        "nanny-commission",
        slotRange(nowInstant()),
      );
      return slots.ok
        ? { ok: true as const, value: groupSlotsByDay(slots.value) }
        : slots;
    });
  const findBooking =
    reads?.findBooking ??
    (async () => {
      const booking = await callLayer.findNannyBooking(profile.userId);
      return booking.ok
        ? {
            ok: true as const,
            value:
              booking.value === null
                ? null
                : { start: booking.value.start, end: booking.value.end },
          }
        : booking;
    });

  const [slots, booking] = await Promise.all([listSlots(), findBooking()]);
  if (!slots.ok)
    log.warn("the commission calendar could not be read", {
      module: "onboarding-nanny",
      action: "loadCommissionPage",
      surface: "S-N-02",
      errorCode: slots.error.code as never,
    });

  return {
    kind: "page",
    view: {
      firstName: profile.firstName,
      mobile: (profile.mobile as E164 | undefined) ?? null,
      days: slots.ok ? slots.value : null,
      chosen: booking.ok ? booking.value : null,
    },
  };
}
