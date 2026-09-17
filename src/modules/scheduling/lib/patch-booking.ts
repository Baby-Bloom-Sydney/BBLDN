// One `bookings` update at service scope, in one place, so every status move carries the same seam and a
// constraint name reaches `schedulingFailure` rather than a caller (02 §4.4 row 4: the module is the one writer;
// `0009` gives the table no client UPDATE policy at all).
import type { Auth } from "@/modules/auth";
import type { BookingId, Result, Uuid } from "@/modules/shared-types";
import type { BookingRow, SchedulingErrorDetails } from "../types";
import { schedulingFailure } from "./scheduling-failure";

export async function patchBooking(
  auth: Auth,
  name: string,
  bookingId: BookingId,
  patch: Readonly<Record<string, unknown>>,
): Promise<Result<BookingRow, SchedulingErrorDetails>> {
  const written = await auth.data.run(
    {
      name: `scheduling.${name}`,
      exec: (q) =>
        q.from("bookings").update(bookingId as string as Uuid, patch),
    },
    { scope: "service" },
  );
  return written.ok ? written : schedulingFailure(written.error);
}
