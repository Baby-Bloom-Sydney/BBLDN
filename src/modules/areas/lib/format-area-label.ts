// 03 §6.2 `formatAreaLabel` — the one rendered form of a location ("Clapham, SW4"). 03 §6.3 rule 6: no consumer
// concatenates a name and a district itself; the banned-literal test watches for the ones that try.
import type { Area, AreaLabel } from "../types";

/** Takes a full `Area` or just its two rendered fields — an `AreaRef` from `scoring` renders through it too. */
export const formatAreaLabel = (
  area: Pick<Area, "name" | "district"> & Partial<Area>,
): AreaLabel => `${area.name}, ${area.district}`;
