import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/notificationsTypes';
import {
  pushStackableNotification,
  ensureWarningNotification,
  clearWarningNotification,
} from '@/lib/notificationHelpers';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Track current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchNotifications = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false });
    setNotifications((data as AppNotification[]) ?? []);
  }, []);

  // Check warning conditions (no policies / categories / staff) and create or
  // remove the corresponding warning notifications accordingly.
  const checkWarnings = useCallback(async () => {
    const [pRes, cRes, sRes] = await Promise.all([
      supabase.from('policies').select('id', { count: 'exact', head: true }),
      supabase.from('categories').select('id', { count: 'exact', head: true }),
      supabase.from('staff').select('id', { count: 'exact', head: true }),
    ]);

    const pCount = pRes.count ?? 0;
    const cCount = cRes.count ?? 0;
    const sCount = sRes.count ?? 0;

    if (pCount === 0) {
      await ensureWarningNotification(
        'warning_no_policies',
        'No Business Policies',
        'Add policies so the AI knows how to handle incoming emails.',
      );
    } else {
      await clearWarningNotification('warning_no_policies');
    }

    if (cCount === 0) {
      await ensureWarningNotification(
        'warning_no_categories',
        'No Email Categories',
        'Add categories to classify and route incoming emails.',
      );
    } else {
      await clearWarningNotification('warning_no_categories');
    }

    if (sCount === 0) {
      await ensureWarningNotification(
        'warning_no_staff',
        'No Staff Members',
        'Add staff so the AI knows who to assign emails to.',
      );
    } else {
      await clearWarningNotification('warning_no_staff');
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    Promise.all([fetchNotifications(userId), checkWarnings()]).then(() =>
      setLoading(false),
    );

    // Realtime: any change to this user's notifications refreshes the list
    const notifChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchNotifications(userId),
      )
      .subscribe();

    // Realtime: watch inbox inserts for AI-handled emails and urgent emails
    const inboxChannel = supabase
      .channel(`inbox-watch:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox' },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          const urgency =
            typeof row.urgency === 'string' ? row.urgency.toLowerCase() : '';
          const hasResponse = row.response !== null && row.response !== undefined && row.response !== '';
          const type =
            typeof row.type === 'string' ? row.type.toLowerCase() : '';

          if (urgency === 'urgent' && type !== 'send') {
            await pushStackableNotification(
              'urgent_email',
              'Urgent Email',
              (n) =>
                n === 1
                  ? 'An urgent email requires your attention.'
                  : `${n} urgent emails require your attention.`,
            ).catch(() => {});
          }

          if (hasResponse && type !== 'send') {
            await pushStackableNotification(
              'email_handled',
              'AI Handled Email',
              (n) =>
                n === 1
                  ? 'The AI responded to an email.'
                  : `The AI responded to ${n} emails.`,
            ).catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(inboxChannel);
    };
  }, [userId, fetchNotifications, checkWarnings]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  }, [userId]);

  const dismissNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  };
}
