// Every value a template interpolates into an HTML body passes through here first.
//
// This is not defensive tidiness: `contact-request-public` renders an **anonymous** submitter's name, role and
// free text (`public-site/actions/send-contact-message-action.ts`), and `admin-contact` renders whatever an
// operator typed. An email body is markup in someone else's client, so unescaped input is stored HTML injection
// with the support inbox as the target. The text half needs no escaping and gets none.
const REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/gu,
    (character) => REPLACEMENTS[character] ?? character,
  );
}
