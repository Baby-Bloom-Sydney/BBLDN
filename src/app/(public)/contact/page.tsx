// S-X-23 — Contact (04 §6.1). Thin by rule (05 §7 rule 5): the action and the support mailbox are props.
import type { Metadata } from "next";
import { SENDERS } from "@/modules/config/server";
import { URLS } from "@/modules/config";
import {
  ContactContent,
  publicPageMetadata,
  sendContactMessageAction,
} from "@/modules/public-site";

export const metadata: Metadata = publicPageMetadata(URLS.paths.support);

export default function ContactPage() {
  return (
    <main>
      <ContactContent
        action={sendContactMessageAction}
        supportEmail={SENDERS.support.address}
      />
    </main>
  );
}
