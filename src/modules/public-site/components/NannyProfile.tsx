// S-X-11 — the public nanny profile (04 §6.1; `01.18` / `02.14`; 04 §3.1 step 7): first name, area label, the DBS
// badge, bio, experience, qualification, certificates, languages, the practical facts, the weekly availability
// grid. Guest CTAs per T-1.8b/d: "Sign up to see availability" → S-X-06, Connect → the one entry point (a guest
// lands on S-X-03); a signed-in parent's Connect goes to S-P-07 through the same entry point. No rate on screen.
import Image from "next/image";
import Link from "next/link";
import { formatAreaLabel } from "@/modules/areas";
import { DbsBadge, FUNNEL_PATHS } from "@/modules/matching";
import type { NannyProfileProps } from "../types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const PARTS = ["morning", "midday", "afternoon", "evening"] as const;

const primary =
  "inline-flex h-11 items-center justify-center rounded-md bg-violet-500 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";
const secondary =
  "inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";

function Fact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}) {
  if (value === null) return null;
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3">
      <dt className="text-xs uppercase [letter-spacing:0.15em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function NannyProfile({
  nanny,
  viewer,
  connectAction,
  leadId,
  src,
}: NannyProfileProps) {
  const has = new Set(
    nanny.availability.map((block) => `${block.day}:${block.part}`),
  );
  const signupQuery = new URLSearchParams();
  if (src !== null) signupQuery.set(FUNNEL_PATHS.query.src, src);
  const signupHref = `${FUNNEL_PATHS.signup}${signupQuery.size > 0 ? `?${signupQuery}` : ""}`;
  return (
    <article
      aria-labelledby="profile-heading"
      className="container mx-auto px-4 py-12 md:px-6 md:py-16"
    >
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <div className="flex items-center gap-5">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white bg-violet-50 shadow-md">
              {nanny.photoUrl !== null ? (
                <Image
                  src={nanny.photoUrl}
                  alt=""
                  width={96}
                  height={96}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-full w-full items-center justify-center text-3xl font-bold text-violet-300"
                >
                  {nanny.firstName.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <h1
                id="profile-heading"
                className="text-3xl font-bold text-slate-900"
              >
                {nanny.firstName}
              </h1>
              <p className="mt-1 text-slate-500">
                {formatAreaLabel({
                  name: nanny.area.area,
                  district: nanny.area.district,
                })}
              </p>
              <div className="mt-2">
                <DbsBadge level={nanny.verificationLevel} />
              </div>
            </div>
          </div>
          {nanny.bio !== null ? (
            <section aria-labelledby="about-heading" className="mt-8">
              <h2
                id="about-heading"
                className="text-lg font-semibold text-slate-900"
              >
                About {nanny.firstName}
              </h2>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-600">
                {nanny.bio}
              </p>
            </section>
          ) : null}
          <section aria-labelledby="facts-heading" className="mt-8">
            <h2
              id="facts-heading"
              className="text-lg font-semibold text-slate-900"
            >
              At a glance
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Fact
                label="Experience"
                value={
                  nanny.yearsExperience === null
                    ? null
                    : `${nanny.yearsExperience} ${nanny.yearsExperience === 1 ? "year" : "years"}`
                }
              />
              <Fact label="Qualification" value={nanny.qualification} />
              <Fact
                label="Certificates"
                value={
                  nanny.certificates.length > 0
                    ? nanny.certificates.join(", ")
                    : null
                }
              />
              <Fact
                label="Languages"
                value={
                  nanny.languages.length > 0 ? nanny.languages.join(", ") : null
                }
              />
              <Fact
                label="Driving"
                value={
                  nanny.hasDrivingLicence
                    ? nanny.hasCar
                      ? "Licence and own car"
                      : "Licence"
                    : null
                }
              />
              <Fact
                label="Non-smoker"
                value={nanny.isNonSmoker === true ? "Yes" : null}
              />
              <Fact
                label="Comfortable with pets"
                value={nanny.comfortableWithPets === true ? "Yes" : null}
              />
            </dl>
          </section>
          <section aria-labelledby="availability-heading" className="mt-8">
            <h2
              id="availability-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Availability
            </h2>
            {viewer === "guest" ? (
              <p className="mt-2 text-slate-600">
                <Link
                  href={signupHref}
                  className="font-medium text-violet-600 underline-offset-4 hover:underline"
                >
                  Sign up to see availability
                </Link>
              </p>
            ) : (
              <table className="mt-3 w-full border-collapse text-sm">
                <caption className="sr-only">
                  Days and times {nanny.firstName} is available
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="sr-only">
                      Time
                    </th>
                    {DAYS.map((day) => (
                      <th
                        key={day}
                        scope="col"
                        className="px-2 py-1 text-center font-medium text-slate-500"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PARTS.map((part) => (
                    <tr key={part}>
                      <th
                        scope="row"
                        className="py-1 pr-2 text-left font-medium capitalize text-slate-500"
                      >
                        {part}
                      </th>
                      {DAYS.map((_, day) => {
                        const available = has.has(`${day}:${part}`);
                        return (
                          <td key={day} className="px-2 py-1 text-center">
                            <span
                              className={
                                available ? "text-green-700" : "text-slate-300"
                              }
                            >
                              {available ? "✓" : "–"}
                            </span>
                            <span className="sr-only">
                              {available ? "available" : "not available"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
        <aside
          aria-label="Next step"
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Meet {nanny.firstName}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Tell us about your family and your matchmaker will call to
              introduce you — and check that {nanny.firstName} is available and
              keen before you speak.
            </p>
            <form action={connectAction} className="mt-5">
              <input type="hidden" name="nannyId" value={nanny.nannyId} />
              <input type="hidden" name="surface" value="browse" />
              {leadId !== null ? (
                <input type="hidden" name="leadId" value={leadId} />
              ) : null}
              <button type="submit" className={`${primary} w-full`}>
                Connect with {nanny.firstName}
              </button>
            </form>
            {viewer === "guest" ? (
              <Link href={signupHref} className={`${secondary} mt-3 w-full`}>
                Sign up
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </article>
  );
}
