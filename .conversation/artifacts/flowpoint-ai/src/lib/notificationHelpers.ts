import { supabase } from './supabase';
import type { NotificationType } from './notificationsTypes';

async function getUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Upserts a stackable notification — increments count on an existing unread
 * notification of the same type, or inserts a fresh one.
 */
export async function pushStackableNotification(
  type: NotificationType,
  title: string,
  makeMessage: (count: number) => string,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const { data: existing, error } = await supabase
    .from('notifications')
    .select('id, count')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!error && existing && existing.length > 0) {
    const newCount = ((existing[0].count as number) ?? 1) + 1;
    await supabase
      .from('notifications')
      .update({
        count: newCount,
        message: makeMessage(newCount),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing[0].id);
  } else {
    await supabase.from('notifications').insert([{
      user_id: userId,
      type,
      title,
      message: makeMessage(1),
      count: 1,
      read: false,
    }]);
  }
}

/**
 * Inserts a one-off notification (e.g. "New contact added").
 */
export async function pushSingleNotification(
  type: NotificationType,
  title: string,
  message: string,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase.from('notifications').insert([{
    user_id: userId,
    type,
    title,
    message,
    count: 1,
    read: false,
  }]);
}

/**
 * Creates a warning notification only if no unread warning of this type
 * already exists (idempotent — safe to call on every mount).
 */
export async function ensureWarningNotification(
  type: NotificationType,
  title: string,
  message: string,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const { data: existing, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('read', false)
    .limit(1);

  if (!error && (!existing || existing.length === 0)) {
    await supabase.from('notifications').insert([{
      user_id: userId,
      type,
      title,
      message,
      count: 1,
      read: false,
    }]);
  }
}

/**
 * Removes all unread warnings of the given type — call this after the
 * condition that triggered the warning has been resolved.
 */
export async function clearWarningNotification(type: NotificationType): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('type', type)
    .eq('read', false);
}
