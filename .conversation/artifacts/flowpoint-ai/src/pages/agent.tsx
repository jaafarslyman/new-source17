import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Plus, Send, Copy, Check, Loader2, AlertCircle, X,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/lib/supabase';
import NotificationBell from '@/components/NotificationBell';
import { useSettingsCtx } from '@/contexts/SettingsContext';
import FlowPointLogo from '@/components/FlowPointLogo';

/* ─── Types ─── */
interface ChatEntry {
  chat_id: string;
  chat_title: string;
  chat_date: string;
}

interface AgentMessage {
  id: string;
  created_at: string;
  chat_id: string;
  message: string;
  response: string | null;
}

/* ─── Constants ─── */
const AGENT_WEBHOOK = import.meta.env.VITE_WEBHOOK_AGENT as string;
const SIDEBAR_W = 220;

/* ─── Helpers ─── */
async function callAgentWebhook(chatId: string, message: string): Promise<string> {
  if (!AGENT_WEBHOOK) {
    throw new Error(
      'The agent workflow is not configured. Set VITE_WEBHOOK_AGENT in your environment.',
    );
  }

  const res = await fetch(AGENT_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message }),
  });
  if (!res.ok) throw new Error(`Webhook failed (${res.status})`);
  const raw = await res.text();
  try {
    const json = JSON.parse(raw);
    const obj = Array.isArray(json) ? json[0] : json;
    return obj?.response ?? obj?.text ?? obj?.message ?? obj?.output ?? obj?.content ?? raw;
  } catch {
    return raw;
  }
}

function generateTitle(msg: string): string {
  const words = msg.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length >= msg.trim().length ? words : words + '…';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ─── Chat Sidebar ─── */
interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  chats: ChatEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  loading: boolean;
}

function ChatSidebar({ open, onClose, chats, selectedId, onSelect, onNewChat, loading }: ChatSidebarProps) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? SIDEBAR_W : 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex-shrink-0 flex flex-col h-full bg-white border-r border-[#ebebeb] overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between h-[52px] px-[10px] border-b border-[#ebebeb] flex-shrink-0"
        style={{ minWidth: SIDEBAR_W }}
      >
        <span className="text-[11px] font-semibold text-[#888] uppercase tracking-wider pl-[2px] whitespace-nowrap">
          Chats
        </span>
        <button
          onClick={onClose}
          className="w-[24px] h-[24px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150 flex-shrink-0"
          aria-label="Close sidebar"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>

      {/* New Chat */}
      <div className="px-[6px] py-[6px] border-b border-[#f4f4f4] flex-shrink-0" style={{ minWidth: SIDEBAR_W }}>
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-[8px] h-[32px] rounded-[6px] px-[8px] text-[12px] font-medium text-[#555] hover:bg-[#f4f4f4] hover:text-[#0a0a0a] transition-colors duration-100"
        >
          <Plus size={14} strokeWidth={2} className="flex-shrink-0" />
          <span className="whitespace-nowrap">New Chat</span>
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-[4px] px-[6px] flex flex-col gap-[2px]" style={{ minWidth: SIDEBAR_W }}>
        {loading && (
          <div className="flex items-center justify-center py-[20px]">
            <Loader2 size={14} className="animate-spin text-[#ccc]" strokeWidth={1.8} />
          </div>
        )}
        {!loading && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-[24px] gap-[6px] px-[8px]">
            <MessageSquare size={20} className="text-[#ddd]" strokeWidth={1.3} />
            <p className="text-[11px] text-[#bbb] text-center leading-[1.5]">No chats yet</p>
          </div>
        )}
        {chats.map(chat => {
          const active = selectedId === chat.chat_id;
          return (
            <button
              key={chat.chat_id}
              onClick={() => onSelect(chat.chat_id)}
              className={`
                w-full flex flex-col gap-[1px] rounded-[6px] px-[8px] py-[7px]
                text-left transition-colors duration-100
                ${active ? 'bg-[#0a0a0a] text-white' : 'text-[#555] hover:bg-[#f4f4f4] hover:text-[#0a0a0a]'}
              `}
            >
              <p className={`text-[12px] font-medium truncate ${active ? 'text-white' : 'text-[#0a0a0a]'}`}>
                {chat.chat_title || 'New Chat'}
              </p>
              <p className={`text-[10px] mt-[1px] ${active ? 'text-white/60' : 'text-[#aaa]'}`}>
                {formatDate(chat.chat_date)}
              </p>
            </button>
          );
        })}
      </div>
    </motion.aside>
  );
}

/* ─── Message Bubble ─── */
function MessageBubble({
  side,
  text,
  id,
  isThinking = false,
}: {
  side: 'left' | 'right';
  text: string;
  id: string;
  isThinking?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isLeft = side === 'left';

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex flex-col gap-[4px] max-w-[72%] ${isLeft ? 'items-start' : 'items-end self-end'}`}
    >
      <p className={`text-[10px] font-semibold px-[2px] flex items-center gap-[4px] ${isLeft ? 'text-[#888]' : 'text-[#aaa]'}`}>
        {isLeft ? 'You' : <><FlowPointLogo className="w-[13px] h-[13px]" alt="" />FlowPoint AI</>}
      </p>

      {isThinking ? (
        <div className="bg-[#f2f2f2] rounded-[14px] rounded-bl-[4px] px-[16px] py-[12px] flex items-center gap-[5px]">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-[6px] h-[6px] rounded-full bg-[#bbb]"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      ) : (
        <div
          className={`
            rounded-[14px] px-[14px] py-[10px] text-[13px] leading-[1.65] whitespace-pre-wrap break-words
            ${isLeft
              ? 'bg-[#f2f2f2] text-[#1a1a1a] rounded-bl-[4px]'
              : 'bg-[#0a0a0a] text-white rounded-br-[4px]'}
          `}
        >
          {text}
        </div>
      )}

      {!isThinking && (
        <button
          onClick={handleCopy}
          className={`flex items-center gap-[4px] text-[10px] font-medium px-[6px] py-[2px] rounded-[4px] transition-colors duration-150
            ${copied ? 'text-[#27ae60]' : 'text-[#bbb] hover:text-[#555]'}
          `}
        >
          {copied
            ? <><Check size={10} strokeWidth={2.5} /> Copied</>
            : <><Copy size={10} strokeWidth={2} /> Copy</>
          }
        </button>
      )}
    </motion.div>
  );
}

/* ─── Main Page ─── */
export default function AgentPage() {
  useAuth();

  /* ── Sidebar ── */
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Chat list (from `chats` table) ── */
  const [chats, setChats]             = useState<ChatEntry[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string>(() => crypto.randomUUID());

  /* ── Messages (from `agent_chat` table) ── */
  const [messages, setMessages]       = useState<AgentMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [pendingMsg, setPendingMsg]   = useState<string | null>(null);
  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState<string | null>(null);

  /* ── Input ── */
  const [input, setInput]   = useState('');
  const bottomRef           = useRef<HTMLDivElement>(null);
  const textareaRef         = useRef<HTMLTextAreaElement>(null);
  const { consumeCredit, confirmBeforeEmail, setConfirmBeforeEmail, confirmBeforeTask, setConfirmBeforeTask } = useSettingsCtx();

  /* ── Agent settings panel ── */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        settingsPanelRef.current && !settingsPanelRef.current.contains(e.target as Node) &&
        settingsBtnRef.current  && !settingsBtnRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  /* ── Auth gate ── */
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
  }, []);

  /* ── Auto-scroll ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, pendingMsg]);

  /* ── Reset input when chat changes ── */
  useEffect(() => {
    setInput('');
    setSendError(null);
  }, [selectedChatId]);

  /* ── Load chat list from `chats` table ── */
  const fetchChats = async () => {
    setChatsLoading(true);
    const { data } = await supabase
      .from('chats')
      .select('chat_id, chat_title, chat_date')
      .order('chat_date', { ascending: false });
    if (data) {
      // Deduplicate by chat_id (keep first/most-recent per chat)
      const seen = new Set<string>();
      const unique: ChatEntry[] = [];
      for (const row of data as ChatEntry[]) {
        if (!seen.has(row.chat_id)) {
          seen.add(row.chat_id);
          unique.push(row);
        }
      }
      setChats(unique);
    }
    setChatsLoading(false);
  };

  /* ── Load messages from `agent_chat` table ── */
  const fetchMessages = async (chatId: string) => {
    setMsgsLoading(true);
    const { data } = await supabase
      .from('agent_chat')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    setMessages((data as AgentMessage[]) ?? []);
    setMsgsLoading(false);
  };

  useEffect(() => {
    if (sessionReady) fetchChats();
  }, [sessionReady]);

  useEffect(() => {
    if (selectedChatId) fetchMessages(selectedChatId);
    else setMessages([]);
  }, [selectedChatId]);

  /* ── New chat ── */
  const handleNewChat = () => {
    setSelectedChatId(crypto.randomUUID());
    setMessages([]);
    setSendError(null);
  };

  /* ── Select chat ── */
  const handleSelectChat = (id: string) => {
    setSelectedChatId(id);
    setSendError(null);
  };

  /* ── Send message ── */
  const handleSend = async () => {
    const userMsg = input.trim();
    if (!userMsg || sending || !selectedChatId) return;

    setInput('');
    setSending(true);
    setSendError(null);
    setPendingMsg(userMsg);

    const isFirstMsg = messages.length === 0;
    const title = isFirstMsg
      ? generateTitle(userMsg)
      : (chats.find(c => c.chat_id === selectedChatId)?.chat_title ?? 'Chat');

    try {
      const aiResponse = await callAgentWebhook(selectedChatId, userMsg);
      await consumeCredit();

      // Insert into agent_chat (always)
      const { data: inserted } = await supabase
        .from('agent_chat')
        .insert({
          chat_id:  selectedChatId,
          message:  userMsg,
          response: aiResponse,
        })
        .select()
        .single();

      if (inserted) {
        setMessages(prev => [...prev, inserted as AgentMessage]);
      }

      // Insert into chats (sidebar) only on first message
      if (isFirstMsg) {
        await supabase.from('chats').insert({
          chat_id:    selectedChatId,
          chat_title: title,
          chat_date:  new Date().toISOString(),
          message:    userMsg,
          response:   aiResponse,
        });
        setChats(prev => [
          { chat_id: selectedChatId, chat_title: title, chat_date: new Date().toISOString() },
          ...prev,
        ]);
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
      setPendingMsg(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">
        {/* Chat Sidebar */}
        <ChatSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          chats={chats}
          selectedId={selectedChatId}
          onSelect={handleSelectChat}
          onNewChat={handleNewChat}
          loading={chatsLoading}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center h-[52px] px-[16px] border-b border-[#ebebeb] bg-white flex-shrink-0 gap-[10px]">
            {/* Sidebar open button (visible only when closed) */}
            <AnimatePresence>
              {!sidebarOpen && (
                <motion.button
                  key="sidebar-open"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                  onClick={() => setSidebarOpen(true)}
                  title="Open chat history"
                  className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] bg-white shadow-sm flex items-center justify-center text-[#666] hover:text-[#0a0a0a] hover:border-[#ccc] transition-colors duration-150 flex-shrink-0"
                >
                  <MessageSquare size={13} strokeWidth={1.8} />
                </motion.button>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-[8px]">
              <FlowPointLogo className="w-[28px] h-[28px] rounded-[7px] flex-shrink-0" alt="" />
              <div>
                <p className="text-[13px] font-semibold text-[#0a0a0a] leading-[1.2]">Agent</p>
                <p className="text-[11px] text-[#aaa]">AI-powered assistant</p>
              </div>
            </div>

            {/* Right: settings + notifications */}
            <div className="ml-auto flex items-center gap-[8px] relative">
              {/* Settings button */}
              <button
                ref={settingsBtnRef}
                onClick={() => setSettingsOpen(v => !v)}
                className={`w-[30px] h-[30px] rounded-full border flex items-center justify-center transition-all duration-150 ${
                  settingsOpen
                    ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white'
                    : 'border-[#e5e5e5] bg-white text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc]'
                }`}
                aria-label="Agent settings"
              >
                <Settings size={13} strokeWidth={1.8} />
              </button>

              {/* Settings panel */}
              <AnimatePresence>
                {settingsOpen && (
                  <motion.div
                    ref={settingsPanelRef}
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                    exit={{   opacity: 0, y: -6,  scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className="absolute right-0 top-[calc(100%+8px)] z-[200] bg-white rounded-[14px] overflow-hidden"
                    style={{
                      width: 272,
                      border: '1px solid #e5e5e5',
                      boxShadow: '0 8px 36px rgba(0,0,0,0.12)',
                    }}
                  >
                    {/* Panel header */}
                    <div className="flex items-center justify-between px-[16px] py-[12px]" style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div className="flex items-center gap-[6px]">
                        <Settings size={12} strokeWidth={2} className="text-[#0a0a0a]" />
                        <span className="text-[13px] font-semibold text-[#0a0a0a]">Agent Settings</span>
                      </div>
                      <button
                        onClick={() => setSettingsOpen(false)}
                        className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[#aaa] hover:text-[#0a0a0a] hover:bg-[#f4f4f4] transition-colors duration-150"
                      >
                        <X size={11} strokeWidth={2} />
                      </button>
                    </div>

                    {/* Setting rows */}
                    <div className="px-[16px] py-[12px] flex flex-col gap-[0px]">
                      {/* Row 1: confirm before email */}
                      <div className="flex items-center gap-[12px] py-[11px]" style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#0a0a0a] leading-[1.2]">Ask before sending an email</p>
                          <p className="text-[11px] text-[#aaa] mt-[3px] leading-[1.4]">Agent will wait for your approval before sending any email</p>
                        </div>
                        <button
                          role="switch"
                          aria-checked={confirmBeforeEmail}
                          onClick={() => setConfirmBeforeEmail(!confirmBeforeEmail)}
                          className="relative flex-shrink-0 focus:outline-none"
                          style={{ width: 34, height: 18 }}
                        >
                          <span
                            className="absolute inset-0 rounded-full transition-colors duration-200"
                            style={{ background: confirmBeforeEmail ? '#22c55e' : '#d1d5db' }}
                          />
                          <motion.span
                            layout
                            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                            className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22)]"
                            style={{ left: confirmBeforeEmail ? 18 : 2 }}
                          />
                        </button>
                      </div>

                      {/* Row 2: confirm before task */}
                      <div className="flex items-center gap-[12px] py-[11px]">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[#0a0a0a] leading-[1.2]">Ask before exciting tasks</p>
                          <p className="text-[11px] text-[#aaa] mt-[3px] leading-[1.4]">Agent will confirm with you before completing any task</p>
                        </div>
                        <button
                          role="switch"
                          aria-checked={confirmBeforeTask}
                          onClick={() => setConfirmBeforeTask(!confirmBeforeTask)}
                          className="relative flex-shrink-0 focus:outline-none"
                          style={{ width: 34, height: 18 }}
                        >
                          <span
                            className="absolute inset-0 rounded-full transition-colors duration-200"
                            style={{ background: confirmBeforeTask ? '#22c55e' : '#d1d5db' }}
                          />
                          <motion.span
                            layout
                            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                            className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22)]"
                            style={{ left: confirmBeforeTask ? 18 : 2 }}
                          />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <NotificationBell />
            </div>
          </div>

          {/* Messages area */}
          {msgsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-[#ccc]" strokeWidth={1.8} />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-[24px] py-[20px] flex flex-col gap-[16px]">
                {messages.length === 0 && !pendingMsg && (
                  <div className="flex flex-col items-center justify-center h-full gap-[12px] text-center px-[32px]">
                    <div className="w-[52px] h-[52px] rounded-full bg-[#f4f4f4] flex items-center justify-center">
                      <FlowPointLogo className="w-[32px] h-[32px] opacity-25" alt="" />
                    </div>
                    <p className="text-[14px] font-semibold text-[#0a0a0a]">Ask your agent anything</p>
                    <p className="text-[13px] text-[#aaa] leading-[1.6] max-w-[300px]">
                      Your AI agent is ready. Type a message below to get started.
                    </p>
                  </div>
                )}

                {messages.map(row => (
                  <React.Fragment key={row.id}>
                    <MessageBubble side="left" text={row.message} id={`msg-${row.id}`} />
                    {row.response && (
                      <MessageBubble side="right" text={row.response} id={`res-${row.id}`} />
                    )}
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

              {/* Error */}
              {sendError && (
                <div className="mx-[24px] mb-[8px] flex items-center gap-[8px] bg-[#fdf0ef] border border-[#f5c6c2] rounded-[8px] px-[12px] py-[8px]">
                  <AlertCircle size={12} className="text-[#c0392b] flex-shrink-0" strokeWidth={2} />
                  <p className="text-[12px] text-[#c0392b] flex-1">{sendError}</p>
                </div>
              )}

              {/* Input */}
              <div className="flex-shrink-0 px-[16px] py-[14px] border-t border-[#f0f0f0] bg-white">
                <div className="flex items-end gap-[10px] bg-[#f7f7f7] border border-[#e8e8e8] rounded-[12px] px-[14px] py-[10px] focus-within:border-[#0a0a0a] transition-colors duration-150">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask your agent anything…"
                    rows={1}
                    disabled={sending}
                    className="flex-1 bg-transparent text-[13px] text-[#0a0a0a] placeholder-[#bbb] resize-none outline-none leading-[1.6] max-h-[120px] disabled:opacity-50"
                    style={{ height: 'auto', minHeight: '22px' }}
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="flex-shrink-0 w-[32px] h-[32px] rounded-[8px] bg-[#0a0a0a] text-white flex items-center justify-center hover:bg-[#222] transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {sending
                      ? <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                      : <Send size={13} strokeWidth={2} />
                    }
                  </button>
                </div>
                <p className="text-[10px] text-[#ccc] mt-[5px] px-[2px]">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
