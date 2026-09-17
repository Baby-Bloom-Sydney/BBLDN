"use client";
// N3's availability (04 §6.1 S-X-17 "availability grid"; 02 §4.2 one shape: day → blocks). Seven days by four
// blocks of checkboxes, mirrored into one hidden JSON field the schema checks. Keyboard-reachable by being
// plain checkboxes; the group is named so a screen reader reads the day and the block.
import { useState } from "react";
import type { NannyAvailability, NannyDayBlock, NannyWeekday } from "../../types";

const DAYS: ReadonlyArray<NannyWeekday> = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const BLOCKS: ReadonlyArray<NannyDayBlock> = ["morning", "midday", "afternoon", "evening"];
const title = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export function AvailabilityGrid({ defaultValue }: { readonly defaultValue?: NannyAvailability | null }) {
  const [grid, setGrid] = useState<NannyAvailability>(defaultValue ?? {});
  const toggle = (day: NannyWeekday, block: NannyDayBlock): void =>
    setGrid((current) => {
      const blocks = current[day] ?? [];
      const next = blocks.includes(block) ? blocks.filter((b) => b !== block) : [...blocks, block];
      return { ...current, [day]: next };
    });
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-900">When are you available?</legend>
      <input type="hidden" name="availability" value={JSON.stringify(grid)} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th scope="col" className="sr-only">Day</th>
              {BLOCKS.map((block) => (
                <th key={block} scope="col" className="px-2 py-1 text-left font-medium text-slate-600">
                  {title(block)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day} className="border-t border-slate-100">
                <th scope="row" className="py-1 pr-2 text-left font-medium text-slate-800">
                  {title(day)}
                </th>
                {BLOCKS.map((block) => (
                  <td key={block} className="px-2 py-1">
                    <input
                      type="checkbox"
                      aria-label={`${title(day)} ${block}`}
                      checked={(grid[day] ?? []).includes(block)}
                      onChange={() => toggle(day, block)}
                      className="h-4 w-4 accent-violet-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}
