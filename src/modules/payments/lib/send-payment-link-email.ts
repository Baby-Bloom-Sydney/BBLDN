// The `bundle-payment-link` email (`08.41`; 03 §5.4.1): the link the matchmaker sent, to the parent. The amount
// travels as integer pence and is rendered by the template through `formatMoney` — never a formatted string here.
import type { Comms } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { Money } from "@/modules/purchase-paths";
import type { FamilyId, Instant, Url } from "@/modules/shared-types";
import { familyUuid } from "./family-uuid";
import type { FamilyContact } from "./spine-store";

export type PaymentLinkEmailInput = {
  readonly familyId: FamilyId;
  readonly contact: FamilyContact | null;
  readonly url: Url;
  readonly amount: Money;
  readonly expiresAt: Instant;
  readonly kind: "deposit" | "balance-after-week-1" | "custom";
};

export async function sendPaymentLinkEmail(
  comms: Pick<Comms, "send">,
  input: PaymentLinkEmailInput,
): Promise<void> {
  const { contact } = input;
  if (contact === null || contact.email === null) {
    log.warn("bundle-payment-link not sent: no email on file", {
      module: "payments",
      action: "bundle-payment-link",
      userId: familyUuid(input.familyId),
    });
    return;
  }
  const sent = await comms.send({
    channel: "email",
    templateId: "bundle-payment-link",
    to: { userId: contact.userId, email: contact.email },
    data: {
      firstName: contact.firstName ?? "",
      url: input.url,
      amountPence: input.amount.pence,
      currency: input.amount.currency,
      expiresAt: input.expiresAt,
      kind: input.kind,
    },
  });
  if (!sent.ok)
    log.warn("bundle-payment-link not sent", {
      module: "payments",
      action: "bundle-payment-link",
      userId: familyUuid(input.familyId),
      errorCode: sent.error.code,
      reason: sent.error.details?.reason,
    });
}
