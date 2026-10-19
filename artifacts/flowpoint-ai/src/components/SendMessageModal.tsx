import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  X,
  Send,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pencil,
  BookUser,
  Mail,
  Briefcase,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Contact, Staff } from '@/lib/contactsTypes';
import { useSettingsCtx } from '@/contexts/SettingsContext';
import FlowPointLogo from '@/components/FlowPointLogo';

/* ─── Webhook ─── */
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_SEND_EMAIL as string;

/* ─── Types ─── */
type Phase = 'form' | 'sending' | 'review' | 'editing';

interface ReviewData {
  subject: string;
  body: string;
}

interface Props {
  onClose: () => void;
  onSent?: () => void;
  initialEmail?: string;
  threadId?: string | null;
  isReply?: boolean;
}

/* ─── Helpers ─── */
function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

async function callWebhook(payload: object): Promise<ReviewData | null> {
  if (!WEBHOOK_URL) {
    throw new Error(
      'Email automation is not configured. Set VITE_WEBHOOK_SEND_EMAIL in your environment.',
    );
  }

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
    },
    body: JSON.stringify(payload),
  });

  // The send-email workflow may acknowledge a successful send with an empty
  // or plain-text response. Read the response once and only parse JSON when
  // the workflow actually returned JSON.
  const raw = await res.text();
  let parsed: unknown = null;
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (/invalid\s+json/i.test(raw)) {
        throw new Error(raw.trim());
      }
      if ((payload as { type?: string }).type === 'Ai' || (payload as { type?: string }).type === 'edit') {
        throw new Error('The AI email workflow returned an invalid response.');
      }
    }
  }

  if (!res.ok) {
    let detail = raw.trim();
    if (parsed && typeof parsed === 'object') {
      const response = parsed as Record<string, unknown>;
      const obj = Array.isArray(parsed) ? parsed[0] : response;
      if (obj && typeof obj === 'object') {
        detail = String(
          (obj as Record<string, unknown>).message ??
          (obj as Record<string, unknown>).error ??
          detail,
        );
      }
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }

  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
  if (obj && typeof obj === 'object' && ('subject' in obj || 'body' in obj)) {
    const response = obj as { subject?: unknown; body?: unknown };
    return {
      subject: response.subject == null ? '' : String(response.subject),
      body: response.body == null ? '' : String(response.body),
    };
  }

  return null;
}

/* ─── Gradient avatar helpers ─── */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f5576c,#f093fb)',
  'linear-gradient(135deg,#2193b0,#6dd5ed)',
  'linear-gradient(135deg,#11998e,#38ef7d)',
  'linear-gradient(135deg,#c94b4b,#4b134f)',
  'linear-gradient(135deg,#5f72be,#9b23ea)',
  'linear-gradient(135deg,#f7971e,#e85d04)',
  'linear-gradient(135deg,#1565c0,#4dd0e1)',
  'linear-gradient(135deg,#cc2b5e,#753a88)',
  'linear-gradient(135deg,#134e5e,#71b280)',
  'linear-gradient(135deg,#eb3349,#f45c43)',
  'linear-gradient(135deg,#0f3460,#533483)',
  'linear-gradient(135deg,#d4145a,#fbb03b)',
  'linear-gradient(135deg,#0072ff,#00c6ff)',
  'linear-gradient(135deg,#7f00ff,#e100ff)',
  'linear-gradient(135deg,#f953c6,#b91d73)',
  'linear-gradient(135deg,#1e3c72,#2a5298)',
  'linear-gradient(135deg,#4e54c8,#8f94fb)',
  'linear-gradient(135deg,#f12711,#f5af19)',
  'linear-gradient(135deg,#2c3e50,#3498db)',
];

function gradStyle(name: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h >>>= 0; }
  return { background: AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length] };
}

function inits(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

/* ─── Sub-components ─── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold text-[#555] uppercase tracking-wider">
      {children}
    </span>
  );
}

function FieldError({ msg }: { msg: string }) {
  return msg ? (
    <p className="text-[11px] text-[#c0392b] mt-[3px] flex items-center gap-[4px]">
      <AlertCircle size={10} strokeWidth={2.5} />
      {msg}
    </p>
  ) : null;
}

function AiToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      animate={{ backgroundColor: on ? '#0a0a0a' : '#f9f9f9' }}
      transition={{ duration: 0.15 }}
      className={`
        flex-shrink-0 w-[32px] h-[32px] rounded-[8px] border flex items-center justify-center
        transition-colors duration-150
        ${on
          ? 'border-[#0a0a0a] shadow-[0_0_0_2px_rgba(10,10,10,0.08)]'
          : 'border-[#e5e5e5] hover:border-[#ccc]'}
      `}
      aria-label={on ? 'Disable AI writing' : 'Write with AI'}
      title="Write with AI"
    >
      <Sparkles
        size={14}
        strokeWidth={on ? 2 : 1.8}
        className={on ? 'text-white' : 'text-[#aaa]'}
      />
    </motion.button>
  );
}

/* ─── Contacts Picker Dropdown ─── */
interface ContactEntry {
  name: string;
  email: string;
  type: 'contact' | 'staff';
  role?: string;
}

function ContactsPicker({
  onSelect,
  onClose,
}: {
  onSelect: (email: string) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from('contacts').select('name, email').order('name'),
        supabase.from('staff').select('name, email, role').order('name'),
      ]);
      const result: ContactEntry[] = [
        ...((c.data ?? []) as { name: string; email: string }[]).map(x => ({ ...x, type: 'contact' as const })),
        ...((s.data ?? []) as { name: string; email: string; role: string }[]).map(x => ({ ...x, type: 'staff' as const, role: x.role })),
      ];
      setContacts(result);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : contacts;

  const contactsList = filtered.filter(c => c.type === 'contact');
  const staffList    = filtered.filter(c => c.type === 'staff');

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[280px] bg-white rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.16)] border border-[#e5e5e5] overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Search */}
      <div className="px-[10px] pt-[10px] pb-[6px] border-b border-[#f0f0f0]">
        <div className="flex items-center gap-[7px] h-[32px] px-[9px] bg-[#f4f4f4] rounded-[7px]">
          <Search size={12} strokeWidth={2} className="text-[#bbb] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 bg-transparent text-[12px] text-[#0a0a0a] placeholder-[#bbb] outline-none"
          />
        </div>
      </div>

      <div className="max-h-[240px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-[24px]">
            <Loader2 size={16} className="animate-spin text-[#ccc]" strokeWidth={1.8} />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-[24px] gap-[5px]">
            <BookUser size={20} className="text-[#ddd]" strokeWidth={1.3} />
            <p className="text-[12px] text-[#bbb]">No results</p>
          </div>
        )}

        {!loading && contactsList.length > 0 && (
          <div>
            <p className="px-[12px] pt-[8px] pb-[3px] text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">
              Contacts
            </p>
            {contactsList.map(c => (
              <button
                key={`c-${c.email}`}
                onClick={() => { onSelect(c.email); onClose(); }}
                className="w-full flex items-center gap-[9px] px-[12px] py-[7px] hover:bg-[#f7f7f7] transition-colors duration-100 text-left"
              >
                <div
                  className="w-[26px] h-[26px] rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold text-[9px]"
                  style={gradStyle(c.name)}
                >
                  {inits(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#0a0a0a] truncate">{c.name}</p>
                  <p className="text-[10px] text-[#aaa] truncate flex items-center gap-[3px]">
                    <Mail size={8} strokeWidth={2} className="flex-shrink-0" />{c.email}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && staffList.length > 0 && (
          <div>
            <p className="px-[12px] pt-[8px] pb-[3px] text-[10px] font-semibold text-[#aaa] uppercase tracking-wider border-t border-[#f4f4f4]">
              Staff
            </p>
            {staffList.map(s => (
              <button
                key={`s-${s.email}`}
                onClick={() => { onSelect(s.email); onClose(); }}
                className="w-full flex items-center gap-[9px] px-[12px] py-[7px] hover:bg-[#f7f7f7] transition-colors duration-100 text-left"
              >
                <div
                  className="w-[26px] h-[26px] rounded-full flex-shrink-0 flex items-center justify-center text-white font-semibold text-[9px]"
                  style={gradStyle(s.name)}
                >
                  {inits(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#0a0a0a] truncate">{s.name}</p>
                  <p className="text-[10px] text-[#aaa] truncate flex items-center gap-[3px]">
                    <Briefcase size={8} strokeWidth={2} className="flex-shrink-0" />{s.role}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Main Modal ─── */
export default function SendMessageModal({
  onClose,
  onSent,
  initialEmail = '',
  threadId = null,
  isReply = false,
}: Props) {
  /* Form fields */
  const [email,      setEmail]      = useState(initialEmail);
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [aiSubject,  setAiSubject]  = useState(false);
  const [aiBody,     setAiBody]     = useState(false);

  /* Phase */
  const [phase,      setPhase]      = useState<Phase>('form');
  const [review,     setReview]     = useState<ReviewData>({ subject: '', body: '' });
  const [editText,   setEditText]   = useState('');
  const [webhookErr, setWebhookErr] = useState<string | null>(null);

  /* Contacts picker */
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  /* Validation errors */
  const [emailErr,   setEmailErr]   = useState('');
  const [subjectErr, setSubjectErr] = useState('');
  const [bodyErr,    setBodyErr]    = useState('');
  const { consumeCredit } = useSettingsCtx();

  /* ── Payload builders ── */
  const buildInitial = () => ({
    email:          email.trim(),
    subject:        aiSubject ? 'Ai' : subject.trim(),
    'email body':   aiBody    ? 'Ai' : body.trim(),
    context:        aiBody    ? body.trim() : null,
    type:           (aiSubject || aiBody) ? 'Ai' : 'send',
    'thread id':    threadId ?? null,
  });

  const buildEdit = () => ({
    email:          email.trim(),
    subject:        aiSubject ? 'Ai' : review.subject,
    'email body':   aiBody    ? 'Ai' : review.body,
    context:        editText.trim(),
    type:           'edit',
    'thread id':    threadId ?? null,
  });

  const buildFinal = () => ({
    email:          email.trim(),
    subject:        review.subject,
    'email body':   review.body,
    context:        null,
    type:           'send',
    'thread id':    threadId ?? null,
  });

  /* ── Validation ── */
  const validate = () => {
    let ok = true;
    if (!email.trim()) {
      setEmailErr('Email address is required'); ok = false;
    } else if (!isValidEmail(email)) {
      setEmailErr('Enter a valid email address'); ok = false;
    } else { setEmailErr(''); }

    if (!aiSubject && !subject.trim()) {
      setSubjectErr('Subject is required'); ok = false;
    } else { setSubjectErr(''); }

    if (!body.trim()) {
      setBodyErr(aiBody
        ? 'Description is required so AI knows what to write'
        : 'Message body is required');
      ok = false;
    } else { setBodyErr(''); }

    return ok;
  };

  /* ── Actions ── */
  const handleSend = async () => {
    if (!validate()) return;
    const isAI = aiSubject || aiBody;
    setWebhookErr(null);
    setPhase('sending');
    try {
      const result = await callWebhook(buildInitial());
      // Generating an AI subject/body is one AI interaction, whether one
      // field or both fields were selected. Charge when the generation
      // succeeds, not when the eventual email is sent.
      if (isAI) await consumeCredit();
      if (isAI && result) {
        setReview(result);
        setPhase('review');
      } else {
        onSent?.();
        onClose();
      }
    } catch (e) {
      setWebhookErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('form');
    }
  };

  const handleFinalSend = async () => {
    setWebhookErr(null);
    setPhase('sending');
    try {
      await callWebhook(buildFinal());
      onSent?.();
      onClose();
    } catch (e) {
      setWebhookErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('review');
    }
  };

  const handleSubmitEdit = async () => {
    if (!editText.trim()) return;
    setWebhookErr(null);
    setPhase('sending');
    try {
      const result = await callWebhook(buildEdit());
      await consumeCredit();
      setEditText('');
      setReview(result ?? review);
      setPhase('review');
    } catch (e) {
      setWebhookErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('editing');
    }
  };

  /* ── Animations ── */
  const backdropV: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
  const cardV: Variants = {
    hidden:  { opacity: 0, scale: 0.96, y: 8 },
    visible: { opacity: 1, scale: 1,    y: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 30 } },
    exit:    { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.18 } },
  };

  /* ── Render helpers ── */
  const renderForm = () => (
    <div className="flex flex-col gap-[14px]">
      {/* Email + contacts picker */}
      <div>
        <Label>To</Label>
        <div className="mt-[5px] relative" ref={pickerRef}>
          <div className="flex items-center gap-[6px]">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailErr(''); }}
              placeholder="recipient@example.com"
              disabled={!!initialEmail}
              className={`
                flex-1 h-[38px] px-[12px] rounded-[8px] text-[13px]
                border outline-none transition-all duration-150
                bg-white text-[#0a0a0a] placeholder-[#bbb]
                focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8
                ${emailErr ? 'border-[#e74c3c]' : 'border-[#e5e5e5]'}
                ${initialEmail ? 'opacity-60 cursor-not-allowed' : ''}
              `}
            />
            {!initialEmail && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => setPickerOpen(v => !v)}
                title="Pick from contacts"
                className={`
                  flex-shrink-0 w-[38px] h-[38px] rounded-[8px] border flex items-center justify-center transition-colors duration-150
                  ${pickerOpen
                    ? 'bg-[#0a0a0a] border-[#0a0a0a] shadow-[0_0_0_2px_rgba(10,10,10,0.08)]'
                    : 'bg-white border-[#e5e5e5] hover:border-[#ccc] hover:bg-[#f9f9f9]'}
                `}
              >
                <BookUser size={15} strokeWidth={1.8} className={pickerOpen ? 'text-white' : 'text-[#888]'} />
              </motion.button>
            )}
          </div>
          <FieldError msg={emailErr} />

          <AnimatePresence>
            {pickerOpen && (
              <ContactsPicker
                onSelect={(em) => { setEmail(em); setEmailErr(''); }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Subject */}
      <div>
        <Label>Subject</Label>
        <div className="mt-[5px] flex items-center gap-[6px]">
          <input
            type="text"
            value={aiSubject ? '' : subject}
            onChange={(e) => { setSubject(e.target.value); setSubjectErr(''); }}
            placeholder={aiSubject ? 'AI will write the subject' : 'Email subject line'}
            disabled={aiSubject}
            className={`
              flex-1 h-[38px] px-[12px] rounded-[8px] text-[13px]
              border outline-none transition-all duration-150
              bg-white text-[#0a0a0a] placeholder-[#bbb]
              focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8
              ${subjectErr ? 'border-[#e74c3c]' : 'border-[#e5e5e5]'}
              ${aiSubject ? 'bg-[#f9f9f9] opacity-60 cursor-not-allowed' : ''}
            `}
          />
          <AiToggle on={aiSubject} onToggle={() => setAiSubject((v) => !v)} />
        </div>
        <FieldError msg={subjectErr} />
      </div>

      {/* Body */}
      <div>
        <Label>{aiBody ? 'Describe this email (AI will write it)' : 'Message'}</Label>
        <div className="mt-[5px] flex items-start gap-[6px]">
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setBodyErr(''); }}
            placeholder={aiBody
              ? 'Describe what this email should be about — the more detail, the better...'
              : 'Write your message here...'}
            rows={5}
            className={`
              flex-1 px-[12px] py-[10px] rounded-[8px] text-[13px] resize-none
              border outline-none transition-all duration-150
              bg-white text-[#0a0a0a] placeholder-[#bbb] leading-[1.6]
              focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8
              ${bodyErr ? 'border-[#e74c3c]' : 'border-[#e5e5e5]'}
            `}
          />
          <AiToggle on={aiBody} onToggle={() => setAiBody((v) => !v)} />
        </div>
        <FieldError msg={bodyErr} />
      </div>

      {/* Webhook error */}
      {webhookErr && (
        <div className="flex items-center gap-[8px] bg-[#fdf0ef] border border-[#f5c6c2] rounded-[8px] px-[12px] py-[9px]">
          <AlertCircle size={13} className="text-[#c0392b] flex-shrink-0" strokeWidth={2} />
          <p className="text-[12px] text-[#c0392b]">{webhookErr}</p>
        </div>
      )}

      {/* Send button */}
      <button
        onClick={handleSend}
        className="w-full h-[42px] bg-[#0a0a0a] text-white text-[13px] font-semibold rounded-[10px] flex items-center justify-center gap-[8px] hover:bg-[#222] transition-colors duration-150 active:scale-[0.98]"
      >
        <Send size={14} strokeWidth={2} />
        {(aiSubject || aiBody) ? 'Generate & Review' : 'Send Message'}
      </button>
    </div>
  );

  const renderSending = () => (
    <div className="flex flex-col items-center justify-center py-[48px] gap-[14px]">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 size={28} strokeWidth={1.8} className="text-[#0a0a0a]" />
      </motion.div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-[#0a0a0a]">
          {phase === 'sending' ? 'Processing…' : 'Sending…'}
        </p>
        <p className="text-[12px] text-[#aaa] mt-[2px]">
          {(aiSubject || aiBody) ? 'AI is writing your email' : 'Sending your message'}
        </p>
      </div>
    </div>
  );

  const renderReview = () => (
    <div className="flex flex-col gap-[14px]">
      {/* AI badge */}
      <div className="flex items-center gap-[8px] bg-[#f9f9f9] border border-[#ebebeb] rounded-[8px] px-[12px] py-[8px]">
        <FlowPointLogo className="w-[22px] h-[22px] rounded-full flex-shrink-0" alt="" />
        <p className="text-[12px] text-[#555]">
          AI draft ready — review and edit before sending.
        </p>
      </div>

      {/* Editable subject */}
      <div>
        <Label>Subject</Label>
        <input
          type="text"
          value={review.subject}
          onChange={(e) => setReview((r) => ({ ...r, subject: e.target.value }))}
          className="mt-[5px] w-full h-[38px] px-[12px] rounded-[8px] text-[13px] border border-[#e5e5e5] outline-none focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8 bg-white text-[#0a0a0a] transition-all duration-150"
        />
      </div>

      {/* Editable body */}
      <div>
        <Label>Message</Label>
        <textarea
          value={review.body}
          onChange={(e) => setReview((r) => ({ ...r, body: e.target.value }))}
          rows={6}
          className="mt-[5px] w-full px-[12px] py-[10px] rounded-[8px] text-[13px] border border-[#e5e5e5] outline-none focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8 bg-white text-[#0a0a0a] resize-none leading-[1.6] transition-all duration-150"
        />
      </div>

      {/* Webhook error */}
      {webhookErr && (
        <div className="flex items-center gap-[8px] bg-[#fdf0ef] border border-[#f5c6c2] rounded-[8px] px-[12px] py-[9px]">
          <AlertCircle size={13} className="text-[#c0392b] flex-shrink-0" strokeWidth={2} />
          <p className="text-[12px] text-[#c0392b]">{webhookErr}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-[8px]">
        <button
          onClick={handleFinalSend}
          className="flex-1 h-[40px] bg-[#0a0a0a] text-white text-[13px] font-semibold rounded-[10px] flex items-center justify-center gap-[7px] hover:bg-[#222] transition-colors duration-150 active:scale-[0.98]"
        >
          <CheckCircle2 size={14} strokeWidth={2} />
          Approve &amp; Send
        </button>
        <button
          onClick={() => { setEditText(''); setPhase('editing'); }}
          className="flex-1 h-[40px] bg-white text-[#0a0a0a] text-[13px] font-semibold rounded-[10px] border border-[#e5e5e5] flex items-center justify-center gap-[7px] hover:bg-[#f4f4f4] transition-colors duration-150 active:scale-[0.98]"
        >
          <Pencil size={13} strokeWidth={2} />
          Request Edits
        </button>
      </div>
    </div>
  );

  const renderEditing = () => (
    <div className="flex flex-col gap-[14px]">
      {/* Current draft (collapsed preview) */}
      <div className="border border-[#ebebeb] rounded-[8px] p-[12px] bg-[#fafafa] opacity-60 pointer-events-none">
        <p className="text-[11px] font-semibold text-[#888] uppercase tracking-wider mb-[6px]">Current Draft</p>
        <p className="text-[12px] font-medium text-[#333] truncate">{review.subject}</p>
        <p className="text-[12px] text-[#888] mt-[3px] line-clamp-2 leading-[1.5]">{review.body}</p>
      </div>

      {/* Edit instructions */}
      <div>
        <Label>Describe your requested changes</Label>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          placeholder="e.g. Make the tone more formal, shorten the second paragraph, add a closing line..."
          rows={4}
          className="mt-[5px] w-full px-[12px] py-[10px] rounded-[8px] text-[13px] border border-[#e5e5e5] outline-none focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8 bg-white text-[#0a0a0a] resize-none leading-[1.6] transition-all duration-150 placeholder-[#bbb]"
        />
      </div>

      {/* Webhook error */}
      {webhookErr && (
        <div className="flex items-center gap-[8px] bg-[#fdf0ef] border border-[#f5c6c2] rounded-[8px] px-[12px] py-[9px]">
          <AlertCircle size={13} className="text-[#c0392b] flex-shrink-0" strokeWidth={2} />
          <p className="text-[12px] text-[#c0392b]">{webhookErr}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-[8px]">
        <button
          onClick={handleSubmitEdit}
          disabled={!editText.trim()}
          className="flex-1 h-[40px] bg-[#0a0a0a] text-white text-[13px] font-semibold rounded-[10px] flex items-center justify-center gap-[7px] hover:bg-[#222] transition-colors duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles size={13} strokeWidth={2} />
          Submit Edit Request
        </button>
        <button
          onClick={() => setPhase('review')}
          className="h-[40px] px-[16px] bg-white text-[#555] text-[13px] font-medium rounded-[10px] border border-[#e5e5e5] hover:bg-[#f4f4f4] transition-colors duration-150"
        >
          Back
        </button>
      </div>
    </div>
  );

  const titles: Record<Phase, string> = {
    form:    'Send Message',
    sending: 'Processing',
    review:  'Review AI Draft',
    editing: 'Request Edits',
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        variants={backdropV}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.2 }}
        onClick={phase !== 'sending' ? onClose : undefined}
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50"
      />

      {/* Card */}
      <motion.div
        key="card"
        variants={cardV}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto w-full max-w-[460px] mx-[16px] bg-white rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-[#ebebeb] overflow-visible"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-[20px] pt-[18px] pb-[16px] border-b border-[#f0f0f0]">
            <div className="flex items-center gap-[8px]">
              {phase === 'review' && (
                <FlowPointLogo className="w-[22px] h-[22px] rounded-full" alt="" />
              )}
              <h2 className="text-[14px] font-semibold text-[#0a0a0a]">{titles[phase]}</h2>
            </div>
            {phase !== 'sending' && (
              <button
                onClick={onClose}
                className="w-[26px] h-[26px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-[20px] py-[18px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                {phase === 'form'    && renderForm()}
                {phase === 'sending' && renderSending()}
                {phase === 'review'  && renderReview()}
                {phase === 'editing' && renderEditing()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
