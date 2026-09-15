"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function MatchmakerClient() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/parent/matches/checkout");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Redirecting...
      </div>
    </div>
  );
}
