import React, { createContext, useContext, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  LayoutDashboard,
  Mail,
  Users2,
  UserRoundCog,
  ChevronLeft,
  LogOut,
  ScrollText,
  Bot,
  Zap,
  Building2,
  BriefcaseBusiness,
  ClipboardList,
} from 'lucide-react';
import FlowPointLogo from '@/components/FlowPointLogo';
import { supabase } from '@/lib/supabase';
import { useSettingsCtx, MONTHLY_LIMIT } from '@/contexts/SettingsContext';
import { Power } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/* ─── Sidebar context ─── */
interface SidebarContextValue { collapsed: boolean; setCollapsed: (v: boolean) => void; }
const SidebarContext = createContext<SidebarContextValue>({ collapsed: false, setCollapsed: () => {} });
export function useSidebar() { return useContext(SidebarContext); }

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

/* ─── Nav items ─── */
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',         path: '/dashboard' },
  { icon: Mail,            label: 'Inbox',             path: '/inbox' },
  { icon: Users2,          label: 'Contacts',          path: '/contacts' },
  { icon: UserRoundCog,    label: 'Team / Staff',       path: '/team' },
  { icon: Building2,       label: 'Properties',        path: '/properties' },
  { icon: BriefcaseBusiness, label: 'Services',       path: '/services' },
  { icon: ClipboardList,  label: 'Requests / Issues', path: '/requests' },
  { icon: ScrollText,      label: 'Business Policies', path: '/business-policies' },
  { icon: Bot,             label: 'Agent',             path: '/agent' },
];

const EXPANDED_W = 224;
const COLLAPSED_W = 64;

export default function AppSidebar() {
  const { collapsed, setCollapsed } = useSidebar();
  const [location, navigate] = useLocation();
  const { creditsUsed, creditsResetAt, agentActive, setAgentActive } = useSettingsCtx();
  const [creditsOpen,  setCreditsOpen]  = useState(false);
  const [warnOpen,     setWarnOpen]     = useState(false);
  const creditsBtnRef = useRef<HTMLButtonElement>(null);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const w = collapsed ? COLLAPSED_W : EXPANDED_W;

  const navBtn = (icon: React.ElementType, label: string, path: string) => {
    const Icon = icon;
    const active = location === path || location.startsWith(path + '/');
    const btn = (
      <button
        key={path}
        onClick={() => navigate(path)}
        className={`
          w-full flex items-center gap-[10px] h-[36px] rounded-[9px] px-[10px]
          text-[13px] font-medium transition-all duration-150
          ${active
            ? 'bg-[#0f0f0f] text-white shadow-[0_2px_6px_rgba(0,0,0,0.22)]'
            : 'text-[#5c5c5c] hover:bg-[#e8e7e3] hover:text-[#0a0a0a]'}
        `}
      >
        <Icon size={15} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
        <motion.span
          animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
          transition={{ duration: 0.14 }}
          className="whitespace-nowrap overflow-hidden"
        >
          {label}
        </motion.span>
      </button>
    );
    if (collapsed) {
      return (
        <Tooltip key={path}>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="text-[12px]">{label}</TooltipContent>
        </Tooltip>
      );
    }
    return <React.Fragment key={path}>{btn}</React.Fragment>;
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: w }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex-shrink-0 flex flex-col h-screen overflow-hidden z-20"
      style={{ minWidth: w, background: '#ffffff', borderRight: '1px solid #ebebeb' }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center h-[60px] px-[16px] flex-shrink-0 relative" style={{ borderBottom: '1px solid #ebebeb' }}>
        {/* Icon mark */}
        <FlowPointLogo className="flex-shrink-0 w-[32px] h-[32px] rounded-[9px]" alt="" />

        {/* Word-mark */}
        <motion.span
          animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
          transition={{ duration: 0.18 }}
          className="ml-[10px] text-[13px] font-semibold tracking-[-0.2px] text-[#0a0a0a] whitespace-nowrap overflow-hidden"
        >
          FlowPoint AI
        </motion.span>

        {/* Collapse toggle */}
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="absolute right-[12px] w-[24px] h-[24px] rounded-full bg-white flex items-center justify-center text-[#888] hover:text-[#0a0a0a] transition-colors duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
          style={{ border: '1px solid #e2e0db' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft size={12} strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* ── Section label ── */}
      <AnimatePresence>
        {!collapsed && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="px-[18px] pt-[16px] pb-[6px] text-[10px] font-semibold text-[#aaa8a3] uppercase tracking-[0.06em]"
          >
            Navigation
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Main nav ── */}
      <nav className="flex-1 py-[4px] flex flex-col gap-[2px] px-[8px] overflow-hidden">
        {NAV_ITEMS.map(({ icon, label, path }) => navBtn(icon, label, path))}
      </nav>

      {/* ── Credits line ── */}
      <div className="px-[8px] py-[6px] relative" style={{ borderTop: '1px solid #ebebeb' }}>
        {(() => {
          const pct        = Math.min(creditsUsed / MONTHLY_LIMIT, 1);
          const exceeded   = creditsUsed > MONTHLY_LIMIT;
          const daysLeft   = creditsResetAt
            ? Math.max(0, Math.ceil((new Date(creditsResetAt).getTime() - Date.now()) / 86400000))
            : 30;
          const barColor   = exceeded ? '#dc2626' : creditsUsed / MONTHLY_LIMIT > 0.8 ? '#f59e0b' : '#0a0a0a';

          const btn = (
            <button
              ref={creditsBtnRef}
              onClick={() => setCreditsOpen(v => !v)}
              className="w-full flex items-center gap-[8px] h-[36px] rounded-[9px] px-[10px] transition-all duration-150 hover:bg-[#f4f4f4] group"
            >
              <Zap size={14} strokeWidth={1.8} className={`flex-shrink-0 ${exceeded ? 'text-[#dc2626]' : 'text-[#888]'}`} />
              <motion.div
                animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
                transition={{ duration: 0.14 }}
                className="overflow-hidden flex-1 min-w-0"
              >
                <div className="flex items-center justify-between mb-[3px]">
                  <span className={`text-[11px] font-medium ${exceeded ? 'text-[#dc2626]' : 'text-[#5c5c5c]'}`}>
                    {creditsUsed.toLocaleString()} / {MONTHLY_LIMIT.toLocaleString()}
                  </span>
                  {exceeded && (
                    <span className="text-[9px] font-semibold text-[#dc2626] bg-[#fef2f2] rounded-full px-[5px] py-[1px]">OVER</span>
                  )}
                </div>
                <div className="w-full h-[3px] rounded-full bg-[#f0f0f0] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct * 100}%`, background: barColor }}
                  />
                </div>
              </motion.div>
            </button>
          );

          return (
            <>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="right" className="text-[12px]">
                    {creditsUsed.toLocaleString()} / {MONTHLY_LIMIT.toLocaleString()} credits
                  </TooltipContent>
                </Tooltip>
              ) : btn}

              {/* Credits popup — anchored above the button */}
              <AnimatePresence>
                {creditsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                    exit={{   opacity: 0, y: 8,   scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    className="absolute left-[8px] right-[8px] z-[200] bg-white rounded-[13px] overflow-hidden"
                    style={{
                      bottom: 'calc(100% + 6px)',
                      border: '1px solid #e5e5e5',
                      boxShadow: '0 8px 36px rgba(0,0,0,0.13)',
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-[14px] py-[11px]" style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div className="flex items-center gap-[6px]">
                        <Zap size={11} strokeWidth={2} className={exceeded ? 'text-[#dc2626]' : 'text-[#0a0a0a]'} />
                        <span className="text-[12px] font-semibold text-[#0a0a0a]">Monthly Credits</span>
                      </div>
                      <button
                        onClick={() => setCreditsOpen(false)}
                        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[#aaa] hover:text-[#0a0a0a] hover:bg-[#f4f4f4] transition-colors duration-150"
                      >
                        ×
                      </button>
                    </div>

                    {/* Body */}
                    <div className="px-[14px] py-[13px] flex flex-col gap-[10px]">
                      {/* Big number */}
                      <div className="flex items-end gap-[4px]">
                        <span className={`text-[22px] font-bold leading-none ${exceeded ? 'text-[#dc2626]' : 'text-[#0a0a0a]'}`}>
                          {creditsUsed.toLocaleString()}
                        </span>
                        <span className="text-[12px] text-[#aaa] mb-[2px]">/ {MONTHLY_LIMIT.toLocaleString()} credits</span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-[5px] rounded-full bg-[#f0f0f0] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(pct * 100, 100)}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ background: barColor }}
                        />
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#888]">Resets in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</span>
                        <span className={`font-medium ${exceeded ? 'text-[#dc2626]' : 'text-[#0a0a0a]'}`}>
                          {exceeded
                            ? `${(creditsUsed - MONTHLY_LIMIT).toLocaleString()} over limit`
                            : `${(MONTHLY_LIMIT - creditsUsed).toLocaleString()} remaining`}
                        </span>
                      </div>

                      {/* Exceeded warning */}
                      {exceeded && (
                        <div className="rounded-[8px] bg-[#fef2f2] px-[11px] py-[9px]" style={{ border: '1px solid #fecaca' }}>
                          <p className="text-[11px] font-semibold text-[#dc2626] mb-[2px]">Limit exceeded</p>
                          <p className="text-[11px] text-[#ef4444] leading-[1.5]">
                            Additional usage is billed separately at the end of your billing period.
                          </p>
                        </div>
                      )}

                      {/* What counts */}
                      <p className="text-[10px] text-[#bbb] leading-[1.5]">
                        1 credit = 1 AI interaction (email reply, agent message, or policy chat).
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          );
        })()}
      </div>

      {/* ── Agent activity toggle ── */}
      <div className="py-[8px] px-[8px] relative" style={{ borderTop: '1px solid #ebebeb' }}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => agentActive ? setWarnOpen(true) : setAgentActive(true)}
                className="w-full flex items-center justify-center h-[36px] rounded-[9px] transition-all duration-150 hover:bg-[#f4f4f4] relative"
                aria-label={agentActive ? 'Agent Active — click to deactivate' : 'Agent Inactive — click to activate'}
              >
                <Power
                  size={15}
                  strokeWidth={2}
                  style={{ color: agentActive ? '#16a34a' : '#9ca3af' }}
                  className="flex-shrink-0"
                />
                <span
                  className="absolute top-[7px] right-[10px] w-[6px] h-[6px] rounded-full"
                  style={{ background: agentActive ? '#22c55e' : '#d1d5db' }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-[12px]">
              Agent: {agentActive ? 'Active' : 'Inactive'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="w-full flex items-center gap-[10px] h-[36px] rounded-[9px] px-[10px]">
            <Power
              size={15}
              strokeWidth={2}
              style={{ color: agentActive ? '#16a34a' : '#9ca3af' }}
              className="flex-shrink-0 transition-colors duration-200"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#0a0a0a] leading-none">Agent</p>
              <p
                className="text-[10px] font-medium mt-[2px] transition-colors duration-200"
                style={{ color: agentActive ? '#16a34a' : '#9ca3af' }}
              >
                {agentActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={agentActive}
              onClick={() => agentActive ? setWarnOpen(true) : setAgentActive(true)}
              className="relative flex-shrink-0 focus:outline-none"
              style={{ width: 34, height: 18 }}
              aria-label="Toggle agent activity"
            >
              <span
                className="absolute inset-0 rounded-full transition-colors duration-200"
                style={{ background: agentActive ? '#22c55e' : '#d1d5db' }}
              />
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22)]"
                style={{ left: agentActive ? 18 : 2 }}
              />
            </button>
          </div>
        )}

        {/* ── Turn-off warning card ── */}
        <AnimatePresence>
          {warnOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{   opacity: 0, y: 8,   scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="absolute left-[8px] right-[8px] z-[300] bg-white rounded-[13px] overflow-hidden"
              style={{
                bottom: 'calc(100% + 6px)',
                border: '1px solid #fecaca',
                boxShadow: '0 8px 36px rgba(0,0,0,0.13)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-[14px] py-[11px]" style={{ borderBottom: '1px solid #fee2e2' }}>
                <div className="flex items-center gap-[6px]">
                  <Power size={11} strokeWidth={2} className="text-[#dc2626]" />
                  <span className="text-[12px] font-semibold text-[#0a0a0a]">Turn off agent?</span>
                </div>
                <button
                  onClick={() => setWarnOpen(false)}
                  className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[#aaa] hover:text-[#0a0a0a] hover:bg-[#f4f4f4] transition-colors duration-150"
                >
                  ×
                </button>
              </div>
              {/* Body */}
              <div className="px-[14px] py-[13px] flex flex-col gap-[12px]">
                <p className="text-[12px] text-[#555] leading-[1.55]">
                  If the agent is off, it will not be able to respond to your emails.
                </p>
                <div className="flex gap-[8px]">
                  <button
                    onClick={() => setWarnOpen(false)}
                    className="flex-1 h-[30px] rounded-[8px] text-[12px] font-medium text-[#555] bg-[#f4f4f4] hover:bg-[#ebebeb] transition-colors duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setWarnOpen(false); setAgentActive(false); }}
                    className="flex-1 h-[30px] rounded-[8px] text-[12px] font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] transition-colors duration-150"
                  >
                    Turn off
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom: sign out ── */}
      <div className="py-[10px] px-[8px] flex flex-col gap-[2px]" style={{ borderTop: '1px solid #ebebeb' }}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center h-[36px] rounded-[9px] px-[10px] text-[13px] font-medium text-[#888] hover:bg-[#fde8e8] hover:text-[#c0392b] transition-all duration-150"
              >
                <LogOut size={15} strokeWidth={1.8} className="flex-shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-[12px]">Sign out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-[10px] h-[36px] rounded-[9px] px-[10px] text-[13px] font-medium text-[#888] hover:bg-[#fde8e8] hover:text-[#c0392b] transition-all duration-150"
          >
            <LogOut size={15} strokeWidth={1.8} className="flex-shrink-0" />
            <motion.span
              animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
              transition={{ duration: 0.14 }}
              className="whitespace-nowrap overflow-hidden"
            >
              Sign out
            </motion.span>
          </button>
        )}
      </div>
    </motion.aside>
  );
}
