"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserGuidance } from "@/lib/verification";

interface GuidanceCardProps {
  guidance: UserGuidance;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

export function GuidanceCard({ guidance, primaryAction, secondaryAction }: GuidanceCardProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">{guidance.title}</p>
          <p className="text-sm text-amber-700 mt-1">{guidance.explanation}</p>
        </div>
      </div>

      {guidance.steps_to_fix.length > 0 && (
        <div className="ml-7">
          <p className="text-xs font-medium text-amber-800 mb-1">To fix this:</p>
          <ol className="list-decimal list-inside text-sm text-amber-700 space-y-0.5">
            {guidance.steps_to_fix.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {(primaryAction || secondaryAction) && (
        <div className="flex gap-2 ml-7 pt-1">
          {primaryAction && (
            <Button
              type="button"
              onClick={primaryAction.onClick}
              className="bg-violet-600 hover:bg-violet-700 text-white text-sm"
              size="sm"
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              type="button"
              variant="outline"
              onClick={secondaryAction.onClick}
              size="sm"
              className="text-sm"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
