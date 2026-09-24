"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ClipboardList,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { PositionDetailView } from "@/app/parent/request/renderers/PositionDetailView";
import { closePosition } from "@/lib/actions/parent";
import type { PositionWithChildren } from "@/lib/actions/parent";
import type { TypeformFormData } from "@/app/parent/request/questions";

/** 04 §6.2 — S-P-05's "S-P-04 (edit)" exit, the one road to a change that reaches the row. */
const EDIT_HREF = "/parent/request";

interface MyChildcareTabProps {
  position: PositionWithChildren | null;
  /**
   * **`positions`' judgement, never this component's** — `parentMayAmend(stage)`, read in the route that
   * serves the hub. A parent changes what she asked for at `DRAFT` and `OPEN`; past that the matchmaker
   * does (`parent-amendable-stages.ts`). Absent ⇒ nobody asked ⇒ no edit road, because showing one that
   * `amend` would refuse is how a family comes to believe a change landed when it did not.
   */
  canEdit?: boolean;
  /**
   * True when the parent has an active placement. Set by the page-
   * level fetch via `getParentPlacement`. When true, the
   * "recreate position" prompt is suppressed in favour of a
   * placement-aware summary — the parent went through the invite
   * link path, not the matchmaking form, so prompting them to
   * recreate the position is wrong.
   */
  hasActivePlacement?: boolean;
}

export function MyChildcareTab({
  position,
  canEdit = false,
  hasActivePlacement = false,
}: MyChildcareTabProps) {
  const router = useRouter();
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);

  const details = position
    ? (position.details as Record<string, unknown> | null)
    : null;
  const formData = (details?.form_data ?? {}) as Partial<TypeformFormData>;
  const hasPosition = !!position;
  const hasFormData = !!details?.form_data;

  const handleClosePosition = async () => {
    if (!position) return;
    setClosing(true);
    const result = await closePosition(position.id);
    setClosing(false);
    if (result.success) {
      setShowCloseConfirm(false);
      router.refresh();
    }
  };

  return (
    <div className="px-5 pb-5 pt-3">
      {!hasPosition ? (
        <div className="text-center py-8 space-y-2">
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link href="/parent/request">Create childcare position</Link>
          </Button>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Create your position to kickstart our childcare journey
          </p>
        </div>
      ) : !hasFormData && !hasActivePlacement ? (
        <div className="text-center py-8 space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
            <ClipboardList className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              Position needs updating
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Please recreate your childcare position using the new form to
              enable editing.
            </p>
          </div>
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link href="/parent/request">Recreate Position</Link>
          </Button>
        </div>
      ) : (
        // Renders for both: (a) parents with full form_data, and (b)
        // invite-link parents whose auto-position has no form_data yet.
        //
        // **Read-only, and no `onSave`.** The inline editor that used to live here saved through
        // `saveTypeformPosition` — a session-scope write to `nanny_positions` that the London schema and
        // grants both refuse, so the change never reached the family's row. The road that reaches it is
        // S-P-04's edit state below, gated by `canEdit` so the link and the write agree about whether she may.
        <>
          <PositionDetailView
            initialData={formData}
            hideClosePosition
            menuSlot={
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPositionMenu((p) => !p)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {showPositionMenu && (
                    <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-10">
                      <button
                        onClick={() => {
                          setShowPositionMenu(false);
                          setShowCloseConfirm(true);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Close this position
                      </button>
                    </div>
                  )}
                </div>
              </div>
            }
          />
          {canEdit && (
            <div className="mt-3 flex justify-center">
              <Link
                href={EDIT_HREF}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Change what you asked for
              </Link>
            </div>
          )}
        </>
      )}

      {/* Close Position Confirmation */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Close Position?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600">
                Are you sure you want to close this childcare position? This
                will:
              </p>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                <li>Remove your position from matching</li>
                <li>Cancel any pending interview requests</li>
                <li>Allow you to create a new position</li>
              </ul>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCloseConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleClosePosition}
                  disabled={closing}
                >
                  {closing ? "Closing..." : "Close Position"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
