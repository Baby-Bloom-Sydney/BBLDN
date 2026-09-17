// `03.06` — the auth callback (ADR-042): the confirmation / recovery link lands here with `?code=`; the connector
// exchanges it and says where to go. Thin by rule (05 §7 rule 5): one connector import, one redirect.
import { NextResponse, type NextRequest } from "next/server";
import { authCallbackDestination } from "@/modules/onboarding-parent";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const destination = await authCallbackDestination(
    searchParams.get("code"),
    searchParams.get("next"),
  );
  return NextResponse.redirect(new URL(destination, origin));
}
