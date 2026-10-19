import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { pushSingleNotification } from '@/lib/notificationHelpers';

export const MONTHLY_LIMIT = 5000;

interface SettingsContextValue {
  loading: boolean;
  creditsUsed: number;
  creditsResetAt: string;
  consumeCredit: () => Promise<void>;
  agentActive: boolean;
  setAgentActive: (v: boolean) => Promise<void>;
  confirmBeforeEmail: boolean;
  setConfirmBeforeEmail: (v: boolean) => Promise<void>;
  confirmBeforeTask: boolean;
  setConfirmBeforeTask: (v: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  loading: true,
  creditsUsed: 0,
  creditsResetAt: '',
  consumeCredit: async () => {},
  agentActive: true,
  setAgentActive: async () => {},
  confirmBeforeEmail: false,
  setConfirmBeforeEmail: async () => {},
  confirmBeforeTask: false,
  setConfirmBeforeTask: async () => {},
});

const CHARGED_EMAILS_STORAGE_PREFIX = 'flowpoint:charged-ai-email-credits:';

function readChargedEmailIds(userId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${CHARGED_EMAILS_STORAGE_PREFIX}${userId}`);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeChargedEmailIds(userId: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(
      `${CHARGED_EMAILS_STORAGE_PREFIX}${userId}`,
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // Credit accounting still succeeds if browser storage is unavailable.
  }
}

function isAiHandledEmail(row: Record<string, unknown>): boolean {
  const id = typeof row.Id === 'string' ? row.Id : '';
  const type = typeof row.type === 'string' ? row.type.toLowerCase() : '';
  const response = row.response;
  return Boolean(id && type !== 'send' && response !== null && response !== undefined && response !== '');
}

export function useSettingsCtx() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [loading,            setLoading]            = useState(true);
  const [creditsUsed,        setCreditsUsed]        = useState(0);
  const [creditsResetAt,     setCreditsResetAt]     = useState('');
  const [agentActive,        setAgentActiveState]   = useState(true);
  const [confirmBeforeEmail, setConfirmEmailState]  = useState(false);
  const [confirmBeforeTask,  setConfirmTaskState]   = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const creditQueueRef = useRef<Promise<void>>(Promise.resolve());
  const chargedEmailIdsRef = useRef<Set<string>>(new Set());
  const queuedEmailIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const { data, error } = await supabase
        .from('settings')
        .select('credits_used, credits_reset_at, agent_activity, confirm_before_email, confirm_before_task')
        .eq('user_id', user.id)
        .single();

      if (!mounted) return;

      const now = new Date();

      if (error?.code === 'PGRST116' || !data) {
        // No row yet — insert with defaults
        const resetAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('settings').insert({
          user_id: user.id,
          credits_used: 0,
          credits_reset_at: resetAt,
          agent_activity: true,
          confirm_before_email: false,
          confirm_before_task: false,
        });
        if (mounted) {
          setCreditsUsed(0);
          setCreditsResetAt(resetAt);
          setAgentActiveState(true);
          setConfirmEmailState(false);
          setConfirmTaskState(false);
          setLoading(false);
        }
      } else if (!error && data) {
        const resetAt = data.credits_reset_at as string | null;
        let used      = (data.credits_used as number) ?? 0;
        let newReset  = resetAt;

        if (!resetAt || now > new Date(resetAt)) {
          used     = 0;
          newReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await supabase
            .from('settings')
            .update({ credits_used: 0, credits_reset_at: newReset })
            .eq('user_id', user.id);
        }

        if (mounted) {
          setCreditsUsed(used);
          setCreditsResetAt(newReset ?? '');
          setAgentActiveState(data.agent_activity !== false);
          setConfirmEmailState(data.confirm_before_email === true);
          setConfirmTaskState(data.confirm_before_task === true);
          setLoading(false);
        }
      } else {
        if (mounted) setLoading(false);
      }

      if (mounted) setUserId(user.id);
    }

    load();
    return () => { mounted = false; };
  }, []);

  /* ── Credit consumption ── */
  const consumeCredit = useCallback(async () => {
    const charge = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Read the current value inside the queue so several AI actions cannot
      // overwrite one another with the same stale client-side count.
      const { data, error } = await supabase
        .from('settings')
        .select('credits_used, credits_reset_at')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Unable to load credit usage.');
      }

      const now = new Date();
      const currentResetAt = data.credits_reset_at as string | null;
      const resetExpired = !currentResetAt || now >= new Date(currentResetAt);
      const previous = resetExpired ? 0 : Number(data.credits_used ?? 0);
      const nextResetAt = resetExpired
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : currentResetAt;
      const updated = previous + 1;

      const { error: updateError } = await supabase
        .from('settings')
        .update({ credits_used: updated, credits_reset_at: nextResetAt })
        .eq('user_id', user.id);

      if (updateError) throw new Error(updateError.message);

      setCreditsUsed(updated);
      setCreditsResetAt(nextResetAt ?? '');

      if (previous < MONTHLY_LIMIT && updated >= MONTHLY_LIMIT) {
        pushSingleNotification(
          'credits_exceeded',
          'Credit Limit Reached',
          `You've used all ${MONTHLY_LIMIT.toLocaleString()} of your monthly credits. Additional usage will be billed separately.`,
        ).catch(() => {});
      }
    };

    const queuedCharge = creditQueueRef.current.then(charge, charge);
    creditQueueRef.current = queuedCharge.then(
      () => undefined,
      () => undefined,
    );
    await queuedCharge;
  }, []);

  /* ── Background AI email accounting ── */
  const chargeHandledEmail = useCallback(async (row: Record<string, unknown>) => {
    if (!isAiHandledEmail(row)) return;

    const emailId = row.Id as string;
    if (
      chargedEmailIdsRef.current.has(emailId) ||
      queuedEmailIdsRef.current.has(emailId)
    ) return;

    queuedEmailIdsRef.current.add(emailId);
    try {
      await consumeCredit();
      chargedEmailIdsRef.current.add(emailId);
      if (userId) writeChargedEmailIds(userId, chargedEmailIdsRef.current);
    } catch (error) {
      queuedEmailIdsRef.current.delete(emailId);
      console.error('Unable to charge credit for AI-handled email:', error);
    }
  }, [consumeCredit, userId]);

  useEffect(() => {
    if (!userId) return;

    chargedEmailIdsRef.current = readChargedEmailIds(userId);

    const reconcileHandledEmails = async () => {
      const { data, error } = await supabase
        .from('inbox')
        .select('Id, type, response')
        .not('response', 'is', null);

      if (error) {
        console.error('Unable to reconcile AI-handled email credits:', error);
        return;
      }

      for (const row of (data ?? []) as Record<string, unknown>[]) {
        await chargeHandledEmail(row);
      }
    };

    void reconcileHandledEmails();

    const inboxChannel = supabase
      .channel(`credit-watch:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox' },
        (payload) => {
          void chargeHandledEmail(payload.new as Record<string, unknown>);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(inboxChannel);
    };
  }, [userId, chargeHandledEmail]);

  /* ── Generic boolean setting writer ── */
  const makeBoolSetter = useCallback(
    (column: string, setState: (v: boolean) => void) =>
      async (v: boolean) => {
        setState(v); // optimistic
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setState(!v); return; }
        const { error } = await supabase
          .from('settings')
          .update({ [column]: v })
          .eq('user_id', user.id);
        if (error) setState(!v); // revert on failure
      },
    [],
  );

  const setAgentActive        = useCallback(makeBoolSetter('agent_activity',       setAgentActiveState), [makeBoolSetter]);
  const setConfirmBeforeEmail = useCallback(makeBoolSetter('confirm_before_email', setConfirmEmailState), [makeBoolSetter]);
  const setConfirmBeforeTask  = useCallback(makeBoolSetter('confirm_before_task',  setConfirmTaskState),  [makeBoolSetter]);

  return (
    <SettingsContext.Provider value={{
      loading, creditsUsed, creditsResetAt, consumeCredit,
      agentActive,        setAgentActive,
      confirmBeforeEmail, setConfirmBeforeEmail,
      confirmBeforeTask,  setConfirmBeforeTask,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
