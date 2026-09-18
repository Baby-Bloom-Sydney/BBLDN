// `/admin/users` — S-A-14 (the users tab, legacy Sydney read kept as it stands) and **S-A-16** the verification
// queue at `?tab=verification` (04 §6.4; `/admin/verifications` redirects here). Thin by rule (01 §2.5): the
// queue half gates on the admin role through `auth` (07 §5.4 row 1; the connector gates again), reads through
// `admin-verification`, and renders; the three actions are passed as props. The Sydney `VerificationTab` and
// `IDCheckModal` (WWCC / OCG columns the London schema never had) are deleted with this unit (L-008 `2c`).
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@/modules/auth";
import {
  VerificationQueue,
  decideSubmissionAction,
  loadVerificationQueue,
  openEvidenceAction,
  parseQueueQuery,
  liftSuspensionAction,
  recordUpdateServiceAction,
} from "@/modules/admin-verification";
import { AdminUsersClient } from "./AdminUsersClient";

export const dynamic = "force-dynamic";

const BASE_PATH = "/admin/users?tab=verification";

// ── Interfaces (the legacy users tab) ──

export interface UserData {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  suburb: string | null;
  postcode: string | null;
  profile_picture_url: string | null;
  mobile_number: string | null;
  date_of_birth: string | null;
  created_at: string;
  role: string;
  nanny_status: string | null;
  verification_level: number | null;
  verification_status: number | null;
  wwcc_verified: boolean | null;
  identity_verified: boolean | null;
  parent_status: string | null;
  babysitter_eligible: boolean | null;
  nanny_id: string | null;
}

export interface UserStats {
  total: number;
  nannies: number;
  parents: number;
  admins: number;
}

// ── Data Fetching (legacy; the users tab) ──

async function getUsers(): Promise<UserData[]> {
  const supabase = createAdminClient();

  const [profilesResult, rolesResult, nanniesResult, parentsResult] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select(
          "user_id, first_name, last_name, email, suburb, postcode, profile_picture_url, mobile_number, date_of_birth, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("user_roles").select("user_id, role"),
      supabase
        .from("nannies")
        .select("id, user_id, status, verification_level"),
      supabase.from("parents").select("user_id, status"),
    ]);

  if (profilesResult.error) {
    console.error("[getUsers] profiles error:", profilesResult.error);
    return [];
  }
  if (nanniesResult.error)
    console.error("[getUsers] nannies error:", nanniesResult.error);

  const roleMap = new Map<string, string>();
  if (rolesResult.data) {
    for (const r of rolesResult.data) roleMap.set(r.user_id, r.role);
  }

  const nannyMap = new Map<
    string,
    { id: string; status: string; verification_level: number }
  >();
  if (nanniesResult.data) {
    for (const n of nanniesResult.data) nannyMap.set(n.user_id, n);
  }

  const parentMap = new Map<string, { status: string }>();
  if (parentsResult.data) {
    for (const p of parentsResult.data) parentMap.set(p.user_id, p);
  }

  return profilesResult.data.map((user) => {
    const nanny = nannyMap.get(user.user_id) ?? null;
    const parent = parentMap.get(user.user_id) ?? null;

    return {
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      suburb: user.suburb,
      postcode: user.postcode,
      profile_picture_url: user.profile_picture_url,
      mobile_number: user.mobile_number,
      date_of_birth: user.date_of_birth,
      created_at: user.created_at,
      role: roleMap.get(user.user_id) ?? "unknown",
      nanny_status: nanny?.status ?? null,
      verification_level: nanny?.verification_level ?? null,
      verification_status: null,
      wwcc_verified: null,
      identity_verified: null,
      parent_status: parent?.status ?? null,
      babysitter_eligible: null,
      nanny_id: nanny?.id ?? null,
    };
  });
}

async function getUserStats(): Promise<UserStats> {
  const supabase = createAdminClient();

  const [totalResult, nanniesResult, parentsResult, adminsResult] =
    await Promise.all([
      supabase.from("user_roles").select("*", { count: "exact", head: true }),
      supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "nanny"),
      supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "parent"),
      supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .in("role", ["admin", "super_admin"]),
    ]);

  return {
    total: totalResult.count ?? 0,
    nannies: nanniesResult.count ?? 0,
    parents: parentsResult.count ?? 0,
    admins: adminsResult.count ?? 0,
  };
}

// ── Page Component ──

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = searchParams ?? {};
  const tab = typeof params.tab === "string" ? params.tab : undefined;

  if (tab === "verification") {
    const session = await auth.requireRole("admin");
    if (!session.ok) notFound();
    const view = await loadVerificationQueue(parseQueueQuery(params));
    return (
      <main aria-labelledby="verification-queue-heading">
        <VerificationQueue
          view={view}
          basePath={BASE_PATH}
          actions={{
            decide: decideSubmissionAction,
            openEvidence: openEvidenceAction,
            recordUpdateService: recordUpdateServiceAction,
            liftSuspension: liftSuspensionAction,
          }}
        />
      </main>
    );
  }

  const [users, userStats] = await Promise.all([getUsers(), getUserStats()]);

  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      }
    >
      <AdminUsersClient
        users={users}
        userStats={userStats}
        verificationHref={BASE_PATH}
      />
    </Suspense>
  );
}
