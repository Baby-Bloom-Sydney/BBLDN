// `LogFields.userId` is typed `Uuid` (01 §4b: "uuid only — never an email or a name"), while every id this module
// holds is a `UserId`. Both are `Brand<string, …>` over the same uuid, but the brands are deliberately unrelated
// ("ids never cross" — `shared-types/ids.ts`), so one has to be re-branded to log it. That happens **here, once**,
// rather than as an `as unknown as Uuid` scattered through the module.
//
// **Note for `platform`'s owner:** the real fix is upstream — widen `LogFields.userId` to the id brands callers
// actually hold (or define `UserId` as a branded `Uuid`). Not done from this unit: `platform` is a shared module
// outside S4's touch surface.
import type { UserId, Uuid } from "@/modules/shared-types";

export const asLogUuid = (id: UserId | string): Uuid => id as Uuid;
