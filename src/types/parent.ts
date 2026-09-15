export interface ParentProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  suburb: string;
  currentNannyId?: string;
}

export interface ChildInfo {
  id: string;
  ageInMonths: number;
  specialNeeds?: string;
}

export interface ParentVerificationData {
  id: string;
  // Document type
  document_type: string | null;
  issuing_country: string | null;
  // Per-section statuses
  identity_status: string;
  contact_status: string;
  cross_check_status: string;
  verification_status: number;
  // Identity fields
  surname: string | null;
  given_names: string | null;
  date_of_birth: string | null;
  document_upload_url: string | null;
  identification_photo_url: string | null;
  identity_verified: boolean;
  identity_rejection_reason: string | null;
  identity_user_guidance: import('@/lib/verification').UserGuidance | null;
  selfie_confidence: number | null;
  // AI Extraction: Common
  extracted_surname: string | null;
  extracted_given_names: string | null;
  extracted_dob: string | null;
  // AI Extraction: Passport
  extracted_nationality: string | null;
  extracted_passport_number: string | null;
  extracted_passport_expiry: string | null;
  // AI Extraction: License
  extracted_license_number: string | null;
  extracted_license_expiry: string | null;
  extracted_license_state: string | null;
  extracted_license_class: string | null;
  // Contact fields
  phone_number: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  // Cross-check
  cross_check_reasoning: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}
