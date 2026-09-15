'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface InboxMessage {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function getInboxMessages(): Promise<{ data: InboxMessage[]; error: string | null }> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: [], error: 'Not authenticated' };
  }

  const { data, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // Table may not exist yet — treat as empty
    console.error('[Inbox] Fetch error:', error);
    return { data: [], error: null };
  }

  return { data: data ?? [], error: null };
}

export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return 0;

  const { count, error } = await supabase
    .from('inbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) return 0;
  return count ?? 0;
}

export async function markAsRead(messageId: string): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();

  const { error } = await supabase
    .from('inbox_messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', messageId);

  if (error) {
    console.error('[Inbox] Mark read error:', error);
    return { success: false, error: 'Failed to mark as read' };
  }

  return { success: true, error: null };
}

export async function markAllAsRead(): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('inbox_messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) {
    console.error('[Inbox] Mark all read error:', error);
    return { success: false, error: 'Failed to mark all as read' };
  }

  revalidatePath('/nanny/inbox');
  revalidatePath('/parent/inbox');
  return { success: true, error: null };
}
