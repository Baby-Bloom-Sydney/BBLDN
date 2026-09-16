// admin — the eight panels (00-glossary §3; 01 §2.3; `calendar` per ADR-074, `guarantees` per ADR-088 / S-A-29).
// `admin` reads through other modules' **connectors only**, never a table directly (fix: A-11 / A-24), so this
// module owns no data of its own: it owns the panel set, the routes and the screens they render.
export type AdminPanelName =
  | "call-queue"
  | "calendar"
  | "positions-panel"
  | "pipeline"
  | "leads"
  | "users"
  | "support"
  | "guarantees";

/**
 * One panel: its name, the route it lives at and the screen IDs it renders (04 §6.4). Paths and screen IDs are
 * quoted from 04, never invented; `calendar` deliberately shares `/admin/calls` with `call-queue` because
 * ADR-074 merged the list and the calendar onto one screen (S-A-03).
 */
export type AdminPanel = {
  readonly name: AdminPanelName;
  readonly path: string;
  readonly screens: ReadonlyArray<string>;
};
