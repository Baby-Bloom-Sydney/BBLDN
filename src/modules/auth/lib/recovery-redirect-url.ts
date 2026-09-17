// Where an emailed recovery link lands (ADR-042; `03.06`): the auth callback, carrying S-X-09's reset screen as
// `next=`. One absolute URL, built from the one configured origin — the provider will only honour a redirect it
// can match, and a link that pointed anywhere else would be an open redirect with a session attached.
//
// The account's own state still wins over this path: the gate's step 3 sends a session with no password to
// set-password from anywhere (01 §4d), so a passwordless account needs no second link and no second email.
import { publicEnv } from "@/modules/config";
import { ROUTE_MAP } from "./route-map";

export function recoveryRedirectUrl(): string {
  const url = new URL(
    ROUTE_MAP.authCallbackPath,
    publicEnv.NEXT_PUBLIC_APP_URL,
  );
  url.searchParams.set(ROUTE_MAP.nextParam, ROUTE_MAP.resetPasswordPath);
  return url.toString();
}
