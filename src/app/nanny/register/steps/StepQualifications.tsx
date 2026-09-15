"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StepProps } from "../NannyRegistrationFunnel";

const QUALIFICATION_OPTIONS = [
  "Certificate III in Early Childhood Education and Care",
  "Certificate IV in Education Support",
  "Diploma of Early Childhood Education and Care",
  "Bachelor of Early Childhood Education (Or Equivalent)",
  "No Qualifications",
];

const ASSURANCE_OPTIONS = ["National Police Check", "References", "None"];

const CERTIFICATE_OPTIONS = [
  "CPR",
  "First Aid",
  "First Aid in Education & Care Setting",
  "Child Protection",
  "None",
];

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none";

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

export function StepQualifications({ data, updateData, goNext, goBack }: StepProps) {
  const { highest_qualification, assurances = [], certificates = [] } = data;

  const isComplete =
    highest_qualification != null &&
    assurances.length > 0 &&
    certificates.length > 0;

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold text-slate-800">
          Accreditations
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pb-8">

        {/* Highest Qualification */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-slate-700">
            What is your highest childcare related qualification?
          </Label>
          <select
            className={selectClass}
            value={highest_qualification ?? ""}
            onChange={(e) =>
              updateData({ highest_qualification: e.target.value || null })
            }
          >
            <option value="">Select qualification</option>
            {QUALIFICATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Assurances — revealed once Qualification answered */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            highest_qualification != null
              ? "max-h-[500px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              Which preferable assurances can you provide?
            </Label>
            <MultiSelectTags
              options={ASSURANCE_OPTIONS}
              selected={assurances}
              onChange={(val) => updateData({ assurances: val })}
            />
          </div>
        </div>

        {/* Certificates — revealed once Assurances has a selection */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            assurances.length > 0
              ? "max-h-[500px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              Which additional certificates do you currently hold?
            </Label>
            <MultiSelectTags
              options={CERTIFICATE_OPTIONS}
              selected={certificates}
              onChange={(val) => updateData({ certificates: val })}
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
              Continue to add Helpful Information
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
