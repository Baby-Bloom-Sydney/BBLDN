// 05 §8.3 — `FAQPage` on S-X-22 with DBS wording; no amount on screen (04 §6.1 S-X-22; P-4, T-1.2). The Sydney
// "how much does a nanny cost" answer is gone: its figures were Sydney's and a London rate band is not grounded
// in any foundation, so no rate FAQ ships until one is (recorded in the L-007 PROGRESS entry).
import { BRAND } from "@/modules/config";

export function servicesFaqJsonLd(serviceAreaName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Are ${BRAND.name} nannies DBS-checked?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes. Every nanny ${BRAND.name} introduces has had her identity checked and holds an Enhanced DBS, and we ask for her right to work in the UK before she can be matched with a family.`,
        },
      },
      {
        "@type": "Question",
        name: "How does the matching work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `You tell us your days, your times, your area and what matters most to your family. ${BRAND.name} matches you with verified nannies near you and checks which of your top nannies are available and keen.`,
        },
      },
      {
        "@type": "Question",
        name: "What happens on the introduction call?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Your matchmaker calls at a time you pick, introduces you to your top nannies and helps you choose who to meet. We arrange the meetings for you.",
        },
      },
      {
        "@type": "Question",
        name: `Which parts of London does ${BRAND.name} cover?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${BRAND.name} covers ${serviceAreaName}. Tell us your area and postcode district and we match you with nannies near you.`,
        },
      },
    ],
  };
}
