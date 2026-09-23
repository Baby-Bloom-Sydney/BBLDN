// 03 §8.2 row 10 — a nanny booked her commission call (04 §4.4 c3; `08.18`). Fired by `call-layer`'s
// `sendNannyCallMessages`, which already owns the road; this is the file that lets it arrive.
//
// The operator's own queue row is the state and this email is the delivery (ADR-160) — the two are raised side
// by side by the caller, so this template says what happened and links the call list, nothing more.
import type { EmailTemplate } from "../types";
import { appUrl } from "./lib/app-url";
import { escapeHtml } from "./lib/escape-html";
import { formatLondonDateTime } from "./lib/format-london-date-time";
import { emailLayout } from "./lib/email-layout";

const CALLS_PATH = "/admin/calls";

type BookingData = { readonly slotAt?: unknown; readonly bookingId?: unknown };

// `slotAt` is read out of an open `TemplateData` record, so the helper is the one that decides what is
// renderable — no cast, and no guard here that would only repeat its own.
const whenOf = (data: BookingData) => formatLondonDateTime(data.slotAt);

const blocks = (data: BookingData) => {
  const when = whenOf(data);
  const line =
    when === ""
      ? "A nanny booked a commission call."
      : `A nanny booked a commission call for ${when}.`;
  const reference = `Booking ${String(data.bookingId ?? "")}`;
  return {
    heading: "Commission call booked",
    paragraphs: [escapeHtml(line), escapeHtml(reference)],
    textParagraphs: [line, reference],
    cta: { label: "Open the call list", href: appUrl(CALLS_PATH) },
  };
};

export const adminCommissionBookingTemplate: EmailTemplate<"admin-commission-booking"> =
  Object.freeze({
    id: "admin-commission-booking",
    channel: "email",
    from: "noreply",
    audience: "admin",
    subject: () => "Commission call booked",
    html: (data) => emailLayout(blocks(data)).html,
    text: (data) => emailLayout(blocks(data)).text,
  });
