// The `TemplateRenderer` port over the template files (03 §8.1). One lookup, one render, no business rule.
//
// **An id with no file refuses.** 03 §8.4's own words for a template without a schema are `INTERNAL`, and that
// is what a missing file is: the id is real, the words do not exist yet. The alternative — an empty body, or a
// subject line made of the id — is a real email to a real person saying nothing, which is the failure 01 §4a
// rule 2 exists to stop.
//
// `from` resolution: the caller's `message.from` wins over the template's own key (03 §8.1 puts `from?: SenderKey`
// on the `Message`), so an operator may send the same words from a different mailbox without a second template.
import { err, ok } from "@/modules/platform";
import type { MessageId, Result } from "@/modules/shared-types";
import type {
  CommsErrorDetails,
  EmailTemplates,
  RenderedEmail,
  ResolvedMessage,
  TemplateRenderer,
} from "../types";

const noFile = (): Result<never, CommsErrorDetails> =>
  err<CommsErrorDetails>("INTERNAL", "That message cannot be rendered yet", {
    reason: "template-schema",
  });

export function createTemplateRenderer(
  templates: EmailTemplates,
): TemplateRenderer {
  return Object.freeze({
    render: async (
      message: ResolvedMessage,
      messageId: MessageId,
    ): Promise<Result<RenderedEmail, CommsErrorDetails>> => {
      const template = templates[message.templateId];
      if (template === undefined) return noFile();
      return ok({
        messageId,
        to: message.to,
        from: message.from ?? template.from,
        ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
        subject: template.subject(message.data),
        html: template.html(message.data),
        text: template.text(message.data),
        ...(message.attachments === undefined
          ? {}
          : { attachments: message.attachments }),
      });
    },
  });
}
