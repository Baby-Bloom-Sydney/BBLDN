// The S3 security review's carry-forward to S6: identifiers go in `fields`, never in the message (01 §4b).
import { createRequire } from "node:module";
import { RuleTester } from "eslint";
import rule from "../rules/no-interpolated-log-message.js";

const require_ = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require_.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("bb/no-interpolated-log-message", rule, {
  valid: [
    'log.info("position created", { positionId });',
    "log.warn(`a template with no value in it`);",
    'logger.error("failed", { cause });',
    "log.child({ requestId }).info(`still just prose`);",
    // Not a logger: the rule does not police every `.info(` in the tree.
    "reporter.info(`${count} rows`);",
    // Not a level the logger has.
    "log.send(`${count} rows`);",
  ],
  invalid: [
    {
      code: "log.info(`created position ${positionId}`);",
      errors: [{ messageId: "interpolated" }],
    },
    {
      code: "logger.error(`failed for ${email}`, { cause });",
      errors: [{ messageId: "interpolated" }],
    },
    {
      code: "log.child({ requestId }).warn(`slow: ${ms}ms`);",
      errors: [{ messageId: "interpolated" }],
    },
  ],
});
