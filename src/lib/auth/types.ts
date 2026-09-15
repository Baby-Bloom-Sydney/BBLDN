export type UserRole = 'nanny' | 'parent' | 'admin' | 'super_admin';

export interface UserProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  suburb: string;
  postcode: string;
  profile_picture_url: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  profile: UserProfile | null;
}

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  suburb: string;
  postcode: string;
  role: UserRole;
}

export interface SignInData {
  email: string;
  password: string;
}
