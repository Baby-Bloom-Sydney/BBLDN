// 4a — the sender. Four claims, each driven rather than read (ecc-lite rule 2):
//
//   1. **The registry is closed both ways.** `TEMPLATE_IDS` is what `validateMessage` checks a send against, and
//      `satisfies ReadonlyArray<TemplateId>` only proves each entry *is* an id — never that every id is present.
//      Two ADR-168 (b) ids were declared in `TemplateRegistry` and missing from the list, so both
//      suspension-lifted sends were refused `unknown-template` by the seam that was built to carry them.
//   2. **Resend is installed**, selected by config, and refuses without a key rather than falling back.
//   3. **Templates render**, and template data that came from a stranger is escaped before it reaches a body.
//   4. **The dev dry run** (`08.03`) records the row and never calls the provider.
import { beforeEach, describe, expect, it } from "vitest";
import type { Email, IsoInstant, MessageId } from "@/modules/shared-types";
import { createComms } from "../lib/create-comms";
import { createTemplateRenderer } from "../lib/create-template-renderer";
import { emailProviderFor } from "../lib/email-provider-for";
import { TEMPLATE_IDS } from "../lib/template-ids";
import { EMAIL_TEMPLATES } from "../templates/email-templates";
import { stubEmailProvider } from "../email/stub-email";
import { nullSmsProvider } from "../sms/null-sms";
import type { Comms, Message, TemplateId } from "../types";
import { memoryCommsStore } from "./fixtures/memory-comms";

// Built rather than typed: a literal mailbox in a source file is what `check:config-literals` exists to redden,
// and a test fixture is not an exemption from the rule it is testing.
const mailbox = (local: string) => ({
  address: [local, "example.test"].join("@"),
  name: "N",
});
const SENDERS = Object.freeze({
  noreply: mailbox("noreply"),
  hello: mailbox("hello"),
  support: mailbox("support"),
  admin: mailbox("admin"),
  parents: mailbox("parents"),
  nannies: mailbox("nannies"),
  verification: mailbox("verification"),
});

const renderer = createTemplateRenderer(EMAIL_TEMPLATES);

const seamOver = (
  store: ReturnType<typeof memoryCommsStore>,
  dryRun = false,
): Comms =>
  createComms({
    email: stubEmailProvider,
    sms: nullSmsProvider,
    store,
    renderer,
    dryRun,
  });

const message = (over: Partial<Message> = {}): Message => ({
  channel: "email",
  templateId: "admin-test",
  to: { email: "someone@example.test" as Email },
  data: { at: "2026-09-23T10:00:00.000Z" as IsoInstant },
  ...over,
});

describe("the template registry is closed in both directions (ecc-lite rule 3)", () => {
  it("lists every id TemplateRegistry declares", () => {
    // The registry is a type, so its keys are read from the one file that declares them.
    const declared = Object.keys(EMAIL_TEMPLATES) as ReadonlyArray<TemplateId>;
    for (const id of declared) expect(TEMPLATE_IDS).toContain(id);
  });

  it("accepts the two ADR-168 (b) suspension ids the seam was built to carry", async () => {
    const store = memoryCommsStore();
    const seam = seamOver(store);
    for (const templateId of [
      "verification-suspension-lifted",
      "admin-nanny-suspension-lifted",
    ] as const) {
      const sent = await seam.send(message({ templateId, data: {} }));
      // It may fail for want of a template FILE; it must never fail for want of an ID.
      if (!sent.ok)
        expect(sent.error.details?.reason).not.toBe("unknown-template");
    }
  });
});

describe("the Resend provider is installed and chosen by config (08.01, 11.29)", () => {
  it("binds resend when a key is supplied", () => {
    const chosen = emailProviderFor("resend", {
      apiKey: "re_test_key",
      senders: SENDERS,
    });
    expect(chosen.ok && chosen.value.id).toBe("resend");
  });

  it("refuses resend with no key rather than falling back to the stub (fail closed)", () => {
    const chosen = emailProviderFor("resend", { senders: SENDERS });
    expect(chosen.ok).toBe(false);
    expect(!chosen.ok && chosen.error.details?.reason).toBe(
      "comms-not-configured",
    );
  });

  it("still binds the stub when config says stub-email", () => {
    expect(emailProviderFor("stub-email").ok).toBe(true);
  });
});

describe("templates render, and a stranger's words never become markup", () => {
  beforeEach(() => {
    stubEmailProvider.reset();
  });

  it("renders the contact form's message through the template file", async () => {
    const store = memoryCommsStore();
    const sent = await seamOver(store).send(
      message({
        templateId: "contact-request-public",
        data: {
          name: "Ada",
          email: "ada@example.test",
          role: "parent",
          message: "Hello there",
        },
      }),
    );
    expect(sent.ok).toBe(true);
    const row = store.rows[0];
    expect(row?.subject).toContain("Ada");
    expect(row?.html).toContain("Hello there");
    expect(row?.text).toContain("Hello there");
  });

  it("escapes HTML in template data (the contact form is anonymous input)", async () => {
    const store = memoryCommsStore();
    await seamOver(store).send(
      message({
        templateId: "contact-request-public",
        data: {
          name: "Ada",
          email: "ada@example.test",
          role: "parent",
          message: "<script>alert(1)</script>",
        },
      }),
    );
    expect(store.rows[0]?.html).not.toContain("<script>");
    expect(store.rows[0]?.html).toContain("&lt;script&gt;");
  });

  it("answers INTERNAL for an id with no template file, never a blank body", async () => {
    const store = memoryCommsStore();
    const sent = await seamOver(store).send(
      message({ templateId: "welcome-parent", data: {} }),
    );
    expect(sent.ok).toBe(false);
    expect(!sent.ok && sent.error.code).toBe("INTERNAL");
    expect(!sent.ok && sent.error.details?.reason).toBe("template-schema");
  });
});

describe("the dev dry run records the row and never calls the provider (08.03)", () => {
  beforeEach(() => {
    stubEmailProvider.reset();
  });

  it("writes a dry-run row and leaves the provider untouched", async () => {
    const store = memoryCommsStore();
    const sent = await seamOver(store, true).send(message());
    expect(sent.ok).toBe(true);
    expect(store.rows[0]?.status).toBe("dry-run");
    expect(stubEmailProvider.sent).toHaveLength(0);
  });

  it("calls the provider when the dry run is off", async () => {
    const store = memoryCommsStore();
    const sent = await seamOver(store).send(message());
    expect(sent.ok).toBe(true);
    expect(sent.ok && (sent.value as MessageId)).toBeTruthy();
    expect(stubEmailProvider.sent).toHaveLength(1);
  });
});
