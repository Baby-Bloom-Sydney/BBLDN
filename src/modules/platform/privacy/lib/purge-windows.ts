// The retention list in the shape `0030` reads it (ADR-179; L-009 `3g`).
//
// Its own file because it is its own thing: the sweep is behaviour, this is a **projection of a legal fact**.
// `LEGAL.erasureRetains` owns the dates and the anchors — 07 §6.2's table is where they came from — and this
// hands them across without interpreting them. Nothing here knows what six years means, and nothing here should
// learn: the day a window changes, one config row changes and this file does not.
import { LEGAL } from "@/modules/config";

/** `LEGAL.erasureRetains` in the shape `0030` reads: one entry per class, months plus the anchor. */
export function purgeWindows(): Readonly<
  Record<string, { readonly months: number; readonly from: string }>
> {
  return Object.freeze(
    Object.fromEntries(
      LEGAL.erasureRetains.map((row) => [
        row.class,
        Object.freeze({ months: row.windowMonths, from: row.from }),
      ]),
    ),
  );
}
