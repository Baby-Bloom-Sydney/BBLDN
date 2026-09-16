// S-X-23 — Contact (04 §6.1: London domain from config; London time; London address line). The postal
// address waits on the registered-office value (B-35) and is not invented; "London" is what we can say.
import { BRAND } from "@/modules/config";
import type { ContactFormProps } from "../types";
import { ContactForm } from "./ContactForm";

export function ContactContent({ action, supportEmail }: ContactFormProps) {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold [letter-spacing:-0.025em] text-slate-900 md:text-4xl">
          Contact us
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Questions about {BRAND.name}, your account or a nanny? Send us a
          message — we reply within one working day.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase [letter-spacing:0.025em] text-slate-400">
              Email
            </p>
            <a
              href={`mailto:${supportEmail}`}
              className="mt-1 block break-all text-sm font-medium text-slate-900 hover:text-violet-700"
            >
              {supportEmail}
            </a>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase [letter-spacing:0.025em] text-slate-400">
              Reply time
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              Within one working day
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Monday to Friday, London time
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase [letter-spacing:0.025em] text-slate-400">
              Based in
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">London</p>
          </div>
        </aside>

        <ContactForm action={action} supportEmail={supportEmail} />
      </div>
    </div>
  );
}
