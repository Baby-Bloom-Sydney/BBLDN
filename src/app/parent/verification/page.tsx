import { getParentVerificationData } from "@/lib/actions/parent-verification";
import { ParentVerificationPageClient } from "./ParentVerificationPageClient";

export default async function ParentVerificationPage() {
  const { data: verification } = await getParentVerificationData();

  return <ParentVerificationPageClient initialData={verification} />;
}
