// RED first: the second pre-existing bug this unit inherits. `/api/admin/pipeline-snapshots` shipped with **no
// auth check at all** and a service-role client — `middleware.ts` only refreshes the session, so any caller could
// read the whole pipeline (`docs/build-progress.md`, Known bugs; security-reviewer at S1 review).
//
// 07 §5.4 row 1: the admin role is re-checked "in every admin action and every admin connector method, not only
// middleware", and `requireRole('admin')` also requires `aal2` (row 2).
import { beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import type { Email } from "@/modules/shared-types";
import { GET } from "../pipeline-snapshots/route";

const URL_ =
  "https://example.test/api/admin/pipeline-snapshots?sections=parent";
const request = () => new Request(URL_);

const signedInAs = (role: "parent" | "admin", mfaVerified: boolean) =>
  configureAuth(
    stubAuth({
      users: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "a@example.test" as Email,
          password: "pw",
          role,
          mfaVerified,
        },
      ],
      signedInUserId: "11111111-1111-4111-8111-111111111111",
    }),
  );

describe("the route is gated, not open", () => {
  beforeEach(() => {
    configureAuth(stubAuth());
  });

  it("refuses an anonymous caller", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
  });
});

describe("role and MFA are both required (07 §5.4 rows 1–2)", () => {
  it("refuses a signed-in parent", async () => {
    signedInAs("parent", true);

    const response = await GET(request());

    expect([401, 403]).toContain(response.status);
  });

  it("refuses an admin whose session is only aal1", async () => {
    signedInAs("admin", false);

    const response = await GET(request());

    expect([401, 403]).toContain(response.status);
  });

  it("lets an aal2 admin past the gate", async () => {
    signedInAs("admin", true);

    const response = await GET(request());

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});

describe("the response carries a request id (01 §4c)", () => {
  it("sets x-request-id on a refusal too", async () => {
    configureAuth(stubAuth());

    const response = await GET(request());

    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
