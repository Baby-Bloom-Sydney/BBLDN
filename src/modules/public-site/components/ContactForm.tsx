"use client";
// S-X-23 — the contact form (04 §6.1: form · sent). `useFormState` is the React 18 / Next 14 pairing
// (ADR-104 pins the current major). The action is a prop so this client bundle never reaches the connector
// barrel; the failure state names the support mailbox (config, via the route) rather than a dead end.
import { useFormState, useFormStatus } from "react-dom";
import type { ContactFormProps } from "../types";

const field =
  "mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30";

export function ContactForm({ action, supportEmail }: ContactFormProps) {
  const [state, formAction] = useFormState(action, null);
  const failed = state !== null && !state.ok;
  const sent = state !== null && state.ok;

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-xl border border-green-200 bg-green-50 p-6 text-green-900"
      >
        <h2 className="text-lg font-semibold">Thank you — we have it.</h2>
        <p className="mt-2 text-sm leading-relaxed">
          We reply within one working day, London time.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-slate-900">
            Your name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={80}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium text-slate-900">
            Email to reply to
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            className={field}
          />
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-slate-900">I am a</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
          {(
            [
              ["parent", "Parent"],
              ["nanny", "Nanny"],
              ["other", "Something else"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="role"
                value={value}
                defaultChecked={value === "parent"}
                className="h-4 w-4 accent-violet-500"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor="message" className="text-sm font-medium text-slate-900">
          How can we help?
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          className={field}
          {...(failed ? { "aria-invalid": true } : {})}
        />
      </div>

      <div aria-live="polite" className="mt-4">
        {failed ? (
          <p role="alert" className="text-sm text-red-700">
            {state.error.message}{" "}
            <span className="text-slate-600">
              If it keeps happening, email us at{" "}
              <a
                href={`mailto:${supportEmail}`}
                className="font-medium underline"
              >
                {supportEmail}
              </a>
              .
            </span>
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-violet-500 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send message"}
    </button>
  );
}
