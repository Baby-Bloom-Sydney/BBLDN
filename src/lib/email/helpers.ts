import { createAdminClient } from '@/lib/supabase/admin';

export interface UserEmailInfo {
  email: string;
  firstName: string;
  lastName: string;
  userId: string;
}

/**
 * Look up a user's email and name from user_profiles by user_id.
 * Returns null if not found.
 */
export async function getUserEmailInfo(userId: string): Promise<UserEmailInfo | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email, first_name, last_name')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error(`[Email] Could not find user_profiles for user_id=${userId}:`, error?.message);
    return null;
  }

  return {
    email: data.email,
    firstName: data.first_name ?? '',
    lastName: data.last_name ?? '',
    userId: data.user_id,
  };
}
