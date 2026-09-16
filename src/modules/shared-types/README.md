# shared-types

**What it does.** The types every module shares (01 §2.1: a leaf every module may import). It holds:
`Result` / `AppError` / the `ErrorCode` registry (01 §4a), `Actor` + `SystemJobName` (03 §2.5), branded ids and
scalars (03 §1.4 / §2.5 / §3.2 / §8.1), the **enum register** of 02 §3 (79 enums as frozen tuples — the tuple index is
the ordinal, 02 C-1), `EventName` (03 §9.3, 88 names), `TransitionId` (03 §2.4, 44 rows), the 26 `ModuleName`s
(00 §3) and the type groups the contracts name as `shared-types/<file>.ts`: `stage-model.ts` (03 §2.5),
`scheduling.ts` (03 §3.2), `vetting.ts` (03 §4.2), `platform.ts` (03 §1.4).

**Connector.** `index.ts` re-exports `types.ts` (types) and the value tuples (`ENUMS`, `ERROR_CODES`, `MODULE_NAMES`,
`SYSTEM_JOB_NAMES`, `TRANSITION_IDS`, `EVENT_NAMES`, `CLIENT_EVENT_NAMES`, `ACTIVE_STATUSES`). Read a union with
`EnumValue<'<enum>'>`; read an ordinal with `ENUMS.<enum>.indexOf(value)` — there is no helper here (behaviour belongs to
`platform`).

**What it may import.** Nothing (01 §2.3 — leaf). It never imports `config`.

**Named service-role uses.** None — no runtime.

**`database.types.ts` is generated, never written** (01 §6.2; 02 C-12). `npm run types:generate` runs
`supabase gen types typescript --local` over the applied migration set and writes the file; CI's `types-drift` job
regenerates it and diffs, so a migration without its regenerated types fails the build. It is re-exported from
`types.ts` as `Database` (plus `Tables` / `TablesInsert` / `TablesUpdate` / `Enums`), and `auth` narrows it to
`Database["public"]` for its one `AppDatabase` seam. `Query<DB>` stays generic over `DatabaseShape`, which
`Database["public"]` structurally satisfies. `EventPropsMap` and `TransitionPayloadMap` are augmented by
`platform/events` (S3) and `positions` (Phase 1e) by declaration merging.

**One type group per file** (build-standard L1 as 03 applies it): each file is one named concept — an enum cluster, an
id group, one contract's types. `index.ts` / `types.ts` are the barrels the boundary lint exempts (05 §7 rule 4).

<!-- audit
Last edited: 2026-09-16T16:40+10:00 — BB-LDN-Planner-070926/S5
Notes: S5 — database.types.ts landed (generated from the applied 0000–0016 set) and is re-exported from types.ts; the "not here yet" paragraph replaced with how it is generated and who narrows it.
Prior: 2026-09-15T16:20+10:00 — BB-LDN-Planner-070926/S2
Notes: created at S2 — register + registries + the four contract type groups; database.types.ts deferred to S5.
-->
