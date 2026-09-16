// 01 §2.3 + 03 §9.3 / §10.1 — the public pages: home, about, services, contact, browse, nanny profile and the
// legal pages. `public-site` owns the browse **Connect** action (K-1) through the `connections` stage-model
// connector (B-39 open — not built), sends the contact form through `comms`, and never imports `scheduling`
// (03 §3.6 R3). Types only; every value lives in its own one-export file (L1).
import type { ClientResult } from "@/modules/platform";
import type { TemplateId } from "@/modules/comms";

/** 03 §9.3 funnel row — the `surface` prop of `results.viewed`. Values verbatim. */
export type ResultsSurface = "quick" | "results" | "matches" | "browse";

/** 03 §8.2 rows 37–40: the contact-form templates this surface sends, `replyTo` = the submitter. */
export type ContactTemplate = Extract<
  TemplateId,
  "contact-request" | "contact-request-public"
>;

/** 04 §2.1 — the public screen ids this module's route register carries (never reused; glossary §4). */
export type PublicScreenId = `S-X-${string}`;

/** 01 §4d route groups a public screen may live in; `public` is the group whose chrome this module renders. */
export type PublicRouteGroup = "public" | "funnel" | "auth";

/**
 * One row of the public route register (04 §2.1 ids; 05 §8.3 index rule). `path` is the canonical path; a
 * dynamic screen carries `prefix` beside the path it hangs off. `index: false` = the 05 §8.3 `noindex` set,
 * kept out of the sitemap and out of the crawl.
 */
export type PublicRoute = {
  readonly id: PublicScreenId;
  readonly path: string;
  readonly prefix?: string;
  readonly group: PublicRouteGroup;
  readonly title: string;
  readonly description: string;
  readonly index: boolean;
  /** S-X-01 only: the home title is the site title, not "Home | Brand". */
  readonly absoluteTitle?: true;
};

/** 02 §4.4 / ADR-118 (c): weekdays `0–6`, Monday = 0 — the value the quick-match form submits per day. */
export type QuickMatchDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The four parts of a day the front door asks about (`scoring` `ScheduleBlock.part`, 03 §7.2). */
export type QuickMatchPart = "morning" | "midday" | "afternoon" | "evening";

/** What S-X-01's front door hands S-X-02 in the query string (04 §3.1 step 1 → 2). */
export type QuickMatchQuery = {
  readonly days: ReadonlyArray<QuickMatchDay>;
  readonly parts: ReadonlyArray<QuickMatchPart>;
  readonly area: string;
  readonly district: string;
};

/** Who is writing to us on S-X-23 — routed the same way, kept so the reply can be addressed. */
export type ContactRole = "parent" | "nanny" | "other";

/** The validated S-X-23 submission (01 §4a: validated once, at the boundary). */
export type ContactMessage = {
  readonly name: string;
  readonly email: string;
  readonly role: ContactRole;
  readonly message: string;
};

/** The contact action's shape, so the client component never imports the connector barrel. */
export type ContactMessageAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<void>>;

export type ContactFormProps = {
  readonly action: ContactMessageAction;
  /** The support mailbox shown as the fallback when a send fails (`SENDERS.support`, config only). */
  readonly supportEmail: string;
};

/** `AREAS_SOURCE.serviceAreaName` — passed from the route, never read in a component (keeps the barrel client-safe). */
export type ServiceAreaProps = {
  readonly serviceAreaName: string;
};
