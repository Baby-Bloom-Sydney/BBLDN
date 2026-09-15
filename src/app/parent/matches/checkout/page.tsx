import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MatchmakerCheckoutClient } from './MatchmakerCheckoutClient';

export default async function MatchmakerCheckoutPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: parent } = await admin
    .from('parents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!parent) redirect('/parent/matches');

  const { data: position } = await admin
    .from('nanny_positions')
    .select('id, dfy_activated_at')
    .eq('parent_id', parent.id)
    .in('status', ['active', 'filled'])
    .maybeSingle();

  if (!position || position.dfy_activated_at) {
    redirect('/parent/matches');
  }

  return (
    <MatchmakerCheckoutClient />
  );
}
