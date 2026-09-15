'use client';

import { createContext, useContext } from 'react';
import { User } from '@supabase/supabase-js';
import { UserRole, UserProfile } from '@/lib/auth/types';

export interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  profile: UserProfile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a SessionProvider');
  }
  return context;
}
