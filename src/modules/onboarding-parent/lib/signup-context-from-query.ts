// 04 §3.2 — which entry path a signup screen is serving, read from the query the previous screen left: S-X-05
// carries `lead` (path B); S-X-06 carries `invite` (path E) or `nanny` (path D), else it is the cold path C.
// `src=std` is the quick-match path A (03 §9.3 `standard_match`). Shapes are checked again by the action's schema;
// this only decides the `SignupContext` the route hands the form, so the route file carries no logic (01 §2.5).
import type { LeadId } from "@/modules/shared-types";
import type { SignupContext } from "../types";

type Query = Readonly<
  Record<string, string | ReadonlyArray<string> | undefined>
>;

const one = (query: Query, key: string): string | undefined => {
  const value = query[key];
  return typeof value === "string" && value !== "" ? value : undefined;
};

export function signupContextFromQuery(query: Query): SignupContext {
  const leadId = one(query, "lead");
  const inviteToken = one(query, "invite");
  const nannyId = one(query, "nanny");
  if (leadId !== undefined)
    return { source: "advanced_match", leadId: leadId as LeadId };
  if (inviteToken !== undefined) return { source: "invite", inviteToken };
  if (nannyId !== undefined) return { source: "profile", nannyId };
  return { source: one(query, "src") === "std" ? "standard_match" : "cold" };
}
