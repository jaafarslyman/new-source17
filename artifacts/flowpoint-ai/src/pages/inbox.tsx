import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Pin, Star, Inbox as InboxIcon, AlertCircle, X, RefreshCw, ChevronRight,
  Send, Pencil, Search, SlidersHorizontal, Trash2, Plus,
  Check, Loader2, MoreHorizontal, Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/lib/supabase';
import type { InboxEmail, EmailThread } from '@/lib/inboxTypes';
import SendMessageModal from '@/components/SendMessageModal';
import NotificationBell from '@/components/NotificationBell';
import FlowPointLogo from '@/components/FlowPointLogo';
import {
  pushSingleNotification,
  clearWarningNotification,
  pushStackableNotification,
} from '@/lib/notificationHelpers';

/* ─── Types ─── */
interface SendTarget { initialEmail?: string; threadId?: string | null; }

interface Category {
  id: string;
  created_at: string;
  category: string;
  description: string | null;
}

interface InboxFilters {
  urgency: 'all' | 'urgent' | 'non-urgent';
  response: 'all' | 'with-response' | 'no-response';
  dateRange: 'all' | 'today' | 'week' | 'month';
}

const DEFAULT_FILTERS: InboxFilters = { urgency: 'all', response: 'all', dateRange: 'all' };

/* ─── System Categories ─── */
interface SysCat { key: string; label: string; icon: React.ReactNode; }
const SYSTEM_CATEGORIES: SysCat[] = [
  { key: 'All', label: 'All', icon: <InboxIcon size={14} strokeWidth={1.8} /> },
  { key: 'Starred', label: 'Starred', icon: <Star     size={14} strokeWidth={1.8} /> },
  { key: 'Sent',    label: 'Sent',    icon: <Send     size={14} strokeWidth={1.8} /> },
  { key: 'Urgent',  label: 'Urgent',  icon: <Zap      size={14} strokeWidth={1.8} /> },
];

/* ─── Avatar gradients ─── */
const GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)','linear-gradient(135deg,#f5576c,#f093fb)',
  'linear-gradient(135deg,#2193b0,#6dd5ed)','linear-gradient(135deg,#11998e,#38ef7d)',
  'linear-gradient(135deg,#c94b4b,#4b134f)','linear-gradient(135deg,#5f72be,#9b23ea)',
  'linear-gradient(135deg,#f7971e,#e85d04)','linear-gradient(135deg,#1565c0,#4dd0e1)',
  'linear-gradient(135deg,#cc2b5e,#753a88)','linear-gradient(135deg,#134e5e,#71b280)',
  'linear-gradient(135deg,#eb3349,#f45c43)','linear-gradient(135deg,#0f3460,#533483)',
  'linear-gradient(135deg,#d4145a,#fbb03b)','linear-gradient(135deg,#0072ff,#00c6ff)',
  'linear-gradient(135deg,#7f00ff,#e100ff)','linear-gradient(135deg,#f953c6,#b91d73)',
  'linear-gradient(135deg,#1e3c72,#2a5298)','linear-gradient(135deg,#4e54c8,#8f94fb)',
  'linear-gradient(135deg,#f12711,#f5af19)','linear-gradient(135deg,#2c3e50,#3498db)',
];
function gradStyle(name: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h >>>= 0; }
  return { background: GRADIENTS[h % GRADIENTS.length] };
}
function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
function formatDate(iso: string): string {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7)   return d.toLocaleDateString([], { weekday: 'short' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}
function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function getSubject(e: InboxEmail) { return e.subject?.trim() ?? ''; }
function getBody(e: InboxEmail)    { return e.body?.trim() ?? ''; }

function groupIntoThreads(emails: InboxEmail[]): EmailThread[] {
  const map = new Map<string, InboxEmail[]>();
  for (const email of emails) {
    const tid = email['thread id'] ?? email.Id;
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid)!.push(email);
  }
  const threads: EmailThread[] = [];
  map.forEach((arr, threadId) => {
    const sorted = [...arr].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    threads.push({ threadId, latest: sorted[0], emails: sorted });
  });
  return threads.sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
}

/* ─── Primitives ─── */
function Avatar({ name }: { name: string }) {
  return (
    <div className="w-[40px] h-[40px] rounded-full flex-shrink-0 flex items-center justify-center text-white text-[13px] font-semibold shadow-sm select-none" style={gradStyle(name)}>
      {initials(name)}
    </div>
  );
}
function UrgencyBadge() {
  return (
    <span className="inline-flex items-center gap-[3px] text-[9px] font-bold text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-[4px] px-[5px] py-[1px] leading-[1.4] tracking-[0.3px] uppercase">
      <AlertCircle size={8} strokeWidth={2.5} />Urgent
    </span>
  );
}

/* ─── Add / Edit Category Modal ─── */
function AddEditCategoryModal({ editing, onSave, onClose }: {
  editing: Category | null;
  onSave: (name: string, desc: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName]   = useState(editing?.category    ?? '');
  const [desc, setDesc]   = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [errs, setErrs]   = useState<{ name?: string; desc?: string }>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const validate = () => {
    const e: { name?: string; desc?: string } = {};
    if (!name.trim()) e.name = 'Category name is required';
    if (!desc.trim()) e.desc = 'Description is required';
    setErrs(e);
    return !Object.keys(e).length;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setSaveErr(null);
    try { await onSave(name.trim(), desc.trim()); onClose(); }
    catch (e) { setSaveErr(e instanceof Error ? e.message : 'Failed to save'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="relative mx-[16px] bg-white rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-[#ebebeb] overflow-hidden"
        style={{ maxWidth: 440, width: '100%' }}
      >
        <div className="flex items-center justify-between px-[20px] pt-[18px] pb-[14px] border-b border-[#f0f0f0]">
          <h2 className="text-[14px] font-semibold text-[#0a0a0a]">{editing ? 'Edit Category' : 'Add Category'}</h2>
          <button onClick={onClose} className="w-[26px] h-[26px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150">
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-[20px] py-[18px] flex flex-col gap-[12px]">
          <div>
            <p className="text-[11px] font-semibold text-[#555] uppercase tracking-wider mb-[5px]">
              Category Name <span className="text-[#c0392b]">*</span>
            </p>
            <input
              value={name} onChange={e => { setName(e.target.value); setErrs(v => ({ ...v, name: '' })); }}
              placeholder="e.g. Maintenance" autoFocus
              className={`w-full h-[38px] px-[12px] rounded-[8px] text-[13px] border outline-none transition-all duration-150 bg-white text-[#0a0a0a] placeholder-[#bbb] focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8 ${errs.name ? 'border-[#e74c3c]' : 'border-[#e5e5e5]'}`}
            />
            {errs.name && <p className="text-[11px] text-[#c0392b] mt-[3px] flex items-center gap-[4px]"><AlertCircle size={10} strokeWidth={2.5} />{errs.name}</p>}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#555] uppercase tracking-wider mb-[5px]">
              Description <span className="text-[#c0392b]">*</span>
            </p>
            <textarea
              value={desc} onChange={e => { setDesc(e.target.value); setErrs(v => ({ ...v, desc: '' })); }}
              placeholder="Describe what this category is for…" rows={3}
              className={`w-full px-[12px] py-[10px] rounded-[8px] text-[13px] border outline-none resize-none transition-all duration-150 leading-[1.6] bg-white text-[#0a0a0a] placeholder-[#bbb] focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/8 ${errs.desc ? 'border-[#e74c3c]' : 'border-[#e5e5e5]'}`}
            />
            {errs.desc && <p className="text-[11px] text-[#c0392b] mt-[3px] flex items-center gap-[4px]"><AlertCircle size={10} strokeWidth={2.5} />{errs.desc}</p>}
          </div>
          {saveErr && <p className="text-[12px] text-[#c0392b] flex items-center gap-[6px]"><AlertCircle size={12} />{saveErr}</p>}
          <div className="flex gap-[8px] pt-[2px]">
            <button onClick={onClose} disabled={saving} className="h-[40px] px-[16px] border border-[#e5e5e5] rounded-[10px] text-[13px] font-medium text-[#555] hover:bg-[#f4f4f4] transition-colors duration-150 disabled:opacity-40">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 h-[40px] bg-[#0a0a0a] text-white text-[13px] font-semibold rounded-[10px] flex items-center justify-center gap-[7px] hover:bg-[#222] transition-colors duration-150 disabled:opacity-40">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2} />}
              {editing ? 'Save Changes' : 'Add Category'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Delete Category Confirm ─── */
function DeleteCategoryModal({ name, onConfirm, onCancel, deleting }: {
  name: string; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        onClick={onCancel} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="relative mx-[16px] bg-white rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-[#ebebeb] overflow-hidden"
        style={{ maxWidth: 360, width: '100%' }}
      >
        <div className="px-[24px] py-[24px] flex flex-col items-center text-center gap-[14px]">
          <div className="w-[44px] h-[44px] rounded-full bg-[#fff0f0] border border-[#fdd] flex items-center justify-center">
            <Trash2 size={18} className="text-[#c0392b]" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#0a0a0a]">Delete "{name}"?</p>
            <p className="text-[12px] text-[#888] mt-[4px]">Emails in this category won't be deleted, just uncategorized.</p>
          </div>
          <div className="flex gap-[8px] w-full">
            <button onClick={onCancel} disabled={deleting} className="flex-1 h-[38px] border border-[#e5e5e5] rounded-[10px] text-[13px] font-medium text-[#555] hover:bg-[#f4f4f4] transition-colors duration-150 disabled:opacity-40">Cancel</button>
            <button onClick={onConfirm} disabled={deleting} className="flex-1 h-[38px] bg-[#c0392b] text-white rounded-[10px] text-[13px] font-semibold flex items-center justify-center gap-[6px] hover:bg-[#a93226] transition-colors duration-150 disabled:opacity-40">
              {deleting && <Loader2 size={13} className="animate-spin" />}Delete
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Email Card ─── */
const cardVariants: Variants = { hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } };

function EmailCard({ thread, pinned, starred, onPin, onStar, onClick, selected }: {
  thread: EmailThread; pinned: boolean; starred: boolean;
  onPin: () => void; onStar: () => void; onClick: () => void; selected: boolean;
}) {
  const { latest } = thread;
  const senderName  = latest['sender name']  ?? 'Unknown';
  const senderEmail = latest['sender email'] ?? '';
  const subject     = getSubject(latest);
  const category    = latest.category ?? '';
  const isUrgent    = latest.urgency?.toLowerCase() === 'urgent';

  return (
    <motion.div variants={cardVariants} layout onClick={onClick}
      className={`group relative flex items-start gap-[12px] px-[16px] py-[13px] cursor-pointer border-b transition-all duration-150 ${selected ? 'bg-[#f0eeeb]' : 'hover:bg-[#faf9f7]'}`}
      style={{ borderBottomColor: '#eceae6' }}
    >
      {/* Pinned indicator */}
      {pinned && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#0a0a0a] rounded-r-full" />}
      {/* Urgent indicator — only when not also pinned */}
      {isUrgent && !pinned && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#dc2626] rounded-r-full" />}
      <Avatar name={senderName} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#0d0d0d] truncate leading-[1.4] tracking-[-0.1px]">{senderName}</p>
        <p className="text-[11px] text-[#9a9898] truncate leading-[1.4] mt-[1px]">{senderEmail}</p>
        <p className="text-[12px] text-[#555] truncate leading-[1.4] mt-[2px]">
          {subject || <span className="text-[#c4c2be] italic">No subject</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-[6px] flex-shrink-0 ml-[8px]">
        <div className="flex items-center gap-[4px]">
          <button onClick={e => { e.stopPropagation(); onPin(); }} aria-label="Pin"
            className={`p-[3px] rounded-[4px] transition-colors duration-100 ${pinned ? 'text-[#0a0a0a]' : 'text-[#d4d2ce] hover:text-[#0a0a0a]'}`}>
            <Pin size={12} strokeWidth={2} className={pinned ? 'fill-[#0a0a0a]' : ''} />
          </button>
          <button onClick={e => { e.stopPropagation(); onStar(); }} aria-label="Star"
            className={`p-[3px] rounded-[4px] transition-colors duration-100 ${starred ? 'text-[#d4a017]' : 'text-[#d4d2ce] hover:text-[#d4a017]'}`}>
            <Star size={12} strokeWidth={2} className={starred ? 'fill-[#d4a017]' : ''} />
          </button>
        </div>
        <div className="flex flex-col items-end gap-[3px]">
          {category && <span className="text-[10px] font-medium text-[#888] bg-[#eeecea] rounded-[4px] px-[6px] py-[1px]" style={{ border: '1px solid #e2e0db' }}>{category}</span>}
          {isUrgent && <UrgencyBadge />}
        </div>
        <span className="text-[10px] font-medium text-[#b8b5b0]">{formatDate(latest.created_at)}</span>
      </div>
    </motion.div>
  );
}

/* ─── Message Bubble ─── */
function MessageBubble({ side, label, labelDetail, body, timestamp, avatar }: {
  side: 'left' | 'right'; label: string; labelDetail?: string;
  body: string; timestamp: string; avatar: React.ReactNode;
}) {
  const isRight = side === 'right';
  return (
    <div className={`flex items-end gap-[8px] min-w-0 ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="flex-shrink-0 mb-[4px]">{avatar}</div>
      <div className={`flex flex-col gap-[3px] min-w-0 max-w-[78%] ${isRight ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-[6px] ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[11px] font-semibold text-[#0a0a0a]">{label}</span>
          {labelDetail && <span className="text-[10px] text-[#aaa]">{labelDetail}</span>}
        </div>
        <div className={`rounded-[14px] px-[14px] py-[10px] text-[12px] leading-[1.65] whitespace-pre-wrap break-words ${isRight ? 'bg-[#0a0a0a] text-white rounded-br-[4px]' : 'bg-[#f2f2f2] text-[#1a1a1a] rounded-bl-[4px]'}`}>
          {body}
        </div>
        <span className="text-[10px] text-[#bbb] px-[2px]">{timestamp}</span>
      </div>
    </div>
  );
}

/* ─── Email Detail Panel ─── */
const panelVariants: Variants = {
  hidden:  { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 32 } },
  exit:    { x: '100%', opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
};

function EmailDetailPanel({ thread, onClose, onSendMessage }: {
  thread: EmailThread; onClose: () => void; onSendMessage: (t: SendTarget) => void;
}) {
  const { latest, emails } = thread;
  const senderName  = latest['sender name']  ?? 'Unknown';
  const senderEmail = latest['sender email'] ?? '';
  const subject     = getSubject(latest);
  const isUrgent    = latest.urgency?.toLowerCase() === 'urgent';
  const chronological = useMemo(() =>
    [...emails].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [emails]
  );
  return (
    <motion.div key={thread.threadId} variants={panelVariants} initial="hidden" animate="visible" exit="exit"
      className="w-[440px] max-w-full flex-shrink-0 flex flex-col bg-white h-full min-h-0 overflow-hidden"
      style={{ borderLeft: '1px solid #e2e0db', boxShadow: '-8px 0 32px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-start gap-[12px] px-[20px] pt-[18px] pb-[14px] border-b border-[#f0f0f0] flex-shrink-0">
        <Avatar name={senderName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[8px] flex-wrap">
            <p className="text-[13px] font-semibold text-[#0a0a0a]">{senderName}</p>
            {isUrgent && <UrgencyBadge />}
          </div>
          <p className="text-[11px] text-[#888] mt-[1px]">{senderEmail}</p>
          {subject && <p className="text-[12px] font-medium text-[#333] mt-[4px] leading-[1.4]">{subject}</p>}
          <div className="flex items-center gap-[6px] mt-[6px] flex-wrap">
            {latest.category && (
              <span className="text-[10px] font-medium text-[#888] bg-[#f4f4f4] border border-[#ebebeb] rounded-[4px] px-[6px] py-[1px]">{latest.category}</span>
            )}
            <span className="text-[10px] text-[#bbb]">{chronological.length} message{chronological.length !== 1 ? 's' : ''} in thread</span>
          </div>
        </div>
        <button onClick={onClose} className="flex-shrink-0 w-[26px] h-[26px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150">
          <X size={13} strokeWidth={2.5} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-[16px] py-[16px] flex flex-col gap-[20px]">
        {chronological.map(email => {
          const sl = email['sender name']  ?? 'Unknown';
          const sd = email['sender email'] ?? undefined;
          const ts = formatDateLong(email.created_at);
          return (
            <div key={email.Id} className="flex flex-col gap-[12px]">
              <MessageBubble side="right" label={sl} labelDetail={sd}
                body={getBody(email) || getSubject(email) || '(No content)'} timestamp={ts}
                avatar={<div className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0 shadow-sm" style={gradStyle(sl)}>{initials(sl)}</div>}
              />
              {email.response && (
                <MessageBubble side="left" label="FlowPoint AI" body={email.response} timestamp={ts}
                  avatar={<FlowPointLogo className="w-[28px] h-[28px] rounded-full flex-shrink-0 shadow-sm" alt="" />}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="px-[16px] py-[12px] border-t border-[#f0f0f0] flex-shrink-0">
        <button onClick={() => onSendMessage({ initialEmail: senderEmail, threadId: thread.threadId })}
          className="w-full h-[38px] bg-[#0a0a0a] text-white text-[13px] font-semibold rounded-[10px] flex items-center justify-center gap-[8px] hover:bg-[#222] transition-colors duration-150 active:scale-[0.98]">
          <Pencil size={13} strokeWidth={2} />Send Message
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Inbox Sidebar ─── */
const SIDEBAR_EXPANDED  = 200;
const SIDEBAR_COLLAPSED = 44;

function InboxSidebar({ activeCategory, onSelect, threadCounts, userCategories, onAddCategory, onEditCategory, onDeleteCategory }: {
  activeCategory: string;
  onSelect: (cat: string) => void;
  threadCounts: Record<string, number>;
  userCategories: Category[];
  onAddCategory: () => void;
  onEditCategory: (cat: Category) => void;
  onDeleteCategory: (cat: Category) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ cat: Category; x: number; y: number } | null>(null);

  // Long-press implementation
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const startLongPress = (cat: Category, e: React.MouseEvent) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setCtxMenu({ cat, x: e.clientX, y: e.clientY });
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleContextMenu = (cat: Category, e: React.MouseEvent) => {
    e.preventDefault();
    cancelLongPress();
    setCtxMenu({ cat, x: e.clientX, y: e.clientY });
  };

  const handleCatClick = (key: string) => {
    if (longPressTriggered.current) return; // long press already handled
    onSelect(key);
  };

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex-shrink-0 flex flex-col h-full overflow-hidden"
        style={{ background: '#ffffff', borderRight: '1px solid #ebebeb' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-[52px] px-[10px]" style={{ borderBottom: '1px solid #ebebeb' }}>
          <motion.span animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }} transition={{ duration: 0.15 }}
            className="text-[11px] font-semibold text-[#888] uppercase tracking-wider whitespace-nowrap overflow-hidden pl-[2px]">
            Mailbox
          </motion.span>
          <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand' : 'Collapse'}
            className="w-[24px] h-[24px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150 flex-shrink-0">
            <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
              <ChevronRight size={12} strokeWidth={2.5} />
            </motion.div>
          </button>
        </div>

        {/* Category list */}
        <nav className="flex-1 overflow-y-auto py-[6px] px-[6px] flex flex-col gap-[2px]">
          {/* System categories */}
          {SYSTEM_CATEGORIES.map(({ key, label, icon }) => {
            const active = activeCategory === key;
            const count  = threadCounts[key] ?? 0;
            return (
              <div key={key} title={collapsed ? label : undefined}>
                <button onClick={() => onSelect(key)}
                  className={`w-full flex items-center gap-[8px] h-[32px] rounded-[7px] px-[8px] text-[12px] font-medium transition-all duration-150 ${active ? 'bg-[#0f0f0f] text-white shadow-[0_2px_5px_rgba(0,0,0,0.20)]' : 'text-[#5c5c5c] hover:bg-[#e8e7e3] hover:text-[#0a0a0a]'}`}
                >
                  <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-[#888]'}`}>{icon}</span>
                  <motion.span animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }} transition={{ duration: 0.13 }}
                    className="whitespace-nowrap overflow-hidden flex-1 text-left">{label}</motion.span>
                  {!collapsed && count > 0 && (
                    <span className={`flex-shrink-0 text-[10px] font-semibold rounded-full px-[5px] min-w-[18px] text-center leading-[18px] ${active ? 'bg-white/20 text-white' : 'bg-[#f0f0f0] text-[#888]'}`}>{count}</span>
                  )}
                </button>
              </div>
            );
          })}

          {/* Divider if user categories exist */}
          {userCategories.length > 0 && !collapsed && (
            <div className="mx-[4px] my-[4px] border-t border-[#f0f0f0]" />
          )}

          {/* User categories */}
          {userCategories.map(cat => {
            const active = activeCategory === cat.category;
            const count  = threadCounts[cat.category] ?? 0;
            return (
              <div key={cat.id} title={collapsed ? cat.category : undefined} className="group/cat relative">
                <button
                  onClick={() => handleCatClick(cat.category)}
                  onMouseDown={e => startLongPress(cat, e)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onContextMenu={e => handleContextMenu(cat, e)}
                  className={`w-full flex items-center gap-[8px] h-[32px] rounded-[7px] px-[8px] text-[12px] font-medium transition-all duration-150 ${active ? 'bg-[#0f0f0f] text-white shadow-[0_2px_5px_rgba(0,0,0,0.20)]' : 'text-[#5c5c5c] hover:bg-[#e8e7e3] hover:text-[#0a0a0a]'}`}
                >
                  <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-[#888]'}`}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 7a6 6 0 1 0 12 0A6 6 0 0 0 1 7z" opacity=".4"/>
                      <circle cx="7" cy="7" r="2" fill="currentColor" stroke="none"/>
                    </svg>
                  </span>
                  <motion.span animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }} transition={{ duration: 0.13 }}
                    className="whitespace-nowrap overflow-hidden flex-1 text-left">{cat.category}</motion.span>
                  {!collapsed && (
                    <div className="flex items-center gap-[2px]">
                      {count > 0 && (
                        <span className={`flex-shrink-0 text-[10px] font-semibold rounded-full px-[5px] min-w-[18px] text-center leading-[18px] ${active ? 'bg-white/20 text-white' : 'bg-[#f0f0f0] text-[#888]'}`}>{count}</span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setCtxMenu({ cat, x: e.clientX, y: e.clientY }); }}
                        className={`opacity-0 group-hover/cat:opacity-100 p-[2px] rounded-[4px] transition-all duration-100 ${active ? 'hover:bg-white/20' : 'hover:bg-[#e8e8e8]'}`}
                      >
                        <MoreHorizontal size={11} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </button>
              </div>
            );
          })}

          {/* Add Category button */}
          {!collapsed && (
            <button onClick={onAddCategory}
              className="w-full flex items-center gap-[8px] h-[30px] rounded-[7px] px-[8px] text-[11px] font-medium text-[#aaa8a3] hover:text-[#555] hover:bg-[#e8e7e3] transition-all duration-150 mt-[2px]"
              style={{ border: '1.5px dashed #d4d2ce' }}>
              <Plus size={12} strokeWidth={2} className="flex-shrink-0" />
              <span>Add Category</span>
            </button>
          )}
          {collapsed && (
            <button onClick={onAddCategory} title="Add Category"
              className="w-full flex items-center justify-center h-[30px] rounded-[7px] text-[#aaa] hover:text-[#555] hover:bg-[#e8e7e3] transition-all duration-150 mt-[2px]">
              <Plus size={12} strokeWidth={2} />
            </button>
          )}
        </nav>
      </motion.aside>

      {/* Context menu */}
      <AnimatePresence>
        {ctxMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              className="fixed z-50 bg-white border border-[#ebebeb] rounded-[10px] shadow-[0_4px_20px_rgba(0,0,0,0.12)] py-[4px] min-w-[150px]"
              style={{ top: ctxMenu.y + 4, left: ctxMenu.x }}
            >
              <button onClick={() => { onEditCategory(ctxMenu.cat); setCtxMenu(null); }}
                className="w-full flex items-center gap-[8px] px-[12px] py-[8px] text-[12px] font-medium text-[#333] hover:bg-[#f4f4f4] transition-colors duration-100">
                <Pencil size={12} strokeWidth={2} className="text-[#888]" />Edit
              </button>
              <button onClick={() => { onDeleteCategory(ctxMenu.cat); setCtxMenu(null); }}
                className="w-full flex items-center gap-[8px] px-[12px] py-[8px] text-[12px] font-medium text-[#c0392b] hover:bg-[#fff0f0] transition-colors duration-100">
                <Trash2 size={12} strokeWidth={2} />Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Filter Panel ─── */
function FilterPanel({ filters, onChange, onReset, onClose }: {
  filters: InboxFilters;
  onChange: (f: InboxFilters) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const section = (label: string) => (
    <p className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-[6px]">{label}</p>
  );
  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick}
      className={`h-[28px] px-[10px] rounded-[6px] text-[11px] font-medium border transition-colors duration-100 ${active ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'border-[#e5e5e5] text-[#555] hover:border-[#ccc] hover:bg-[#f9f9f9]'}`}>
      {label}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className="absolute top-[52px] right-[4px] z-30 w-[260px] bg-white border border-[#ebebeb] rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-[16px] flex flex-col gap-[14px]"
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[#0a0a0a]">Filters</p>
        <div className="flex items-center gap-[6px]">
          <button onClick={onReset} className="text-[11px] text-[#888] hover:text-[#0a0a0a] transition-colors duration-100">Reset</button>
          <button onClick={onClose} className="w-[20px] h-[20px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150">
            <X size={10} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div>
        {section('Urgency')}
        <div className="flex gap-[6px] flex-wrap">
          {chip('All', filters.urgency === 'all', () => onChange({ ...filters, urgency: 'all' }))}
          {chip('Urgent', filters.urgency === 'urgent', () => onChange({ ...filters, urgency: 'urgent' }))}
          {chip('Non-urgent', filters.urgency === 'non-urgent', () => onChange({ ...filters, urgency: 'non-urgent' }))}
        </div>
      </div>

      <div>
        {section('AI Response')}
        <div className="flex gap-[6px] flex-wrap">
          {chip('All', filters.response === 'all', () => onChange({ ...filters, response: 'all' }))}
          {chip('Has response', filters.response === 'with-response', () => onChange({ ...filters, response: 'with-response' }))}
          {chip('No response', filters.response === 'no-response', () => onChange({ ...filters, response: 'no-response' }))}
        </div>
      </div>

      <div>
        {section('Date range')}
        <div className="flex gap-[6px] flex-wrap">
          {chip('All time', filters.dateRange === 'all', () => onChange({ ...filters, dateRange: 'all' }))}
          {chip('Today', filters.dateRange === 'today', () => onChange({ ...filters, dateRange: 'today' }))}
          {chip('This week', filters.dateRange === 'week', () => onChange({ ...filters, dateRange: 'week' }))}
          {chip('This month', filters.dateRange === 'month', () => onChange({ ...filters, dateRange: 'month' }))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Page ─── */
export default function InboxPage() {
  useAuth();

  const [emails,          setEmails]          = useState<InboxEmail[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [activeCategory,  setActiveCategory]  = useState('All');
  const [selectedThread,  setSelectedThread]  = useState<EmailThread | null>(null);
  const [pinned,          setPinned]          = useState<Set<string>>(new Set());
  const [starred,         setStarred]         = useState<Set<string>>(new Set());
  const [sessionReady,    setSessionReady]    = useState(false);
  const [sendTarget,      setSendTarget]      = useState<SendTarget | null>(null);

  // Categories state
  const [userCategories,  setUserCategories]  = useState<Category[]>([]);
  const [catModal,        setCatModal]        = useState<{ editing: Category | null } | null>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<Category | null>(null);
  const [deletingCat,     setDeletingCat]     = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery]   = useState('');
  const [filters,     setFilters]       = useState<InboxFilters>(DEFAULT_FILTERS);
  const [filterOpen,  setFilterOpen]    = useState(false);
  const filterRef                       = useRef<HTMLDivElement>(null);

  /* Session gate */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
  }, []);

  const fetchEmails = async () => {
    setLoading(true); setError(null);
    const { data, error: err } = await supabase.from('inbox').select('*').order('created_at', { ascending: false });
    if (err) { setError(err.message); }
    else {
      const rows = (data as InboxEmail[]) ?? [];
      setEmails(rows);
      const initPinned = new Set<string>(), initStarred = new Set<string>();
      for (const e of rows) {
        const tid = e['thread id'] ?? e.Id;
        if (e.pin)  initPinned.add(tid);
        if (e.star) initStarred.add(tid);
      }
      setPinned(initPinned);
      setStarred(initStarred);
    }
    setLoading(false);
  };

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
    setUserCategories((data as Category[]) ?? []);
  }, []);

  useEffect(() => {
    if (sessionReady) { fetchEmails(); fetchCategories(); }
  }, [sessionReady, fetchCategories]);

  // Close filter panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    if (filterOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  /* Category CRUD */
  const handleAddCategory = async (name: string, desc: string) => {
    const { data, error } = await supabase.from('categories').insert({ category: name, description: desc }).select().single();
    if (error) throw new Error(error.message);
    setUserCategories(prev => [...prev, data as Category]);
    pushSingleNotification('category_added', 'Category Added', `"${name}" category was created.`).catch(() => {});
    clearWarningNotification('warning_no_categories').catch(() => {});
  };

  const handleEditCategory = async (id: string, name: string, desc: string) => {
    const { error } = await supabase.from('categories').update({ category: name, description: desc }).eq('id', id);
    if (error) throw new Error(error.message);
    setUserCategories(prev => prev.map(c => c.id === id ? { ...c, category: name, description: desc } : c));
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!deleteCatTarget) return;
    setDeletingCat(true);
    const { error } = await supabase.from('categories').delete().eq('id', deleteCatTarget.id);
    if (!error) {
      setUserCategories(prev => prev.filter(c => c.id !== deleteCatTarget.id));
      if (activeCategory === deleteCatTarget.category) setActiveCategory('All');
    }
    setDeletingCat(false);
    setDeleteCatTarget(null);
  };

  /* Threads */
  const allThreads = useMemo(() => groupIntoThreads(emails), [emails]);

  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts['All'] = allThreads.length;
    counts['Starred'] = allThreads.filter(t => starred.has(t.threadId)).length;
    counts['Sent']    = allThreads.filter(t => t.emails.some(e => e.type === 'send')).length;
    counts['Urgent']  = allThreads.filter(t => t.latest.urgency?.toLowerCase() === 'urgent').length;
    for (const t of allThreads) {
      const cat = t.latest.category;
      if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [allThreads, starred]);

  const visibleThreads = useMemo(() => {
    if (activeCategory === 'All') return allThreads;
    if (activeCategory === 'Starred') return allThreads.filter(t => starred.has(t.threadId));
    if (activeCategory === 'Sent')    return allThreads.filter(t => t.emails.some(e => e.type === 'send'));
    if (activeCategory === 'Urgent')  return allThreads.filter(t => t.latest.urgency?.toLowerCase() === 'urgent');
    return allThreads.filter(t => t.latest.category === activeCategory);
  }, [allThreads, activeCategory, starred]);

  const sortedThreads = useMemo(() =>
    [...visibleThreads].sort((a, b) => {
      const ap = pinned.has(a.threadId) ? 1 : 0;
      const bp = pinned.has(b.threadId) ? 1 : 0;
      return bp - ap;
    }),
    [visibleThreads, pinned]
  );

  /* Search */
  const searchedThreads = useMemo(() => {
    if (!searchQuery.trim()) return sortedThreads;
    const q = searchQuery.toLowerCase();
    return sortedThreads.filter(t =>
      t.emails.some(e =>
        (e['sender name']  ?? '').toLowerCase().includes(q) ||
        (e['sender email'] ?? '').toLowerCase().includes(q) ||
        (e.subject         ?? '').toLowerCase().includes(q) ||
        (e.body            ?? '').toLowerCase().includes(q) ||
        (e.category        ?? '').toLowerCase().includes(q) ||
        (e.urgency         ?? '').toLowerCase().includes(q)
      )
    );
  }, [sortedThreads, searchQuery]);

  /* Filters */
  const filteredThreads = useMemo(() => {
    let threads = searchedThreads;

    if (filters.urgency === 'urgent')
      threads = threads.filter(t => t.latest.urgency?.toLowerCase() === 'urgent');
    else if (filters.urgency === 'non-urgent')
      threads = threads.filter(t => t.latest.urgency?.toLowerCase() !== 'urgent');

    if (filters.response === 'with-response')
      threads = threads.filter(t => t.emails.some(e => e.response));
    else if (filters.response === 'no-response')
      threads = threads.filter(t => !t.emails.some(e => e.response));

    if (filters.dateRange !== 'all') {
      const now = new Date();
      const cutoffs: Record<string, Date> = {
        today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        week:  new Date(now.getTime() - 7  * 86400000),
        month: new Date(now.getTime() - 30 * 86400000),
      };
      const cutoff = cutoffs[filters.dateRange];
      if (cutoff) threads = threads.filter(t => new Date(t.latest.created_at) >= cutoff);
    }

    return threads;
  }, [searchedThreads, filters]);

  const activeFiltersCount = useMemo(() =>
    [filters.urgency !== 'all', filters.response !== 'all', filters.dateRange !== 'all'].filter(Boolean).length,
    [filters]
  );

  /* Active category label */
  const activeCategoryLabel = useMemo(() => {
    const sys = SYSTEM_CATEGORIES.find(c => c.key === activeCategory);
    if (sys) return sys.label;
    const usr = userCategories.find(c => c.category === activeCategory);
    return usr?.category ?? activeCategory;
  }, [activeCategory, userCategories]);

  const togglePin = async (id: string) => {
    const newVal = !pinned.has(id);
    setPinned(prev => { const n = new Set(prev); newVal ? n.add(id) : n.delete(id); return n; });
    await supabase.from('inbox').update({ pin: newVal }).eq('thread id', id);
    await supabase.from('inbox').update({ pin: newVal }).eq('Id', id).is('thread id', null);
  };

  const toggleStar = async (id: string) => {
    const newVal = !starred.has(id);
    setStarred(prev => { const n = new Set(prev); newVal ? n.add(id) : n.delete(id); return n; });
    await supabase.from('inbox').update({ star: newVal }).eq('thread id', id);
    await supabase.from('inbox').update({ star: newVal }).eq('Id', id).is('thread id', null);
  };

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Email categories sidebar */}
        <InboxSidebar
          activeCategory={activeCategory}
          onSelect={cat => { setActiveCategory(cat); setSelectedThread(null); setSearchQuery(''); }}
          threadCounts={threadCounts}
          userCategories={userCategories}
          onAddCategory={() => setCatModal({ editing: null })}
          onEditCategory={cat => setCatModal({ editing: cat })}
          onDeleteCategory={cat => setDeleteCatTarget(cat)}
        />

        {/* Email list */}
        <div className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-[10px] h-[52px] px-[16px] bg-white flex-shrink-0" style={{ borderBottom: '1px solid #e8e7e3', boxShadow: '0 1px 0 rgba(0,0,0,0.03)' }}>
            <span className="text-[14px] font-semibold text-[#0a0a0a] flex-shrink-0 min-w-0 max-w-[120px] truncate">
              {activeCategoryLabel}
            </span>
            {!loading && (
              <span className="text-[11px] text-[#aaa] flex-shrink-0">
                {filteredThreads.length}
              </span>
            )}

            {/* Search bar */}
            <div className="flex-1 relative">
              <Search size={12} strokeWidth={2} className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[#bbb] pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, subject…"
                className="w-full h-[30px] pl-[28px] pr-[28px] rounded-[8px] text-[12px] border border-[#e5e5e5] bg-[#fafafa] text-[#0a0a0a] placeholder-[#bbb] outline-none focus:border-[#ccc] focus:bg-white transition-all duration-150"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-[8px] top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#888] transition-colors duration-100">
                  <X size={10} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {/* Filter button */}
            <div ref={filterRef} className="relative flex-shrink-0">
              <button
                onClick={() => setFilterOpen(v => !v)}
                className={`relative w-[30px] h-[30px] rounded-full border flex items-center justify-center transition-all duration-150 ${filterOpen || activeFiltersCount > 0 ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-[#e5e5e5] text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc]'}`}
                aria-label="Filters"
              >
                <SlidersHorizontal size={12} strokeWidth={2} />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-[4px] -right-[4px] w-[14px] h-[14px] rounded-full bg-[#e74c3c] text-white text-[8px] font-bold flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {filterOpen && (
                  <FilterPanel
                    filters={filters}
                    onChange={setFilters}
                    onReset={() => setFilters(DEFAULT_FILTERS)}
                    onClose={() => setFilterOpen(false)}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Refresh */}
            <button onClick={fetchEmails} disabled={loading} aria-label="Refresh"
              className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-all duration-150 disabled:opacity-40 flex-shrink-0">
              <motion.div animate={{ rotate: loading ? 360 : 0 }} transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }}>
                <RefreshCw size={13} strokeWidth={2} />
              </motion.div>
            </button>
            <NotificationBell />
          </div>

          {/* Thread list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-[200px]">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw size={18} strokeWidth={1.8} className="text-[#ccc]" />
                </motion.div>
              </div>
            )}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center h-[200px] gap-[8px] text-center px-[24px]">
                <AlertCircle size={24} className="text-[#e74c3c]" strokeWidth={1.5} />
                <p className="text-[13px] font-medium text-[#0a0a0a]">Failed to load inbox</p>
                <p className="text-[12px] text-[#888]">{error}</p>
                <button onClick={fetchEmails} className="mt-[4px] text-[12px] font-medium text-[#0a0a0a] border border-[#e5e5e5] rounded-[6px] px-[12px] py-[6px] hover:bg-[#f4f4f4] transition-colors duration-150">Try again</button>
              </div>
            )}
            {!loading && !error && filteredThreads.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[200px] gap-[8px]">
                {activeCategory === 'Sent'
                  ? <Send size={28} className="text-[#ddd]" strokeWidth={1.3} />
                  : activeCategory === 'Urgent'
                  ? <Zap size={28} className="text-[#ddd]" strokeWidth={1.3} />
                  : <InboxIcon size={28} className="text-[#ddd]" strokeWidth={1.3} />
                }
                <p className="text-[13px] text-[#aaa]">
                  {searchQuery
                    ? `No results for "${searchQuery}"`
                    : activeCategory === 'All'     ? 'Your inbox is empty'
                    : activeCategory === 'Starred' ? 'No starred messages'
                    : activeCategory === 'Sent'    ? 'No sent messages yet'
                    : activeCategory === 'Urgent'  ? 'No urgent messages'
                    : `No messages in ${activeCategoryLabel}`}
                </p>
                {(searchQuery || activeFiltersCount > 0) && (
                  <button onClick={() => { setSearchQuery(''); setFilters(DEFAULT_FILTERS); }} className="text-[12px] font-medium text-[#0a0a0a] border border-[#e5e5e5] rounded-[6px] px-[12px] py-[5px] hover:bg-[#f4f4f4] transition-colors duration-150">
                    Clear search & filters
                  </button>
                )}
              </div>
            )}
            {!loading && !error && filteredThreads.length > 0 && (
              <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.03 } } }}>
                {filteredThreads.map(thread => (
                  <EmailCard
                    key={thread.threadId}
                    thread={thread}
                    pinned={pinned.has(thread.threadId)}
                    starred={starred.has(thread.threadId)}
                    onPin={() => togglePin(thread.threadId)}
                    onStar={() => toggleStar(thread.threadId)}
                    onClick={() => setSelectedThread(prev => prev?.threadId === thread.threadId ? null : thread)}
                    selected={selectedThread?.threadId === thread.threadId}
                  />
                ))}
              </motion.div>
            )}
          </div>

          {/* Floating "Send Message" pill */}
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 28 }}
            onClick={() => setSendTarget({ threadId: null })}
            className="absolute bottom-[24px] right-[24px] z-10 flex items-center gap-[8px] bg-[#0a0a0a] text-white text-[13px] font-semibold px-[18px] h-[42px] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.22)] hover:bg-[#222] hover:shadow-[0_6px_24px_rgba(0,0,0,0.28)] transition-all duration-150 active:scale-[0.97]"
          >
            <Send size={14} strokeWidth={2} />Send Message
          </motion.button>
        </div>

        {/* Email detail panel */}
        <AnimatePresence>
          {selectedThread && (
            <EmailDetailPanel
              thread={selectedThread}
              onClose={() => setSelectedThread(null)}
              onSendMessage={setSendTarget}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Send Message modal */}
      <AnimatePresence>
        {sendTarget !== null && (
          <SendMessageModal
            key="send-modal"
            initialEmail={sendTarget.initialEmail ?? ''}
            threadId={sendTarget.threadId ?? null}
            onClose={() => setSendTarget(null)}
            onSent={() => {
              pushStackableNotification(
                'email_sent',
                'Email Sent',
                (n) => n === 1 ? 'You sent an email.' : `You sent ${n} emails.`,
              ).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      {/* Add/Edit Category modal */}
      <AnimatePresence>
        {catModal && (
          <AddEditCategoryModal
            key="cat-modal"
            editing={catModal.editing}
            onSave={async (name, desc) => {
              if (catModal.editing) await handleEditCategory(catModal.editing.id, name, desc);
              else await handleAddCategory(name, desc);
            }}
            onClose={() => setCatModal(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete Category confirm */}
      <AnimatePresence>
        {deleteCatTarget && (
          <DeleteCategoryModal
            key="del-cat"
            name={deleteCatTarget.category}
            onConfirm={handleDeleteCategoryConfirm}
            onCancel={() => setDeleteCatTarget(null)}
            deleting={deletingCat}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
