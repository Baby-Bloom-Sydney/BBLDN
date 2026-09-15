import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50/50 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
        <Icon className="h-7 w-7 text-violet-500" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-6">
          {actionHref ? (
            <Button asChild className="bg-violet-500 hover:bg-violet-600">
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button
              onClick={onAction}
              className="bg-violet-500 hover:bg-violet-600"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
