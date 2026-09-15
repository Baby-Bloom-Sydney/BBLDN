import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PARENT_IDENTITY_STATUS, PARENT_VERIFICATION_STATUS, PARENT_GUIDANCE_MESSAGES } from '@/lib/verification';

// If identity has been 'processing' for this long, escalate to 'review'.
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: null }, { status: 401 });
  }

  const { data } = await supabase
    .from('parent_verifications')
    .select(`
      verification_status,
      identity_status, contact_status, cross_check_status,
      identity_status_at,
      identity_verified, identity_rejection_reason, identity_user_guidance,
      surname, given_names, date_of_birth,
      document_type, issuing_country,
      selfie_confidence,
      extracted_surname, extracted_given_names, extracted_dob,
      extracted_nationality, extracted_passport_number, extracted_passport_expiry,
      extracted_license_number, extracted_license_expiry, extracted_license_state, extracted_license_class,
      cross_check_status, cross_check_reasoning,
      updated_at
    `)
    .eq('user_id', user.id)
    .single();

  if (!data) {
    return NextResponse.json({ status: null });
  }

  let { identity_status } = data;
  const now = Date.now();

  // Staleness safety net: processing stuck too long → escalate to review
  if (identity_status === PARENT_IDENTITY_STATUS.PROCESSING && data.identity_status_at) {
    const stuckMs = now - new Date(data.identity_status_at).getTime();
    if (stuckMs > STALE_THRESHOLD_MS) {
      const admin = createAdminClient();
      await admin.from('parent_verifications').update({
        identity_status: PARENT_IDENTITY_STATUS.REVIEW,
        identity_status_at: new Date().toISOString(),
        identity_ai_issues: JSON.stringify(['Auto-check timed out — escalated to manual review']),
        identity_user_guidance: PARENT_GUIDANCE_MESSAGES.TECHNICAL_STALE,
        verification_status: PARENT_VERIFICATION_STATUS.PENDING_ID_REVIEW,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);

      identity_status = PARENT_IDENTITY_STATUS.REVIEW;
      console.log(`[parent-verification-status] Identity stale for user ${user.id} — escalated to review`);
    }
  }

  return NextResponse.json({
    status: data.verification_status,
    identity_status,
    identity_verified: data.identity_verified,
    identity_rejection_reason: data.identity_rejection_reason,
    identity_user_guidance: data.identity_user_guidance,
    surname: data.surname,
    given_names: data.given_names,
    date_of_birth: data.date_of_birth,
    document_type: data.document_type,
    issuing_country: data.issuing_country,
    selfie_confidence: data.selfie_confidence,
    extracted_surname: data.extracted_surname,
    extracted_given_names: data.extracted_given_names,
    extracted_dob: data.extracted_dob,
    extracted_nationality: data.extracted_nationality,
    extracted_passport_number: data.extracted_passport_number,
    extracted_passport_expiry: data.extracted_passport_expiry,
    extracted_license_number: data.extracted_license_number,
    extracted_license_expiry: data.extracted_license_expiry,
    extracted_license_state: data.extracted_license_state,
    extracted_license_class: data.extracted_license_class,
    contact_status: data.contact_status,
    cross_check_status: data.cross_check_status,
    cross_check_reasoning: data.cross_check_reasoning,
  });
}
