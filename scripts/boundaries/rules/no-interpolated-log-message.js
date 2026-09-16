"use strict";

// bb/no-interpolated-log-message — the second line of defence the S3 security review asked for and handed to
// S6 (`docs/build-progress.md`, the ★ S3 entry: "the finding also proposed a lint rule against
// template-interpolated `msg`"). The runtime scrubber in `platform/log` is the first line: it redacts the
// message token-wise and **fail-closed**, so an interpolated value is either leaked-if-missed or mangled-if-
// caught — a 9–15-digit run in prose reads as a phone number and goes. 01 §4b says identifiers belong in
// `fields`; this rule says it at write time instead of at read time.
//
// It fires on `log.info(`…${x}…`)` and any call whose receiver chain roots at `log` / `logger` —
// `log.child({ … }).warn(`…`)` included. A template literal with no expressions is just a string and passes.

const LEVELS = new Set(["debug", "info", "warn", "error", "fatal", "trace"]);
const RECEIVERS = /^(log|logger)$/u;

/** The identifier a member / call chain starts from, or undefined for anything else. */
function rootIdentifierOf(node) {
  let current = node;
  while (current !== null && current !== undefined) {
    if (current.type === "Identifier") return current.name;
    if (current.type === "MemberExpression") current = current.object;
    else if (current.type === "CallExpression") current = current.callee;
    else return undefined;
  }
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a log message is prose, not a value: interpolate nothing into it (01 §4b; S3 security review)",
    },
    schema: [],
    messages: {
      interpolated:
        "A log message is prose, not a value — `{{level}}` is called with a template literal carrying `${...}`. Pass the value in `fields` instead (01 §4b). The runtime scrubber redacts the message fail-closed, so an interpolated id is either leaked if the pattern misses it or mangled if it hits.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        const level = callee.property.name;
        if (!LEVELS.has(level)) return;
        const root = rootIdentifierOf(callee.object);
        if (root === undefined || !RECEIVERS.test(root)) return;
        const [first] = node.arguments;
        if (
          first === undefined ||
          first.type !== "TemplateLiteral" ||
          first.expressions.length === 0
        )
          return;
        context.report({
          node: first,
          messageId: "interpolated",
          data: { level },
        });
      },
    };
  },
};
