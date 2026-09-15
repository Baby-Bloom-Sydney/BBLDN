"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  TypeformFormData,
  DAY_OPTIONS,
  DAY_SHORT,
  TIME_BLOCK_OPTIONS,
  DAY_ROSTER_FIELD,
} from "../questions";

interface DaysTimesCompoundProps {
  data: Partial<TypeformFormData>;
  updateData: (d: Partial<TypeformFormData>) => void;
  onAdvance: () => void;
}

export function DaysTimesCompound({
  data,
  updateData,
  onAdvance,
}: DaysTimesCompoundProps) {
  const weeklyRoster = data.weekly_roster ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when grid appears
  useEffect(() => {
    if (weeklyRoster.length > 0 && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [weeklyRoster.length]);

  const toggleDay = (day: string) => {
    if (weeklyRoster.includes(day)) {
      // Toggle off — reset that day's brackets
      const fieldKey = DAY_ROSTER_FIELD[day];
      updateData({
        weekly_roster: weeklyRoster.filter((d) => d !== day),
        [fieldKey]: [],
      });
    } else {
      updateData({ weekly_roster: [...weeklyRoster, day] });
    }
  };

  const toggleTimeBlock = (day: string, blockKey: string) => {
    const fieldKey = DAY_ROSTER_FIELD[day];
    const current = (data[fieldKey] as string[] | undefined) ?? [];
    const updated = current.includes(blockKey)
      ? current.filter((b) => b !== blockKey)
      : [...current, blockKey];
    updateData({ [fieldKey]: updated });
  };

  // Sort selected days in week order
  const sortedSelectedDays = DAY_OPTIONS.filter((d) =>
    weeklyRoster.includes(d)
  );

  // Continue only when every selected day has at least one bracket
  const allDaysHaveBrackets =
    sortedSelectedDays.length > 0 &&
    sortedSelectedDays.every((day) => {
      const fieldKey = DAY_ROSTER_FIELD[day];
      const times = (data[fieldKey] as string[] | undefined) ?? [];
      return times.length > 0;
    });

  const dayButton = (day: string) => (
    <button
      key={day}
      type="button"
      onClick={() => toggleDay(day)}
      className={`px-2 py-2.5 rounded-lg border text-sm font-medium text-center cursor-pointer transition-all duration-150 ${
        weeklyRoster.includes(day)
          ? "bg-violet-500 text-white border-violet-500"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {DAY_SHORT[day]}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
      {/* Day selection — 2 rows: 4 + 3 */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-4 gap-2">
          {DAY_OPTIONS.slice(0, 4).map((day) => dayButton(day))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DAY_OPTIONS.slice(4).map((day) => dayButton(day))}
        </div>
      </div>

      {/* Time bracket grid */}
      {sortedSelectedDays.length > 0 && (
        <div className="flex flex-col gap-2 transition-all duration-300">
          <p className="text-sm font-medium text-slate-700 text-center">
            When during the day?
          </p>

          <div className="overflow-x-auto">
            <div className="min-w-[320px]">
              {/* Column headers */}
              <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1">
                <div />
                {TIME_BLOCK_OPTIONS.map((block) => (
                  <div key={block.key} className="text-center">
                    <p className="text-[11px] font-semibold text-slate-600">
                      {block.label}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {block.sublabel}
                    </p>
                  </div>
                ))}
              </div>

              {/* Day rows */}
              {sortedSelectedDays.map((day) => {
                const fieldKey = DAY_ROSTER_FIELD[day];
                const currentTimes =
                  (data[fieldKey] as string[] | undefined) ?? [];

                return (
                  <div
                    key={day}
                    className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1"
                  >
                    <div className="flex items-center">
                      <p className="text-xs font-semibold text-slate-600">
                        {DAY_SHORT[day]}
                      </p>
                    </div>
                    {TIME_BLOCK_OPTIONS.map((block) => {
                      const isSelected = currentTimes.includes(block.key);
                      return (
                        <button
                          key={block.key}
                          type="button"
                          onClick={() => toggleTimeBlock(day, block.key)}
                          className={`h-9 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-violet-500 text-white border-violet-500"
                              : "bg-white text-slate-400 border-slate-200 hover:border-violet-400"
                          }`}
                        >
                          {isSelected ? "\u2713" : ""}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Continue — only when all selected days have at least one bracket */}
      {allDaysHaveBrackets && (
        <Button
          onClick={onAdvance}
          className="mt-1 bg-violet-600 hover:bg-violet-700 text-white py-2.5 px-6 rounded-lg font-medium text-sm"
        >
          Continue
        </Button>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
