// The `(public)` group (01 §4d): header + footer from `public-site`; thin by rule (05 §7 rule 5).
import { PublicFooter, PublicHeader } from "@/modules/public-site";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
