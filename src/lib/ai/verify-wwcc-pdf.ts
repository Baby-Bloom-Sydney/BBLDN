/**
 * Systematic WWCC grant email PDF parser.
 *
 * Extracts text from a Gmail-printed PDF of an OCG (Office of the Children's Guardian)
 * WWCC grant notification email, validates authenticity markers, extracts table fields,
 * and compares against submitted data. No AI required.
 *
 * Template structure (as extracted by pdf-parse):
 *   - Gmail header with sender WWCCNotification@ocg.nsw.gov.au
 *   - "To: <recipient_email>"
 *   - "You have been granted a Working with Children Check clearance (Employee/Volunteer)"
 *   - "Working With Children Check Number: WWC<7 digits><1 letter>"
 *   - Table (label on one line, value on next):
 *       Surname / First Name / Other Name / WWC Number / Type of Clearance / Expiry Date
 *   - Sign-off: Steve Gholab, Director, Working With Children Check, Office of the Children's Guardian
 *   - Footer: "The Office of the Children's Guardian is an independent statutory authority..."
 */

// Import inner module directly to avoid pdf-parse/index.js trying to readFileSync a test PDF at import time
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse/lib/pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import type { WWCCVerificationResult } from './verify-wwcc';

// Re-export compatible result type with added recipient_email
export interface WWCCPdfResult extends Omit<WWCCVerificationResult, 'extracted'> {
  extracted: WWCCVerificationResult['extracted'] & {
    recipient_email: string | null;
  };
  /**
   * True when the parser couldn't read the document at all (parsing error,
   * unrecognised template, missing critical fields). The pipeline should
   * fall back to AI vision rather than treating this as a real verification fail.
   *
   * False when the parser read the document fine but the data didn't match
   * (name mismatch, expired, etc.) — this is a genuine verification failure.
   */
  needsAIFallback: boolean;
}

// ── Authenticity markers ──
// Each must be present in a genuine OCG grant email PDF

const AUTHENTICITY_MARKERS = [
  { pattern: /WWCCNotification@ocg\.nsw\.gov\.au/i, label: 'OCG sender email (WWCCNotification@ocg.nsw.gov.au)' },
  { pattern: /Information Regarding your Working With Children Check/i, label: 'Email subject line' },
  { pattern: /You have been granted a Working with Children Check clearance/i, label: 'Grant confirmation heading' },
  { pattern: /Office of the Children's Guardian/i, label: 'OCG organisation name' },
  { pattern: /You have been cleared to work with children/i, label: 'Clearance confirmation text' },
  { pattern: /Your details are:/i, label: 'Details table header' },
  { pattern: /Yours sincerely/, label: 'Formal sign-off' },
  { pattern: /Director\nWorking With Children Check/i, label: 'Director title block' },
  { pattern: /The Office of the Children's Guardian is an independent statutory authority/i, label: 'OCG footer statement' },
];

const MIN_MARKERS = 6; // out of 9 — allow some tolerance for PDF rendering quirks

const WWCC_NUMBER_REGEX = /^WWC\d{7}[A-Z]$/;

// ── Main parser ──

export async function verifyWWCCPdf(
  pdfBuffer: Buffer,
  submittedData: {
    surname: string;
    given_names: string;
    wwcc_number: string;
  }
): Promise<WWCCPdfResult> {
  const issues: string[] = [];

  try {
    const data = await pdf(pdfBuffer);
    const text = data.text;

    // ── 1. AUTHENTICITY CHECKS ──

    let markersFound = 0;
    const missingMarkers: string[] = [];

    for (const marker of AUTHENTICITY_MARKERS) {
      if (marker.pattern.test(text)) {
        markersFound++;
      } else {
        missingMarkers.push(marker.label);
      }
    }

    if (markersFound < MIN_MARKERS) {
      return {
        pass: false,
        needsAIFallback: true, // template may have changed — let AI try
        extracted: emptyExtracted(),
        reasoning: [
          `Authenticity: ${markersFound}/${AUTHENTICITY_MARKERS.length} markers found`,
          `Missing: ${missingMarkers.join(', ')}`,
        ].join('\n'),
        issues: [...missingMarkers.map(m => `Missing marker: ${m}`), 'Document does not appear to be a genuine OCG grant email'],
      };
    }

    // ── 2. EXTRACT TABLE FIELDS ──
    // In the PDF text, the table renders as:
    //   Surname\n
    //   WRIGHT\n
    //   First Name\n
    //   Bailey\n
    //   ...

    const surname = extractTableField(text, 'Surname');
    const firstName = extractTableField(text, 'First Name');
    const otherName = extractTableField(text, 'Other Name');
    const wwccNumber = extractTableField(text, 'WWC Number');
    const clearanceType = extractTableField(text, 'Type of Clearance');
    const expiryRaw = extractTableField(text, 'Expiry Date');

    // Also extract from the header line as a backup/cross-check
    const headerWwcc = text.match(/Working With Children Check Number:\s*(WWC\d{7}[A-Z])/)?.[1] ?? null;

    // Extract recipient email — the "To:" line right after the OCG sender
    const recipientEmail = text.match(/WWCCNotification@ocg\.nsw\.gov\.au[^\n]*\nTo:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)?.[1] ?? null;

    // Use table WWCC number, fallback to header
    const finalWwcc = wwccNumber || headerWwcc;

    // Convert DD/MM/YYYY to YYYY-MM-DD
    let expiryIso: string | null = null;
    if (expiryRaw) {
      const parts = expiryRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (parts) {
        expiryIso = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }

    // Cross-check: header WWCC number should match table WWCC number
    if (headerWwcc && wwccNumber && headerWwcc !== wwccNumber) {
      issues.push(`WWCC number inconsistency: header says "${headerWwcc}" but table says "${wwccNumber}"`);
    }

    // ── 3. VALIDATE AGAINST SUBMITTED DATA ──

    // Surname — case-insensitive comparison (skip if submitted name is empty/missing)
    if (surname) {
      if (submittedData.surname?.trim()) {
        if (surname.toLowerCase().trim() !== submittedData.surname.toLowerCase().trim()) {
          issues.push(`Surname mismatch: document "${surname}" vs submitted "${submittedData.surname}"`);
        }
      }
    } else if (submittedData.surname?.trim()) {
      issues.push('Could not extract surname from document');
    }

    // First name — lenient: check submitted first name appears in extracted names (skip if empty)
    const submittedFirstTokens = submittedData.given_names?.trim()
      ? submittedData.given_names.toLowerCase().trim().split(/\s+/).filter(Boolean)
      : [];
    const extractedNameParts = [firstName, otherName].filter(Boolean).join(' ').toLowerCase().trim().split(/\s+/).filter(Boolean);

    if (extractedNameParts.length > 0 && submittedFirstTokens.length > 0) {
      const firstNameMatch = submittedFirstTokens[0] && extractedNameParts.some(p => p === submittedFirstTokens[0]);
      if (!firstNameMatch) {
        issues.push(`First name mismatch: document "${[firstName, otherName].filter(Boolean).join(' ')}" vs submitted "${submittedData.given_names}"`);
      }
    } else if (extractedNameParts.length === 0 && submittedFirstTokens.length > 0) {
      issues.push('Could not extract first name from document');
    }

    // WWCC number — must match if submitted (file upload methods may not submit one)
    if (finalWwcc) {
      if (submittedData.wwcc_number?.trim() && finalWwcc.toUpperCase().trim() !== submittedData.wwcc_number.toUpperCase().trim()) {
        issues.push(`WWCC number mismatch: document "${finalWwcc}" vs submitted "${submittedData.wwcc_number}"`);
      }
      if (!WWCC_NUMBER_REGEX.test(finalWwcc.trim())) {
        issues.push(`Invalid WWCC number format: "${finalWwcc}"`);
      }
    } else {
      issues.push('Could not extract WWCC number from document');
    }

    // Expiry date — check not expired and not expiring within 3 months
    if (expiryIso) {
      const expiryDate = new Date(expiryIso);
      const now = new Date();
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);

      if (expiryDate < now) {
        issues.push(`WWCC has expired (${expiryRaw})`);
      } else if (expiryDate < threeMonths) {
        issues.push(`WWCC expires within 3 months (${expiryRaw})`);
      }
    } else {
      issues.push('Could not extract expiry date from document');
    }

    // ── 4. DETERMINE PASS/FAIL ──

    const hasNameMismatch = issues.some(i => i.includes('name mismatch'));
    const hasNumberMismatch = issues.some(i => i.includes('WWCC number mismatch'));
    const hasExpired = issues.some(i => i.includes('expired') || i.includes('expires within'));
    const missingCritical = !finalWwcc || !expiryIso; // surname optional for file uploads

    const pass = !hasNameMismatch && !hasNumberMismatch && !hasExpired && !missingCritical;

    // If critical fields couldn't be extracted, the parser couldn't read the doc properly → AI fallback
    // If data was extracted but doesn't match → genuine fail, no fallback needed
    const needsAIFallback = missingCritical;

    const reasoning = [
      `Authenticity: ${markersFound}/${AUTHENTICITY_MARKERS.length} markers found${missingMarkers.length ? ` (missing: ${missingMarkers.join(', ')})` : ''}`,
      surname ? `Surname: "${surname}" ${surname.toLowerCase().trim() === submittedData.surname.toLowerCase().trim() ? '(matches)' : '(MISMATCH)'}` : 'Surname: not found',
      firstName ? `First name: "${firstName}"${otherName ? ` / Other: "${otherName}"` : ''} ${!issues.some(i => i.includes('First name mismatch')) ? '(matches)' : '(MISMATCH)'}` : 'First name: not found',
      otherName ? `Other name: "${otherName}"` : 'Other name: none',
      finalWwcc ? `WWCC number: ${finalWwcc}${submittedData.wwcc_number?.trim() ? (finalWwcc.toUpperCase().trim() === submittedData.wwcc_number.toUpperCase().trim() ? ' (matches)' : ' (MISMATCH)') : ' (extracted from document)'}` : 'WWCC number: not found',
      clearanceType ? `Clearance type: ${clearanceType}` : 'Clearance type: not found',
      expiryIso ? `Expiry: ${expiryRaw} (${new Date(expiryIso) > new Date() ? 'valid' : 'EXPIRED'})` : 'Expiry: not found',
      recipientEmail ? `Recipient email: ${recipientEmail}` : 'Recipient email: not found',
    ].join('\n');

    return {
      pass,
      needsAIFallback,
      extracted: {
        surname: surname?.trim() ?? null,
        first_name: firstName?.trim() ?? null,
        other_names: otherName?.trim() ?? null,
        wwcc_number: finalWwcc?.trim() ?? null,
        clearance_type: clearanceType?.trim() ?? null,
        expiry: expiryIso,
        recipient_email: recipientEmail?.trim() ?? null,
      },
      reasoning,
      issues,
    };
  } catch (error) {
    return {
      pass: false,
      needsAIFallback: true, // parsing crashed — let AI try
      extracted: emptyExtracted(),
      reasoning: `PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      issues: ['Failed to parse PDF document'],
    };
  }
}

// ── Helpers ──

/**
 * Extracts a value from the OCG table where the label is on one line
 * and the value is on the next line.
 *
 * e.g. "Surname\nWRIGHT\n" → "WRIGHT"
 */
function extractTableField(text: string, label: string): string | null {
  // Match: label at start of line, then capture the next non-empty line
  const regex = new RegExp(`${escapeRegex(label)}\\s*\\n([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emptyExtracted(): WWCCPdfResult['extracted'] {
  return {
    surname: null,
    first_name: null,
    other_names: null,
    wwcc_number: null,
    clearance_type: null,
    expiry: null,
    recipient_email: null,
  };
}
