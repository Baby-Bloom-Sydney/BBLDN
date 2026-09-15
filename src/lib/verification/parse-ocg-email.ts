/**
 * Systematic parser for OCG (Office of the Children's Guardian) employer
 * WWCC verification results emails.
 *
 * The email HTML contains two <tbody> sections:
 *   1. Employer info: Employer ID, Employer Name, Verification Date/Time
 *   2. Results table: Family Name, Reference Number, Result Status, Expiry Date, Result
 *
 * Can contain multiple result rows (batch verifications).
 *
 * Known Result Status values:
 *   - CLEARED — person has a current WWCC
 *   - NOT FOUND — no record found
 *   - BARRED — person is barred from working with children
 *   - INTERIM BAR — interim bar in place
 *   - APPLICATION IN PROGRESS — application not yet decided
 */

export interface OCGVerificationResult {
  family_name: string;
  reference_number: string;    // e.g. "WWC2752857E"
  result_status: string;       // "CLEARED", "NOT FOUND", "BARRED", etc.
  expiry_date: string | null;  // ISO format "2028-10-13"
  result_text: string;         // Full result description
}

export interface OCGEmailParseResult {
  employer_id: string;
  employer_name: string;
  verification_datetime: string;
  results: OCGVerificationResult[];
}

// ── Helpers ──

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function convertDate(ddmmyyyy: string): string | null {
  const match = ddmmyyyy.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

/**
 * Extract text content from all <td> cells in a <tr> row.
 * Returns array of cell text values.
 */
function extractCells(trHtml: string): string[] {
  const cells: string[] = [];
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = cellRegex.exec(trHtml)) !== null) {
    cells.push(stripHtml(match[1]));
  }
  return cells;
}

/**
 * Extract text content from <th>...<td> pairs for employer info rows.
 * Returns { label: value } map.
 */
function extractThTdPairs(tbodyHtml: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(tbodyHtml)) !== null) {
    const rowHtml = match[1];
    const thMatch = rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    const tdMatch = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    if (thMatch && tdMatch) {
      const label = stripHtml(thMatch[1]);
      const value = stripHtml(tdMatch[1]);
      pairs[label] = value;
    }
  }
  return pairs;
}

// ── Main parser ──

export function parseOCGEmail(html: string): OCGEmailParseResult {
  // Split into <tbody> sections
  const tbodyRegex = /<tbody[^>]*>([\s\S]*?)<\/tbody>/gi;
  const tbodies: string[] = [];
  let tbodyMatch;
  while ((tbodyMatch = tbodyRegex.exec(html)) !== null) {
    tbodies.push(tbodyMatch[1]);
  }

  if (tbodies.length < 2) {
    throw new Error(`Expected at least 2 <tbody> sections, found ${tbodies.length}`);
  }

  // First tbody: employer info (th/td pairs)
  const employerInfo = extractThTdPairs(tbodies[0]);
  const employer_id = employerInfo['Employer ID'] ?? '';
  const employer_name = employerInfo['Employer Name'] ?? '';
  const verification_datetime = employerInfo['Verification Date/Time'] ?? '';

  // Second tbody: results header + data rows
  // The first row is the "Results" colspan header, second is column headers (<th>),
  // remaining rows are data (<td>)
  const resultsTbody = tbodies[1];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const results: OCGVerificationResult[] = [];
  let rowMatch;

  while ((rowMatch = rowRegex.exec(resultsTbody)) !== null) {
    const rowHtml = rowMatch[1];

    // Skip rows that contain <th> (header rows)
    if (/<th[\s>]/i.test(rowHtml)) continue;

    // Data row — extract 5 cells
    const cells = extractCells(rowHtml);
    if (cells.length < 5) continue;

    const [family_name, reference_number, result_status, expiry_raw, result_text] = cells;

    results.push({
      family_name: family_name.trim(),
      reference_number: reference_number.trim(),
      result_status: result_status.trim().toUpperCase(),
      expiry_date: convertDate(expiry_raw),
      result_text: result_text.trim(),
    });
  }

  return {
    employer_id,
    employer_name,
    verification_datetime,
    results,
  };
}
