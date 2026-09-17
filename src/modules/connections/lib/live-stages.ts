// 03 §2.2 — "**Live** = any non-terminal stage". The complement of the terminal list `0007`'s partial unique
// index (`connection_requests_one_live_per_pair_idx`) uses, derived from the 02 §3 enum rather than restated,
// so a stage added to the enum and forgotten here is impossible.
//
// `SCHEDULE_EXPIRED` is terminal and still re-openable by K-9 — I-6's one exception, and the reason "terminal"
// and "cannot be left" are not the same word in this model.
import { ENUMS } from "@/modules/shared-types";
import type { ConnectionStage } from "@/modules/shared-types";

const TERMINAL: ReadonlyArray<ConnectionStage> = Object.freeze([
  "REQUEST_EXPIRED",
  "DECLINED",
  "REQUEST_CANCELLED",
  "SCHEDULE_EXPIRED",
  "NOT_HIRED",
  "NOT_SELECTED",
  "FINISHED",
  "CANCELLED_BY_PARENT",
  "CANCELLED_BY_NANNY",
]);

export const LIVE_STAGES: ReadonlyArray<ConnectionStage> = Object.freeze(
  ENUMS.connection_stage.filter((stage) => !TERMINAL.includes(stage)),
);
