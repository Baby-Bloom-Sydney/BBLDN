// S-X-01 — the journey in four steps, naming the call (04 §3.1 spine; glossary §8 "introduction call",
// "matchmaker", "meeting"). Guide voice (P-4): the parent is the hero, we do the work.
const STEPS = Object.freeze([
  {
    title: "Tell us what you need",
    body: "Your days, your times, your area and what matters most to your family. A few short questions — nothing to prepare.",
  },
  {
    title: "We match and check",
    body: "We match you with verified nannies near you, then check which of your top nannies are available and keen before anyone calls.",
  },
  {
    title: "Your matchmaker calls",
    body: "At a time you pick, your matchmaker introduces you to your top nannies and helps you choose who to meet.",
  },
  {
    title: "Meet, then hire",
    body: "We arrange the meetings. When you have found your nanny, we confirm the placement — hours, rate and start date — with you both.",
  },
]);

export function HomeSteps() {
  return (
    <section
      aria-labelledby="steps-heading"
      className="border-t border-slate-100 bg-white py-16 md:py-24"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-2xl">
          <div className="mb-6 h-1 w-10 rounded-full bg-violet-500" />
          <h2
            id="steps-heading"
            className="text-3xl font-bold [letter-spacing:-0.025em] text-slate-900 md:text-4xl"
          >
            One journey, and we walk it with you.
          </h2>
        </div>
        <ol className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative pl-12">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700"
              >
                {index + 1}
              </span>
              <h3 className="text-lg font-semibold text-slate-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
