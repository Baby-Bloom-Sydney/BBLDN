import { redirect } from "next/navigation";
import { isProfileComplete, getNannyProfile } from "@/lib/actions/nanny";
import { NannyRegistrationFunnel } from "./NannyRegistrationFunnel";
import { createClient } from "@/lib/supabase/server";

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

export default async function NannyRegisterPage() {
  if (!isDevMode) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    // Check if profile is already complete
    const complete = await isProfileComplete();
    if (complete) {
      redirect("/nanny/profile");
    }

    // Get any existing partial data
    const { data: profile } = await getNannyProfile();

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Complete Your Profile</h1>
          <p className="mt-1 text-slate-500">
            Tell us about yourself to start connecting with families
          </p>
        </div>

        <NannyRegistrationFunnel
          userId={user.id}
          initialData={{
            first_name: profile?.first_name || "",
            last_name: profile?.last_name || "",
          }}
        />
      </div>
    );
  }

  // DEV MODE: skip all auth, render with mock data
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Complete Your Profile</h1>
        <p className="mt-1 text-slate-500">
          Tell us about yourself to start connecting with families
        </p>
      </div>

      <NannyRegistrationFunnel
        userId="dev-nanny-user"
        initialData={{
          first_name: "Emma",
          last_name: "Wilson",
        }}
      />
    </div>
  );
}
