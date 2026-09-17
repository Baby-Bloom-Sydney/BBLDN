// S-X-06's second path (04 §2.1: `/signup` · `/signup/parent`) — one screen, one file: this path hands its query
// to `/signup` unchanged so the invite token and the entry path survive.
import { redirect } from "next/navigation";

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function ParentSignupPage({ searchParams }: Props) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams))
    if (typeof value === "string") query.set(key, value);
  const suffix = query.toString();
  redirect(suffix === "" ? "/signup" : `/signup?${suffix}`);
}
