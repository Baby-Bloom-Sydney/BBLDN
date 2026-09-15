"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StageProps } from "../../FunnelOrchestrator";
import Image from "next/image";
import { Sparkles, Bell, Eye } from "lucide-react";

export function N5Welcome({ state }: StageProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center animate-in fade-in duration-500">
      <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center">
        <Sparkles className="w-8 h-8 text-violet-600" />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-slate-800">
          Welcome to Baby Bloom, {state.first_name}!
        </h1>
        <p className="text-lg text-violet-600 font-medium">
          Your profile is live. Families can now find you.
        </p>
      </div>

      {/* Profile thumbnail */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 max-w-sm w-full">
        {state.about_you.profile_picture_url ? (
          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border-2 border-violet-200">
            <Image
              src={state.about_you.profile_picture_url}
              alt="Profile"
              width={56}
              height={56}
              className="object-cover w-full h-full"
            />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 border-2 border-violet-200">
            <span className="text-xl font-bold text-violet-600">
              {state.first_name?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
        )}
        <div className="text-left flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm">
            {state.first_name} {state.last_name}
          </p>
          <p className="text-xs text-slate-500 line-clamp-2">
            {(state.ai_content?.headline as string)
              ?.replace(/<[^>]*>/g, "")
              .trim() || "Professional nanny"}
          </p>
        </div>
      </div>

      {/* Next steps */}
      <div className="flex flex-col gap-3 max-w-sm w-full text-left">
        <p className="text-sm font-semibold text-slate-700">
          Here&apos;s what happens next:
        </p>
        <div className="flex items-start gap-3">
          <Eye className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            Parents are now able to find you to connect
          </p>
        </div>
        <div className="flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            We&apos;ll start matching you with families based on your
            preferences
          </p>
        </div>
        <div className="flex items-start gap-3">
          <Bell className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            You&apos;ll be notified when a family is interested in you
          </p>
        </div>
      </div>

      <Button
        onClick={() => router.push("/nanny")}
        className="max-w-sm w-full bg-violet-600 hover:bg-violet-700 text-white h-11 px-6 rounded-lg font-medium text-sm mt-2"
      >
        Go to your dashboard
      </Button>
    </div>
  );
}
