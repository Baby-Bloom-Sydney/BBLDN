// The service-role client (01 §6.3 `elevated`): bypasses RLS on purpose, so it is `server-only` and reached only
// through `auth`'s own named uses (module README). Loaded by dynamic import so the service-role key's *name*
// never enters a client or edge bundle (07 §7 item 3).
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/modules/config/server";

export const elevatedClient = (): SupabaseClient =>
  createClient(
    env.public.NEXT_PUBLIC_SUPABASE_URL,
    env.server.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
