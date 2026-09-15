import { redirect } from "next/navigation";

export default function AdminVerificationsPage() {
  redirect("/admin/users?tab=verification");
}
