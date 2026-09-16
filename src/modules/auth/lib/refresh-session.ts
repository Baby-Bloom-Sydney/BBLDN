// 03 §1.4 `refreshSession` — middleware only (01 §4d step 1): the one place session cookies are rotated, and the
// one round-trip the edge gets (there is no `next/headers` there), so the password signal rides back on the
// `GateSession` rather than costing a second call.
import { fromThrown, ok } from "@/modules/platform";
import type { NextRequest, NextResponse } from "next/server";
import type { Result } from "@/modules/shared-types";
import type { AppDatabase, AuthDriver, GateSession } from "../types";
import { toSession } from "./to-session";

export const refreshSessionWith =
  (driver: AuthDriver<AppDatabase>) =>
  async (
    req: NextRequest,
    res: NextResponse,
  ): Promise<Result<GateSession | null>> => {
    try {
      const user = await driver.refresh(req, res);
      if (user === null) return ok(null);
      return ok(toSession(user, await driver.roleOf(user.id)));
    } catch (thrown) {
      return fromThrown(thrown, { module: "auth", action: "refreshSession" });
    }
  };
