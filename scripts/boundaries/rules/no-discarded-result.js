"use strict";

// bb/no-discarded-result — the single most-repeated finding class in the Phase 1–3 review record, as a gate.
//
// **Why this rule exists and not a paragraph.** Measured across the three checkpoint sweeps
// (`docs/review-sweep-170926.md`, `-180926.md`, `-190926.md`), "a refusal that nothing reads" is the class
// that recurs most: REVIEW-2 C-2 (`await deps.openDfyAccess({…})` with no `.ok` check — a paid family's app
// could silently never open), REVIEW-2 M-13 (`settle` discards the update result), REVIEW-4 H-1 (a refused
// cron sweep laundered into a plausible `skipped`), and a dozen MEDIUMs and LOWs of the same shape. Every one
// of them was found by a person reading the line. ECC-lite rule 1: if you want it enforced, write the check.
//
// **What it asserts, and only this.** An expression statement whose value is a `Result` — the one result shape
// (01 §4a, `src/modules/shared-types/result.ts`) — is a refusal nobody read. `await store.settle(id);` on its
// own line cannot have checked `.ok`, because the value went nowhere.
//
// **What it deliberately does NOT assert.** It says nothing about a `Result` that IS bound and then handled
// badly — `links.ok ? links.value : []`, `if (!user.ok) return null`, a refusal rendered as an absence. Those
// are the same finding class and they are NOT mechanically separable from the legitimate cases: REVIEW-2 H-9
// and REVIEW-3 H-2 both concluded, correctly, that swallowing a particular refusal was the right call and the
// defect was only that nobody said so. A gate cannot read that intent. Those stay a person's job.
//
// The escape hatch is deliberate and narrow: `void`-ing the call is NOT one (that is REVIEW-2 H-9's own
// defect, suppressing the signal without handling anything). Binding it to a name and doing nothing is also
// not one — `no-unused-vars` catches that. To discard a `Result` on purpose you write the check and say why:
//
//     const settled = await store.settle(id);
//     if (!settled.ok) log.error("…", { alert: ALERT_… });   // or an explicit, commented discard
//
// Type information is required (the rule asks the checker what the expression's type is), so it runs in
// `eslint.typed.js` rather than `.eslintrc.js`.

const { ESLintUtils } = require("@typescript-eslint/utils");

// A `Result<T, D>` is `{ ok: true; value: T } | { ok: false; error: AppError<D> }`. Two shapes reach here:
// the alias is still attached (`Result`/`Result<…>`), or the checker has already expanded it to the bare
// union. Recognising both matters — a function declared `Promise<Result<Booking, …>>` keeps its alias, one
// built inline through `ok()` / `fail()` often does not.
function isResultLike(type, checker) {
  const alias = type.aliasSymbol?.getName();
  if (alias === "Result") return true;
  if (!type.isUnion()) return false;
  const arms = type.types;
  if (arms.length < 2) return false;
  // Every arm carries `ok`, and between them both a `value` arm and an `error` arm appear. Anything looser
  // (every arm has `ok`) would catch unrelated discriminated unions that happen to use the same field name.
  let sawValue = false;
  let sawError = false;
  for (const arm of arms) {
    const props = checker.getPropertiesOfType(arm).map((p) => p.getName());
    if (!props.includes("ok")) return false;
    if (props.includes("value")) sawValue = true;
    if (props.includes("error")) sawError = true;
  }
  return sawValue && sawError;
}

// `await f()` in statement position discards a `Result`; so does a bare `f()` that returns one synchronously.
// `void f()` is reported too, and is the reason `ignoreVoid` is not an option here: REVIEW-2 H-9 is precisely
// the case where `void` was read as "handled" and meant "unhandled rejection".
function subjectOf(node) {
  const expression = node.expression;
  if (expression.type === "AwaitExpression") return expression.argument;
  if (expression.type === "UnaryExpression" && expression.operator === "void")
    return expression.argument.type === "AwaitExpression"
      ? expression.argument.argument
      : expression.argument;
  return expression;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A Result discarded at statement position is a refusal nobody read.",
    },
    schema: [],
    messages: {
      discarded:
        "This {{what}} answers a `Result` and the answer goes nowhere, so its refusal is unreadable — the shape of REVIEW-2 C-2 (a paid family's app silently never opened) and REVIEW-4 H-1. Bind it and check `.ok`; if the refusal is genuinely to be swallowed, say so in the code rather than dropping the value.",
    },
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      ExpressionStatement(node) {
        const subject = subjectOf(node);
        if (subject.type !== "CallExpression") return;

        let type = services.getTypeAtLocation(subject);
        // An un-awaited call gives `Promise<Result<…>>`; unwrap exactly one level so a floating
        // promise carrying a Result is caught here too (`no-floating-promises` catches the float; this
        // catches the discard, and the two messages say different things).
        if (type.aliasSymbol?.getName() !== "Result") {
          const awaited = checker.getAwaitedType?.(type);
          if (awaited) type = awaited;
        }
        if (!isResultLike(type, checker)) return;

        context.report({
          node,
          messageId: "discarded",
          data: {
            what: node.expression.type === "AwaitExpression" ? "await" : "call",
          },
        });
      },
    };
  },
};
