import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // DEV MODE: bypass all auth checks
  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    return NextResponse.next();
  }

  // Skip Supabase session management if env vars aren't configured
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http") ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
