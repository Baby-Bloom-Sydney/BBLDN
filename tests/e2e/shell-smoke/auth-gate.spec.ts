// E1 assertion 3 — **the auth gate holds on the assembled app**. 01 §4d: prefix → required role; no session →
// redirect to login with `next=`; the `(auth)` group renders for a signed-out caller; the `NEXT_PUBLIC_DEV_MODE`
// bypass is honoured only outside production (step 4); a session that cannot be read is refused, never waved
// through (step 2 — Sydney's middleware called `next()` when Supabase was unreachable; not carried).
//
// The smoke server points `NEXT_PUBLIC_SUPABASE_URL` at a closed loopback port, so every request here is the
// "cannot tell" case. That is the harder half of step 2 and the one Sydney got wrong: a refused gate under an
// unreachable auth provider, not merely under an absent cookie.
//
// The dev bypass is proved in two places, because it has two mechanisms:
//   · `scripts/ci/boot-guard.sh` case 4 — the registry marks the name dev-only, so a non-development deployment
//     that sets it does not boot at all;
//   · here — this server *is* a production build (`next start`), and the protected prefixes still redirect. A
//     live bypass would `NextResponse.next()` and these would render 200.
import { expect, test } from "@playwright/test";
import { STATUS } from "./envelope";

const PROTECTED_PATHS = [
  "/parent",
  "/parent/dashboard",
  "/nanny",
  "/nanny/profile",
  "/admin",
  "/admin/calls",
  "/admin/guarantees",
] as const;

const AUTH_GROUP_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/set-password",
] as const;

for (const path of PROTECTED_PATHS) {
  test(`an unauthenticated request to ${path} is refused, not served`, async ({
    request,
  }) => {
    const response = await request.get(path, { maxRedirects: 0 });

    expect(response.status()).toBe(STATUS.redirect);
    const location = response.headers()["location"];
    expect(location).toBeDefined();
    const target = new URL(location, "http://127.0.0.1");
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("next")).toBe(path);
  });
}

for (const path of AUTH_GROUP_PATHS) {
  test(`the (auth) page ${path} renders for a signed-out caller`, async ({
    page,
  }) => {
    const response = await page.goto(path);

    expect(response?.status()).toBe(STATUS.ok);
    expect(new URL(page.url()).pathname).toBe(path);
    // Its own heading, not a form control: `/reset-password` reached without a token legitimately renders the
    // "invalid or expired link" state (AC-Y-28), which has no input and is still the page rendering.
    // Any heading level, not `h1`: the legacy `/signup` page's top heading is an `h2` — an a11y defect the
    // Phase 1 journeys own (05 §8.2), recorded in docs/build-progress.md rather than fixed from a smoke suite.
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
}

test("a protected route is never served under a redirect — the body is not the page", async ({
  request,
}) => {
  const response = await request.get("/admin", { maxRedirects: 0 });

  expect(response.status()).toBe(STATUS.redirect);
  expect(await response.text()).not.toContain("admin-calls-heading");
});
