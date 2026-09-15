"use client";

import { Check, Minus } from "lucide-react";

// ── Score helpers ──

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const percent = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-3">
      <span className="w-[100px] text-sm text-slate-500 shrink-0">{label}</span>
      <div className="flex-1 h-3.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function getScoreBadgeStyle(score: number) {
  if (score >= 90) return "bg-green-100 text-green-700 border-green-200";
  if (score >= 75) return "bg-violet-100 text-violet-700 border-violet-200";
  if (score >= 60) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// ── Availability table ──

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCKS = ["morning", "midday", "afternoon", "evening"] as const;
const BLOCK_LABELS = ["Morning", "Midday", "Afternoon", "Evening"];

export function AvailabilityTable({ schedule }: { schedule: Record<string, string[]> }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-[9px]">
        <thead>
          <tr className="border-b">
            <th className="py-0.5 px-1.5 text-left font-medium text-slate-400 w-[36px]" />
            {BLOCK_LABELS.map((b) => (
              <th key={b} className="py-0.5 px-0 text-center font-medium text-slate-400 uppercase tracking-wider">
                {b.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, i) => {
            const available = schedule[day] ?? [];
            return (
              <tr key={day} className={i < DAYS.length - 1 ? "border-b border-slate-100" : ""}>
                <td className="py-[3px] px-1.5 font-medium text-slate-600">{DAY_LABELS[i]}</td>
                {BLOCKS.map((block) => {
                  const has = available.includes(block);
                  return (
                    <td key={block} className="py-[3px] px-0 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full ${
                          has ? "bg-violet-100 text-violet-500" : "bg-slate-100 text-slate-300"
                        }`}
                      >
                        {has ? <Check className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Swipe panel helpers ──

export type View = "availability" | "overview" | "breakdown";

export function getTranslateClass(panel: "availability" | "overview" | "breakdown", view: View): string {
  if (panel === "availability") {
    if (view === "availability") return "translate-x-0";
    return "-translate-x-full";
  }
  if (panel === "overview") {
    if (view === "overview") return "translate-x-0";
    if (view === "availability") return "translate-x-full";
    return "-translate-x-full";
  }
  // breakdown
  if (view === "breakdown") return "translate-x-0";
  return "translate-x-full";
}
