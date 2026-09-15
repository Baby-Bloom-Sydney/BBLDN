"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, Calendar, Briefcase, User, ShieldCheck, Bell } from "lucide-react";

export default function NannyDashboardPage() {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {profile?.first_name || "Nanny"}!
        </h1>
        <p className="mt-1 text-slate-500">
          Here&apos;s what&apos;s happening with your profile.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          icon={Eye}
          value="-"
          label="Profile Views"
          iconColor="text-violet-500"
          iconBgColor="bg-violet-100"
        />
        <StatsCard
          icon={Calendar}
          value="0"
          label="Interview Requests"
          iconColor="text-blue-500"
          iconBgColor="bg-blue-100"
        />
        <StatsCard
          icon={Briefcase}
          value="0"
          label="Jobs Completed"
          iconColor="text-green-500"
          iconBgColor="bg-green-100"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/nanny/profile">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <User className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Edit Profile</h3>
                  <p className="text-sm text-slate-500">Update your info</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/nanny/verification">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <ShieldCheck className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Verification</h3>
                  <p className="text-sm text-slate-500">Complete checks</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/nanny/interviews">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <Calendar className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Interviews</h3>
                  <p className="text-sm text-slate-500">View requests</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/nanny/settings">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                  <Bell className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <h3 className="font-medium">Notifications</h3>
                  <p className="text-sm text-slate-500">Manage alerts</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest updates and notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-slate-500">No recent activity to show</p>
            <p className="mt-1 text-xs text-slate-400">
              Complete your profile and verification to start receiving requests
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
