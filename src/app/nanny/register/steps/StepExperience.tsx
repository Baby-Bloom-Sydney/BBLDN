"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StepProps } from "../NannyRegistrationFunnel";

const EXPERIENCE_OPTIONS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none";

export function StepExperience({ data, updateData, goNext, goBack }: StepProps) {
  const {
    total_experience,
    nanny_experience,
    under_3_experience,
    newborn_experience,
    experience_details,
  } = data;

  const isComplete =
    total_experience != null &&
    nanny_experience != null &&
    under_3_experience != null &&
    newborn_experience != null &&
    experience_details != null &&
    experience_details.trim().length > 0;

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold text-slate-800">
          Childcare Experience
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pb-8">

        {/* Total Experience */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-slate-700">
            How many years have you worked in childcare?
          </Label>
          <select
            className={selectClass}
            value={total_experience ?? ""}
            onChange={(e) =>
              updateData({ total_experience: e.target.value || null })
            }
          >
            <option value="">Select years</option>
            {EXPERIENCE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Nanny Experience — revealed once Total Experience answered */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            total_experience != null
              ? "max-h-[200px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              How many years have you worked as a nanny?
            </Label>
            <select
              className={selectClass}
              value={nanny_experience ?? ""}
              onChange={(e) =>
                updateData({ nanny_experience: e.target.value || null })
              }
            >
              <option value="">Select years</option>
              {EXPERIENCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Under 3 Experience — revealed once Nanny Experience answered */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            nanny_experience != null
              ? "max-h-[200px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              How many years of experience do you have working with children under 3 years old?
            </Label>
            <select
              className={selectClass}
              value={under_3_experience ?? ""}
              onChange={(e) =>
                updateData({ under_3_experience: e.target.value || null })
              }
            >
              <option value="">Select years</option>
              {EXPERIENCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Newborn Experience — revealed once Under 3 answered */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            under_3_experience != null
              ? "max-h-[200px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              How many years of experience do you have working with newborns?
            </Label>
            <select
              className={selectClass}
              value={newborn_experience ?? ""}
              onChange={(e) =>
                updateData({ newborn_experience: e.target.value || null })
              }
            >
              <option value="">Select years</option>
              {EXPERIENCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Experience Details — revealed once Newborn answered */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            newborn_experience != null
              ? "max-h-[500px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              Briefly describe your childcare experience, including key roles and positions held
            </Label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none min-h-[120px] resize-y"
              value={experience_details ?? ""}
              placeholder="Eg: Creche Worker, Early Childhood Educator, Primary School Teacher, Pediatric Nurse, Etc..."
              onChange={(e) =>
                updateData({ experience_details: e.target.value || null })
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
              Continue
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
