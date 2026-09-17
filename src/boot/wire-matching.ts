// `matching` (03 §10.1) — the real inside, over `auth`'s data port: the candidate set from the `nanny_public`
// view at session scope and the wizard lead from `parent_leads` at service scope (02 §4.7). It needs no
// environment switch, because every read it makes is `auth`'s and fails closed on its own when the port is not
// there. It is wired **after** `scoring`, which it is the only caller of (03 §7.2), so the engine is installed
// before the first candidate is scored.
import { auth } from "@/modules/auth";
import { configureMatching, createMatching } from "@/modules/matching";
import type { PortWiring } from "./types";

export function wireMatching(): PortWiring {
  configureMatching(createMatching({ auth }));
  return {
    port: "matching",
    binding:
      "create-matching (nanny_public + parent_leads through auth's data port)",
    reason:
      "autofire and resultsFor answer `not-built` until 1e writes them (03 §10.1) — the rest of the connector is the real inside",
  };
}
