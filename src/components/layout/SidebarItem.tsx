"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  collapsed?: boolean;
}

export function SidebarItem({ href, icon: Icon, label, collapsed }: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  if (collapsed) {
    return (
      <Link
        href={href}
        prefetch={true}
        title={label}
        className={cn(
          "flex items-center justify-center rounded-lg p-2 transition-colors",
          isActive
            ? "bg-violet-500 text-white"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        )}
      >
        <Icon className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      prefetch={true}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-violet-500 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
