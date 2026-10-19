import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Plus, Send, Copy, Check, Loader2, AlertCircle, X,
  Trash2, Pencil, ScrollText, ShieldCheck, ShieldOff,
  FileText, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/lib/supabase';
import NotificationBell from '@/components/NotificationBell';
import { useSettingsCtx } from '@/contexts/SettingsContext';
import FlowPointLogo from '@/components/FlowPointLogo';
import {
  pushSingleNotification,
  clearWarningNotification,
} from '@/lib/notificationHelpers';

/* ─── Types ─── */
interface ChatEntry { chat_id: string; chat_title: string; chat_date: string; }
interface ChatMessage { id: string; chat_id: string; chat_title: string; chat_date: string; message: string; response: string | null; }
interface Policy { id: string; created_at: string; policy: string | null; name: string | null; active: boolean; }

/* ─── Constants ─── */
const CHAT_WEBHOOK = import.meta.env.VITE_WEBHOOK_POLICIES_CHAT as string;
const CHAT_SIDEBAR_W = 220;

/* ─── Helpers ─── */
async function callChatWebhook(chatId: string, message: string): Promise<string> {
  if (!CHAT_WEBHOOK) {
    throw new Error(
      'The policy assistant is not configured. Set VITE_WEBHOOK_POLICIES_CHAT in your environment.',
    );
  }

  const res = await fetch(CHAT_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message }),
  });
  if (!res.ok) throw new Error(`Webhook failed (${res.status})`);
  const raw = await res.text();
  try {
    const json = JSON.parse(raw);
    const obj = Array.isArray(json) ? json[0] : json;
    return obj?.response ?? obj?.text ?? obj?.message ?? obj?.output ?? obj?.content ?? raw;
  } catch { return raw; }
}

function generateTitle(msg: string): string {
  const words = msg.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length >= msg.trim().length ? words : words + '…';
}

function formatDate(iso: string): string {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ─── Modal Shell ─── */
function ModalShell({ children, onClose, maxWidth = 520 }: { children: React.ReactNode; onClose: () => void; maxWidth?: number; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        style={{ maxWidth, width: '100%' }}
        className="relative mx-[16px] bg-white rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-[#ebebeb] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {children}
      </motion.div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-[20px] py-[16px] border-b border-[#f0f0f0]">
      <p className="text-[14px] font-semibold text-[#0a0a0a]">{title}</p>
      <button onClick={onClose} className="w-[26px] h-[26px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150">
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ─── Chat Sidebar ─── */
function ChatSidebar({ open, onClose, chats, selectedId, onSelect, onNewChat, loading }: {
  open: boolean; onClose: () => void; chats: ChatEntry[]; selectedId: string | null;
  onSelect: (id: string) => void; onNewChat: () => void; loading: boolean;
}) {
  return (
    <motion.aside initial={false} animate={{ width: open ? CHAT_SIDEBAR_W : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex-shrink-0 flex flex-col h-full bg-white border-r border-[#ebebeb] overflow-hidden">
      <div className="flex items-center justify-between h-[52px] px-[10px] border-b border-[#ebebeb] flex-shrink-0" style={{ minWidth: CHAT_SIDEBAR_W }}>
        <span className="text-[11px] font-semibold text-[#888] uppercase tracking-wider pl-[2px] whitespace-nowrap">Chats</span>
        <button onClick={onClose} className="w-[24px] h-[24px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150 flex-shrink-0">
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
      <div className="px-[6px] py-[6px] border-b border-[#f4f4f4] flex-shrink-0" style={{ minWidth: CHAT_SIDEBAR_W }}>
        <button onClick={onNewChat} className="w-full flex items-center gap-[8px] h-[32px] rounded-[6px] px-[8px] text-[12px] font-medium text-[#555] hover:bg-[#f4f4f4] hover:text-[#0a0a0a] transition-colors duration-100">
          <Plus size={14} strokeWidth={2} className="flex-shrink-0" /><span className="whitespace-nowrap">New Chat</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-[4px] px-[6px] flex flex-col gap-[2px]" style={{ minWidth: CHAT_SIDEBAR_W }}>
        {loading && <div className="flex items-center justify-center py-[20px]"><Loader2 size={14} className="animate-spin text-[#ccc]" strokeWidth={1.8} /></div>}
        {!loading && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-[24px] gap-[6px] px-[8px]">
            <MessageSquare size={20} className="text-[#ddd]" strokeWidth={1.3} />
            <p className="text-[11px] text-[#bbb] text-center leading-[1.5]">No chats yet</p>
          </div>
        )}
        {chats.map(chat => {
          const active = selectedId === chat.chat_id;
          return (
            <button key={chat.chat_id} onClick={() => onSelect(chat.chat_id)}
              className={`w-full flex flex-col gap-[1px] rounded-[6px] px-[8px] py-[7px] text-left transition-colors duration-100 ${active ? 'bg-[#0a0a0a] text-white' : 'text-[#555] hover:bg-[#f4f4f4] hover:text-[#0a0a0a]'}`}>
              <p className={`text-[12px] font-medium truncate ${active ? 'text-white' : 'text-[#0a0a0a]'}`}>{chat.chat_title || 'New Chat'}</p>
              <p className={`text-[10px] mt-[1px] ${active ? 'text-white/60' : 'text-[#aaa]'}`}>{formatDate(chat.chat_date)}</p>
            </button>
          );
        })}
      </div>
    </motion.aside>
  );
}

/* ─── Message Bubble ─── */
function MessageBubble({ side, text, id, isThinking = false }: { side: 'left' | 'right'; text: string; id: string; isThinking?: boolean; }) {
  const [copied, setCopied] = useState(false);
  const isLeft = side === 'left';
  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
      className={`flex flex-col gap-[4px] max-w-[72%] ${isLeft ? 'items-start' : 'items-end self-end'}`}>
      <p className={`text-[10px] font-semibold px-[2px] flex items-center gap-[4px] ${isLeft ? 'text-[#888]' : 'text-[#aaa]'}`}>
        {isLeft ? 'You' : <><FlowPointLogo className="w-[13px] h-[13px]" alt="" />FlowPoint AI</>}
      </p>
      {isThinking ? (
        <div className="bg-[#f2f2f2] rounded-[14px] rounded-bl-[4px] px-[16px] py-[12px] flex items-center gap-[5px]">
          {[0, 1, 2].map(i => (
            <motion.div key={i} className="w-[6px] h-[6px] rounded-full bg-[#bbb]"
              animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
          ))}
        </div>
      ) : (
        <div className={`rounded-[14px] px-[14px] py-[10px] text-[13px] leading-[1.65] whitespace-pre-wrap break-words ${isLeft ? 'bg-[#f2f2f2] text-[#1a1a1a] rounded-bl-[4px]' : 'bg-[#0a0a0a] text-white rounded-br-[4px]'}`}>{text}</div>
      )}
      {!isThinking && (
        <button onClick={handleCopy} className={`flex items-center gap-[4px] text-[10px] font-medium px-[6px] py-[2px] rounded-[4px] transition-colors duration-150 ${copied ? 'text-[#27ae60]' : 'text-[#bbb] hover:text-[#555]'}`}>
          {copied ? <><Check size={10} strokeWidth={2.5} />Copied</> : <><Copy size={10} strokeWidth={2} />Copy</>}
        </button>
      )}
    </motion.div>
  );
}

/* ─── Chat View ─── */
function ChatView({ selectedChatId, messages, sending, sendError, onSend, pendingMsg }: {
  selectedChatId: string | null; messages: ChatMessage[]; sending: boolean;
  sendError: string | null; onSend: (msg: string) => void; pendingMsg: string | null;
}) {
  const [input, setInput]    = useState('');
  const bottomRef            = useRef<HTMLDivElement>(null);
  const textareaRef          = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending, pendingMsg]);
  useEffect(() => { setInput(''); }, [selectedChatId]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput(''); onSend(msg);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <div className="flex-1 overflow-y-auto px-[24px] py-[20px] flex flex-col gap-[16px]">
        {messages.length === 0 && !pendingMsg && (
          <div className="flex flex-col items-center justify-center h-full gap-[12px] text-center px-[32px]">
            <div className="w-[52px] h-[52px] rounded-full bg-[#f4f4f4] flex items-center justify-center">
              <MessageSquare size={22} className="text-[#ccc]" strokeWidth={1.4} />
            </div>
            <p className="text-[14px] font-semibold text-[#0a0a0a]">Ask about your policies</p>
            <p className="text-[13px] text-[#aaa] leading-[1.6] max-w-[300px]">
              Ask anything about your business policies and FlowPoint AI will help you find answers.
            </p>
          </div>
        )}
        {messages.map(row => (
          <React.Fragment key={row.id}>
            <MessageBubble side="left" text={row.message} id={`msg-${row.id}`} />
            {row.response && <MessageBubble side="right" text={row.response} id={`res-${row.id}`} />}
          </React.Fragment>
        ))}
        {pendingMsg && (
          <>
            <MessageBubble side="left" text={pendingMsg} id="pending-user" />
            <MessageBubble side="right" text="" id="thinking" isThinking />
          </>
        )}
        <div ref={bottomRef} />
      </div>
      {sendError && (
        <div className="mx-[24px] mb-[8px] flex items-center gap-[8px] bg-[#fdf0ef] border border-[#f5c6c2] rounded-[8px] px-[12px] py-[8px]">
          <AlertCircle size={12} className="text-[#c0392b] flex-shrink-0" strokeWidth={2} />
          <p className="text-[12px] text-[#c0392b] flex-1">{sendError}</p>
        </div>
      )}
      <div className="flex-shrink-0 px-[16px] py-[14px] border-t border-[#f0f0f0] bg-white">
        <div className="flex items-end gap-[10px] bg-[#f7f7f7] border border-[#e8e8e8] rounded-[12px] px-[14px] py-[10px] focus-within:border-[#0a0a0a] transition-colors duration-150">
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ask about your business policies…" rows={1} disabled={sending}
            className="flex-1 bg-transparent text-[13px] text-[#0a0a0a] placeholder-[#bbb] resize-none outline-none leading-[1.6] max-h-[120px] disabled:opacity-50"
            style={{ height: 'auto', minHeight: '22px' }}
            onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }} />
          <button onClick={handleSend} disabled={!input.trim() || sending}
            className="flex-shrink-0 w-[32px] h-[32px] rounded-[8px] bg-[#0a0a0a] text-white flex items-center justify-center hover:bg-[#222] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed">
            {sending ? <Loader2 size={13} strokeWidth={2} className="animate-spin" /> : <Send size={13} strokeWidth={2} />}
          </button>
        </div>
        <p className="text-[10px] text-[#ccc] mt-[5px] px-[2px]">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

/* ─── Policy Card ─── */
function PolicyCard({ policy, onView, onEdit, onDelete, onToggleActive }: {
  policy: Policy; onView: () => void; onEdit: () => void; onDelete: () => void; onToggleActive: () => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      className="bg-white border border-[#ebebeb] rounded-[12px] p-[16px] flex flex-col gap-[12px] hover:border-[#d0d0d0] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-150 cursor-pointer group"
      onClick={onView}>
      <div className="flex items-start justify-between gap-[10px]">
        <div className="flex items-center gap-[8px] min-w-0">
          <div className={`w-[32px] h-[32px] rounded-[8px] flex items-center justify-center flex-shrink-0 ${policy.active ? 'bg-[#f0fdf4]' : 'bg-[#f7f7f7]'}`}>
            <FileText size={15} strokeWidth={1.8} className={policy.active ? 'text-[#16a34a]' : 'text-[#aaa]'} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#0a0a0a] truncate leading-[1.3]">{policy.name || 'Untitled Policy'}</p>
            <p className="text-[11px] text-[#aaa] mt-[1px]">{new Date(policy.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-[4px] text-[10px] font-semibold rounded-[6px] px-[7px] py-[3px] ${policy.active ? 'bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]' : 'bg-[#f4f4f4] text-[#999] border border-[#e8e8e8]'}`}>
          {policy.active ? <ShieldCheck size={10} strokeWidth={2.5} /> : <ShieldOff size={10} strokeWidth={2} />}
          {policy.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p className="text-[12px] text-[#666] leading-[1.6] line-clamp-3">{policy.policy || <span className="italic text-[#bbb]">No policy content.</span>}</p>
      <div className="flex items-center gap-[6px] pt-[4px] border-t border-[#f4f4f4]" onClick={e => e.stopPropagation()}>
        <button onClick={onToggleActive}
          className={`flex items-center gap-[5px] h-[28px] px-[10px] rounded-[6px] text-[11px] font-medium border transition-colors duration-150 ${policy.active ? 'border-[#e8e8e8] text-[#888] hover:text-[#c0392b] hover:border-[#fdd] hover:bg-[#fff5f5]' : 'border-[#bbf7d0] text-[#16a34a] bg-[#f0fdf4] hover:bg-[#dcfce7]'}`}>
          {policy.active ? <ShieldOff size={11} strokeWidth={2} /> : <ShieldCheck size={11} strokeWidth={2} />}
          {policy.active ? 'Deactivate' : 'Set Active'}
        </button>
        <div className="ml-auto flex items-center gap-[4px]">
          <button onClick={onEdit} className="w-[28px] h-[28px] rounded-[6px] border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150" title="Edit"><Pencil size={11} strokeWidth={2} /></button>
          <button onClick={onDelete} className="w-[28px] h-[28px] rounded-[6px] border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#c0392b] hover:border-[#fdd] hover:bg-[#fff5f5] transition-colors duration-150" title="Delete"><Trash2 size={11} strokeWidth={2} /></button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Policy View Modal ─── */
function PolicyViewModal({ policy, onClose, onEdit, onDelete }: { policy: Policy; onClose: () => void; onEdit: () => void; onDelete: () => void; }) {
  return (
    <ModalShell onClose={onClose} maxWidth={580}>
      <ModalHeader title={policy.name || 'Untitled Policy'} onClose={onClose} />
      <div className="px-[20px] py-[16px] max-h-[60vh] overflow-y-auto">
        <pre className="text-[13px] text-[#333] leading-[1.75] whitespace-pre-wrap font-sans">{policy.policy || <span className="italic text-[#bbb]">No content.</span>}</pre>
      </div>
      <div className="flex items-center gap-[8px] px-[20px] py-[14px] border-t border-[#f0f0f0]">
        <span className={`inline-flex items-center gap-[4px] text-[11px] font-semibold rounded-[6px] px-[8px] py-[3px] ${policy.active ? 'bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]' : 'bg-[#f4f4f4] text-[#999] border border-[#e8e8e8]'}`}>
          {policy.active ? <ShieldCheck size={11} strokeWidth={2.5} /> : <ShieldOff size={11} strokeWidth={2} />}{policy.active ? 'Active' : 'Inactive'}
        </span>
        <div className="ml-auto flex gap-[8px]">
          <button onClick={onDelete} className="h-[34px] px-[14px] border border-[#fdd] rounded-[8px] text-[12px] font-medium text-[#c0392b] hover:bg-[#fff5f5] transition-colors duration-150 flex items-center gap-[6px]"><Trash2 size={12} strokeWidth={2} />Delete</button>
          <button onClick={onEdit} className="h-[34px] px-[14px] bg-[#0a0a0a] text-white rounded-[8px] text-[12px] font-semibold hover:bg-[#222] transition-colors duration-150 flex items-center gap-[6px]"><Pencil size={12} strokeWidth={2} />Edit</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─── Policy Edit/Add Modal ─── */
function PolicyEditModal({ initial, onClose, onSave }: { initial?: Policy; onClose: () => void; onSave: (name: string, policy: string) => Promise<void>; }) {
  const [name, setName]       = useState(initial?.name ?? '');
  const [text, setText]       = useState(initial?.policy ?? '');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [nameErr, setNameErr] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setNameErr('Policy name is required'); return; }
    setSaving(true); setErr(null);
    try { await onSave(name.trim(), text.trim()); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to save'); setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} maxWidth={580}>
      <ModalHeader title={initial ? 'Edit Policy' : 'Add Policy'} onClose={onClose} />
      <div className="px-[20px] py-[18px] flex flex-col gap-[14px]">
        <div>
          <p className="text-[11px] font-semibold text-[#555] uppercase tracking-wider mb-[6px]">Policy Name <span className="text-[#c0392b]">*</span></p>
          <input value={name} onChange={e => { setName(e.target.value); setNameErr(''); }} placeholder="e.g. Tenant Screening Policy"
            className={`w-full h-[38px] px-[12px] rounded-[8px] text-[13px] border outline-none transition-all duration-150 bg-white text-[#0a0a0a] placeholder-[#bbb] focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8 ${nameErr ? 'border-[#e74c3c]' : 'border-[#e5e5e5]'}`} />
          {nameErr && <p className="text-[11px] text-[#c0392b] mt-[3px] flex items-center gap-[4px]"><AlertCircle size={10} strokeWidth={2.5} />{nameErr}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#555] uppercase tracking-wider mb-[6px]">Policy Content</p>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write your policy here…" rows={12}
            className="w-full px-[12px] py-[10px] rounded-[8px] text-[13px] border border-[#e5e5e5] outline-none transition-all duration-150 bg-white text-[#0a0a0a] placeholder-[#bbb] leading-[1.7] resize-y focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8" />
        </div>
        {err && <div className="flex items-center gap-[8px] bg-[#fdf0ef] border border-[#f5c6c2] rounded-[8px] px-[12px] py-[8px]"><AlertCircle size={12} className="text-[#c0392b] flex-shrink-0" strokeWidth={2} /><p className="text-[12px] text-[#c0392b]">{err}</p></div>}
      </div>
      <div className="flex gap-[8px] px-[20px] py-[14px] border-t border-[#f0f0f0]">
        <button onClick={onClose} disabled={saving} className="h-[38px] px-[16px] border border-[#e5e5e5] rounded-[8px] text-[13px] font-medium text-[#555] hover:bg-[#f4f4f4] transition-colors duration-150 disabled:opacity-40">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 h-[38px] bg-[#0a0a0a] text-white text-[13px] font-semibold rounded-[8px] flex items-center justify-center gap-[7px] hover:bg-[#222] transition-colors duration-150 disabled:opacity-40">
          {saving && <Loader2 size={13} className="animate-spin" />}{initial ? 'Save Changes' : 'Add Policy'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Delete Confirm Modal ─── */
function DeleteConfirmModal({ policyName, onClose, onConfirm, deleting }: { policyName: string; onClose: () => void; onConfirm: () => void; deleting: boolean; }) {
  return (
    <ModalShell onClose={onClose} maxWidth={400}>
      <div className="px-[24px] py-[24px] flex flex-col gap-[16px]">
        <div className="w-[44px] h-[44px] rounded-full bg-[#fff0f0] flex items-center justify-center"><Trash2 size={20} className="text-[#c0392b]" strokeWidth={1.8} /></div>
        <div>
          <p className="text-[15px] font-semibold text-[#0a0a0a]">Delete policy?</p>
          <p className="text-[13px] text-[#666] mt-[4px] leading-[1.6]">"<strong>{policyName || 'Untitled Policy'}</strong>" will be permanently deleted.</p>
        </div>
        <div className="flex gap-[8px] pt-[4px]">
          <button onClick={onClose} disabled={deleting} className="flex-1 h-[38px] border border-[#e5e5e5] rounded-[8px] text-[13px] font-medium text-[#555] hover:bg-[#f4f4f4] transition-colors duration-150 disabled:opacity-40">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="flex-1 h-[38px] bg-[#c0392b] text-white text-[13px] font-semibold rounded-[8px] flex items-center justify-center gap-[7px] hover:bg-[#a93226] transition-colors duration-150 disabled:opacity-40">
            {deleting && <Loader2 size={13} className="animate-spin" />}Delete
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─── Activate Warning Modal ─── */
function ActivateWarningModal({ currentName, onClose, onConfirm }: { currentName: string; onClose: () => void; onConfirm: () => void; }) {
  return (
    <ModalShell onClose={onClose} maxWidth={400}>
      <div className="px-[24px] py-[24px] flex flex-col gap-[16px]">
        <div className="w-[44px] h-[44px] rounded-full bg-[#fffbeb] flex items-center justify-center"><ShieldCheck size={20} className="text-[#d97706]" strokeWidth={1.8} /></div>
        <div>
          <p className="text-[15px] font-semibold text-[#0a0a0a]">Change active policy?</p>
          <p className="text-[13px] text-[#666] mt-[4px] leading-[1.6]">"<strong>{currentName || 'Untitled Policy'}</strong>" is currently active and will be deactivated.</p>
        </div>
        <div className="flex gap-[8px] pt-[4px]">
          <button onClick={onClose} className="flex-1 h-[38px] border border-[#e5e5e5] rounded-[8px] text-[13px] font-medium text-[#555] hover:bg-[#f4f4f4] transition-colors duration-150">Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-[38px] bg-[#0a0a0a] text-white text-[13px] font-semibold rounded-[8px] hover:bg-[#222] transition-colors duration-150">Continue</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─── Policies View ─── */
function PoliciesView({ policies, loading, onRefresh, onAdd, onEdit, onDelete, onSetActive }: {
  policies: Policy[]; loading: boolean; onRefresh: () => void;
  onAdd: (name: string, policy: string) => Promise<void>;
  onEdit: (id: string, name: string, policy: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetActive: (id: string, currentActiveId: string | null) => Promise<void>;
}) {
  const [viewTarget,   setViewTarget]   = useState<Policy | null>(null);
  const [editTarget,   setEditTarget]   = useState<Policy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);
  const [activateWarn, setActivateWarn] = useState<{ target: Policy; currentActive: Policy } | null>(null);
  const [showAdd,      setShowAdd]      = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  const openEdit   = (p: Policy) => { setViewTarget(null); setEditTarget(p); };
  const openDelete = (p: Policy) => { setViewTarget(null); setDeleteTarget(p); };
  const currentActive = policies.find(p => p.active) ?? null;

  const handleToggleActive = (policy: Policy) => {
    if (policy.active) { onSetActive(policy.id, null); }
    else if (currentActive && currentActive.id !== policy.id) { setActivateWarn({ target: policy, currentActive }); }
    else { onSetActive(policy.id, null); }
  };

  const handleConfirmActivate = () => {
    if (!activateWarn) return;
    onSetActive(activateWarn.target.id, activateWarn.currentActive.id);
    setActivateWarn(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await onDelete(deleteTarget.id);
    setDeleting(false); setDeleteTarget(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between px-[20px] py-[14px] border-b border-[#ebebeb] flex-shrink-0 bg-white">
        <div className="flex items-center gap-[8px]">
          <p className="text-[14px] font-semibold text-[#0a0a0a]">Business Policies</p>
          {!loading && <span className="text-[12px] text-[#aaa]">{policies.length} {policies.length === 1 ? 'policy' : 'policies'}</span>}
        </div>
        <div className="flex items-center gap-[8px]">
          <button onClick={onRefresh} disabled={loading} className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-all duration-150 disabled:opacity-40">
            <motion.div animate={{ rotate: loading ? 360 : 0 }} transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }}><RefreshCw size={13} strokeWidth={2} /></motion.div>
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-[7px] h-[32px] px-[14px] bg-[#0a0a0a] text-white text-[12px] font-semibold rounded-[8px] hover:bg-[#222] transition-colors duration-150">
            <Plus size={13} strokeWidth={2.5} />Add Policy
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-[20px] py-[16px]">
        {loading && <div className="flex items-center justify-center py-[48px]"><Loader2 size={20} className="animate-spin text-[#ccc]" strokeWidth={1.8} /></div>}
        {!loading && policies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-[64px] gap-[10px]">
            <ScrollText size={32} className="text-[#ddd]" strokeWidth={1.2} />
            <p className="text-[14px] font-semibold text-[#0a0a0a]">No policies yet</p>
            <p className="text-[13px] text-[#aaa]">Click "Add Policy" to create your first one.</p>
          </div>
        )}
        {!loading && policies.length > 0 && (
          <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
            className="grid grid-cols-1 gap-[12px] max-w-[900px]">
            {policies.map(p => (
              <PolicyCard key={p.id} policy={p}
                onView={() => setViewTarget(p)} onEdit={() => openEdit(p)} onDelete={() => openDelete(p)}
                onToggleActive={() => handleToggleActive(p)} />
            ))}
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {viewTarget && <PolicyViewModal key="view" policy={viewTarget} onClose={() => setViewTarget(null)} onEdit={() => openEdit(viewTarget)} onDelete={() => openDelete(viewTarget)} />}
        {editTarget && <PolicyEditModal key="edit" initial={editTarget} onClose={() => setEditTarget(null)} onSave={(name, policy) => onEdit(editTarget.id, name, policy)} />}
        {showAdd && <PolicyEditModal key="add" onClose={() => setShowAdd(false)} onSave={onAdd} />}
        {deleteTarget && <DeleteConfirmModal key="delete" policyName={deleteTarget.name ?? ''} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} deleting={deleting} />}
        {activateWarn && <ActivateWarningModal key="activate-warn" currentName={activateWarn.currentActive.name ?? ''} onClose={() => setActivateWarn(null)} onConfirm={handleConfirmActivate} />}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main Page ─── */
export default function BusinessPoliciesPage() {
  useAuth();

  type Tab = 'chat' | 'policies';
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  /* Chat state — initialize with a new chat ID immediately */
  const [chats,         setChats]         = useState<ChatEntry[]>([]);
  const [chatsLoading,  setChatsLoading]  = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string>(() => crypto.randomUUID());
  const [messages,      setMessages]      = useState<ChatMessage[]>([]);
  const [msgsLoading,   setMsgsLoading]   = useState(false);
  const [pendingMsg,    setPendingMsg]     = useState<string | null>(null);
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState<string | null>(null);

  /* Policies state */
  const [policies,        setPolicies]        = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);

  /* Session */
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data: { session } }) => { if (session) setSessionReady(true); }); }, []);

  const fetchChats = async () => {
    setChatsLoading(true);
    const { data } = await supabase.from('business_policies_chats').select('chat_id, chat_title, chat_date').order('chat_date', { ascending: false });
    if (data) {
      const seen = new Set<string>(), unique: ChatEntry[] = [];
      for (const row of data as ChatEntry[]) { if (!seen.has(row.chat_id)) { seen.add(row.chat_id); unique.push(row); } }
      setChats(unique);
    }
    setChatsLoading(false);
  };

  const fetchMessages = async (chatId: string) => {
    setMsgsLoading(true);
    const { data } = await supabase.from('business_policies_chats').select('*').eq('chat_id', chatId).order('chat_date', { ascending: true });
    setMessages((data as ChatMessage[]) ?? []);
    setMsgsLoading(false);
  };

  const fetchPolicies = async () => {
    setPoliciesLoading(true);
    const { data } = await supabase.from('policies').select('*').order('created_at', { ascending: false });
    setPolicies((data as Policy[]) ?? []);
    setPoliciesLoading(false);
  };

  useEffect(() => { if (sessionReady) { fetchChats(); fetchPolicies(); } }, [sessionReady]);
  useEffect(() => { if (selectedChatId) fetchMessages(selectedChatId); else setMessages([]); }, [selectedChatId]);

  const handleNewChat = () => {
    setSelectedChatId(crypto.randomUUID());
    setMessages([]); setSendError(null); setActiveTab('chat');
  };

  const handleSelectChat = (id: string) => {
    setSelectedChatId(id); setSendError(null); setActiveTab('chat');
  };

  const { consumeCredit } = useSettingsCtx();

  const handleSend = async (userMsg: string) => {
    if (!selectedChatId) return;
    setSending(true); setSendError(null); setPendingMsg(userMsg);
    const isFirstMsg = messages.length === 0;
    const title = isFirstMsg ? generateTitle(userMsg) : (chats.find(c => c.chat_id === selectedChatId)?.chat_title ?? 'Chat');
    try {
      const aiResponse = await callChatWebhook(selectedChatId, userMsg);
      await consumeCredit();
      const { data: inserted } = await supabase.from('business_policies_chats').insert({
        chat_id: selectedChatId, chat_title: title, chat_date: new Date().toISOString(), message: userMsg, response: aiResponse,
      }).select().single();
      if (inserted) setMessages(prev => [...prev, inserted as ChatMessage]);
      setChats(prev => {
        const existing = prev.find(c => c.chat_id === selectedChatId);
        if (existing) return prev;
        return [{ chat_id: selectedChatId, chat_title: title, chat_date: new Date().toISOString() }, ...prev];
      });
    } catch (e) { setSendError(e instanceof Error ? e.message : 'Failed to send message.'); }
    finally { setSending(false); setPendingMsg(null); }
  };

  /* Policy CRUD */
  const handleAddPolicy = async (name: string, policy: string) => {
    const { data, error } = await supabase.from('policies').insert({ name, policy, active: false }).select().single();
    if (error) throw new Error(error.message);
    setPolicies(prev => [data as Policy, ...prev]);
    pushSingleNotification('policy_added', 'Policy Added', `"${name}" policy was created.`).catch(() => {});
    clearWarningNotification('warning_no_policies').catch(() => {});
  };
  const handleEditPolicy = async (id: string, name: string, policy: string) => {
    const { error } = await supabase.from('policies').update({ name, policy }).eq('id', id);
    if (error) throw new Error(error.message);
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, name, policy } : p));
  };
  const handleDeletePolicy = async (id: string) => {
    const { error } = await supabase.from('policies').delete().eq('id', id);
    if (error) throw new Error(error.message);
    setPolicies(prev => prev.filter(p => p.id !== id));
  };
  const handleSetActive = async (id: string, currentActiveId: string | null) => {
    if (currentActiveId && currentActiveId !== id) await supabase.from('policies').update({ active: false }).eq('id', currentActiveId);
    const target = policies.find(p => p.id === id);
    const newVal = target ? !target.active : true;
    await supabase.from('policies').update({ active: newVal }).eq('id', id);
    setPolicies(prev => prev.map(p => { if (p.id === currentActiveId) return { ...p, active: false }; if (p.id === id) return { ...p, active: newVal }; return p; }));
  };

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">
        <ChatSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}
          chats={chats} selectedId={selectedChatId} onSelect={handleSelectChat} onNewChat={handleNewChat} loading={chatsLoading} />

        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          {/* Tabs */}
          <div className="flex items-center h-[52px] px-[16px] border-b border-[#ebebeb] bg-white flex-shrink-0 gap-[4px]">
            <AnimatePresence>
              {!sidebarOpen && (
                <motion.button key="sidebar-open"
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                  onClick={() => setSidebarOpen(true)} title="Open chat history"
                  className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] bg-white shadow-sm flex items-center justify-center text-[#666] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150 mr-[4px] flex-shrink-0">
                  <MessageSquare size={13} strokeWidth={1.8} />
                </motion.button>
              )}
            </AnimatePresence>
            {(['chat', 'policies'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-[6px] h-[32px] px-[14px] rounded-[7px] text-[13px] font-medium transition-colors duration-150 ${activeTab === tab ? 'bg-[#0a0a0a] text-white' : 'text-[#666] hover:bg-[#f4f4f4] hover:text-[#0a0a0a]'}`}>
                {tab === 'chat' ? <><MessageSquare size={13} strokeWidth={1.9} />Chat</> : <><ScrollText size={13} strokeWidth={1.9} />Policies</>}
              </button>
            ))}
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === 'chat' ? (
                <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {msgsLoading ? (
                    <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-[#ccc]" strokeWidth={1.8} /></div>
                  ) : (
                    <ChatView selectedChatId={selectedChatId} messages={messages} sending={sending} sendError={sendError} onSend={handleSend} pendingMsg={pendingMsg} />
                  )}
                </motion.div>
              ) : (
                <motion.div key="policies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <PoliciesView policies={policies} loading={policiesLoading} onRefresh={fetchPolicies}
                    onAdd={handleAddPolicy} onEdit={handleEditPolicy} onDelete={handleDeletePolicy} onSetActive={handleSetActive} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
