// code-only.mjs — a source file's **code**, with comments and string / template contents blanked out. One export.
//
// Both limiter gates ask "does this text contain the reference", and both must answer no for a reference that is
// only a comment or a string: without this, `// TODO: wire rateLimits.clientEvents` in any non-test file satisfies
// `check:limiter-call-sites` for a policy nothing consumes — exactly the declared-but-unenforced state the gate
// exists to catch (`security-reviewer`, MEDIUM) — and `// consumeChildAddLimit(userId)` would satisfy
// `check:action-limits` for an action that calls nothing.
//
// Blanking rather than deleting keeps offsets meaningless but harmless; we only ever ask about content. A quote
// inside a regex literal can confuse the scanner and blank more than it should. That direction is safe: it can
// only lose a real call site and turn a gate **red**, never green.
export function codeOnly(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === "//") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (two === "/*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    const quote = text[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      i += 1;
      while (i < text.length && text[i] !== quote)
        i += text[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}
