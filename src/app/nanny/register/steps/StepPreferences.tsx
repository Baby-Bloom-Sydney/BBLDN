"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StepProps } from "../NannyRegistrationFunnel";

const ROLE_TYPE_OPTIONS = [
  "Mothers Help",
  "Back-to-Work Support",
  "Pick Up & Drop Off",
  "Child Development",
  "Home Management",
];

const LEVEL_OF_SUPPORT_OPTIONS = [
  "Supervision",
  "Engagement and Play",
  "Educational Support",
  "Developmental Assistance",
];

const MAX_CHILDREN_OPTIONS = ["1", "2", "3"];

const MIN_AGE_OPTIONS = [
  "Newborn",
  "3 months",
  "6 months",
  "12 months",
  "18 months",
  "2 years",
  "3 years",
  "5 years",
  "10 years",
];

const MAX_AGE_OPTIONS = [
  "12 months",
  "3 years",
  "5 years",
  "10 years",
  "13 years",
  "16 years",
];

const ADDITIONAL_NEEDS_OPTIONS = ["Yes", "No"];

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

export function StepPreferences({ data, updateData, goNext, goBack }: StepProps) {
  const {
    role_types = [],
    level_of_support = [],
    max_children,
    min_age,
    max_age,
    additional_needs,
  } = data;

  // Convert max_children number to string for tag comparison
  const maxChildrenStr = max_children != null ? String(max_children) : null;

  const isComplete =
    role_types.length > 0 &&
    level_of_support.length > 0 &&
    max_children != null &&
    min_age != null &&
    max_age != null &&
    additional_needs != null;

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold text-slate-800">
          Nannying Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pb-8">

        {/* Role Types */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-slate-700">
            Which services are you happy to provide?
          </Label>
          <MultiSelectTags
            options={ROLE_TYPE_OPTIONS}
            selected={role_types}
            onChange={(val) => updateData({ role_types: val })}
          />
        </div>

        {/* Level of Support — revealed once Role Type has selection */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            role_types.length > 0
              ? "max-h-[500px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              Which types of support are you able to offer children?
            </Label>
            <MultiSelectTags
              options={LEVEL_OF_SUPPORT_OPTIONS}
              selected={level_of_support}
              onChange={(val) => updateData({ level_of_support: val })}
            />
          </div>
        </div>

        {/* Max Children — revealed once Level of Support has selection */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            level_of_support.length > 0
              ? "max-h-[500px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              How many children are you comfortable caring for at the same time?
            </Label>
            <SingleSelectTags
              options={MAX_CHILDREN_OPTIONS}
              selected={maxChildrenStr}
              onChange={(val) => updateData({ max_children: Number(val) })}
            />
          </div>
        </div>

        {/* Min Age — revealed once Max Children selected */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            max_children != null
              ? "max-h-[500px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              What is the youngest age you are comfortable caring for?
            </Label>
            <SingleSelectTags
              options={MIN_AGE_OPTIONS}
              selected={min_age ?? null}
              onChange={(val) => updateData({ min_age: val })}
            />
          </div>
        </div>

        {/* Max Age — revealed once Min Age selected */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            min_age != null
              ? "max-h-[500px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              What is the oldest age you are comfortable caring for?
            </Label>
            <SingleSelectTags
              options={MAX_AGE_OPTIONS}
              selected={max_age ?? null}
              onChange={(val) => updateData({ max_age: val })}
            />
          </div>
        </div>

        {/* Additional Needs — revealed once Max Age selected */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            max_age != null
              ? "max-h-[500px] opacity-100 mt-6"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              Are you comfortable caring for children with additional needs?
            </Label>
            <SingleSelectTags
              options={ADDITIONAL_NEEDS_OPTIONS}
              selected={
                additional_needs === true
                  ? "Yes"
                  : additional_needs === false
                  ? "No"
                  : null
              }
              onChange={(val) =>
                updateData({ additional_needs: val === "Yes" })
              }
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
              Continue to add Availability
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
