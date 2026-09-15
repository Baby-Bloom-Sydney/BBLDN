"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DocumentTypeSelector } from "./sections/DocumentTypeSelector";
import { ParentIdentitySection } from "./sections/ParentIdentitySection";
import { ParentContactSection } from "./sections/ParentContactSection";
import { SectionStatusBadge } from "@/app/nanny/verification/sections/SectionStatusBadge";
import { Shield, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { ParentVerificationData } from "@/types/parent";
import type { UserGuidance } from "@/lib/verification";

interface ParentVerificationPageClientProps {
  initialData: ParentVerificationData | null;
}

type PollResponse = {
  identity_status: string;
  identity_verified: boolean;
  identity_rejection_reason: string | null;
  identity_user_guidance: UserGuidance | null;
  surname: string | null;
  given_names: string | null;
  date_of_birth: string | null;
  document_type: string | null;
  issuing_country: string | null;
  selfie_confidence: number | null;
  extracted_surname: string | null;
  extracted_given_names: string | null;
  extracted_dob: string | null;
  extracted_nationality: string | null;
  extracted_passport_number: string | null;
  extracted_passport_expiry: string | null;
  extracted_license_number: string | null;
  extracted_license_expiry: string | null;
  extracted_license_state: string | null;
  extracted_license_class: string | null;
  contact_status: string;
  cross_check_status: string;
  cross_check_reasoning: string | null;
  status: number;
};

type StepState = "completed" | "current" | "future";

function stepLineColor(step: StepState): string {
  return step === "completed" ? "bg-green-300" : step === "current" ? "bg-violet-200" : "bg-slate-200";
}

function StepIndicator({ state, isFirst, isLast, topLineColor }: {
  state: StepState;
  isFirst?: boolean;
  isLast?: boolean;
  topLineColor?: string;
}) {
  const isCompleted = state === "completed";
  const isCurrent = state === "current";

  return (
    <div className="flex w-7 shrink-0 flex-col items-center">
      <div className={`w-0.5 h-3.5 ${!isFirst && topLineColor ? topLineColor : "bg-transparent"}`} />
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
          isCompleted
            ? "border-green-500 bg-green-500"
            : isCurrent
            ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200"
            : "border-slate-200 bg-white"
        }`}
      >
        {isCompleted && <Check className="h-4 w-4 text-white" />}
        {isCurrent && <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />}
      </div>
      {!isLast && <div className={`w-0.5 flex-1 ${stepLineColor(state)}`} />}
    </div>
  );
}

export function ParentVerificationPageClient({ initialData }: ParentVerificationPageClientProps) {
  const [verification, setVerification] = useState<ParentVerificationData | null>(initialData);
  const [documentType, setDocumentType] = useState<string | null>(initialData?.document_type ?? null);

  // Determine section statuses
  const identityStatus = verification?.identity_status ?? "not_started";
  const contactStatus = verification?.contact_status ?? "not_started";
  const crossCheckStatus = verification?.cross_check_status ?? "not_started";

  const identityInReview = identityStatus === "review";
  const contactLocked = identityStatus === "not_started";

  // Determine which sections to open by default
  const getDefaultOpen = useCallback((): string[] => {
    if (identityStatus === "not_started") return ["identity"];
    if (identityInReview) return ["identity"];
    if (contactStatus === "not_started" && !contactLocked) return ["contact"];
    if (identityStatus === "processing") return ["identity"];
    if (["failed", "rejected"].includes(identityStatus)) return ["identity"];
    return ["identity"];
  }, [identityStatus, contactStatus, contactLocked, identityInReview]);

  const [openSections, setOpenSections] = useState<string[]>(getDefaultOpen());

  // Poll for status updates when identity is processing or pending
  const isProcessing =
    identityStatus === "processing" || identityStatus === "pending";

  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/parent-verification-status");
        if (!res.ok) return;
        const data: PollResponse = await res.json();

        setVerification((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            identity_status: data.identity_status,
            identity_verified: data.identity_verified,
            identity_rejection_reason: data.identity_rejection_reason,
            identity_user_guidance: data.identity_user_guidance,
            surname: data.surname ?? prev.surname,
            given_names: data.given_names ?? prev.given_names,
            date_of_birth: data.date_of_birth ?? prev.date_of_birth,
            document_type: data.document_type ?? prev.document_type,
            selfie_confidence: data.selfie_confidence ?? prev.selfie_confidence,
            extracted_surname: data.extracted_surname ?? prev.extracted_surname,
            extracted_given_names: data.extracted_given_names ?? prev.extracted_given_names,
            extracted_dob: data.extracted_dob ?? prev.extracted_dob,
            extracted_nationality: data.extracted_nationality ?? prev.extracted_nationality,
            extracted_passport_number: data.extracted_passport_number ?? prev.extracted_passport_number,
            extracted_passport_expiry: data.extracted_passport_expiry ?? prev.extracted_passport_expiry,
            extracted_license_number: data.extracted_license_number ?? prev.extracted_license_number,
            extracted_license_expiry: data.extracted_license_expiry ?? prev.extracted_license_expiry,
            extracted_license_state: data.extracted_license_state ?? prev.extracted_license_state,
            extracted_license_class: data.extracted_license_class ?? prev.extracted_license_class,
            contact_status: data.contact_status,
            cross_check_status: data.cross_check_status,
            cross_check_reasoning: data.cross_check_reasoning,
            verification_status: data.status ?? prev.verification_status,
          };
        });
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isProcessing]);

  const handleDocumentTypeSelect = (type: string) => {
    setDocumentType(type);
  };

  const handleIdentitySaved = (verificationId: string, data: { surname: string; givenNames: string; dob: string }) => {
    setVerification((prev) => {
      if (prev) {
        return { ...prev, identity_status: "processing", identity_user_guidance: null, surname: data.surname, given_names: data.givenNames, date_of_birth: data.dob };
      }
      // First save — create minimal verification data
      return {
        id: verificationId,
        document_type: documentType,
        issuing_country: null,
        identity_status: "processing",
        contact_status: "not_started",
        cross_check_status: "not_started",
        verification_status: 10,
        identity_verified: false,
        identity_rejection_reason: null,
        identity_user_guidance: null,
        selfie_confidence: null,
        extracted_surname: null,
        extracted_given_names: null,
        extracted_dob: null,
        extracted_nationality: null,
        extracted_passport_number: null,
        extracted_passport_expiry: null,
        extracted_license_number: null,
        extracted_license_expiry: null,
        extracted_license_state: null,
        extracted_license_class: null,
        phone_number: null,
        address_line: null,
        city: null,
        state: null,
        postcode: null,
        country: null,
        cross_check_reasoning: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        surname: data.surname,
        given_names: data.givenNames,
        date_of_birth: data.dob,
        document_upload_url: null,
        identification_photo_url: null,
      } as ParentVerificationData;
    });
    setOpenSections(["contact"]);
  };

  const handleManualReview = () => {
    setVerification((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        identity_status: "review",
        identity_user_guidance: null,
        cross_check_status: "not_started",
        cross_check_reasoning: null,
      };
    });
    setOpenSections(["identity"]);
  };

  const handleContactSaved = () => {
    setVerification((prev) => {
      if (!prev) return prev;
      return { ...prev, contact_status: "saved" };
    });
    setOpenSections([]);
  };

  const getBadgeStatus = (sectionStatus: string) => {
    switch (sectionStatus) {
      case "not_started": return null;
      case "pending": return "processing" as const;
      case "processing": return "processing" as const;
      case "verified": case "passed": return "verified" as const;
      case "saved": return "verified" as const;
      case "review": return "review" as const;
      case "rejected": return "rejected" as const;
      case "failed": return "failed" as const;
      default: return null;
    }
  };

  const allVerified =
    identityStatus === "verified" &&
    contactStatus === "saved" &&
    (crossCheckStatus === "passed" || crossCheckStatus === "not_started");

  // Stepper states
  const identityStep: StepState = identityStatus === "verified" ? "completed" : "current";
  const contactStep: StepState = contactStatus === "saved" ? "completed" : contactLocked ? "future" : "current";
  const goalStep: StepState = allVerified ? "completed" : "future";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Verification</h1>
        {allVerified ? (
          <p className="text-sm text-green-600 mt-1 font-medium flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Your account is fully verified!
          </p>
        ) : (
          <p className="text-sm text-slate-500 mt-1">
            For the protection of our families and childcare professionals, all users must complete the same gold-standard verification before we will connect them with each other.
          </p>
        )}
      </div>

      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        {/* Step 1: Verify ID */}
        <div className="flex gap-3">
          <StepIndicator state={identityStep} isFirst />
          <div className="flex-1 pb-3">
            <AccordionItem value="identity" className="border-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-slate-800">Verify ID</span>
                  {getBadgeStatus(identityStatus) && (
                    <SectionStatusBadge
                      status={getBadgeStatus(identityStatus)!}
                      customLabel={identityInReview ? "Pending review" : undefined}
                    />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <div className="space-y-6">
                  {identityStatus !== "verified" && (
                    <DocumentTypeSelector
                      selected={documentType}
                      onSelect={handleDocumentTypeSelect}
                      disabled={identityStatus !== "not_started" && identityStatus !== "failed" && identityStatus !== "rejected"}
                    />
                  )}
                  {documentType && (
                    <ParentIdentitySection
                      verification={verification}
                      documentType={documentType}
                      onSaved={handleIdentitySaved}
                      onManualReview={handleManualReview}
                    />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 2: Contact Information */}
        <div className="flex gap-3">
          <StepIndicator state={contactStep} topLineColor={stepLineColor(identityStep)} />
          <div className="flex-1 pb-3">
            <AccordionItem value="contact" className="border-0" disabled={contactLocked}>
              <AccordionTrigger className="hover:no-underline" disabled={contactLocked}>
                <div className="flex items-center gap-3">
                  <span className={`text-base font-semibold ${contactLocked ? "text-slate-400" : "text-slate-800"}`}>
                    Verify Contact Information
                  </span>
                  {!contactLocked && getBadgeStatus(contactStatus) && (
                    <SectionStatusBadge status={getBadgeStatus(contactStatus)!} />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <ParentContactSection
                  verification={verification}
                  locked={contactLocked}
                  onSaved={handleContactSaved}
                />
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 3: Find Childcare Professional (goal step — no accordion) */}
        <div className="flex gap-3">
          <StepIndicator state={goalStep} isLast topLineColor={stepLineColor(contactStep)} />
          <div className="py-4">
            <span className={`text-base font-semibold ${allVerified ? "text-green-700" : "text-slate-300"}`}>
              Find Childcare Professional
            </span>
          </div>
        </div>
      </Accordion>

      {allVerified && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild className="bg-violet-600 hover:bg-violet-700 text-white">
            <Link href="/parent/browse">Find a Nanny</Link>
          </Button>
          <Button asChild variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50">
            <Link href="/parent/babysitting">Find a Babysitter</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
