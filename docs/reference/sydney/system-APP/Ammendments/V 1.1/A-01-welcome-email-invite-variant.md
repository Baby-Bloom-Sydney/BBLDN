> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# A-01 — Welcome email variant for child-invite signups

**Complexity:** Small
**Touches:** Email templates + signup flow branch
**Status:** Ready to hand off

## Intent

When a parent signs up by claiming a child invite link (vs. signing up through the normal nanny-matching funnel), they receive a **different welcome email** — one focused on the BB-app's child-tracking + Katie capabilities, NOT on finding childcare.

## Why

The current welcome path treats every parent as a childcare-seeker. But invite-flow parents already have a nanny — they're being onboarded into the BB app to track their child's day with that nanny. A "find your perfect nanny" welcome misframes the product entirely for that audience.

## Scope

**In scope:**
- New email template: invite-flow welcome
- Branch in the signup completion logic to pick the right template
- Verify a "standard" welcome email exists (or create one if it doesn't — see note below)

**Out of scope:**
- Redesigning the standard welcome email
- Changing the broader onboarding flow (covered by A-08)

## Files affected

| File | What changes |
|------|--------------|
| `BB/nanny-platform/app/src/lib/email/templates/` | Add new template file (e.g. `welcome-invite-parent.ts`) and confirm/create a standard welcome template |
| `BB/nanny-platform/app/src/lib/auth/actions.ts` | Likely the auth/signup completion path — add branch on signup origin |
| `BB/nanny-platform/app/src/lib/actions/bapp/child-invites.ts` (or equivalent) | The `connect_child_invite` server action where invite-flow signup completes — invoke the invite-variant template |

**Heads-up — verify before writing:** `app/src/lib/email/templates/` currently only contains `client-hire-confirmation.ts` and `professional-hire-confirmation.ts`. There may not be a "standard welcome" template yet — Supabase auth might be sending a default. The agent should grep for the existing welcome path before adding the variant. If no standard welcome template exists, create one as part of this amendment so the branch has both sides.

## Behaviour / acceptance criteria

1. **Trigger detection:** distinguish "this signup originated from a child invite token" from "this signup originated from the standard funnel". The simplest signal is: did the user claim an invite token as part of their session? If yes → invite variant.
2. **Standard welcome content** (existing or new — confirm with Bailey if creating from scratch):
   - "Welcome to Baby Bloom"
   - Sets expectation: find a great nanny, get matched, etc.
   - Primary CTA: complete profile / browse nannies
3. **Invite-flow welcome content** (NEW):
   - "Welcome to Baby Bloom — you're connected with `{nanny first name}`"
   - Frames the app as the place to track `{child first name}`'s day with their nanny
   - Brief callout for Katie ("Your AI helper for parenting questions")
   - Primary CTA: open the BB app for `{child first name}`
   - NO "find a nanny" CTA — they already have one
4. **Both emails** use the existing `sendEmail` infra at `app/src/lib/email/resend.ts` and log to `email_logs` per existing pattern.

## Edge cases

- Parent signs up via invite, then later claims a second invite for a different child → still receives only the original welcome. Subsequent invite acceptances log to `activity_logs` per child-linking spec but don't re-fire welcome.
- Parent signs up via the standard funnel, then later claims an invite → standard welcome already sent. Invite acceptance triggers the standard "child connected" email per child-linking spec, NOT the invite-variant welcome.
- Email send fails → existing `email_logs` retry pattern applies.

## Test scenarios

```
1. Parent signs up via invite link → receives invite-variant welcome
2. Parent signs up via standard funnel → receives standard welcome
3. Parent signs up via funnel, then claims invite → receives standard welcome only (NOT invite variant)
4. Parent signs up via invite, then claims a second invite → receives invite variant only ONCE
5. Email send fails → retried per existing pattern; not silently dropped
```

## Notes for the implementing agent

- **Confirm with Bailey** what the standard welcome currently contains (or whether it exists at all) before drafting the invite variant. If standard doesn't exist, both emails ship in this amendment — flag for Bailey's review of copy.
- Email copy should be in plain language, mobile-friendly, and follow whatever brand voice the existing transactional emails use. Look at `client-hire-confirmation.ts` and `professional-hire-confirmation.ts` for the existing tone.
- This is a paid + transactional email, not marketing — don't add "Unsubscribe" outside what's required.

## Definition of done

- [ ] Two welcome templates exist (standard + invite-variant) with Bailey-approved copy
- [ ] Branch logic in signup completion picks correct template based on signup origin
- [ ] `email_logs` records both variants distinguishably (e.g. `template_id = 'welcome' | 'welcome-invite'`)
- [ ] Tests pass for both signup paths
- [ ] `code-reviewer` + `typescript-reviewer` agents passed
- [ ] Manual smoke: signup via invite link → check inbox → invite-variant received
- [ ] Manual smoke: signup via funnel → check inbox → standard received
