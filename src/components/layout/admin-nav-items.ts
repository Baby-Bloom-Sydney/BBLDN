// `09.02` Admin navigation — **one** nav list (04 §6.4 S-A-01: "Rejig: add Call queue; drop commission pay,
// Analytics, dev pages; Positions on mobile; one nav list").
//
// It lived twice, once in `Sidebar` and once in `MobileNav`, and the two had already drifted: the sidebar had
// Positions and the verification crib, the drawer had Verifications and neither of the other two. One list,
// imported by both, is what stops that happening again — and it is why Positions now reaches mobile.
//
// Call queue is first after the dashboard because it is the admin's day (04 §5.2: rows 1–9 all start there).
import {
  CalendarClock,
  CreditCard,
  Filter,
  Home,
  LifeBuoy,
  Phone,
  Settings,
  ShieldCheck,
  Users,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export const ADMIN_NAV_ITEMS: ReadonlyArray<{
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
}> = Object.freeze([
  { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
  { href: "/admin/calls", icon: CalendarClock, label: "Call queue" },
  { href: "/admin/positions", icon: Briefcase, label: "Positions" },
  { href: "/admin/leads", icon: Phone, label: "Contacts" },
  { href: "/admin/users", icon: Users, label: "User Management" },
  { href: "/admin/verifications", icon: ShieldCheck, label: "Verifications" },
  { href: "/admin/subscriptions", icon: CreditCard, label: "Subscriptions" },
  { href: "/admin/support", icon: LifeBuoy, label: "Support" },
  { href: "/admin/pipeline", icon: Filter, label: "User Pipeline" },
  { href: "/admin/settings", icon: Settings, label: "Settings" },
]);
