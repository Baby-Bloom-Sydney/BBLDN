"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StepProps, NannyRegistrationData } from "../NannyRegistrationFunnel";

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_OPTIONS = [
  "Morning (6am-10am)",
  "Midday (10am-2pm)",
  "Afternoon (2pm-6pm)",
  "Evening (6pm-10pm)",
];

const IMMEDIATE_START_OPTIONS = ["Yes", "At a later date"];
const PLACEMENT_ONGOING_OPTIONS = ["Yes", "Until a certain date"];

// Map day label to its data field key
const DAY_TIMES_FIELD: Record<string, keyof NannyRegistrationData> = {
  Monday: "monday_times",
  Tuesday: "tuesday_times",
  Wednesday: "wednesday_times",
  Thursday: "thursday_times",
  Friday: "friday_times",
  Saturday: "saturday_times",
  Sunday: "sunday_times",
};

interface MultiSelectTagsProps {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}

function MultiSelectTags({ options, selected, onChange }: MultiSelectTagsProps) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt)
        ? selected.filter((v) => v !== opt)
        : [...selected, opt]
    );
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`px-4 py-2 rounded-full border text-sm font-medium cursor-pointer transition-colors ${
            selected.includes(opt)
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-slate-700 border-slate-300 hover:border-violet-400"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

interface SingleSelectTagsProps {
  options: string[];
  selected: string | null;
  onChange: (val: string) => void;
}

function SingleSelectTags({ options, selected, onChange }: SingleSelectTagsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-4 py-2 rounded-full border text-sm font-medium cursor-pointer transition-colors ${
            selected === opt
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-slate-700 border-slate-300 hover:border-violet-400"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function StepAvailability({ data, updateData, goNext, goBack }: StepProps) {
  const {
    available_days = [],
    monday_times = [],
    tuesday_times = [],
    wednesday_times = [],
    thursday_times = [],
    friday_times = [],
    saturday_times = [],
    sunday_times = [],
    immediate_start,
    start_date,
    placement_ongoing,
    end_date,
  } = data;

  const dayTimesMap: Record<string, string[]> = {
    Monday: monday_times,
    Tuesday: tuesday_times,
    Wednesday: wednesday_times,
    Thursday: thursday_times,
    Friday: friday_times,
    Saturday: saturday_times,
    Sunday: sunday_times,
  };

  // Determine if any day has at least one time slot selected
  const anyDayHasTime = available_days.some(
    (day) => (dayTimesMap[day] ?? []).length > 0
  );

  // All selected days must have at least one time slot
  const allDaysHaveTimes =
    available_days.length > 0 &&
    available_days.every((day) => (dayTimesMap[day] ?? []).length > 0);

  // "Immediate start" section shown once any day-time availability provided
  const showImmediateStart = anyDayHasTime;

  // Start date shown if "At a later date" selected
  const showStartDate = immediate_start === "At a later date";

  // Placement ongoing shown if immediate start answered OR start date provided
  const showPlacementOngoing =
    immediate_start === "Yes" ||
    (immediate_start === "At a later date" && start_date != null && start_date.trim().length > 0);

  // End date shown if "Until a certain date" selected
  const showEndDate = placement_ongoing === "Until a certain date";

  // Overall completion check
  const isComplete =
    allDaysHaveTimes &&
    immediate_start != null &&
    (immediate_start !== "At a later date" || (start_date != null && start_date.trim().length > 0)) &&
    placement_ongoing != null &&
    (placement_ongoing !== "Until a certain date" || (end_date != null && end_date.trim().length > 0));

  const today = new Date().toISOString().split("T")[0];

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold text-slate-800">
          Availability
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pb-8">

        {/* Available Days */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-slate-700">
            Which days of the week do you have availability?
          </Label>
          <MultiSelectTags
            options={DAY_OPTIONS}
            selected={available_days}
            onChange={(val) => updateData({ available_days: val })}
          />
        </div>

        {/* Per-day time slots — revealed once at least one day selected */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            available_days.length > 0
              ? "max-h-[2000px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-5">
            <Label className="text-sm font-medium text-slate-700">
              What times are you available on these days?
            </Label>
            {available_days.map((day) => {
              const fieldKey = DAY_TIMES_FIELD[day];
              const currentTimes = (data[fieldKey] as string[] | undefined) ?? [];
              return (
                <div key={day} className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-600">
                    {day}
                  </span>
                  <MultiSelectTags
                    options={TIME_OPTIONS}
                    selected={currentTimes}
                    onChange={(val) => updateData({ [fieldKey]: val })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Immediate Start — revealed once any day-time availability provided */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showImmediateStart
              ? "max-h-[500px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              Are you available for an immediate start?
            </Label>
            <SingleSelectTags
              options={IMMEDIATE_START_OPTIONS}
              selected={immediate_start ?? null}
              onChange={(val) => updateData({ immediate_start: val })}
            />
          </div>
        </div>

        {/* Start Date — revealed if "At a later date" */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showStartDate
              ? "max-h-[200px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              When would you be able to start?
            </Label>
            <Input
              type="date"
              min={today}
              value={start_date ?? ""}
              onChange={(e) =>
                updateData({ start_date: e.target.value || null })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>
        </div>

        {/* Placement Ongoing — revealed once immediate start answered or start date provided */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showPlacementOngoing
              ? "max-h-[500px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              Is your availability ongoing or until a certain date?
            </Label>
            <SingleSelectTags
              options={PLACEMENT_ONGOING_OPTIONS}
              selected={placement_ongoing ?? null}
              onChange={(val) => updateData({ placement_ongoing: val })}
            />
          </div>
        </div>

        {/* End Date — revealed if "Until a certain date" */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showEndDate
              ? "max-h-[200px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              When would you need to finish your position?
            </Label>
            <Input
              type="date"
              min={today}
              value={end_date ?? ""}
              onChange={(e) =>
                updateData({ end_date: e.target.value || null })
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-2">
          <Button
            variant="outline"
            onClick={goBack}
            className="border-slate-300 text-slate-700 hover:border-violet-400"
          >
            Back
          </Button>
          {isComplete && (
            <Button
              onClick={goNext}
              className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 font-medium rounded-lg"
            >
              Continue to add Salary Expectations
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
