// config — the module's type surface (01 §2.5). Types only; every value lives in its own one-export file.
// `config` imports nothing (01 §2.3 leaf), so unions that mirror `shared-types` are restated here and pinned by
// the config tests: EvidenceType · BucketKey · PaymentLinkKind · VerificationLevelKey equal; VettingProviderId ⊆ ProviderId.

/** 06 §2.5 marks: ● required · ○ optional · — absent / not expected. */
export type EnvMark = "●" | "○" | "—";
export type EnvScope = "public" | "server";
export type EnvKind =
  | "string"
  | "boolean"
  | "number"
  | "enum"
  | "url"
  | "uuid"
  | "email";
export type EnvGroup =
  | "App"
  | "Supabase"
  | "Stripe"
  | "Providers"
  | "Email"
  | "AI"
  | "Analytics"
  | "Flags"
  | "Flags (dev)"
  | "Flags (Katie)"
  | "Monitoring";

type EnvEntryBase = {
  readonly group: EnvGroup;
  readonly scope: EnvScope;
  readonly purpose: string;
  readonly dev: EnvMark;
  readonly preview: EnvMark;
  readonly prod: EnvMark;
  /** 06 §4.1 C: the name must be absent outside development */
  readonly devOnly?: true;
  /** server-only secret of 07 §7 item 3 (bundle string scan) */
  readonly secret?: true;
};

/** Discriminated on `kind`: an enum entry must carry its closed, non-empty value set; no other kind may. */
export type EnvEntry =
  | (EnvEntryBase & {
      readonly kind: "enum";
      readonly values: readonly [string, ...string[]];
    })
  | (EnvEntryBase & {
      readonly kind: Exclude<EnvKind, "enum">;
      readonly values?: never;
    });

export type Environment = "development" | "preview" | "production";

/** Which 06 §2.5 column governs requiredness. */
export type EnvColumn = "dev" | "preview" | "prod";

export type SenderKey =
  | "noreply"
  | "hello"
  | "support"
  | "admin"
  | "parents"
  | "nannies"
  | "verification";
export type Sender = { readonly address: string; readonly name: string };

/** 02 `payment_link_kind` + `price_preset` (03 §5.2). */
export type PaymentLinkKind = "deposit" | "balance-after-week-1" | "custom";
export type PricePreset = PaymentLinkKind | "self-serve-app";

/** Mirrors shared-types `EvidenceType` (03 §4.2) — pinned equal by the config tests. */
export type EvidenceType =
  | "identity-document"
  | "selfie"
  | "dbs-certificate"
  | "dbs-update-service"
  | "right-to-work-passport"
  | "right-to-work-share-code"
  | "right-to-work-document";
export type VettingProviderId =
  | "stub-manual"
  | "admin-manual"
  | "ai-id-check"
  | "dbs-update-service"
  | "home-office-share-code";
export type VerificationLevelKey =
  | "L0_SIGNED_UP"
  | "L1_REGISTERED"
  | "L2_ID_VERIFIED"
  | "L3_PROVISIONALLY_VERIFIED"
  | "L4_FULLY_VERIFIED";

/** Mirrors shared-types `BucketKey` (01 §6.1) — pinned equal by the config tests. */
export type BucketKey =
  | "profile-pictures"
  | "verification-documents"
  | "development-images";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type LocalTime = `${number}:${number}`;

/** A cron's intended Europe/London time (01 §4f). */
export type CronSchedule =
  | { readonly kind: "every"; readonly minutes: number }
  | { readonly kind: "daily"; readonly hour: number; readonly minute: number }
  | {
      readonly kind: "weekly";
      readonly weekday: Weekday;
      readonly hour: number;
      readonly minute: number;
    };

export type CronSpec = {
  readonly path: `/api/cron/${string}`;
  /** the 03 §2.5 SystemJobName when the cron calls `advance` or is a named sweep; absent for jobs that move no stage */
  readonly job?: string;
  readonly london: CronSchedule;
  readonly serves: string;
};

export type FlagName =
  | "KATIE"
  | "INVITE_LINKS"
  | "NEW_TRIALS"
  | "PAYMENTS"
  | "BONUS_PROGRAM"
  | "PROACTIVE"
  | "DEV_MODE"
  | "EMAIL_DEV_DRY_RUN"
  | "KATIE_STREAM_DIAGNOSTICS"
  | "KATIE_PRELOAD_PASSTHROUGH"
  | "KATIE_PARALLEL_TOOLS"
  | "KATIE_IMAGE_MARKER"
  | "KATIE_ALWAYS_ON_CONTEXT"
  | "KATIE_TYPEWRITER"
  | "SKIP_INTRO_WAIT"
  | "FUNNEL_LOG";
export type PublicFlagName =
  | "KATIE"
  | "BONUS_PROGRAM"
  | "DEV_MODE"
  | "KATIE_TYPEWRITER"
  | "SKIP_INTRO_WAIT"
  | "FUNNEL_LOG";

export type RateLimit = {
  /**
   * The declared name — the key the policy sits under in `SECURITY.rateLimits`, stamped by `security.ts` so the
   * two cannot drift (ADR-140). `platform/rate-limit` reads it to decide ADR-134's fail-open by membership in
   * `SECURITY.failOpenOnLimiterOutage`; a policy built anywhere else carries no name and so is never on the list.
   */
  readonly name?: string;
  readonly key: string;
  readonly perMinute?: number;
  readonly perHour?: number;
  readonly perDay?: number;
  readonly note?: string;
};

// ── Derived env types (from the registry in lib/env-schema.ts) ──
type EnvEntries = typeof import("./lib/env-schema").ENV_SCHEMA.entries;
type EnumValues<E> = E extends { readonly values: ReadonlyArray<infer V> }
  ? V
  : never;
type BaseEnvValue<E extends EnvEntry> = E["kind"] extends "boolean"
  ? boolean
  : E["kind"] extends "number"
    ? number
    : E["kind"] extends "enum"
      ? EnumValues<E>
      : string;
type RequiredEverywhere<E extends EnvEntry> = E["dev"] extends "●"
  ? E["preview"] extends "●"
    ? E["prod"] extends "●"
      ? true
      : false
    : false
  : false;
/** boolean → `boolean | undefined` (absent = code default); required in every column → `T`; else `T | undefined`. */
export type EnvValue<E extends EnvEntry> = E["kind"] extends "boolean"
  ? boolean | undefined
  : RequiredEverywhere<E> extends true
    ? BaseEnvValue<E>
    : BaseEnvValue<E> | undefined;
export type EnvName = keyof EnvEntries;
export type PublicEnv = {
  readonly [K in EnvName as EnvEntries[K]["scope"] extends "public"
    ? K
    : never]: EnvValue<EnvEntries[K]>;
};
export type ServerEnv = {
  readonly [K in EnvName as EnvEntries[K]["scope"] extends "server"
    ? K
    : never]: EnvValue<EnvEntries[K]>;
};
export type ParsedEnv = {
  readonly environment: Environment;
  readonly public: PublicEnv;
  readonly server: ServerEnv;
};

// ── 07 §6.2's retention schedule (ADR-179; L-009 `3h`). The values are `retention.ts`; these are their shapes,
//    here because a config file exports exactly one thing (build-standard L1).
/** The column a window runs from. Every one is checked against the catalogue by the job, which raises if it is gone. */
export type RetentionAnchor = {
  readonly table: string;
  readonly column: string;
};

export type RetentionTreatment =
  | { readonly kind: "delete" }
  | { readonly kind: "null-columns"; readonly columns: ReadonlyArray<string> }
  | { readonly kind: "none"; readonly because: string }
  | {
      readonly kind: "deferred";
      readonly because: string;
      readonly owner: string;
    };

export type RetentionClass = {
  /** The name the job dispatches on and the gate joins. */
  readonly class: string;
  /** Its row in 07 §6.2. */
  readonly specRow: number;
  /** 07 §6.2's own words for what this is. */
  readonly what: string;
  /** `null` only for `none` and `deferred`. */
  readonly window:
    | { readonly months: number }
    | { readonly days: number }
    | null;
  readonly anchors: ReadonlyArray<RetentionAnchor>;
  readonly targets: ReadonlyArray<string>;
  readonly treatment: RetentionTreatment;
};
