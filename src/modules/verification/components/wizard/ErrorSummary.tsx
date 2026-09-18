"use client";
// 04 §6.1 — a failed submit is assertive and moves focus to the error summary (fix: a11y-13 / a11y-16). The
// sentence is the action's, never rewritten here.
import { useEffect, useRef } from "react";

export function ErrorSummary({ message }: { readonly message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message !== null) ref.current?.focus();
  }, [message]);
  if (message === null) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-live="assertive"
      className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </div>
  );
}
