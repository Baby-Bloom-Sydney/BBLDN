// `--check` is what the CI `allowed-imports` job runs first: the committed output must be what the generator
// writes today, or the table changed without the artefact being regenerated (05 §10 regenerated-not-edited).
export function checkResult(
  current: string,
  expected: string,
): { readonly ok: boolean; readonly message: string } {
  if (current === expected)
    return {
      ok: true,
      message:
        "check:allowed-imports: OK — eslint.boundaries.js matches the 01 §2.3 table",
    };
  return {
    ok: false,
    message:
      "check:allowed-imports: FAIL — eslint.boundaries.js drifted from the allowed-imports table. " +
      "It is generated, never hand-edited (05 §10): run `npm run gen:boundary-rules` and commit the result. " +
      "If the table itself needs to change, amend `01-architecture.md` §2.3 first (it needs an ADR), then " +
      "`scripts/boundaries/allowed-imports.ts`.",
  };
}
