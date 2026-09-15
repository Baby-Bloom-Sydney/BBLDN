"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepProps } from "../NannyRegistrationFunnel";

const LANGUAGE_OPTIONS = ["English", "Foreign Language", "Multiple"];

function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function MultiSelectTags({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
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

function YesNoTags({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {["Yes", "No"].map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt === "Yes")}
          className={`px-4 py-2 rounded-full border text-sm font-medium cursor-pointer transition-colors ${
            value === (opt === "Yes")
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

function Reveal({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`transition-all duration-300 ease-in-out overflow-hidden ${
        show ? "max-h-[500px] opacity-100 mt-6" : "max-h-0 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

export function StepHelpfulInfo({ data, updateData, goNext, goBack }: StepProps) {
  const languages: string[] = data.languages ?? [];
  const dob = data.date_of_birth ?? null;

  // Age calculation
  const age = dob ? calculateAge(dob) : null;
  const isUnder18 = dob !== null && age !== null && age < 18;

  // Progressive reveal conditions
  const showLanguages = !isUnder18; // show if DOB entered and 18+, or not entered (optional)
  const showOtherLanguages =
    languages.includes("Multiple") || languages.includes("Foreign Language");
  // Show drivers license if: English in languages, or other languages field has text, or any language selected
  // Per spec: show if "Language includes English OR Other Languages field has text"
  const _showDriversLicenseDeprecated =
    languages.includes("English") ||
    (data.other_languages !== null &&
      data.other_languages !== undefined &&
      data.other_languages.trim() !== "") ||
    (languages.length > 0 &&
      !languages.includes("Multiple") &&
      !languages.includes("Foreign Language"));
  void _showDriversLicenseDeprecated;
  // But we also need to show it if someone selected a language and it's not Multiple/Foreign (edge case)
  // Simplified: show if languages has been answered (any selection) AND (includes English OR other lang filled OR only non-English/multiple)
  // Per spec exactly: show if "Language includes English OR Other Languages field has text"
  // But what if user picks only Foreign Language without filling other_languages?
  // Let's interpret: show after languages is answered, gated on the conditions
  const showDrivers =
    showLanguages &&
    (languages.includes("English") ||
      (showOtherLanguages &&
        !!data.other_languages &&
        data.other_languages.trim() !== "") ||
      (!showOtherLanguages && languages.length > 0));

  const showCar =
    showDrivers && data.drivers_license === true;
  const showPets =
    showDrivers && (data.drivers_license === false || data.has_car !== null);
  const showVaccination = showPets && data.comfortable_with_pets !== null;
  const showNonSmoker = showVaccination && data.vaccination_status !== null;

  const canContinue = showNonSmoker && data.non_smoker !== null && !isUnder18;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-slate-800">
          Helpful Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Date of Birth */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">
            What is your date of birth?
          </p>
          <Input
            type="date"
            max={todayString()}
            value={dob ?? ""}
            onChange={(e) =>
              updateData({ date_of_birth: e.target.value || null })
            }
            className="max-w-xs"
          />
        </div>

        {/* Under-18 warning — stops all reveal */}
        {isUnder18 && (
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li className="text-sm text-slate-600 italic">
              You must be at least 18 years old to nanny with us
            </li>
          </ul>
        )}

        {/* Languages — revealed if 18+ or DOB not entered */}
        <Reveal show={showLanguages}>
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">
              What languages do you speak?
            </p>
            <MultiSelectTags
              options={LANGUAGE_OPTIONS}
              selected={languages}
              onChange={(val) => updateData({ languages: val })}
            />
          </div>

          {/* Other Languages — revealed if Multiple or Foreign Language selected */}
          <Reveal show={showOtherLanguages}>
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                Please specify which other languages you speak
              </p>
              <Input
                type="text"
                placeholder="e.g. French, Mandarin"
                value={data.other_languages ?? ""}
                onChange={(e) =>
                  updateData({ other_languages: e.target.value || null })
                }
              />
            </div>
          </Reveal>

          {/* Drivers License */}
          <Reveal show={showDrivers}>
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                Do you have a valid driver&apos;s license?
              </p>
              <YesNoTags
                value={data.drivers_license ?? null}
                onChange={(val) => updateData({ drivers_license: val })}
              />
            </div>

            {/* Car — revealed if license = Yes */}
            <Reveal show={showCar}>
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">
                  Do you have access to a car?
                </p>
                <YesNoTags
                  value={data.has_car ?? null}
                  onChange={(val) => updateData({ has_car: val })}
                />
              </div>
            </Reveal>

            {/* Pets — revealed if license = No OR car answered */}
            <Reveal show={showPets}>
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">
                  Are you comfortable working with a family that has pets?
                </p>
                <YesNoTags
                  value={data.comfortable_with_pets ?? null}
                  onChange={(val) => updateData({ comfortable_with_pets: val })}
                />
              </div>

              {/* Vaccination */}
              <Reveal show={showVaccination}>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    Are you fully vaccinated?
                  </p>
                  <YesNoTags
                    value={data.vaccination_status ?? null}
                    onChange={(val) => updateData({ vaccination_status: val })}
                  />
                </div>

                {/* Non-Smoker */}
                <Reveal show={showNonSmoker}>
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">
                      Are you a non-smoker?
                    </p>
                    <YesNoTags
                      value={data.non_smoker ?? null}
                      onChange={(val) => updateData({ non_smoker: val })}
                    />
                  </div>
                </Reveal>
              </Reveal>
            </Reveal>
          </Reveal>
        </Reveal>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={goBack} className="flex-1">
            Back
          </Button>
          {canContinue && (
            <Button
              type="button"
              onClick={goNext}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
            >
              Continue to add Residency Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
