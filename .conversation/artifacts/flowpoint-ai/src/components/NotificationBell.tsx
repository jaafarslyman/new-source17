import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellOff, X, CheckCheck, AlertTriangle, Zap, Bot, Send,
  UserPlus, Shield, Tag,
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification, NotificationType } from '@/lib/notificationsTypes';

/* ─── Helpers ─── */
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

type TypeCfg = {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  rowBg: string;
  rowBorder: string;
};

const TYPE_CFG: Record<NotificationType, TypeCfg> = {
  email_handled:        { icon: Bot,           iconColor: '#0a0a0a', iconBg: '#f0f0f0',  rowBg: '#fafafa', rowBorder: '#f0f0f0' },
  email_sent:           { icon: Send,          iconColor: '#2563eb', iconBg: '#dbeafe',  rowBg: '#f8faff', rowBorder: '#dbeafe' },
  contact_added:        { icon: UserPlus,      iconColor: '#16a34a', iconBg: '#dcfce7',  rowBg: '#f6fef9', rowBorder: '#dcfce7' },
  policy_added:         { icon: Shield,        iconColor: '#7c3aed', iconBg: '#ede9fe',  rowBg: '#faf8ff', rowBorder: '#ede9fe' },
  category_added:       { icon: Tag,           iconColor: '#0891b2', iconBg: '#cffafe',  rowBg: '#f8fdff', rowBorder: '#cffafe' },
  urgent_email:         { icon: Zap,           iconColor: '#dc2626', iconBg: '#fee2e2',  rowBg: '#fff5f5', rowBorder: '#fecaca' },
  warning_no_policies:  { icon: AlertTriangle, iconColor: '#d97706', iconBg: '#fde68a',  rowBg: '#fffbeb', rowBorder: '#fde68a' },
  warning_no_categories:{ icon: AlertTriangle, iconColor: '#d97706', iconBg: '#fde68a',  rowBg: '#fffbeb', rowBorder: '#fde68a' },
  warning_no_staff:     { icon: AlertTriangle, iconColor: '#d97706', iconBg: '#fde68a',  rowBg: '#fffbeb', rowBorder: '#fde68a' },
  credits_exceeded:     { icon: Zap,           iconColor: '#dc2626', iconBg: '#fee2e2',  rowBg: '#fff5f5', rowBorder: '#fecaca' },
};

function sortNotifications(ns: AppNotification[]): AppNotification[] {
  return [...ns].sort((a, b) => {
    // Read goes to bottom
    if (a.read !== b.read) return a.read ? 1 : -1;

    // Among unread: warnings → urgent → others
    if (!a.read && !b.read) {
      const wA = a.type.startsWith('warning_');
      const wB = b.type.startsWith('warning_');
      if (wA !== wB) return wA ? -1 : 1;
      const uA = a.type === 'urgent_email';
      const uB = b.type === 'urgent_email';
      if (uA !== uB) return uA ? -1 : 1;
    }

    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

/* ─── Notification Row ─── */
function NotifRow({
  n,
  onRead,
  onDismiss,
}: {
  n: AppNotification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const cfg = TYPE_CFG[n.type] ?? TYPE_CFG.email_handled;
  const Icon = cfg.icon;
  const isWarning = n.type.startsWith('warning_');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.15 }}
      className="group relative flex items-start gap-[10px] px-[14px] py-[12px] cursor-pointer transition-colors duration-150 hover:brightness-[0.97]"
      style={{
        background: n.read ? '#fafafa' : cfg.rowBg,
        borderBottom: `1px solid #f0f0f0`,
        opacity: n.read ? 0.55 : 1,
      }}
      onClick={() => { if (!n.read) onRead(n.id); }}
    >
      {/* Unread left accent bar */}
      {!n.read && (
        <div
          className="absolute left-0 top-[8px] bottom-[8px] w-[3px] rounded-r-full"
          style={{ background: isWarning ? '#d97706' : cfg.iconColor }}
        />
      )}

      {/* Icon bubble */}
      <div
        className="flex-shrink-0 w-[30px] h-[30px] rounded-[8px] flex items-center justify-center mt-[1px]"
        style={{
          background: n.read ? '#f0f0f0' : cfg.iconBg,
          border: `1px solid ${n.read ? '#e5e5e5' : cfg.rowBorder}`,
        }}
      >
        <Icon
          size={13}
          strokeWidth={n.read ? 1.6 : 2}
          style={{ color: n.read ? '#aaa' : cfg.iconColor }}
        />
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[6px]">
          <p
            className="text-[12px] leading-[1.3] truncate"
            style={{
              color: n.read ? '#888' : '#0a0a0a',
              fontWeight: n.read ? 500 : 600,
            }}
          >
            {n.title}
          </p>
          {n.count > 1 && (
            <span
              className="flex-shrink-0 text-[9px] font-bold px-[5px] py-[1px] rounded-full"
              style={{
                background: n.read ? '#e5e5e5' : cfg.iconColor,
                color: n.read ? '#888' : 'white',
              }}
            >
              {n.count}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#888] mt-[2px] leading-[1.45]">{n.message}</p>
        <p className="text-[10px] text-[#bbb] mt-[4px]">{timeAgo(n.updated_at)}</p>
      </div>

      {/* Dismiss × */}
      <button
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 mt-[2px] w-[20px] h-[20px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#aaa] hover:text-[#0a0a0a] hover:border-[#ccc] transition-all duration-150"
        title="Dismiss"
        onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
      >
        <X size={9} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

/* ─── Main export ─── */
export default function NotificationBell() {
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead, dismissNotification } =
    useNotifications();

  const [open, setOpen] = useState(false);
  const panelRef  = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const sorted  = sortNotifications(notifications);
  const hasUnread = unreadCount > 0;

  return (
    <>
      {/* ── Bell button ── */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex-shrink-0 w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all duration-150"
        style={{
          background: open ? '#0a0a0a' : 'transparent',
          border:     open ? '1px solid #0a0a0a' : '1px solid #e5e5e5',
          color:      open ? 'white' : '#888',
        }}
      >
        <Bell size={13} strokeWidth={open ? 2.2 : 1.8} />
        {hasUnread && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-[5px] -right-[5px] min-w-[16px] h-[16px] rounded-full bg-[#dc2626] text-white text-[9px] font-bold flex items-center justify-center px-[3px] select-none"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* ── Notification panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,   scale: 1     }}
            exit={{   opacity: 0, y: -10,  scale: 0.97  }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="fixed z-[200] flex flex-col overflow-hidden rounded-[14px] bg-white"
            style={{
              top:       48,
              right:     8,
              width:     380,
              maxHeight: 520,
              border:    '1px solid #e5e5e5',
              boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
            }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-[14px] py-[11px]"
              style={{ borderBottom: '1px solid #f0f0f0' }}
            >
              <div className="flex items-center gap-[8px]">
                <Bell size={13} strokeWidth={2} className="text-[#0a0a0a]" />
                <p className="text-[13px] font-semibold text-[#0a0a0a]">Notifications</p>
                {hasUnread && (
                  <span className="text-[10px] font-bold text-white bg-[#0a0a0a] rounded-full px-[7px] py-[1.5px]">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {hasUnread && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-[5px] text-[11px] font-medium text-[#888] hover:text-[#0a0a0a] transition-colors duration-150"
                >
                  <CheckCheck size={12} strokeWidth={2} />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-[48px]">
                  <div className="w-[18px] h-[18px] rounded-full border-[2px] border-[#e5e5e5] border-t-[#0a0a0a] animate-spin" />
                </div>
              ) : sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-[52px] gap-[10px]">
                  <div className="w-[42px] h-[42px] rounded-full bg-[#f4f4f4] flex items-center justify-center">
                    <BellOff size={18} className="text-[#ccc]" strokeWidth={1.4} />
                  </div>
                  <p className="text-[13px] font-semibold text-[#0a0a0a]">All caught up</p>
                  <p className="text-[12px] text-[#aaa] text-center leading-[1.5]" style={{ maxWidth: 200 }}>
                    No notifications yet. Events in your workspace will appear here.
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {sorted.map((n) => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      onRead={markAsRead}
                      onDismiss={dismissNotification}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
