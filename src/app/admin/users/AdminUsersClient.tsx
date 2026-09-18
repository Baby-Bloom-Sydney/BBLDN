"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UsersTab } from "./UsersTab";
import { Users, ShieldCheck } from "lucide-react";
import type { UserData, UserStats } from "./page";

interface AdminUsersClientProps {
  users: UserData[];
  userStats: UserStats;
  /** S-A-16 lives on this page at `?tab=verification` (04 §6.4); the tab is a link so the queue renders server-side */
  verificationHref: string;
}

export function AdminUsersClient({
  users,
  userStats,
  verificationHref,
}: AdminUsersClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="mt-1 text-slate-500">
          Manage users and review verifications
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              <span>Users</span>
            </TabsTrigger>
            <a
              href={verificationHref}
              className="inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Nanny Verification</span>
            </a>
          </TabsList>
        </div>

        <TabsContent value="users">
          <UsersTab users={users} stats={userStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
