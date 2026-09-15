export interface NannyProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  headline: string;
  bio: string;
  hourlyRate: number;
  suburb: string;
  profilePictureUrl?: string;
  verificationTier: 1 | 2 | 3;
  profileVisible: boolean;
  visibleInMatchMaking: boolean;
  visibleInBsr: boolean;
}
