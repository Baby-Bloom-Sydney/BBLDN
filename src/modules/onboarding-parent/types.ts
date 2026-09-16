// 01 §2.3 + 03 §9.3 — the parent signup surface (04 §3.1 step 5, §3.2 paths A–E, §6.1 S-X-05 / S-X-06 / S-X-08 /
// S-X-09): UK mobile + the promise line (D5), the passwordless catch (D4 / ADR-042) and post-signup routing
// (`03.36`). The module calls `auth.signUp`, `positions.advance(P-2)`, `matching.autofire` (03 §7.4),
// `comms.send(welcome-*)` and `platform/consent`; it owns no stage of its own. Types only; every value lives in
// its own one-export file (L1).
import type { ClientResult } from "@/modules/platform";
import type { TemplateId } from "@/modules/comms";
import type {
  E164,
  Email,
  LeadId,
  Result,
  UserId,
} from "@/modules/shared-types";

/** 03 §9.3 funnel row — the `signupSource` prop of `signup.completed`. Values verbatim. */
export type SignupSource =
  | "standard_match"
  | "advanced_match"
  | "cold"
  | "profile"
  | "invite";

/** 03 §8.2 rows 1–3: the three welcome templates this module owns. */
export type ParentWelcomeTemplate = Extract<
  TemplateId,
  "welcome-parent" | "welcome-parent-position" | "welcome-parent-invited"
>;

/** What S-X-05 / S-X-06 carry into the action beside the form fields (04 §3.2: the lead, the invite, the profile). */
export type SignupContext = {
  readonly source: SignupSource;
  /** S-X-05: the `parent_leads.id` the wizard minted (02 §4.7) — converted by P-2 on submit. */
  readonly leadId?: LeadId;
  /** S-X-06 path E: the child-invite token, kept through signup (04 §6.1 "invite token kept"). */
  readonly inviteToken?: string;
  /** S-X-06 path D: the nanny whose profile the parent signed up from, remembered for S-P-03. */
  readonly nannyId?: string;
};

/** The validated S-X-05 / S-X-06 submission (01 §4a: validated once, at the boundary). `mobile` is E.164 with the config prefix (ADR-102). */
export type ParentSignupInput = SignupContext & {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: Email;
  readonly mobile: E164;
  readonly password: string;
};

/** 02 §4.1 row 3 — the `user_profiles` row the signup action writes after `auth.signUp` (first name, last name, mobile). */
export type ParentProfileInput = {
  readonly userId: UserId;
  readonly firstName: string;
  readonly lastName: string;
  readonly mobile: E164;
};

/** `details.reason` of an `INTERNAL` from the profile store. */
export type ParentProfileErrorDetails = {
  readonly reason: "profile-store-not-configured" | "profile-write-failed";
};

/**
 * The port behind the `user_profiles` write (02 §4.1; ADR-127 — one RPC is one transaction). The schema has no
 * definer for it yet (`0000`–`0016`), so the module-level binding fails closed until boot installs an adapter over
 * `auth`'s data port; the migration is recorded as owed in the L-007 `1c` PROGRESS entry.
 */
export type ParentProfileStore = {
  create(
    input: ParentProfileInput,
  ): Promise<Result<void, ParentProfileErrorDetails>>;
};

/** What the signup action tells the form: where the parent goes next (`03.36`) and whether a position opened (path B). */
export type ParentSignupOutcome = {
  readonly destination: string;
  readonly positionOpened: boolean;
};

/**
 * `details` of a VALIDATION refusal — `field` names the input the summary points at (04 §6.1: error summary takes
 * focus). Every other refusal is INTERNAL, whose details never cross the boundary (01 §4a): the reason is logged
 * server-side and the form shows the generic line.
 */
export type SignupErrorDetails = {
  readonly reason: "invalid-input";
  readonly field: string;
};

/** The signup action's shape, so the client component never imports the connector barrel (01 §2.5). */
export type ParentSignupAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<ParentSignupOutcome, SignupErrorDetails>>;

/** S-X-08: where a signed-in person is sent (01 §4d `next=`, else their own dashboard). */
export type SignInOutcome = {
  readonly destination: string;
};

export type SignInErrorDetails = {
  readonly reason: "invalid-input" | "refused";
};

export type SignInAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<SignInOutcome, SignInErrorDetails>>;

/** S-X-09 forgot half: the request is answered the same way whether or not the email is known (07 §4, no enumeration). */
export type PasswordResetRequestErrorDetails = {
  readonly reason: "invalid-input";
};

export type PasswordResetRequestAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<void, PasswordResetRequestErrorDetails>>;

/** S-X-05 shows the form beside the matches; S-X-06 is the cold / invite / profile form (04 §6.1). */
export type SignupVariant = "beside-matches" | "cold";

export type ParentSignupFormProps = {
  readonly action: ParentSignupAction;
  readonly variant: SignupVariant;
  readonly context: SignupContext;
  /** `SECURITY.password.minLength` — passed from the route, never read in a component. */
  readonly minPasswordLength: number;
  readonly signInHref: string;
  readonly clientTermsHref: string;
  readonly privacyHref: string;
  /** S-X-05 only: "N nannies matched" from S-X-04, when the results page handed it over. */
  readonly matchCount?: number;
};

export type SignInFormProps = {
  readonly action: SignInAction;
  /** 01 §4d step 2 — the attempted path the gate carried in `next=`; already checked by the route. */
  readonly nextPath?: string;
  readonly forgotPasswordHref: string;
  readonly signupHref: string;
};

export type ForgotPasswordFormProps = {
  readonly action: PasswordResetRequestAction;
  readonly signInHref: string;
  /** The support mailbox shown when a request cannot be sent (`SENDERS.support`, config only). */
  readonly supportEmail: string;
};

/** The `(auth)` group chrome: brand and legal links from config (L4), one card, no marketing. */
export type AuthShellProps = {
  readonly brandName: string;
  readonly homeHref: string;
  readonly clientTermsHref: string;
  readonly privacyHref: string;
  readonly children: React.ReactNode;
};
