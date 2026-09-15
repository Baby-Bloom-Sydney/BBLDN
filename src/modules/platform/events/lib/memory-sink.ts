// 03 §9.5 / 05 §4.3 `memorySink` — the stub every test constructs `Events` with; captures envelopes in memory.
// Stands in for `event-log` by default (swap test 8: "event-log → memorySink"). Production code, no test import.
import type { MemorySink, SinkId } from "../types";
import { err } from "../../lib/err";
import { ok } from "../../lib/ok";

export function memorySink(
  options: { readonly id?: SinkId; readonly fail?: boolean } = {},
): MemorySink {
  const captured = {
    envelopes: [] as ReadonlyArray<MemorySink["envelopes"][number]>,
  };
  return Object.freeze({
    id: options.id ?? "event-log",
    handle: async (envelope) => {
      if (options.fail)
        return err("INTERNAL", "memory sink set to fail", {
          reason: "configured-failure",
        });
      captured.envelopes = [...captured.envelopes, envelope];
      return ok(undefined);
    },
    get envelopes() {
      return captured.envelopes;
    },
    reset: () => {
      captured.envelopes = [];
    },
  });
}
