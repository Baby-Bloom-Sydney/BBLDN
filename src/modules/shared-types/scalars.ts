// Branded scalars the contracts spell (03 §1.4, §2.5, §3.2, §8.1). One canonical instant type; the aliases
// keep the exact names each contract uses so a connector can be copied from 03 without renaming.
import type { Brand } from "./brand";

export type Scalars = {
  /** RFC 4122 uuid, lower-case. */
  Uuid: Brand<string, "Uuid">;
  /** Lower-cased email (citext in the DB — 02 C-8). */
  Email: Brand<string, "Email">;
  /** E.164, UK numbers only — the prefix is `LOCALE.phonePrefix` (ADR-102; 02 C-7). */
  E164: Brand<string, "E164">;
  /** Absolute https URL. */
  Url: Brand<string, "Url">;
  /** ISO-8601 instant with offset (01 §4c rule 3). */
  Instant: Brand<string, "Instant">;
  /** `YYYY-MM-DD` (a London date where a contract says so). */
  ISODate: Brand<string, "ISODate">;
};

export type Uuid = Scalars["Uuid"];
export type Email = Scalars["Email"];
export type E164 = Scalars["E164"];
export type Url = Scalars["Url"];
export type Instant = Scalars["Instant"];
export type ISODate = Scalars["ISODate"];
/** 03 §3.2 spells the instant `ISO`; 03 §8.1 spells it `IsoInstant`. Same type. */
export type ISO = Instant;
export type IsoInstant = Instant;
