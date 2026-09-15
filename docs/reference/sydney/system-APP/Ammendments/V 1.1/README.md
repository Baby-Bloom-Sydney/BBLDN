> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Amendments — V 1.1

**Started:** 2026-05-06
**Status:** 7 of 8 amendments shipped. A-08 is the only remaining work.
**Sequencing:** This work ships BEFORE the payments/subscriptions build (`system/APP/PAYMENTS/`).

## What this is

A planning workspace for **UX amendments and flow changes** to the existing app — small to mid-size improvements that should ship before the payments system goes in.

Why before payments:
- Some amendments may touch surfaces that payments will also touch (paywalls, billing, account settings). Cleaner to land the UX changes first, then layer payments on top.
- Payments touches money flows — high-risk surface. Doing UX cleanup on a stable base reduces variables.
- Quick wins build momentum + clean up rough edges users are seeing today.

## How we work in here

Same research-and-document-first pattern as PAYMENTS + child-linking — application code is not modified during planning. Each amendment gets its own spec file once scoped enough to hand off.

The implementing agent should run with full ECC discipline (TDD, code-reviewer + typescript-reviewer in parallel after each change, security-reviewer on auth/upload paths). See `BB/nanny-platform/CLAUDE.md`.

---

## Amendment status

### Shipped (2026-05-06 to 2026-05-07)

See `PROGRESS.md` for full ship notes per amendment (commit hashes, verification, scope decisions made during implementation).

| ID | Title | Status |
|----|-------|--------|
| A-01 | Welcome email variant for child-invite signups | ✅ shipped |
| A-02 | Rename "Education" tab → "Children" universally | ✅ shipped |
| A-03 | Active nanny tile redesign | ✅ shipped |
| A-04 | Hide Browse Nannies tab on placement + inline link | ✅ shipped |
| A-05 | Parents can edit their profile picture | ✅ shipped |
| A-06 | Child profile picture editable by nanny + parent | ✅ shipped |
| A-07 | Top-tab Katie / BabyBloom split (Chrome-tab style) | ✅ shipped |

### Remaining

| ID | Title | Spec | Status |
|----|-------|------|--------|
| A-08 | Katie-guided add-child onboarding (populate the feed) | `A-08-katie-guided-onboarding.md` | DRAFT v4 — heavily iterated with Bailey; ready for live alpha testing per recent discussion |

---

## Out of scope for V 1.1

- Anything in `PAYMENTS/` — that's a separate workspace, ships after V 1.1.
- Wholesale redesign of the nanny matching funnel.
- Backend / data model changes beyond what each amendment specifically requires.
- Personality protocol revisions (e.g. the "no auto welcome-back" rule queued in `system/APP/BLOOMBOT/PROMPTS/PROPOSED-EDITS.md`) — handled separately at the prompt-system level.

## Cross-system impact

A-08 touches surfaces the payments build will also touch — flagged here so the payments agent knows to coordinate:

- **A-08 (Katie-guided onboarding):** Payments has a paywall around BB-app surfaces. The onboarding flow itself is during the trial period (or pre-trial), so the paywall doesn't gate it — but if a parent's trial expires mid-onboarding, the flow should handle that gracefully.

(Earlier cross-system flags for A-05 + A-07 are now resolved — both shipped with the relevant coordination considered.)

---

## Where the implementing agent should start (for A-08)

A-08 is the only remaining work in V 1.1.

1. Read this README for context.
2. Read `A-08-katie-guided-onboarding.md` end-to-end. It's long — there's a lot to digest because the spec doubles as the actual prompt design (Bailey's preference). Read once for shape, then again for detail.
3. Read the BLOOMBOT references the spec depends on:
   - `system/APP/BLOOMBOT/PROMPTS/RULES/PRINCIPLES.md`
   - `system/APP/BLOOMBOT/PROMPTS/RULES/ANTI-PATTERNS.md`
   - `system/APP/BLOOMBOT/PROMPTS/DIRECTORY/SECTIONS.md`
   - `system/APP/BLOOMBOT/MODULES.md` + `PROACTIVE-MESSAGES.md` + `TOOLS.md` + `LAYOUT.md` + `BRANDING.md`
   - `app/src/lib/chat/prompts/seed-data.ts` (the `personality` section is ground truth for voice + ACA)
4. Read `BB/nanny-platform/CLAUDE.md` for ECC discipline expectations.
5. Note: A-08 inherits from Katie's existing personality framework — do NOT rewrite or override it. Only add the onboarding-specific rules documented in the spec.
6. TDD-first per usual.
7. Update `PROGRESS.md` (in this folder) when A-08 lands.
