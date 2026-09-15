// Builds the one zod object schema (01 §3.3) from a registry table for a 06 §2.5 column. A name is required when
// its mark for that column is ● and it is not a boolean (booleans default in code — 01 §3.4). The server reader
// passes `ENV_SCHEMA.entries`; the client reader passes `PUBLIC_ENV_ENTRIES` only, so no server name is even
// referenced on that side (07 §7 item 3).
import { z } from "zod";
import type { EnvColumn, EnvEntry } from "../types";
import { envValueSchema } from "./env-value-schema";

export function buildEnvSchema(
  entries: Readonly<Record<string, EnvEntry>>,
  column: EnvColumn,
): z.ZodObject<Record<string, z.ZodType<unknown>>> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const [name, entry] of Object.entries(entries)) {
    const required = entry[column] === "●" && entry.kind !== "boolean";
    shape[name] = envValueSchema(entry, required);
  }
  return z.object(shape);
}
