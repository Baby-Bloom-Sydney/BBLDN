'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/lib/auth/types';

const DEV_ROLE_KEY = 'bb-dev-role';
const DEV_LIVE_KEY = 'bb-dev-live';

const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'nanny', label: 'Nanny', color: 'bg-violet-500' },
  { value: 'parent', label: 'Parent', color: 'bg-blue-500' },
  { value: 'admin', label: 'Admin', color: 'bg-red-500' },
];

export function getDevRole(): UserRole {
  if (typeof window === 'undefined') return 'nanny';
  return (localStorage.getItem(DEV_ROLE_KEY) as UserRole) || 'nanny';
}

/** When true, forms use real server actions + real uploads instead of mock data */
export function isLiveMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEV_LIVE_KEY) === 'true';
}

export function DevToolbar() {
  const [role, setRole] = useState<UserRole>('nanny');
  const [live, setLive] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    setRole(getDevRole());
    setLive(isLiveMode());
  }, []);

  // Auto-collapse on navigation
  useEffect(() => {
    setCollapsed(true);
  }, [pathname]);

  const switchRole = (newRole: UserRole) => {
    localStorage.setItem(DEV_ROLE_KEY, newRole);
    setRole(newRole);
    window.location.reload();
  };

  const toggleLive = () => {
    const next = !live;
    localStorage.setItem(DEV_LIVE_KEY, String(next));
    setLive(next);
    window.location.reload();
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className={`fixed bottom-4 right-4 z-[9999] text-white px-3 py-2 rounded-full text-xs font-mono shadow-lg transition-colors ${
          live ? 'bg-green-700 hover:bg-green-600' : 'bg-gray-900 hover:bg-gray-700'
        }`}
      >
        {live ? 'LIVE' : 'DEV'}: {role.toUpperCase()}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-gray-900 text-white rounded-lg shadow-2xl border border-gray-700 p-3 font-mono text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 font-semibold">DEV MODE</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-500 hover:text-white ml-4"
        >
          —
        </button>
      </div>

      {/* Role selector */}
      <div className="flex gap-1 mb-2">
        {ROLES.map((r) => (
          <button
            key={r.value}
            onClick={() => switchRole(r.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
              role === r.value
                ? `${r.color} text-white ring-2 ring-white/30`
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Live/Mock toggle */}
      <button
        onClick={toggleLive}
        className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-all ${
          live
            ? 'bg-green-600 text-white ring-2 ring-green-400/30'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        {live ? 'LIVE — Real DB + Uploads' : 'MOCK — Fake Data + Skip Actions'}
      </button>
      <div className="mt-2 text-[10px] text-gray-500">
        {live ? 'Forms write to Supabase. Auth required.' : 'Auth bypassed. Click to switch role.'}
      </div>
    </div>
  );
}
