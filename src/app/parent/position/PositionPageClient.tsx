"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PositionDetailView } from "../request/renderers/PositionDetailView";
import { PlacementCard } from "@/components/parent/PlacementCard";
import type { PlacementData } from "@/lib/types/placement";
import { PositionWithChildren, closePosition } from "@/lib/actions/parent";
import {
  AlertTriangle,
  ClipboardList,
  MapPin,
  Calendar,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Users,
  XCircle,
  Search,
  ShieldCheck,
  Phone,
  MoreVertical,
  ArrowRight,
  Check,
  DollarSign,
  Mail,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  CONNECTION_STAGE,
  CONNECTION_STAGE_LABELS,
} from "@/lib/position/constants";
import type { ConnectionStage } from "@/lib/position/constants";
import {
  parentInitiateFill,
  confirmPlacement,
  reportParentOutcome,
  rejectHiredClaim,
  revertToAwaiting,
  closePositionWithReason,
  scheduleIntroTime,
  updateConnectionStartWeek,
  removeNannyPlacement,
  updateParentPlacementRate,
  updateParentPlacementHours,
  confirmTrialArrangement,
  declineTrialArrangement,
} from "@/lib/actions/position-funnel";
import type { UpcomingIntro } from "@/lib/actions/position-funnel";
import { ConnectionDetailPopup } from "@/components/position/ConnectionDetailPopup";
import { cancelConnectionRequest } from "@/lib/actions/connection";
import {
  getDfyConnections,
  declineDfyConnection,
} from "@/lib/actions/matching";
import type { DfyConnection } from "@/lib/actions/matching";
import { getScoreBadgeStyle, calcAge } from "@/components/match/match-helpers";
import { ScheduleTimeGrid } from "@/components/position/ScheduleTimeGrid";
import type { TypeformFormData } from "../request/questions";

interface ConfirmedNanny {
  connectionId: string;
  nannyId: string;
  nannyName: string;
  nannySuburb: string;
  nannyPhoto: string | null;
  connectionStage: number;
  confirmedTime: string | null;
}

interface PositionPageClientProps {
  position: PositionWithChildren | null;
  placement?: PlacementData | null;
  confirmedNannies?: ConfirmedNanny[];
  showFillButton?: boolean;
  upcomingIntros?: UpcomingIntro[];
  dfyTier?: "standard" | "priority" | null;
  dfyExpiresAt?: string | null;
  dfyActivated?: boolean;
}

function formatStartWeekLabel(d: Date): string {
  return `Week of ${d.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}`;
}

function getStartWeekOptionsFill(): {
  label: string;
  value: string;
  display: string;
}[] {
  const now = new Date();
  const day = now.getDay();
  const getMonday = (weeksAhead: number) => {
    const d = new Date(now);
    const diff = (day === 0 ? -6 : 1 - day) + weeksAhead * 7;
    d.setDate(now.getDate() + diff);
    return d;
  };
  const thisMon = getMonday(0);
  const nextMon = getMonday(1);
  const in2Mon = getMonday(2);
  return [
    {
      label: "This week",
      value: thisMon.toISOString().split("T")[0],
      display: formatStartWeekLabel(thisMon),
    },
    {
      label: "Next week",
      value: nextMon.toISOString().split("T")[0],
      display: formatStartWeekLabel(nextMon),
    },
    {
      label: "In 2 weeks",
      value: in2Mon.toISOString().split("T")[0],
      display: formatStartWeekLabel(in2Mon),
    },
    { label: "Different date", value: "custom", display: "" },
    { label: "To be confirmed", value: "tbc", display: "" },
  ];
}

function getParentStageBadge(
  stage: number,
  fillInitiatedBy?: string | null,
  trialDate?: string | null,
): { label: string; color: string } {
  switch (stage) {
    case CONNECTION_STAGE.REQUEST_SENT:
      return { label: "Request Sent", color: "bg-slate-100 text-slate-600" };
    case CONNECTION_STAGE.ACCEPTED:
      return { label: "Pick a Time", color: "bg-amber-100 text-amber-700" };
    case CONNECTION_STAGE.INTRO_SCHEDULED:
      return {
        label: "Meet Scheduled",
        color: "bg-violet-100 text-violet-700",
      };
    case CONNECTION_STAGE.INTRO_COMPLETE:
      return { label: "Meet Done", color: "bg-green-100 text-green-700" };
    case CONNECTION_STAGE.AWAITING_RESPONSE:
      return { label: "In Progress", color: "bg-amber-100 text-amber-700" };
    case CONNECTION_STAGE.TRIAL_ARRANGED: {
      if (fillInitiatedBy === "nanny")
        return { label: "Confirm Trial", color: "bg-amber-100 text-amber-700" };
      // Confirmed trial — check if date has elapsed
      const today = new Date().toISOString().split("T")[0];
      if (trialDate && trialDate < today)
        return { label: "Trial Done", color: "bg-cyan-100 text-cyan-700" };
      return { label: "Trial Arranged", color: "bg-cyan-100 text-cyan-700" };
    }
    case CONNECTION_STAGE.TRIAL_COMPLETE:
      return { label: "Trial Done", color: "bg-cyan-100 text-cyan-700" };
    case CONNECTION_STAGE.OFFERED:
      return fillInitiatedBy === "nanny"
        ? { label: "Confirm Placement", color: "bg-green-100 text-green-700" }
        : {
            label: "Awaiting Confirmation",
            color: "bg-amber-100 text-amber-700",
          };
    case CONNECTION_STAGE.CONFIRMED:
      return { label: "Confirmed", color: "bg-green-100 text-green-700" };
    case CONNECTION_STAGE.ACTIVE:
      return { label: "Active", color: "bg-emerald-100 text-emerald-700" };
    default:
      return {
        label:
          CONNECTION_STAGE_LABELS[stage as ConnectionStage] || "In Progress",
        color: "bg-slate-100 text-slate-600",
      };
  }
}

export function PositionPageClient({
  position,
  placement,
  confirmedNannies = [],
  showFillButton = false,
  upcomingIntros = [],
  dfyTier = null,
  dfyExpiresAt = null,
  dfyActivated = false,
}: PositionPageClientProps) {
  const router = useRouter();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showFillModal, setShowFillModal] = useState(false);
  const [fillingNannyId, setFillingNannyId] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [fillSuccess, setFillSuccess] = useState(false);
  const [selectedIntro, setSelectedIntro] = useState<UpcomingIntro | null>(
    null,
  );
  const [closeReason, setCloseReason] = useState<
    "found_elsewhere" | "no_longer_needed" | null
  >(null);
  const [closingReason, setClosingReason] = useState(false);
  const [fillStartWeek, setFillStartWeek] = useState<string | null>(null);
  const [fillCustomDate, setFillCustomDate] = useState("");
  const [fillSelectedNanny, setFillSelectedNanny] = useState<string | null>(
    null,
  );
  const [showNannyPopup, setShowNannyPopup] = useState(false);
  const [removeStep, setRemoveStep] = useState<"none" | "confirm" | "reason">(
    "none",
  );
  const [removeReason, setRemoveReason] = useState<string | null>(null);
  const [removeNotes, setRemoveNotes] = useState("");
  const [removing, setRemoving] = useState(false);
  const [positionExpanded, setPositionExpanded] = useState(!placement);
  const [editingRate, setEditingRate] = useState(false);
  const [editRateValue, setEditRateValue] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [editHoursValue, setEditHoursValue] = useState("");
  const [savingHours, setSavingHours] = useState(false);
  const [positionEditing, setPositionEditing] = useState(false);
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const [dfyConnections, setDfyConnections] = useState<DfyConnection[]>([]);
  const [dfyLoading, setDfyLoading] = useState(false);
  const [dfyLoaded, setDfyLoaded] = useState(false);
  const [schedulingDfyId, setSchedulingDfyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [schedulingDfy, setSchedulingDfy] = useState(false);
  const [selectedDfyIntro, setSelectedDfyIntro] =
    useState<UpcomingIntro | null>(null);

  // Check if position has DFY activated
  const hasDfy =
    position &&
    (position as PositionWithChildren & { dfy_activated_at?: string | null })
      .dfy_activated_at;

  // DFY intros from upcomingIntros (for ConnectionDetailPopup)
  const dfyIntros = upcomingIntros.filter((i) => i.source === "dfy");

  // Load DFY connections on mount when DFY is activated
  const loadDfyConnections = async () => {
    if (!position || dfyLoading) return;
    setDfyLoading(true);
    const result = await getDfyConnections(position.id);
    if (result.data) {
      setDfyConnections(result.data);
    }
    setDfyLoading(false);
    setDfyLoaded(true);
  };

  // Auto-load on first render if DFY is active
  if (hasDfy && !dfyLoaded && !dfyLoading) {
    loadDfyConnections();
  }

  const handleApproveDfy = async (connectionId: string, isoTime: string) => {
    setSchedulingDfy(true);
    const result = await scheduleIntroTime(connectionId, isoTime);
    setSchedulingDfy(false);
    if (result.success) {
      setSchedulingDfyId(null);
      // Update local state to reflect scheduled stage
      setDfyConnections((prev) =>
        prev.map((c) =>
          c.connectionId === connectionId
            ? {
                ...c,
                connectionStage: CONNECTION_STAGE.INTRO_SCHEDULED,
                confirmedTime: isoTime,
              }
            : c,
        ),
      );
      router.refresh();
    }
  };

  const handleDeclineDfy = async (connectionId: string) => {
    setDecliningId(connectionId);
    const result = await declineDfyConnection(connectionId);
    setDecliningId(null);
    if (result.success) {
      setDfyConnections((prev) =>
        prev.filter((c) => c.connectionId !== connectionId),
      );
    }
  };

  const handleFillPosition = async (nannyId: string, startWeek?: string) => {
    if (!position) return;
    setFillingNannyId(nannyId);
    setFillError(null);
    const result = await parentInitiateFill(
      nannyId,
      position.id,
      startWeek || undefined,
    );
    setFillingNannyId(null);
    if (!result.success) {
      setFillError(result.error || "Something went wrong.");
    } else {
      setFillSuccess(true);
      setTimeout(() => {
        setShowFillModal(false);
        setFillSuccess(false);
        setFillStartWeek(null);
        setFillCustomDate("");
        setFillSelectedNanny(null);
        router.refresh();
      }, 2000);
    }
  };

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

  const handleCloseWithReason = async () => {
    if (!closeReason) return;
    setClosingReason(true);
    const result = await closePositionWithReason(closeReason);
    setClosingReason(false);
    if (result.success) {
      setCloseReason(null);
      router.refresh();
    }
  };

  const handleConfirmPlacement = async (
    connectionId: string,
    startWeek?: string,
  ) => {
    const result = await confirmPlacement(connectionId, startWeek);
    if (result.success) router.refresh();
    return result;
  };

  const handleParentOutcome = async (
    connectionId: string,
    outcome: "hired" | "not_hired" | "awaiting" | "trial",
    dateValue?: string,
  ) => {
    const result = await reportParentOutcome(connectionId, outcome, dateValue);
    if (result.success) router.refresh();
    return result;
  };

  const handleRejectHiredClaim = async (connectionId: string) => {
    const result = await rejectHiredClaim(connectionId);
    if (result.success) router.refresh();
    return result;
  };

  const handleUpdateStartWeek = async (
    connectionId: string,
    startDate: string,
  ) => {
    const result = await updateConnectionStartWeek(connectionId, startDate);
    if (result.success) router.refresh();
    return result;
  };

  const handleRevertToAwaiting = async (connectionId: string) => {
    const result = await revertToAwaiting(connectionId);
    if (result.success) router.refresh();
    return result;
  };

  const handleScheduleTime = async (connectionId: string, isoTime: string) => {
    const result = await scheduleIntroTime(connectionId, isoTime);
    if (result.success) router.refresh();
    return result;
  };

  const handleRemoveNanny = async () => {
    if (!placement || !removeReason) return;
    setRemoving(true);
    const result = await removeNannyPlacement(
      placement.id,
      removeReason,
      removeNotes || undefined,
    );
    setRemoving(false);
    if (result.success) {
      setShowNannyPopup(false);
      setRemoveStep("none");
      setRemoveReason(null);
      setRemoveNotes("");
      router.refresh();
    }
  };

  const handleSaveRate = async () => {
    if (!placement) return;
    const rate = parseFloat(editRateValue);
    if (isNaN(rate) || rate <= 0) return;
    setSavingRate(true);
    const result = await updateParentPlacementRate(placement.id, rate);
    setSavingRate(false);
    if (result.success) {
      setEditingRate(false);
      router.refresh();
    }
  };

  const handleSaveHours = async () => {
    if (!placement) return;
    const hours = parseFloat(editHoursValue);
    if (isNaN(hours) || hours <= 0) return;
    setSavingHours(true);
    const result = await updateParentPlacementHours(placement.id, hours);
    setSavingHours(false);
    if (result.success) {
      setEditingHours(false);
      router.refresh();
    }
  };

  // Matchmaking state for header
  const isMatchmakingActive =
    dfyActivated && dfyExpiresAt
      ? new Date(dfyExpiresAt).getTime() > Date.now()
      : false;
  const hasMatchedNannies = dfyConnections.length > 0;
  const matchmakingTimeRemaining = (() => {
    if (!dfyExpiresAt) return null;
    const diff = new Date(dfyExpiresAt).getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "<1h";
  })();

  // Extract form_data from details JSONB
  const details = position
    ? (position.details as Record<string, unknown> | null)
    : null;
  const formData = (details?.form_data ?? {}) as Partial<TypeformFormData>;
  const hasPosition = !!position;
  const hasFormData = !!details?.form_data;

  return (
    <>
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Childcare</h1>
      </div>

      {/* My Position (collapsible when has position, locked open when no position) */}
      <Card className="border-slate-200">
        <div className="flex items-center px-5 py-4">
          <button
            type="button"
            onClick={() =>
              hasPosition && hasFormData && setPositionExpanded((p) => !p)
            }
            className={`flex flex-1 items-center gap-2 ${!hasPosition || !hasFormData ? "cursor-default" : ""}`}
          >
            <ClipboardList className="h-5 w-5 text-violet-600" />
            <span className="text-base font-semibold text-slate-800">
              My Position
            </span>
          </button>
          {/* Accordion toggle — only when has position with form data */}
          {hasPosition && hasFormData && (
            <button
              type="button"
              onClick={() => setPositionExpanded((p) => !p)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {positionExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
        {(!hasPosition || !hasFormData || positionExpanded) && (
          <CardContent className="pt-0 pb-4">
            {!hasPosition ? (
              <div className="text-center py-2 space-y-2">
                <Button asChild className="bg-violet-600 hover:bg-violet-700">
                  <Link href="/parent/request">Create childcare position</Link>
                </Button>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  A vetted &amp; verified nanny tailored to your needs
                </p>
              </div>
            ) : !hasFormData ? (
              <div className="text-center py-6 space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
                  <ClipboardList className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Position needs updating
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Please recreate your childcare position using the new form
                    to enable editing.
                  </p>
                </div>
                <Button asChild className="bg-violet-600 hover:bg-violet-700">
                  <Link href="/parent/request">Recreate Position</Link>
                </Button>
              </div>
            ) : (
              <PositionDetailView
                initialData={formData}
                editingExternal={positionEditing}
                onEditingChange={setPositionEditing}
                hideClosePosition
                menuSlot={
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {positionEditing && (
                      <button
                        onClick={() => setPositionEditing(false)}
                        className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
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
                              setPositionEditing(true);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setShowPositionMenu(false);
                              setShowCloseConfirm(true);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-b-lg transition-colors"
                          >
                            Close this position
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                }
              />
            )}
          </CardContent>
        )}
      </Card>

      {/* My Nanny — wide tile inspired by MatchCard */}
      {placement && (
        <>
          <PlacementCard
            placement={placement}
            rateNode={
              editingRate ? (
                <div className="flex items-center justify-end gap-1">
                  <span className="text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    className="w-16 text-sm border border-violet-300 rounded-md px-1.5 py-0.5 text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-violet-400"
                    value={editRateValue}
                    onChange={(e) => setEditRateValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingRate(false);
                        setEditingHours(false);
                      }
                    }}
                  />
                  <span className="text-xs text-slate-400">/hr</span>
                </div>
              ) : undefined
            }
            hoursNode={
              editingHours ? (
                <div className="flex items-center justify-end gap-1">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="168"
                    className="w-12 text-sm border border-violet-300 rounded-md px-1.5 py-0.5 text-slate-700 text-right focus:outline-none focus:ring-1 focus:ring-violet-400"
                    value={editHoursValue}
                    onChange={(e) => setEditHoursValue(e.target.value)}
                    autoFocus={!editingRate}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingRate(false);
                        setEditingHours(false);
                      }
                    }}
                  />
                  <span className="text-xs text-slate-400">hrs/wk</span>
                </div>
              ) : undefined
            }
            menuSlot={
              <>
                {(editingRate || editingHours) && (
                  <button
                    onClick={async () => {
                      if (editRateValue) await handleSaveRate();
                      if (editHoursValue) await handleSaveHours();
                      setEditingRate(false);
                      setEditingHours(false);
                    }}
                    disabled={savingRate || savingHours}
                    className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                  >
                    {savingRate || savingHours ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </button>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNannyPopup((p) => !p)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {showNannyPopup && (
                    <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-10">
                      <button
                        onClick={() => {
                          setShowNannyPopup(false);
                          setEditingRate(true);
                          setEditRateValue(
                            placement.hourlyRate?.toString() ||
                              placement.nannyHourlyRate?.toString() ||
                              "",
                          );
                          setEditingHours(true);
                          setEditHoursValue(
                            placement.weeklyHours?.toString() || "",
                          );
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg transition-colors"
                      >
                        Edit pay &amp; hours
                      </button>
                      <button
                        onClick={() => {
                          setShowNannyPopup(false);
                          setShowContactPopup(true);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Contact
                      </button>
                      <button
                        onClick={() => {
                          setShowNannyPopup(false);
                          setRemoveStep("confirm");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-b-lg transition-colors"
                      >
                        Remove nanny
                      </button>
                    </div>
                  )}
                </div>
              </>
            }
            showBrowseNanniesLink
          />

          {/* Remove Nanny Dialog */}
          <Dialog
            open={removeStep !== "none"}
            onOpenChange={(open) => {
              if (!open) {
                setRemoveStep("none");
                setRemoveReason(null);
                setRemoveNotes("");
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  Remove {placement.nannyName.split(" ")[0]} as your nanny
                </DialogTitle>
              </DialogHeader>

              {removeStep === "confirm" && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-red-50 border border-red-100 p-4 space-y-2">
                    <p className="text-sm font-medium text-slate-700">
                      We&apos;re really sorry to hear things haven&apos;t worked
                      out
                    </p>
                    <p className="text-sm text-slate-600">
                      We completely understand that sometimes it just isn&apos;t
                      the right fit, and that&apos;s okay. Removing{" "}
                      {placement.nannyName.split(" ")[0]} will end your current
                      placement, but your childcare position will stay active so
                      we can continue helping you find the right match.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => setRemoveStep("none")}
                    >
                      Never mind
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setRemoveStep("reason")}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {removeStep === "reason" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    Could you let us know what happened?
                  </p>
                  <p className="text-xs text-slate-500">
                    This helps us improve our matching and support for families
                    like yours.
                  </p>
                  <div className="space-y-1.5">
                    {[
                      {
                        value: "parent_no_longer_needs",
                        label: "We no longer need a nanny",
                      },
                      {
                        value: "nanny_left",
                        label: `${placement.nannyName.split(" ")[0]} is no longer available`,
                      },
                      {
                        value: "mutual_agreement",
                        label: "It was a mutual decision",
                      },
                      {
                        value: "relocation",
                        label: "We or the nanny are relocating",
                      },
                      {
                        value: "child_aged_out",
                        label: "Our children no longer need a nanny",
                      },
                      { value: "other", label: "Other reason" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setRemoveReason(opt.value)}
                        className={`w-full text-left px-3 py-2.5 text-sm rounded-lg border transition-colors ${
                          removeReason === opt.value
                            ? "border-red-300 bg-red-50 text-red-700 font-medium"
                            : "border-slate-200 text-slate-600 hover:border-red-200 hover:bg-red-50/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {removeReason && (
                    <div className="space-y-2">
                      <textarea
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400 resize-none"
                        rows={2}
                        placeholder="Anything else you'd like to share? (optional)"
                        value={removeNotes}
                        onChange={(e) => setRemoveNotes(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => {
                        setRemoveStep("confirm");
                        setRemoveReason(null);
                        setRemoveNotes("");
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                      disabled={!removeReason || removing}
                      onClick={handleRemoveNanny}
                    >
                      {removing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : null}
                      Remove nanny
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Contact Popup */}
          <Dialog open={showContactPopup} onOpenChange={setShowContactPopup}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  Contact {placement.nannyName.split(" ")[0]}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {placement.nannyPhone && (
                  <a
                    href={`tel:${placement.nannyPhone}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-violet-50 hover:border-violet-200 transition-colors"
                  >
                    <Phone className="h-4 w-4 text-violet-500" />
                    {placement.nannyPhone}
                  </a>
                )}
                {placement.nannyEmail && (
                  <a
                    href={`mailto:${placement.nannyEmail}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-violet-50 hover:border-violet-200 transition-colors"
                  >
                    <Mail className="h-4 w-4 text-violet-500" />
                    {placement.nannyEmail}
                  </a>
                )}
                {!placement.nannyPhone && !placement.nannyEmail && (
                  <p className="text-sm text-slate-500 text-center py-2">
                    No contact details available
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Nannies — combined matched nannies + connections */}
      {!placement &&
        (() => {
          const nonDfyIntros = upcomingIntros.filter((i) => i.source !== "dfy");
          return (
            <Card>
              <CardContent className="py-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-violet-600" />
                    <p className="text-base font-semibold text-slate-800">
                      Nannies
                    </p>
                  </div>
                  {showFillButton && (
                    <button
                      onClick={() => setShowFillModal(true)}
                      className="text-sm font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                    >
                      I have made my decision
                    </button>
                  )}
                </div>

                {/* ── Empty state: no DFY, no connections ── */}
                {!hasDfy &&
                  dfyConnections.length === 0 &&
                  nonDfyIntros.length === 0 && (
                    <div className="text-center py-6 space-y-4">
                      <div className="flex items-center justify-center gap-4">
                        <Button
                          asChild
                          className="bg-violet-600 hover:bg-violet-700"
                        >
                          <Link href="/parent/matches/checkout">
                            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                            Find my nanny for me
                          </Link>
                        </Button>
                        <Link
                          href="/nannies"
                          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          Browse nannies
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Let us do all the heavy lifting! We will use our AI
                        matchmaking algorithm to connect you with the best
                        nannies for your specific childcare needs
                      </p>
                    </div>
                  )}

                {/* ── Matched Nannies (only when DFY active/has matches) ── */}
                {(hasDfy || dfyConnections.length > 0) && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Matched Nannies
                        {dfyConnections.length > 0
                          ? ` (${dfyConnections.length})`
                          : ""}
                      </p>
                      {isMatchmakingActive && matchmakingTimeRemaining ? (
                        <div className="rounded-full bg-green-50 border border-green-100 px-3 py-1">
                          <p className="text-xs font-medium text-green-700">
                            You have{" "}
                            {dfyTier === "priority" ? "Priority" : "Standard"}{" "}
                            matchmaking for the next {matchmakingTimeRemaining}!
                          </p>
                        </div>
                      ) : !isMatchmakingActive && hasMatchedNannies ? (
                        <Link
                          href="/parent/matches/checkout"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          Find my perfect nanny
                        </Link>
                      ) : null}
                    </div>

                    {/* DFY loading / awaiting */}
                    {dfyConnections.length === 0 && (
                      <div className="text-center py-4">
                        {!dfyLoaded ? (
                          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </div>
                        ) : isMatchmakingActive ? (
                          <p className="text-sm text-slate-500">
                            We&apos;re reaching out to your top matches —
                            awaiting responses
                          </p>
                        ) : (
                          <p className="text-sm text-slate-400">
                            No responses yet
                          </p>
                        )}
                      </div>
                    )}

                    {/* Matched nanny cards */}
                    {dfyConnections.length > 0 && (
                      <div className="space-y-3">
                        {dfyConnections.map((conn) => {
                          const score = Math.round(
                            50 + (conn.matchScore / 100) * 50,
                          );
                          const nannyAge = calcAge(conn.nanny.dateOfBirth);
                          const isDeclining = decliningId === conn.connectionId;
                          const isScheduling =
                            schedulingDfyId === conn.connectionId;
                          const isScheduled =
                            conn.connectionStage >=
                            CONNECTION_STAGE.INTRO_SCHEDULED;
                          const matchingIntro = dfyIntros.find(
                            (i) => i.connectionId === conn.connectionId,
                          );
                          const badge = isScheduled
                            ? getParentStageBadge(
                                conn.connectionStage,
                                matchingIntro?.fillInitiatedBy ?? null,
                                matchingIntro?.trialDate ?? null,
                              )
                            : null;

                          return (
                            <div
                              key={conn.connectionId}
                              className={`rounded-lg border border-slate-100 bg-white p-3 space-y-3 ${isScheduled ? "cursor-pointer hover:bg-violet-50 hover:border-violet-200 transition-colors" : ""}`}
                              onClick={
                                isScheduled && matchingIntro
                                  ? () => setSelectedDfyIntro(matchingIntro)
                                  : undefined
                              }
                            >
                              {/* Nanny info row */}
                              <div
                                className={`flex items-center gap-3 ${!isScheduled && matchingIntro ? "cursor-pointer" : ""}`}
                                onClick={
                                  !isScheduled && matchingIntro
                                    ? (e) => {
                                        e.stopPropagation();
                                        setSelectedDfyIntro(matchingIntro);
                                      }
                                    : undefined
                                }
                              >
                                <div className="relative shrink-0">
                                  {conn.nanny.profilePicUrl ? (
                                    <img
                                      src={conn.nanny.profilePicUrl}
                                      alt={conn.nanny.firstName}
                                      className="w-10 h-10 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                                      <span className="text-sm font-semibold text-violet-500">
                                        {conn.nanny.firstName[0]}
                                        {conn.nanny.lastName[0]}
                                      </span>
                                    </div>
                                  )}
                                  {conn.nanny.wwccVerified && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                                      <ShieldCheck className="w-3 h-3 text-green-500" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-sm font-medium text-slate-900 truncate">
                                      {conn.nanny.firstName}
                                    </span>
                                    {nannyAge && (
                                      <span className="text-xs text-slate-400">
                                        {nannyAge}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-slate-400">
                                    {conn.nanny.suburb && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="w-2.5 h-2.5" />
                                        {conn.nanny.suburb}
                                        {conn.distanceKm != null &&
                                          ` (${conn.distanceKm < 1 ? "<1" : conn.distanceKm.toFixed(0)} km)`}
                                      </span>
                                    )}
                                    {conn.nanny.hourlyRateMin && (
                                      <span className="flex items-center gap-1">
                                        <DollarSign className="w-2.5 h-2.5" />$
                                        {conn.nanny.hourlyRateMin}/hr
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div
                                    className={`rounded-lg border px-2 py-0.5 font-semibold text-xs ${getScoreBadgeStyle(score)}`}
                                  >
                                    {score}%{" "}
                                    {dfyTier === "standard"
                                      ? "Logistical Score"
                                      : "Match"}
                                  </div>
                                  {isScheduled && badge && (
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${badge.color}`}
                                    >
                                      {badge.label}
                                    </span>
                                  )}
                                  {isScheduled && (
                                    <ChevronRight className="h-4 w-4 text-slate-300" />
                                  )}
                                </div>
                              </div>

                              {/* ── Inline ScheduleTimeGrid (approve = schedule) ── */}
                              {isScheduling && conn.proposedTimes && (
                                <ScheduleTimeGrid
                                  proposedTimes={conn.proposedTimes}
                                  otherPartyName={`${conn.nanny.firstName} ${conn.nanny.lastName}`}
                                  submitting={schedulingDfy}
                                  onBack={() => setSchedulingDfyId(null)}
                                  onConfirm={(isoTime) =>
                                    handleApproveDfy(conn.connectionId, isoTime)
                                  }
                                />
                              )}

                              {/* ── Action buttons (only for ACCEPTED stage, not yet scheduling) ── */}
                              {!isScheduled && !isScheduling && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSchedulingDfyId(conn.connectionId);
                                    }}
                                    disabled={isDeclining}
                                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-xs"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeclineDfy(conn.connectionId);
                                    }}
                                    disabled={isDeclining}
                                    className="flex-1 text-xs"
                                  >
                                    {isDeclining ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5 mr-1" />
                                    )}
                                    Decline
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Connections (only when there are connections) ── */}
                {nonDfyIntros.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Connections ({nonDfyIntros.length})
                      </p>
                      <Link
                        href="/nannies"
                        className="inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Browse nannies
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                    <div className="space-y-3">
                      {nonDfyIntros.map((intro) => {
                        const badge = getParentStageBadge(
                          intro.connectionStage,
                          intro.fillInitiatedBy,
                          intro.trialDate,
                        );

                        return (
                          <div
                            key={intro.connectionId}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 cursor-pointer hover:bg-violet-50 hover:border-violet-200 transition-colors"
                            onClick={() => setSelectedIntro(intro)}
                          >
                            <div className="flex items-center gap-3">
                              {intro.otherPartyPhoto ? (
                                <img
                                  src={intro.otherPartyPhoto}
                                  alt=""
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
                                  <span className="text-sm font-semibold text-violet-600">
                                    {intro.otherPartyName.charAt(0)}
                                  </span>
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {intro.otherPartyName}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  {intro.otherPartySuburb && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {intro.otherPartySuburb}
                                    </span>
                                  )}
                                  {intro.startDate &&
                                    intro.connectionStage >=
                                      CONNECTION_STAGE.OFFERED && (
                                      <span className="flex items-center gap-1 text-green-600">
                                        <Calendar className="h-3 w-3" />
                                        {intro.startDate === "tbc"
                                          ? "Start week to be confirmed"
                                          : `Starting ${formatStartWeekLabel(new Date(intro.startDate + "T00:00:00")).replace("Week", "week")}`}
                                      </span>
                                    )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${badge.color}`}
                              >
                                {badge.label}
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-300" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

      {/* Connection Detail Popup */}
      <ConnectionDetailPopup
        intro={selectedIntro}
        open={selectedIntro !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIntro(null);
            router.refresh();
          }
        }}
        role="parent"
        onConfirmPlacement={handleConfirmPlacement}
        onParentOutcome={handleParentOutcome}
        onRejectHiredClaim={handleRejectHiredClaim}
        onRevertToAwaiting={handleRevertToAwaiting}
        onScheduleTime={handleScheduleTime}
        onUpdateStartWeek={handleUpdateStartWeek}
        onConfirmTrial={async (connectionId, trialDate) => {
          const result = await confirmTrialArrangement(connectionId, trialDate);
          if (result.success) router.refresh();
          return result;
        }}
        onDeclineTrial={async (connectionId) => {
          const result = await declineTrialArrangement(connectionId);
          if (result.success) router.refresh();
          return result;
        }}
        onRemoveConnection={async (connectionId) => {
          const result = await cancelConnectionRequest(connectionId);
          if (result.success) router.refresh();
          return result;
        }}
      />

      {/* DFY Connection Detail Popup */}
      {(() => {
        const selectedDfyConn = dfyConnections.find(
          (c) => c.connectionId === selectedDfyIntro?.connectionId,
        );
        return (
          <ConnectionDetailPopup
            intro={selectedDfyIntro}
            open={selectedDfyIntro !== null}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedDfyIntro(null);
                router.refresh();
                loadDfyConnections();
              }
            }}
            role="parent"
            matchData={
              selectedDfyConn
                ? {
                    matchScore: selectedDfyConn.matchScore,
                    distanceKm: selectedDfyConn.distanceKm,
                    breakdown: selectedDfyConn.breakdown,
                    nannySchedule: selectedDfyConn.nanny.schedule,
                    aiHeadline: selectedDfyConn.nanny.aiHeadline,
                    tier: (dfyTier as "standard" | "priority") || "standard",
                    nannyId: selectedDfyConn.nannyId,
                    overQualifiedBonuses: selectedDfyConn.overQualifiedBonuses,
                    unmetRequirements: selectedDfyConn.unmetRequirements,
                  }
                : null
            }
            onConfirmPlacement={handleConfirmPlacement}
            onParentOutcome={handleParentOutcome}
            onRejectHiredClaim={handleRejectHiredClaim}
            onRevertToAwaiting={handleRevertToAwaiting}
            onScheduleTime={handleScheduleTime}
            onUpdateStartWeek={handleUpdateStartWeek}
            onConfirmTrial={async (connectionId, trialDate) => {
              const result = await confirmTrialArrangement(
                connectionId,
                trialDate,
              );
              if (result.success) router.refresh();
              return result;
            }}
            onDeclineTrial={async (connectionId) => {
              const result = await declineTrialArrangement(connectionId);
              if (result.success) router.refresh();
              return result;
            }}
            onRemoveConnection={async (connectionId) => {
              const result = await cancelConnectionRequest(connectionId);
              if (result.success) router.refresh();
              return result;
            }}
          />
        );
      })()}

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

      {/* Close with Reason Confirmation */}
      {closeReason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-700">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {closeReason === "found_elsewhere"
                  ? "Found a nanny elsewhere?"
                  : "No longer need a nanny?"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                {closeReason === "found_elsewhere"
                  ? "This will end your current nanny connections. Your position will remain on file so we can help you in the future."
                  : "This will end your current nanny connections. Your position will remain on file in case you change your mind."}
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCloseReason(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCloseWithReason}
                  disabled={closingReason}
                >
                  {closingReason ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : null}
                  Confirm
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Path B: Select Nanny Modal */}
      {showFillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                {fillSelectedNanny ? (
                  (() => {
                    const selectedNanny = confirmedNannies.find(
                      (n) => n.nannyId === fillSelectedNanny,
                    );
                    return (
                      <div className="flex items-center gap-3">
                        {selectedNanny?.nannyPhoto ? (
                          <img
                            src={selectedNanny.nannyPhoto}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
                            <span className="text-sm font-semibold text-violet-600">
                              {selectedNanny?.nannyName.charAt(0)}
                            </span>
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-base">
                            {selectedNanny?.nannyName}
                          </CardTitle>
                          {selectedNanny?.nannySuburb && (
                            <p className="text-xs text-slate-500">
                              {selectedNanny.nannySuburb}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <CardTitle className="text-base">
                    Which nanny did you choose?
                  </CardTitle>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowFillModal(false);
                    setFillError(null);
                    setFillSuccess(false);
                    setFillStartWeek(null);
                    setFillCustomDate("");
                    setFillSelectedNanny(null);
                  }}
                >
                  <span className="text-lg">&times;</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {fillSuccess ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-green-800">
                    We&apos;ve reached out to the nanny to confirm the details.
                  </p>
                </div>
              ) : fillSelectedNanny ? (
                /* Step 2: Select start week */
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">
                    When would you like{" "}
                    {
                      confirmedNannies
                        .find((n) => n.nannyId === fillSelectedNanny)
                        ?.nannyName.split(" ")[0]
                    }{" "}
                    to start?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {getStartWeekOptionsFill().map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setFillStartWeek(opt.value);
                          if (opt.value !== "custom") setFillCustomDate("");
                        }}
                        className={`px-3 py-2.5 text-sm rounded-lg border transition-colors text-left ${
                          fillStartWeek === opt.value
                            ? "border-violet-500 bg-violet-50 text-violet-700 font-medium"
                            : "border-slate-200 text-slate-600 hover:border-violet-300"
                        }`}
                      >
                        <span className="block">{opt.label}</span>
                        {opt.display && (
                          <span className="block text-xs opacity-70">
                            {opt.display}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {fillStartWeek === "custom" && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                      <input
                        type="date"
                        value={fillCustomDate}
                        onChange={(e) => setFillCustomDate(e.target.value)}
                        className="flex-1 text-sm border rounded-lg px-3 py-1.5 text-slate-700"
                      />
                    </div>
                  )}
                  {fillError && (
                    <p className="text-sm text-red-600">{fillError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setFillSelectedNanny(null);
                        setFillStartWeek(null);
                        setFillCustomDate("");
                      }}
                      disabled={fillingNannyId !== null}
                    >
                      Back
                    </Button>
                    <Button
                      className="flex-1 bg-violet-600 hover:bg-violet-700"
                      disabled={
                        !fillStartWeek ||
                        (fillStartWeek === "custom" && !fillCustomDate) ||
                        fillingNannyId !== null
                      }
                      onClick={() => {
                        const startVal =
                          fillStartWeek === "custom"
                            ? fillCustomDate
                            : (fillStartWeek ?? undefined);
                        handleFillPosition(fillSelectedNanny!, startVal);
                      }}
                    >
                      {fillingNannyId ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : null}
                      Confirm
                    </Button>
                  </div>
                </div>
              ) : (
                /* Step 1: Select nanny */
                <>
                  <p className="text-sm text-slate-500">
                    Select the nanny you&apos;ve decided to hire.
                  </p>
                  {fillError && (
                    <p className="text-sm text-red-600">{fillError}</p>
                  )}
                  <div className="space-y-2">
                    {confirmedNannies.map((nanny) => (
                      <button
                        key={nanny.nannyId}
                        onClick={() => setFillSelectedNanny(nanny.nannyId)}
                        disabled={fillingNannyId !== null}
                        className="w-full text-left rounded-lg border border-slate-200 bg-white p-4 hover:bg-violet-50 hover:border-violet-300 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {nanny.nannyPhoto ? (
                              <img
                                src={nanny.nannyPhoto}
                                alt=""
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
                                <span className="text-sm font-semibold text-violet-600">
                                  {nanny.nannyName.charAt(0)}
                                </span>
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {nanny.nannyName}
                              </p>
                              {nanny.nannySuburb && (
                                <p className="text-xs text-slate-500">
                                  {nanny.nannySuburb}
                                </p>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Close position alternatives */}
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <p className="text-xs text-slate-400">
                      Or close this position:
                    </p>
                    <button
                      onClick={() => {
                        setShowFillModal(false);
                        setCloseReason("found_elsewhere");
                      }}
                      className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 hover:text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Search className="h-4 w-4" />I found a nanny elsewhere
                    </button>
                    <button
                      onClick={() => {
                        setShowFillModal(false);
                        setCloseReason("no_longer_needed");
                      }}
                      className="w-full flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 hover:text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <XCircle className="h-4 w-4" />I no longer need a nanny
                    </button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}