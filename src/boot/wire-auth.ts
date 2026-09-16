// `auth` over the real Supabase driver, joined to the unit of work (03 §1.4; ADR-127). The module's own default
// already resolves to this driver; boot installs it explicitly so the join it runs with is the one boot built.
// There is no env name that selects `stub-auth` (06 §2.5 defines none), so the stub is reached by test wiring
// only — `configureAuth(stubAuth(...))` — never by a deployment; adding such a name is the env schema's business.
import { configureAuth, createAuth, supabaseAuthDriver } from "@/modules/auth";
import type { UnitOfWorkJoin } from "@/modules/platform";
import type { PortWiring } from "./types";

export function wireAuth(unitOfWork: UnitOfWorkJoin): PortWiring {
  configureAuth(createAuth({ driver: supabaseAuthDriver(), unitOfWork }));
  return { port: "auth", binding: "supabase" };
}
