"use client";
// S-X-03 — the advanced wizard (04 §3.1 step 3; 04 §6.1): one question per screen, "question n of N" in the h1
// with `aria-current="step"`, focus moving to each new question heading (fix: a11y-17); prefilled from the quick
// match; progressive save through the lead action after every answer (02 §4.7 — a drop is recoverable, ADR-041);
// the T-1.8d landing header "Create your position to connect with nannies" (04 §8, ratified) when a guest
// Connect brought the parent here; on the last answer → S-X-04 with the lead. A failed save never stops the
// wizard: it keeps going in memory and retries at the end; only a failed **final** save shows an error + retry.
//
// `1e` — S-P-04 reuses the same component (04 §6.2 "same question bank as S-X-03"). A signed-in parent has no
// lead to save and does not go to S-X-04: the route passes `onComplete` (the P-2 create action) and the header
// the screen is ratified with, and the last answer goes wherever that action says. Everything else — the
// questions, the progress list, the focus move, the error line — is shared, so the two roads cannot drift.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientResult } from "@/modules/platform";
import type { WizardQuestion } from "../lib/wizard-questions";
import type { WizardAnswers } from "../types";
import type { SaveParentLeadPayload } from "../actions/save-parent-lead-action";
import { FUNNEL_PATHS } from "../lib/funnel-paths";
import { QuestionBody } from "./wizard/QuestionBody";

export type WizardProps = {
  readonly questions: ReadonlyArray<WizardQuestion>;
  readonly ageLabels: ReadonlyArray<string>;
  readonly initialAnswers: WizardAnswers;
  readonly leadId: string;
  readonly source: string | null;
  readonly connectNannyId: string | null;
  readonly saveAction?: (
    payload: SaveParentLeadPayload,
  ) => Promise<ClientResult<void>>;
  /** S-P-04: where the last answer goes instead of S-X-04 — the action answers the destination. */
  readonly onComplete?: (input: {
    readonly answers: WizardAnswers;
  }) => Promise<ClientResult<{ readonly destination: string }>>;
  /** Shown above the questions when the screen is ratified with one (04 §8). */
  readonly header?: string;
  readonly submitLabel?: string;
};

const RATIFIED_T18D_HEADER = "Create your position to connect with nannies";

const answered = (
  question: WizardQuestion,
  answers: WizardAnswers,
): boolean => {
  switch (question.kind) {
    case "children":
      return (
        (answers.children ?? []).length > 0 &&
        (answers.children ?? []).every((child) => child.ageLabel !== "")
      );
    case "area":
      return answers.area !== undefined;
    case "days-times":
      return (
        (answers.days ?? []).length > 0 && (answers.parts ?? []).length > 0
      );
    case "multi":
      return true;
    default:
      return answers[question.id as keyof WizardAnswers] !== undefined;
  }
};

const primary =
  "inline-flex h-12 items-center justify-center rounded-md bg-violet-500 px-6 text-base font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";

export function Wizard({
  questions,
  ageLabels,
  initialAnswers,
  leadId,
  source,
  connectNannyId,
  saveAction,
  onComplete,
  header,
  submitLabel,
}: WizardProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(() =>
    connectNannyId === null
      ? initialAnswers
      : { ...initialAnswers, connectNannyId },
  );
  const [finishing, setFinishing] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  useEffect(() => {
    if (failed) errorRef.current?.focus();
  }, [failed]);

  const question = questions[index];
  const total = questions.length;
  const last = index === total - 1;

  const save = useCallback(
    async (next: WizardAnswers, completed: boolean) =>
      saveAction === undefined
        ? { ok: true as const, value: undefined }
        : saveAction({ leadId, answers: next, source, completed }),
    [leadId, saveAction, source],
  );

  const onChange = (patch: Partial<WizardAnswers>): void => {
    const next = { ...answers, ...patch };
    setAnswers(next);
    void save(next, false);
  };

  const finish = async (): Promise<void> => {
    setFinishing(true);
    setFailed(false);
    const saved = await save(answers, true);
    if (!saved.ok) {
      setFinishing(false);
      setFailed(true);
      return;
    }
    if (onComplete === undefined) {
      router.push(
        `${FUNNEL_PATHS.matches}?${FUNNEL_PATHS.query.lead}=${encodeURIComponent(leadId)}`,
      );
      return;
    }
    const created = await onComplete({ answers });
    if (!created.ok) {
      setFinishing(false);
      setFailed(true);
      return;
    }
    router.push(created.value.destination);
  };

  if (question === undefined) return null;
  const canAdvance = answered(question, answers);

  return (
    <div className="mx-auto max-w-2xl">
      {(header ?? (connectNannyId === null ? null : RATIFIED_T18D_HEADER)) ? (
        <p className="mb-6 rounded-md border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          {header ?? RATIFIED_T18D_HEADER}
        </p>
      ) : null}
      <ol aria-label="Your questions" className="flex flex-wrap gap-1.5">
        {questions.map((entry, at) => (
          <li
            key={entry.id}
            aria-current={at === index ? "step" : undefined}
            className={`h-1.5 w-6 rounded-full ${at <= index ? "bg-violet-500" : "bg-slate-200"}`}
          >
            <span className="sr-only">
              Question {at + 1}
              {at < index ? ", answered" : at === index ? ", current" : ""}
            </span>
          </li>
        ))}
      </ol>
      <h1
        ref={heading}
        tabIndex={-1}
        className="mt-6 text-2xl font-bold text-slate-900 focus:outline-none md:text-3xl"
      >
        <span className="block text-xs font-semibold uppercase [letter-spacing:0.2em] text-violet-500">
          Question {index + 1} of {total}
        </span>
        <span className="mt-2 block">{question.heading}</span>
      </h1>
      {question.help !== undefined ? (
        <p className="mt-2 text-slate-600">{question.help}</p>
      ) : null}
      <div className="mt-6">
        <QuestionBody
          key={question.id}
          question={question}
          ageLabels={ageLabels}
          answers={answers}
          onChange={onChange}
        />
      </div>
      {failed ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          We couldn&apos;t save your answers. Try again in a moment.
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
          className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline disabled:invisible"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() =>
            last ? void finish() : setIndex((current) => current + 1)
          }
          disabled={!canAdvance || finishing}
          className={primary}
        >
          {last
            ? failed
              ? "Try again"
              : (submitLabel ?? "See my matches")
            : "Next"}
        </button>
      </div>
    </div>
  );
}
