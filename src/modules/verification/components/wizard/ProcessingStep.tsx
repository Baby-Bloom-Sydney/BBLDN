"use client";
// S-N-08 — processing (04 §4.1 row 13; 04 §6.3): `aria-busy`, the poll, a polite "still checking" line at most
// once a minute, no spinner under reduced motion, error + retry when the poll fails; done → the status page after
// the configured pause (with `stub-manual` every section lands in review, so the status page is where she goes).
import { useEffect, useRef, useState } from "react";
import type {
  ProcessAction,
  VerificationState,
  WizardOptions,
} from "../../types";
import { FIELD_STYLES } from "./field-styles";

const OPEN = new Set(["pending", "processing"]);

export function ProcessingStep({
  action,
  options,
  onDone,
}: {
  readonly action: ProcessAction;
  readonly options: WizardOptions;
  readonly onDone: (state: VerificationState) => void;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [stillChecking, setStillChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(Date.now());
  const lastLine = useRef(0);
  // the latest props without making them dependencies: one poll loop per attempt, restarted only by "Try again"
  const latest = useRef({ action, options, onDone });
  latest.current = { action, options, onDone };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async (): Promise<void> => {
      const { action, options, onDone } = latest.current;
      const result = await action();
      if (cancelled) return;
      if (!result.ok) {
        setFailed(result.error.message);
        return;
      }
      const open = result.value.sections.some((section) =>
        OPEN.has(section.status),
      );
      if (!open) {
        timer = setTimeout(() => onDone(result.value), options.routeAfterMs);
        return;
      }
      if (
        Date.now() - lastLine.current >= options.stillCheckingEveryMs &&
        Date.now() - started.current >= options.stillCheckingEveryMs
      ) {
        lastLine.current = Date.now();
        setStillChecking(true);
      }
      timer = setTimeout(poll, options.pollMs);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [attempt]);

  return (
    <div className="space-y-4" aria-busy={failed === null}>
      <p className="text-sm text-slate-700">Checking your documents…</p>
      <div className="motion-reduce:hidden h-1 w-full overflow-hidden rounded bg-slate-100">
        <div className="h-1 w-1/3 animate-pulse rounded bg-violet-400" />
      </div>
      <p role="status" aria-live="polite" className={FIELD_STYLES.hint}>
        {stillChecking ? "Still checking — this can take a moment." : ""}
      </p>
      {failed !== null && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {failed}
          <div className="mt-2">
            <button
              type="button"
              className={FIELD_STYLES.secondary}
              onClick={() => {
                setFailed(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
