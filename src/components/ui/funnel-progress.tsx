"use client";

interface Step {
  id: string;
  label: string;
}

interface FunnelProgressProps {
  currentStep: number;
  steps: Step[];
}

export function FunnelProgress({ currentStep, steps }: FunnelProgressProps) {
  return (
    <div className="mb-8">
      {/* Desktop */}
      <div className="hidden sm:flex items-center justify-center gap-2">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  i < currentStep
                    ? "bg-violet-600 text-white"
                    : i === currentStep
                    ? "bg-violet-100 text-violet-700 ring-2 ring-violet-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {i < currentStep ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  i <= currentStep ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-8 ${
                  i < currentStep ? "bg-violet-600" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Mobile */}
      <div className="flex sm:hidden items-center justify-between px-2">
        <span className="text-sm font-medium text-slate-700">
          Step {currentStep + 1} of {steps.length}
        </span>
        <span className="text-sm text-slate-500">{steps[currentStep]?.label}</span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-600 transition-all duration-300"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
