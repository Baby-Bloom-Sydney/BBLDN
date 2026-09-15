// 01 §4a — the success half of `Result`. Structural: assignable to any `Result<T, D>`.
export const ok = <T>(value: T): { readonly ok: true; readonly value: T } =>
  Object.freeze({ ok: true as const, value });
