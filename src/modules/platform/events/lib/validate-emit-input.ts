// 03 §9.2 "Errors: VALIDATION (unknown name / props schema)" + the client allow-list (§9.3). Validates once at
// the connector boundary (01 §4a rule 3); inside, the envelope is trusted. Props come back parsed (readonly,
// unknown keys rejected) so what is stored is exactly what the schema allows.
import { EVENT_NAMES } from "@/modules/shared-types";
import type { EventName, Result } from "@/modules/shared-types";
import type { EmitErrorDetails, EmitInput } from "../types";
import { EVENT_SCHEMAS } from "../schemas";
import { err } from "../../lib/err";
import { ok } from "../../lib/ok";
import { attributionSchema } from "./attribution-schema";
import { isClientEventName } from "./is-client-event-name";

const KNOWN_NAMES: ReadonlySet<string> = new Set(EVENT_NAMES);

const issueLines = (
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): ReadonlyArray<string> =>
  issues.map(
    (issue) =>
      `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
  );

export function validateEmitInput<N extends EventName>(
  input: EmitInput<N>,
  source: "server" | "client",
): Result<EmitInput<N>, EmitErrorDetails> {
  if (!KNOWN_NAMES.has(input.name)) {
    return err("VALIDATION", "Unknown event name", { reason: "unknown-name" });
  }
  if (source === "client" && !isClientEventName(input.name)) {
    return err("VALIDATION", "This event cannot be emitted from the client", {
      reason: "server-only-name",
    });
  }
  const props = EVENT_SCHEMAS[input.name].safeParse(input.props);
  if (!props.success) {
    return err("VALIDATION", "Event props do not match the schema", {
      reason: "props",
      issues: issueLines(props.error.issues),
    });
  }
  const attribution =
    input.attribution === undefined
      ? undefined
      : attributionSchema.safeParse(input.attribution);
  if (attribution !== undefined && !attribution.success) {
    return err("VALIDATION", "Event attribution is invalid", {
      reason: "props",
      issues: issueLines(attribution.error.issues),
    });
  }
  return ok({
    ...input,
    props: props.data as EmitInput<N>["props"],
    ...(attribution === undefined ? {} : { attribution: attribution.data }),
  });
}
