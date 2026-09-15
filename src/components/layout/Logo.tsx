import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-0.5 text-xl font-bold">
      <span className="text-slate-900">Baby</span>
      <span className="text-violet-500">Bloom</span>
    </Link>
  );
}
