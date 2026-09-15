"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TypeformFormData, AGE_OPTIONS, GENDER_OPTIONS } from "../questions";

const CHILD_LABELS = ["First Child", "Second Child", "Third Child"];
const NUM_OPTIONS = ["1", "2", "3"];

interface ChildrenCompoundProps {
  data: Partial<TypeformFormData>;
  updateData: (d: Partial<TypeformFormData>) => void;
  onAdvance: () => void;
}

const AGE_KEYS: (keyof TypeformFormData)[] = [
  "child_a_age",
  "child_b_age",
  "child_c_age",
];
const GENDER_KEYS: (keyof TypeformFormData)[] = [
  "child_a_gender",
  "child_b_gender",
  "child_c_gender",
];

export function ChildrenCompound({
  data,
  updateData,
  onAdvance,
}: ChildrenCompoundProps) {
  const numChildren = data.num_children;
  const numStr = numChildren != null ? String(numChildren) : null;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when child cards appear
  useEffect(() => {
    if (numChildren != null && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [numChildren]);

  // Toggle: click selected number to deselect
  const handleNumClick = (opt: string) => {
    if (numStr === opt) {
      updateData({ num_children: null });
    } else {
      updateData({ num_children: parseInt(opt, 10) });
    }
  };

  // Check if all visible children have age and gender filled
  const allChildrenFilled =
    numChildren != null &&
    Array.from({ length: numChildren }).every((_, i) => {
      const age = data[AGE_KEYS[i]] as string | null | undefined;
      const gender = data[GENDER_KEYS[i]] as string | null | undefined;
      return age && gender;
    });

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
      {/* 3 uniform tiles side by side — stays at top */}
      <div className="grid grid-cols-3 gap-2">
        {NUM_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => handleNumClick(opt)}
            className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-center cursor-pointer transition-all duration-150 ${
              numStr === opt
                ? "bg-violet-500 text-white border-violet-500"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Child cards — expand below */}
      {numChildren != null && (
        <div className="flex flex-col gap-3 transition-all duration-300">
          {Array.from({ length: numChildren }).map((_, i) => {
            const age =
              (data[AGE_KEYS[i]] as string | null | undefined) ?? null;
            const gender =
              (data[GENDER_KEYS[i]] as string | null | undefined) ?? null;

            return (
              <div
                key={i}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-3"
              >
                <p className="text-sm font-semibold text-slate-700">
                  {CHILD_LABELS[i]}
                </p>

                {/* Age */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">
                    Age
                  </label>
                  <select
                    value={age ?? ""}
                    onChange={(e) =>
                      updateData({
                        [AGE_KEYS[i]]: e.target.value || null,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  >
                    <option value="">Select age range</option>
                    {AGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Gender */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">
                    Gender
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {GENDER_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          updateData({ [GENDER_KEYS[i]]: opt })
                        }
                        className={`px-2 py-2 rounded-lg border text-xs font-medium text-center cursor-pointer transition-colors ${
                          gender === opt
                            ? "bg-violet-500 text-white border-violet-500"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Continue */}
          {allChildrenFilled && (
            <Button
              onClick={onAdvance}
              className="mt-1 bg-violet-600 hover:bg-violet-700 text-white py-2.5 px-6 rounded-lg font-medium text-sm"
            >
              Continue
            </Button>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
