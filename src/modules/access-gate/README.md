# access-gate

**What it does.** Answers one question — _is the app open for this family?_ — and re-exports the one lever that
changes the answer. It reads `payments.getAccess` and applies `decideAccess`, the pure rule of 03 §5.2 / §5.4.5 /
§5.4.6:

| Standing                  | Gate   | Why                                                                       |
| ------------------------- | ------ | ------------------------------------------------------------------------- |
| `toggled` (on / off)      | either | the admin override beats every other standing, both ways (ADR-093)        |
| `placed`                  | open   | the app is on from the nanny's first day, before any bill (ADR-093 / 094) |
| `trial`                   | open   | self-serve only (ADR-068 / 093)                                           |
| `active` · `paid-in-full` | open   | past-due is lapsed by its cron, not by this read (§5.4.5)                 |
| `deposit-paid`            | closed | the deposit secures the place and opens **nothing** (ADR-097)             |
| `lapsed` · `none`         | closed | —                                                                         |

`accessUntil` — the youngest linked child's third birthday, recomputed on every child link (ADR-083 / 084) —
closes the gate once it has passed, whatever the standing says. The lapse crons move the record; this read does
not wait for them, because an expired grant that still renders the product is the failure that matters.

**Connector** (`index.ts` + `types.ts` — L2):

| Area     | Values                                   | Types                                     |
| -------- | ---------------------------------------- | ----------------------------------------- |
| The gate | `accessGate` (`hasAccess` · `setAccess`) | `AccessDecision` · `AccessReason`         |
| The rule | `decideAccess` (pure)                    | —                                         |
| The stub | `stubAccessGate` (`access-gate.stub.ts`) | `StubAccessGateSeed` · `AccessGateResult` |

**What it may import.** `payments` · `app` · `auth` (S) · `platform` (S) (01 §2.3). The edge runs one way only:
`access-gate → payments`, never back (fix: A-3 / R2).

**Fail-closed by construction.** `hasAccess` returns whatever `payments.getAccess` returned; with `payments`
unconfigured that is `INTERNAL`, and the caller must treat it as closed. There is no default "open" anywhere in
this module.

**What this module does _not_ do yet (F-c boundaries).** It does not read `app` — 01 §2.3 gives it the arrow and
03 §10.1 names the pair, but no section states what it reads. The most likely need, `accessUntil` from the
youngest linked child (ADR-083 / 084), is a read `app/child-linking` owes and its signature is not stated;
recorded in the L-005 F-c PROGRESS entry rather than invented. The screen wiring (S-P-10 / 11 / 12 / 13, the rail
row, S-A-10's toggle control) is Phase 1.

**Suites.** `src/modules/access-gate/__tests__/access-gate.swap.test.ts` — every row of the table above, both
sides of the admin override, the `accessUntil` expiry, and the reverse swap (`payments` stubbed, the gate still
runs).

**`1h` changed nothing in this module, and that is the point.** `payments` grew its whole inside — the spine, the
webhook, the crons, three screens — and the gate is the same seven-line derivation it was, because F-c put the
rule in `decideAccess` and the data in `payments.getAccess`. Two claims about it are now pinned at boot rather
than only in the swap test: with `payments` unwired the gate carries `payments-not-configured` and refuses
(`ports.fail-closed.test.ts`), and with `payments` wired against an unreachable database it carries `E_STORE` and
still refuses (`boot.test.ts`). A defaulted `open: false` would be indistinguishable from a real closed gate and
would lock a paying family out of the product she paid for while hiding the outage.

**Still owed:** the `accessUntil` recomputation on every child link (ADR-083 / 084) has a writer now —
`payments` calls `set_access_window` on every paid transition and at `openDfyAccess` — but **`app/child-linking`
never calls it**, because that module has no inside. So the window moves when money moves and not when a child
is linked, which is half of ADR-084. Owner: whoever builds `app/child-linking` (`1i`).

<!-- audit
Last edited: 2026-09-17T20:10+10:00 — BB-LDN-Planner-070926/1h
Notes: no code change — the gate's two fail-closed claims are now pinned at boot as well as in the swap test, and
the half of ADR-084 that `app/child-linking` still owes is named with its owner.
Prior: 2026-09-16T16:05+10:00 — BB-LDN-Planner-070926/F-c
Notes: initial authoring — the connector, the pure `decideAccess` rule, the stub and the swap test.
-->
