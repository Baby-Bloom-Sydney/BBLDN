import { createAdminClient } from "@/lib/supabase/admin";
import { BrandKitClient } from "./BrandKitClient";

const NANNY_EMAIL = "baileywright.eu@gmail.com";

export default async function BrandKitPage() {
  let profilePicUrl: string | null = null;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("user_profiles")
      .select("profile_picture_url")
      .eq("email", NANNY_EMAIL)
      .single();
    if (data) profilePicUrl = data.profile_picture_url;
  } catch {
    // Fall back to null
  }

  return <BrandKitClient profilePicUrl={profilePicUrl} />;
}
