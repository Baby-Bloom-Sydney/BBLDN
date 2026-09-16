// The support inbox (S-A-20) — Contact Us messages by category, replied through `comms` (`support-reply`,
// `admin-contact`). Refunds stay a conversation, never a self-serve control.
import type { AdminPanel } from "../types";

export const SUPPORT_PANEL: AdminPanel = Object.freeze({
  name: "support",
  path: "/admin/support",
  screens: Object.freeze(["S-A-20"]),
});
