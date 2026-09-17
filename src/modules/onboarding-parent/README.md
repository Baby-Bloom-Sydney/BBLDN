# onboarding-parent

**What it does.** Parent signup — UK mobile (ADR-102) + the promise line (D5) — sign in with the passwordless
catch (D4 / ADR-042), the forgot-password request, and the post-signup route to the call page (`03.36`). It calls
`auth.signUp` / `auth.signIn`, `platform/consent` (AGR-01), `positions.advance(P-2)` then `matching.autofire`
after the commit (03 §7.4), `comms.send(welcome-*)` and `Events.emit(signup.completed)`. It owns no stage of its
own.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`call-layer`, `matching`, `positions` (01 §2.3 row). **Never `scheduling`** (03 §3.6 R3).

**Connector.** `signUpParentAction` · `signInAction` · `requestPasswordResetAction` (the three server actions, passed
to the forms as props) · `ParentSignupForm` (S-X-05 `beside-matches` / S-X-06 `cold`) · `SignInForm` (S-X-08) ·
`ForgotPasswordForm` (S-X-09 forgot half) · `AuthShell` (the `(auth)` group chrome) · `postSignupDestination` ·
`safeNextPath` · `normaliseUkMobile` · `SIGNUP_COPY` · `configureParentProfileStore` + `memoryParentProfileStore`.
The set-password half of S-X-09 is `auth`'s (`SetPasswordForm`, `/set-password`) and is reused at `/reset-password`,
not duplicated.

**Signup order (the action).** validate → `auth.signUp` (role from a server value) → AGR-01 consent rows → the
`user_profiles` row → lead → position (P-2) when a lead is present → welcome email (best effort) →
`signup.completed` → destination: S-P-01 when a position opened, S-P-14 for an invite arrival, else S-P-03 state 0.

**Gaps (recorded, not hidden — detail in the L-007 `1c` PROGRESS entry).**

1. **`user_profiles` has no definer.** Closed by `S5b`'s `0017` (`create_parent_profile`) and
   `src/boot/db-parent-profile-store.ts`. `1e` added the port's read half (`get`) — S-P-04 needs the parent's
   contact details as facts for P-2 (03 §8.1), at session scope under RLS, so no service-role call joins
   07 §5.1 rule 5's list.
2. **No anonymous passwordless catch and no reset-request method on `auth`** (its README says so). Sign-in refuses
   with one line that points at S-X-09; the forgot form fails closed naming support. Pinned as failing tests.
3. **`/reset-password` is in `auth`'s signed-out-only group**, so a recovery link's signed-in session is bounced to
   the dashboard before it can set a password. Pinned as a failing gate test; `auth`'s owner rules it.
4. ~~**The P-2 slice is `1e`'s.**~~ **Closed by `1e`.** The one-go signup now reads the lead through
   `matching.getLead`, converts it with `positionDetailOf` and opens the position through `advance(P-2)`, whose
   own cascade opens the call — the pin is a passing test. A lead with no London area still degrades to S-P-03
   state 0 rather than guessing a district. `1e` also added S-P-04 (`/parent/request`): the same question bank,
   `createPositionAction`, then S-P-01.
5. **S-X-06 with-invite does not name the inviter** (`get_invite_preview` is `1i`'s): the line says the parent was
   invited, nothing more.

<!-- audit
Last edited: 2026-09-17T18:10+10:00 — BB-LDN-Planner-070926/1e
Notes: 1e — gap 4 closed (the P-2 slice exists; the pin is green), the profile store's `get` half, S-P-04 `/parent/request` + `createPositionAction`.
Prior: 2026-09-17T13:40+10:00 — BB-LDN-Planner-070926/1c
Notes: 1c — the inside: schema + UK mobile, the profile-store seat, consent, lead conversion, welcome, routing, three actions, four components; five gaps recorded.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
-->
