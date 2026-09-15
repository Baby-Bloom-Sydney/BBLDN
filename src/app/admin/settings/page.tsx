"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { Settings, Shield, Bell, Database } from "lucide-react";

export default function AdminSettingsPage() {
  const { profile, role } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">
          Platform configuration and admin settings
        </p>
      </div>

      {/* Admin Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-500" />
            Admin Account
          </CardTitle>
          <CardDescription>
            Your admin account details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                defaultValue={profile?.first_name || ""}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                defaultValue={profile?.last_name || ""}
                disabled
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              defaultValue={profile?.email || ""}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Input
              value={role === 'super_admin' ? 'Super Admin' : 'Admin'}
              disabled
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-violet-500" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Configure admin notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-slate-500">Notification settings coming soon</p>
            <p className="mt-1 text-xs text-slate-400">
              Configure alerts for new users, verifications, and system events
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Platform Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-violet-500" />
            Platform Settings
          </CardTitle>
          <CardDescription>
            Global platform configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Maintenance Mode</p>
                <p className="text-sm text-slate-500">
                  Temporarily disable the platform for maintenance
                </p>
              </div>
              <Button variant="outline" disabled>
                Enable
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">New Registrations</p>
                <p className="text-sm text-slate-500">
                  Allow new users to sign up
                </p>
              </div>
              <Button variant="outline" disabled>
                Enabled
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-slate-500">
                  Global email notification toggle
                </p>
              </div>
              <Button variant="outline" disabled>
                Enabled
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Database Info */}
      {role === 'super_admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-violet-500" />
              Database Information
            </CardTitle>
            <CardDescription>
              Supabase connection details (Super Admin only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Project</span>
                <span className="font-mono text-sm">umkqevipzmoovyrnynrf</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Region</span>
                <span className="font-mono text-sm">ap-northeast-1 (Tokyo)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">PostgreSQL Version</span>
                <span className="font-mono text-sm">17.6</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Tables</span>
                <span className="font-mono text-sm">23</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coming Soon */}
      <Card className="border-violet-200 bg-violet-50">
        <CardHeader>
          <CardTitle className="text-violet-900">More Settings Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-violet-800 sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Rate limit configuration
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Email template customization
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Matching algorithm weights
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Backup and restore
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
