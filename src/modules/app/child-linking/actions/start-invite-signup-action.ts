"use server";
// S-X-13 → S-X-06 / S-X-07 (ADR-150): the "Join {child}'s app" button for a signed-out visitor is a form, not a
// link, because the token must travel in an `HttpOnly` cookie and only a server action can set one. The token
// is normalised (02 §4.6's `XXXX-XXXX` is the only shape that is ever carried), the cookie is minted with the
// lifetime `config/security.ts` names, and the visitor is sent to the account form for the side the invite
// names — `/signup/nanny` (S-X-07) for a `parent_to_nanny` invite, `/signup` (S-X-06) for `nanny_to_parent`.
// Nothing about the token appears in either URL. A string that is not a token carries nothing: the visitor
// lands on the plain account form and the claim is one preview away.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SECURITY } from "@/modules/config";
import { normaliseInviteToken } from "../lib/normalise-invite-token";

const NANNY_SIGNUP = "/signup/nanny";
const PARENT_SIGNUP = "/signup";

export async function startInviteSignupAction(form: FormData): Promise<void> {
  const token = normaliseInviteToken(String(form.get("token") ?? ""));
  const role = form.get("role") === "nanny" ? "nanny" : "parent";
  if (token !== null) {
    const spec = SECURITY.carriedTokens.invite;
    cookies().set({
      name: spec.name,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      // `Secure` follows the request's scheme (`x-forwarded-proto`, Vercel's), never an environment read (07 §7).
      secure: headers().get("x-forwarded-proto") === "https",
      path: "/",
      maxAge: spec.maxAgeSeconds,
    });
  }
  redirect(role === "nanny" ? NANNY_SIGNUP : PARENT_SIGNUP);
}
