// Nominal typing helper: a `Brand<string, 'UserId'>` is a string the compiler refuses to mix with other ids.
// Zero runtime — the brand key never exists on the value.
declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & {
  readonly [brand]: Name;
};
