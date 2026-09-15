"use client";

import { FileText, Car } from "lucide-react";

interface DocumentTypeSelectorProps {
  selected: string | null;
  onSelect: (type: string) => void;
  disabled?: boolean;
}

export function DocumentTypeSelector({ selected, onSelect, disabled }: DocumentTypeSelectorProps) {
  const options = [
    {
      type: "passport",
      label: "Passport",
      description: "Any valid passport",
      icon: FileText,
    },
    {
      type: "drivers_license",
      label: "Driver's License",
      description: "Australian or international",
      icon: Car,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">
        Select your ID type
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const isSelected = selected === option.type;
          const Icon = option.icon;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => !disabled && onSelect(option.type)}
              disabled={disabled}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                disabled
                  ? "border-slate-200 bg-slate-100 cursor-not-allowed opacity-60"
                  : isSelected
                  ? "border-violet-500 bg-violet-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50 cursor-pointer"
              }`}
            >
              <Icon className={`h-6 w-6 ${isSelected ? "text-violet-600" : "text-slate-400"}`} />
              <span className={`text-sm font-medium ${isSelected ? "text-violet-700" : "text-slate-700"}`}>
                {option.label}
              </span>
              <span className="text-xs text-slate-500">{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
