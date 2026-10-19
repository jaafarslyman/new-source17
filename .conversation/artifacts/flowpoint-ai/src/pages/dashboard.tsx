import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  AlertCircle,
  Mail,
  Send,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Bell,
  FileText,
  Zap,
  Users,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/lib/supabase';
import { useLocation } from 'wouter';
import NotificationBell from '@/components/NotificationBell';
import { useSettingsCtx } from '@/contexts/SettingsContext';
import FlowPointLogo from '@/components/FlowPointLogo';

/* ─────────────────────── Types ─────────────────────── */
interface InboxRow {
  Id: string;
  created_at: string;
  'sender name': string | null;
  'sender email': string | null;
  subject: string | null;
  body: string | null;
  category: string | null;
  urgency: string | null;
  response: string | null;
  type: string | null;
  'thread id': string | null;
  'staff name': string | null;
  'staff email': string | null;
  'staff role': string | null;
  'staff subject': string | null;
  'staff message': string | null;
  star: boolean | null;
  pin: boolean | null;
}

interface PolicyRow {
  id: string;
  active: boolean;
  created_at: string;
  name: string | null;
}

interface DashboardData {
  inbox: InboxRow[];
  policies: PolicyRow[];
}

/* ─────────────────────── Constants ─────────────────────── */
const CATEGORY_COLORS: Record<string, string> = {
  General:     '#94a3b8',
  Inquiry:     '#3b82f6',
  Maintenance: '#f59e0b',
  Lease:       '#8b5cf6',
  Payments:    '#10b981',
  Application: '#06b6d4',
  Complaint:   '#ef4444',
  Owner:       '#6366f1',
  Vendor:      '#22c55e',
  Documents:   '#eab308',
  Support:     '#f97316',
  Spam:        '#cbd5e1',
};

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

/* ─────────────────────── Helpers ─────────────────────── */
function getGradientStyle(name: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h >>>= 0; }
  return { background: AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length] };
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getTodayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getYesterdayStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? '#94a3b8';
}

/* ─────────────────────── Count-up hook ─────────────────────── */
function useCountUp(target: number, duration = 900): number {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const startTime = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
      else setCount(target);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return count;
}

/* ─────────────────────── Skeleton loader ─────────────────────── */
function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      className={`bg-[#ebebeb] rounded-[6px] ${className}`}
      style={style}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

/* ─────────────────────── Section card wrapper ─────────────────────── */
function SectionCard({
  title,
  subtitle,
  icon,
  children,
  className = '',
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`bg-white border border-[#ebebeb] rounded-[14px] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-[20px] pt-[18px] pb-[14px] border-b border-[#f0f0f0]">
        <div className="flex items-center gap-[8px]">
          {icon && <span className="text-[#888]">{icon}</span>}
          <div>
            <p className="text-[13px] font-semibold text-[#0a0a0a] leading-[1.3]">{title}</p>
            {subtitle && <p className="text-[11px] text-[#aaa] mt-[1px]">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────── Stat card ─────────────────────── */
interface StatCardProps {
  label: string;
  value: number;
  subLabel?: string;
  icon: React.ReactNode;
  urgent?: boolean;
  suffix?: string;
  delta?: number | null;
  loading?: boolean;
  delay?: number;
}

function StatCard({ label, value, subLabel, icon, urgent, suffix, delta, loading, delay = 0 }: StatCardProps) {
  const displayed = useCountUp(loading ? 0 : value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 30 }}
      className={`bg-white border rounded-[14px] p-[20px] flex flex-col gap-[12px] transition-shadow duration-200 hover:shadow-[0_2px_16px_rgba(0,0,0,0.06)] ${
        urgent && value > 0 ? 'border-[#f5c6c2]' : 'border-[#ebebeb]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`w-[34px] h-[34px] rounded-[8px] flex items-center justify-center ${urgent && value > 0 ? 'bg-[#fdf0ef] text-[#c0392b]' : 'bg-[#f4f4f4] text-[#555]'}`}>
          {icon}
        </span>
        {delta !== null && delta !== undefined && !loading && (
          <span className={`flex items-center gap-[2px] text-[11px] font-medium ${delta > 0 ? 'text-[#16a34a]' : delta < 0 ? 'text-[#dc2626]' : 'text-[#aaa]'}`}>
            {delta > 0 ? <ArrowUpRight size={11} strokeWidth={2.5} /> : delta < 0 ? <ArrowDownRight size={11} strokeWidth={2.5} /> : <Minus size={11} strokeWidth={2.5} />}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      <div>
        {loading ? (
          <Skeleton className="h-[28px] w-[60px] mb-[6px]" />
        ) : (
          <p className={`text-[28px] font-bold tracking-tight leading-[1] ${urgent && value > 0 ? 'text-[#c0392b]' : 'text-[#0a0a0a]'}`}>
            {displayed}{suffix}
          </p>
        )}
        <p className="text-[12px] text-[#888] mt-[4px] font-medium">{label}</p>
        {subLabel && !loading && (
          <p className="text-[11px] text-[#bbb] mt-[2px]">{subLabel}</p>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────────────── Category badge ─────────────────────── */
function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="text-[10px] font-medium text-[#888] bg-[#f4f4f4] border border-[#ebebeb] rounded-[4px] px-[6px] py-[1px]">
      {category}
    </span>
  );
}

/* ─────────────────────── Donut chart ─────────────────────── */
interface DonutData { name: string; value: number; }

function CustomDonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#ebebeb] rounded-[8px] px-[10px] py-[7px] shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
      <p className="text-[11px] font-semibold text-[#0a0a0a]">{payload[0].name}</p>
      <p className="text-[11px] text-[#888]">{payload[0].value} email{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  );
}

function CategoryDonut({ data, total, loading }: { data: DonutData[]; total: number; loading: boolean }) {
  const displayedTotal = useCountUp(loading ? 0 : total);

  return (
    <SectionCard
      title="Categories Today"
      subtitle="Breakdown by type"
      icon={<Mail size={14} strokeWidth={2} />}
      className="h-full"
    >
      <div className="p-[16px]">
        {loading ? (
          <div className="flex flex-col gap-[8px]">
            <Skeleton className="h-[160px] w-full rounded-full mx-auto" style={{ borderRadius: '50%', width: '160px', height: '160px' }} />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] gap-[8px]">
            <Mail size={24} className="text-[#ddd]" strokeWidth={1.3} />
            <p className="text-[12px] text-[#bbb]">No emails today</p>
          </div>
        ) : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                  animationBegin={200}
                  animationDuration={900}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={getCategoryColor(entry.name)} />
                  ))}
                </Pie>
                <ReTooltip content={<CustomDonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[22px] font-bold text-[#0a0a0a] leading-[1]">{displayedTotal}</p>
              <p className="text-[10px] text-[#aaa] mt-[2px] font-medium">emails</p>
            </div>
          </div>
        )}

        {/* Legend */}
        {!loading && data.length > 0 && (
          <div className="flex flex-col gap-[6px] mt-[8px]">
            {data.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between">
                <div className="flex items-center gap-[6px]">
                  <div className="w-[8px] h-[8px] rounded-full flex-shrink-0" style={{ background: getCategoryColor(entry.name) }} />
                  <span className="text-[11px] text-[#555]">{entry.name}</span>
                </div>
                <span className="text-[11px] font-semibold text-[#0a0a0a]">
                  {entry.value}
                  <span className="text-[10px] font-normal text-[#aaa] ml-[3px]">
                    ({Math.round((entry.value / total) * 100)}%)
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── Weekly bar chart ─────────────────────── */
interface BarDayData { day: string; [category: string]: number | string; }

function WeeklyBarChart({ data, categories, loading }: { data: BarDayData[]; categories: string[]; loading: boolean }) {
  return (
    <SectionCard
      title="7-Day Volume"
      subtitle="Emails received per day"
      icon={<Zap size={14} strokeWidth={2} />}
      className="h-full"
    >
      <div className="p-[16px]">
        {loading ? (
          <div className="flex items-end gap-[8px] h-[200px]">
            {[60, 90, 45, 120, 80, 100, 70].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-[6px]" style={{ height: `${h}px` }} />
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} barSize={10} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="#f0f0f0" strokeDasharray="0" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#aaa', fontFamily: 'Inter, sans-serif' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#ccc', fontFamily: 'Inter, sans-serif' }}
                width={24}
                allowDecimals={false}
              />
              <ReTooltip
                cursor={{ fill: '#f9f9f9' }}
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #ebebeb',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: 'Inter, sans-serif',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  padding: '8px 12px',
                }}
                itemStyle={{ color: '#555', padding: '1px 0' }}
                labelStyle={{ color: '#0a0a0a', fontWeight: 600, marginBottom: '4px' }}
              />
              {categories.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="a"
                  fill={getCategoryColor(cat)}
                  radius={i === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── Urgent feed ─────────────────────── */
function UrgentFeed({ emails, loading }: { emails: InboxRow[]; loading: boolean }) {
  const [, navigate] = useLocation();

  return (
    <SectionCard
      title="Urgent Issues"
      subtitle={loading ? '—' : `${emails.length} active`}
      icon={<AlertCircle size={14} strokeWidth={2} />}
      className="h-full"
      action={
        emails.length > 0 && !loading ? (
          <span className="flex items-center gap-[2px] text-[10px] font-semibold text-white bg-[#c0392b] rounded-full px-[7px] py-[2px]">
            {emails.length}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col divide-y divide-[#f0f0f0] max-h-[460px] overflow-y-auto">
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-[6px] px-[16px] py-[14px]">
            <Skeleton className="h-[12px] w-[70%]" />
            <Skeleton className="h-[10px] w-[50%]" />
          </div>
        ))}

        {!loading && emails.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-[8px] py-[48px] px-[16px]">
            <div className="w-[36px] h-[36px] rounded-full bg-[#f0fdf4] flex items-center justify-center">
              <CheckCircle2 size={18} className="text-[#16a34a]" strokeWidth={1.8} />
            </div>
            <p className="text-[12px] font-semibold text-[#0a0a0a]">All clear</p>
            <p className="text-[11px] text-[#bbb] text-center">No urgent issues right now</p>
          </div>
        )}

        {!loading && emails.map((email) => (
          <motion.div
            key={email.Id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate('/inbox')}
            className="relative flex flex-col gap-[6px] px-[16px] py-[13px] cursor-pointer hover:bg-[#fafafa] transition-colors duration-100"
          >
            {/* Red left border strip */}
            <div className="absolute left-0 top-[8px] bottom-[8px] w-[3px] bg-[#c0392b] rounded-r-full" />

            <div className="flex items-center justify-between gap-[8px]">
              <p className="text-[12px] font-semibold text-[#0a0a0a] truncate">
                {email['sender name'] ?? 'Unknown'}
              </p>
              <span className="text-[10px] text-[#bbb] flex-shrink-0">{formatTimeAgo(email.created_at)}</span>
            </div>

            <p className="text-[11px] text-[#555] truncate leading-[1.4]">
              {email.subject ?? '(No subject)'}
            </p>

            <div className="flex items-center gap-[6px] flex-wrap">
              {email.category && <CategoryBadge category={email.category} />}
              {email['staff name'] && (
                <span className="text-[10px] text-[#888] flex items-center gap-[3px]">
                  <Bell size={9} strokeWidth={2} />
                  {email['staff name']} alerted
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── AI Activity feed ─────────────────────── */
function ActivityFeed({ emails, loading }: { emails: InboxRow[]; loading: boolean }) {
  return (
    <SectionCard
      title="AI Activity"
      subtitle="Real-time responses"
      icon={<FlowPointLogo className="w-[16px] h-[16px]" alt="" />}
      className="h-full"
    >
      <div className="flex flex-col divide-y divide-[#f0f0f0] max-h-[340px] overflow-y-auto">
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-[10px] px-[16px] py-[11px]">
            <Skeleton className="w-[28px] h-[28px] rounded-full flex-shrink-0" />
            <div className="flex flex-col gap-[4px] flex-1">
              <Skeleton className="h-[10px] w-[75%]" />
              <Skeleton className="h-[9px] w-[40%]" />
            </div>
          </div>
        ))}

        {!loading && emails.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-[6px] py-[32px]">
            <FlowPointLogo className="w-[22px] h-[22px] opacity-20" alt="" />
            <p className="text-[12px] text-[#bbb]">No AI activity yet today</p>
          </div>
        )}

        {!loading && emails.map((email, i) => {
          const name = email['sender name'] ?? 'Unknown';
          return (
            <motion.div
              key={email.Id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025 }}
              className="flex items-center gap-[10px] px-[16px] py-[11px] hover:bg-[#fafafa] transition-colors duration-100"
            >
              {/* AI avatar */}
              <FlowPointLogo className="w-[28px] h-[28px] rounded-full flex-shrink-0" alt="" />

              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[#0a0a0a] leading-[1.4] truncate">
                  <span className="font-semibold">AI replied</span> to{' '}
                  <span className="font-medium">{name}</span>
                  {email.category && (
                    <span className="text-[#888]"> · {email.category}</span>
                  )}
                </p>
                <p className="text-[10px] text-[#bbb] mt-[1px]">{formatTimeAgo(email.created_at)}</p>
              </div>

              {/* Tiny dot indicator */}
              <div className="w-[5px] h-[5px] rounded-full bg-[#16a34a] flex-shrink-0" />
            </motion.div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── Staff Alert Log ─────────────────────── */
function StaffAlertLog({ emails, loading }: { emails: InboxRow[]; loading: boolean }) {
  return (
    <SectionCard
      title="Staff Alerts"
      subtitle="AI escalations today"
      icon={<Bell size={14} strokeWidth={2} />}
      className="h-full"
    >
      <div className="flex flex-col divide-y divide-[#f0f0f0] max-h-[340px] overflow-y-auto">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-[10px] px-[16px] py-[11px]">
            <Skeleton className="w-[28px] h-[28px] rounded-full flex-shrink-0" />
            <div className="flex flex-col gap-[4px] flex-1">
              <Skeleton className="h-[10px] w-[60%]" />
              <Skeleton className="h-[9px] w-[80%]" />
            </div>
          </div>
        ))}

        {!loading && emails.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-[6px] py-[32px]">
            <Bell size={22} className="text-[#ddd]" strokeWidth={1.3} />
            <p className="text-[12px] text-[#bbb]">No escalations today</p>
          </div>
        )}

        {!loading && emails.map((email, i) => {
          const staffName = email['staff name'] ?? 'Staff';
          const staffRole = email['staff role'];
          const senderName = email['sender name'] ?? 'Unknown';
          return (
            <motion.div
              key={email.Id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-[10px] px-[16px] py-[12px] hover:bg-[#fafafa] transition-colors duration-100"
            >
              {/* Staff avatar */}
              <div
                className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                style={getGradientStyle(staffName)}
              >
                {getInitials(staffName)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-[4px]">
                  <p className="text-[11px] font-semibold text-[#0a0a0a] truncate">{staffName}</p>
                  <span className="text-[10px] text-[#bbb] flex-shrink-0">{formatTimeAgo(email.created_at)}</span>
                </div>
                {staffRole && (
                  <p className="text-[10px] text-[#aaa] mt-[1px]">{staffRole}</p>
                )}
                <p className="text-[10px] text-[#555] mt-[3px] leading-[1.4] truncate">
                  Re: <span className="font-medium">{senderName}</span>
                  {email.subject ? ` — ${email.subject}` : ''}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── Top Contacts ─────────────────────── */
interface ContactEntry { name: string; email: string; count: number; lastCategory: string | null; }

function TopContacts({ contacts, loading }: { contacts: ContactEntry[]; loading: boolean }) {
  return (
    <SectionCard
      title="Most Active Contacts"
      subtitle="Last 7 days"
      icon={<Users size={14} strokeWidth={2} />}
    >
      <div className="flex flex-col divide-y divide-[#f0f0f0]">
        {loading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-[10px] px-[16px] py-[11px]">
            <Skeleton className="w-[32px] h-[32px] rounded-full flex-shrink-0" />
            <div className="flex flex-col gap-[4px] flex-1">
              <Skeleton className="h-[10px] w-[55%]" />
              <Skeleton className="h-[9px] w-[70%]" />
            </div>
            <Skeleton className="h-[20px] w-[28px] rounded-full" />
          </div>
        ))}

        {!loading && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-[6px] py-[32px]">
            <Users size={22} className="text-[#ddd]" strokeWidth={1.3} />
            <p className="text-[12px] text-[#bbb]">No contacts yet this week</p>
          </div>
        )}

        {!loading && contacts.map((contact, i) => (
          <motion.div
            key={contact.email}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-[10px] px-[16px] py-[11px] hover:bg-[#fafafa] transition-colors duration-100"
          >
            <div
              className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0"
              style={getGradientStyle(contact.name)}
            >
              {getInitials(contact.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#0a0a0a] truncate">{contact.name}</p>
              <p className="text-[10px] text-[#aaa] truncate">{contact.email}</p>
            </div>
            <div className="flex flex-col items-end gap-[3px] flex-shrink-0">
              <span className="text-[11px] font-bold text-[#0a0a0a]">{contact.count}</span>
              {contact.lastCategory && <CategoryBadge category={contact.lastCategory} />}
            </div>
          </motion.div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── Sent Today ─────────────────────── */
function SentToday({ emails, loading }: { emails: InboxRow[]; loading: boolean }) {
  const displayedCount = useCountUp(loading ? 0 : emails.length);

  return (
    <SectionCard
      title="Sent Today"
      subtitle="Outbound emails"
      icon={<Send size={14} strokeWidth={2} />}
    >
      {/* Count header */}
      <div className="px-[20px] py-[14px] border-b border-[#f0f0f0]">
        {loading ? (
          <Skeleton className="h-[28px] w-[48px]" />
        ) : (
          <p className="text-[26px] font-bold text-[#0a0a0a] tracking-tight">{displayedCount}</p>
        )}
        <p className="text-[11px] text-[#aaa] mt-[2px]">emails sent</p>
      </div>

      <div className="flex flex-col divide-y divide-[#f0f0f0]">
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-[4px] px-[16px] py-[11px]">
            <Skeleton className="h-[10px] w-[65%]" />
            <Skeleton className="h-[9px] w-[45%]" />
          </div>
        ))}

        {!loading && emails.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-[6px] py-[28px]">
            <Send size={22} className="text-[#ddd]" strokeWidth={1.3} />
            <p className="text-[12px] text-[#bbb]">No sent emails today</p>
          </div>
        )}

        {!loading && emails.slice(0, 5).map((email, i) => (
          <motion.div
            key={email.Id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="flex flex-col gap-[3px] px-[16px] py-[11px] hover:bg-[#fafafa] transition-colors duration-100"
          >
            <div className="flex items-center justify-between gap-[8px]">
              <p className="text-[11px] font-semibold text-[#0a0a0a] truncate">
                {email['sender email'] ?? 'Unknown recipient'}
              </p>
              <span className="text-[10px] text-[#bbb] flex-shrink-0">{formatTimeAgo(email.created_at)}</span>
            </div>
            <p className="text-[10px] text-[#888] truncate">{email.subject ?? '(No subject)'}</p>
          </motion.div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ─────────────────────── Policy Coverage ─────────────────────── */
function PolicyCoverage({ policies, loading }: { policies: PolicyRow[]; loading: boolean }) {
  const activePolicies = useMemo(() => policies.filter((p) => p.active), [policies]);
  const totalPolicies  = policies.length;
  const activeCount    = activePolicies.length;
  const displayedActive = useCountUp(loading ? 0 : activeCount);
  const displayedTotal  = useCountUp(loading ? 0 : totalPolicies);

  const lastUpdated = useMemo(() => {
    if (policies.length === 0) return null;
    return policies.reduce((latest, p) =>
      new Date(p.created_at) > new Date(latest.created_at) ? p : latest
    ).created_at;
  }, [policies]);

  const daysSinceUpdate = lastUpdated
    ? Math.floor((new Date().getTime() - new Date(lastUpdated).getTime()) / 86400000)
    : null;

  const coverageStatus = daysSinceUpdate === null
    ? null
    : daysSinceUpdate > 30
    ? { label: 'Review recommended', color: '#d97706', bg: '#fefce8', border: '#fde68a' }
    : { label: 'Up to date', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };

  return (
    <SectionCard
      title="Policy Coverage"
      subtitle="AI knowledge base"
      icon={<FileText size={14} strokeWidth={2} />}
    >
      {/* Stats row */}
      <div className="grid grid-cols-2 divide-x divide-[#f0f0f0] border-b border-[#f0f0f0]">
        <div className="flex flex-col gap-[2px] px-[20px] py-[16px]">
          {loading ? <Skeleton className="h-[24px] w-[40px] mb-[4px]" /> : (
            <p className="text-[22px] font-bold text-[#0a0a0a]">{displayedActive}</p>
          )}
          <p className="text-[11px] text-[#888]">Active policies</p>
        </div>
        <div className="flex flex-col gap-[2px] px-[20px] py-[16px]">
          {loading ? <Skeleton className="h-[24px] w-[40px] mb-[4px]" /> : (
            <p className="text-[22px] font-bold text-[#0a0a0a]">{displayedTotal}</p>
          )}
          <p className="text-[11px] text-[#888]">Total policies</p>
        </div>
      </div>

      {/* Status + last updated */}
      <div className="px-[20px] py-[14px] flex flex-col gap-[10px]">
        {loading ? (
          <Skeleton className="h-[32px] w-full rounded-[8px]" />
        ) : coverageStatus ? (
          <div
            className="flex items-center gap-[7px] px-[12px] py-[8px] rounded-[8px] border"
            style={{ background: coverageStatus.bg, borderColor: coverageStatus.border }}
          >
            <ShieldCheck size={13} strokeWidth={2} style={{ color: coverageStatus.color }} />
            <span className="text-[11px] font-semibold" style={{ color: coverageStatus.color }}>
              {coverageStatus.label}
            </span>
          </div>
        ) : null}

        {!loading && lastUpdated && (
          <div className="flex items-center gap-[5px] text-[10px] text-[#bbb]">
            <Clock size={10} strokeWidth={2} />
            Last policy added {formatTimeAgo(lastUpdated)}
          </div>
        )}

        {!loading && policies.length === 0 && (
          <p className="text-[11px] text-[#bbb] text-center py-[8px]">No policies configured</p>
        )}
      </div>

      {/* Recent policies */}
      {!loading && activePolicies.length > 0 && (
        <div className="flex flex-col gap-[4px] px-[16px] pb-[14px]">
          <p className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wider mb-[2px]">Active</p>
          {activePolicies.slice(0, 4).map((policy) => (
            <div key={policy.id} className="flex items-center gap-[6px]">
              <div className="w-[5px] h-[5px] rounded-full bg-[#16a34a] flex-shrink-0" />
              <span className="text-[11px] text-[#555] truncate">{policy.name ?? 'Untitled policy'}</span>
            </div>
          ))}
          {activePolicies.length > 4 && (
            <p className="text-[10px] text-[#bbb] mt-[2px]">+{activePolicies.length - 4} more</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/* ─────────────────────── Main Dashboard ─────────────────────── */
export default function DashboardPage() {
  useAuth();

  const { agentActive } = useSettingsCtx();

  const [data, setData]       = useState<DashboardData>({ inbox: [], policies: [] });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [inboxRes, policiesRes] = await Promise.all([
      supabase
        .from('inbox')
        .select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('policies')
        .select('id, active, created_at, name'),
    ]);

    setData({
      inbox:    (inboxRes.data    as InboxRow[])    ?? [],
      policies: (policiesRes.data as PolicyRow[])   ?? [],
    });
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) fetchData();
    });
  }, []);

  /* ── Derived data ── */
  const todayStart     = useMemo(() => getTodayStart(), [lastRefresh]);
  const yesterdayStart = useMemo(() => getYesterdayStart(), [lastRefresh]);

  const receivedToday = useMemo(() =>
    data.inbox.filter((e) => new Date(e.created_at) >= todayStart && e.type !== 'send'),
    [data.inbox, todayStart]
  );

  const receivedYesterday = useMemo(() =>
    data.inbox.filter((e) => {
      const d = new Date(e.created_at);
      return d >= yesterdayStart && d < todayStart && e.type !== 'send';
    }),
    [data.inbox, todayStart, yesterdayStart]
  );

  const aiHandledToday = useMemo(() =>
    receivedToday.filter((e) => e.response != null),
    [receivedToday]
  );

  const aiHandledYesterday = useMemo(() =>
    receivedYesterday.filter((e) => e.response != null),
    [receivedYesterday]
  );

  const urgentAll = useMemo(() =>
    data.inbox.filter((e) => e.urgency?.toLowerCase() === 'urgent' && e.type !== 'send'),
    [data.inbox]
  );

  const staffAlertsToday = useMemo(() =>
    data.inbox.filter((e) => e['staff name'] != null && new Date(e.created_at) >= todayStart),
    [data.inbox, todayStart]
  );

  const staffAlertsYesterday = useMemo(() =>
    data.inbox.filter((e) => {
      const d = new Date(e.created_at);
      return e['staff name'] != null && d >= yesterdayStart && d < todayStart;
    }),
    [data.inbox, todayStart, yesterdayStart]
  );

  const handleRate = receivedToday.length > 0
    ? Math.round((aiHandledToday.length / receivedToday.length) * 100)
    : 0;

  /* Category donut — today only */
  const categoryDonutData = useMemo<DonutData[]>(() => {
    const map: Record<string, number> = {};
    receivedToday.forEach((e) => {
      const cat = e.category ?? 'General';
      map[cat] = (map[cat] ?? 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [receivedToday]);

  /* 7-day bar chart */
  const { barData, barCategories } = useMemo(() => {
    const receivedOnly = data.inbox.filter((e) => e.type !== 'send');
    const catSet = new Set<string>();
    const dayMap: Record<string, Record<string, number>> = {};

    // Build 7 day slots
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString([], { weekday: 'short' });
      dayMap[key] = {};
    }

    receivedOnly.forEach((e) => {
      const dayKey = new Date(e.created_at).toLocaleDateString([], { weekday: 'short' });
      if (!(dayKey in dayMap)) return;
      const cat = e.category ?? 'General';
      catSet.add(cat);
      dayMap[dayKey][cat] = (dayMap[dayKey][cat] ?? 0) + 1;
    });

    const cats = Array.from(catSet);
    const rows: BarDayData[] = Object.entries(dayMap).map(([day, counts]) => ({
      day,
      ...counts,
    }));

    return { barData: rows, barCategories: cats };
  }, [data.inbox]);

  /* Activity feed — AI responses, last 30 */
  const activityFeed = useMemo(() =>
    data.inbox
      .filter((e) => e.response != null && e.type !== 'send')
      .slice(0, 30),
    [data.inbox]
  );

  /* Staff alert log — today */
  const staffAlertLog = useMemo(() =>
    staffAlertsToday.slice(0, 25),
    [staffAlertsToday]
  );

  /* Top contacts — last 7 days */
  const topContacts = useMemo<ContactEntry[]>(() => {
    const map: Record<string, ContactEntry> = {};
    data.inbox
      .filter((e) => e.type !== 'send')
      .forEach((e) => {
        const name  = e['sender name']  ?? 'Unknown';
        const email = e['sender email'] ?? '';
        const key = email || name;
        if (!map[key]) map[key] = { name, email, count: 0, lastCategory: null };
        map[key].count += 1;
        if (!map[key].lastCategory) map[key].lastCategory = e.category;
      });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [data.inbox]);

  /* Sent today */
  const sentToday = useMemo(() =>
    data.inbox.filter((e) => e.type === 'send' && new Date(e.created_at) >= todayStart),
    [data.inbox, todayStart]
  );

  /* Last email received */
  const lastEmailReceived = useMemo(() => {
    const received = data.inbox.filter((e) => e.type !== 'send');
    return received[0]?.created_at ?? null;
  }, [data.inbox]);

  /* Greeting */
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const todayLabel = new Date().toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  /* Deltas */
  const emailsDelta   = receivedToday.length - receivedYesterday.length;
  const aiDelta       = aiHandledToday.length - aiHandledYesterday.length;
  const staffDelta    = staffAlertsToday.length - staffAlertsYesterday.length;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-[#fafafa] min-h-screen">

        {/* ── Sticky header ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="sticky top-0 z-10 bg-white border-b border-[#ebebeb] px-[28px] h-[60px] flex items-center justify-between"
        >
          {/* Left: greeting */}
          <div>
            <p className="text-[14px] font-semibold text-[#0a0a0a] leading-[1.2]">{greeting}</p>
            <p className="text-[11px] text-[#aaa]">{todayLabel}</p>
          </div>

          {/* Right: agent status + last email + refresh */}
          <div className="flex items-center gap-[12px]">
            {/* Agent activity pill */}
            <motion.div
              key={agentActive ? 'active' : 'inactive'}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-[6px] h-[28px] rounded-full px-[10px] select-none"
              style={{
                background: agentActive ? '#f0fdf4' : '#f9fafb',
                border: `1px solid ${agentActive ? '#bbf7d0' : '#e5e7eb'}`,
              }}
            >
              <span
                className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                style={{
                  background: agentActive ? '#22c55e' : '#d1d5db',
                  boxShadow: agentActive ? '0 0 0 2px #bbf7d0' : 'none',
                }}
              />
              <span
                className="text-[11px] font-semibold tracking-[0.01em]"
                style={{ color: agentActive ? '#15803d' : '#9ca3af' }}
              >
                {agentActive ? 'Agent Active' : 'Agent Inactive'}
              </span>
            </motion.div>

            {lastEmailReceived && !loading && (
              <div className="flex items-center gap-[5px] text-[11px] text-[#aaa]">
                <Clock size={11} strokeWidth={2} />
                Last email {formatTimeAgo(lastEmailReceived)}
              </div>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] flex items-center justify-center text-[#888] hover:text-[#0a0a0a] hover:border-[#ccc] transition-all duration-150 disabled:opacity-40"
              aria-label="Refresh"
            >
              <motion.div
                animate={{ rotate: loading ? 360 : 0 }}
                transition={loading ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
              >
                <RefreshCw size={12} strokeWidth={2} />
              </motion.div>
            </button>
            <NotificationBell />
          </div>
        </motion.div>

        {/* ── Dashboard content ── */}
        <div className="px-[28px] py-[24px] flex flex-col gap-[20px] max-w-[1600px] mx-auto">

          {/* ── KPI Strip ── */}
          <div className="grid grid-cols-5 gap-[14px]">
            <StatCard
              label="Emails Today"
              value={receivedToday.length}
              icon={<Mail size={15} strokeWidth={2} />}
              delta={emailsDelta}
              subLabel="vs. yesterday"
              loading={loading}
              delay={0.05}
            />
            <StatCard
              label="AI Handled"
              value={aiHandledToday.length}
              suffix=""
              subLabel={`${handleRate}% handle rate`}
               icon={<FlowPointLogo className="w-[17px] h-[17px]" alt="" />}
              delta={aiDelta}
              loading={loading}
              delay={0.1}
            />
            <StatCard
              label="Urgent Open"
              value={urgentAll.length}
              icon={<AlertCircle size={15} strokeWidth={2} />}
              urgent
              subLabel={urgentAll.length === 0 ? 'All clear' : 'Requires attention'}
              delta={null}
              loading={loading}
              delay={0.15}
            />
            <StatCard
              label="Staff Alerts Today"
              value={staffAlertsToday.length}
              icon={<Bell size={15} strokeWidth={2} />}
              delta={staffDelta}
              subLabel="AI escalations"
              loading={loading}
              delay={0.2}
            />
            <StatCard
              label="Active Policies"
              value={data.policies.filter((p) => p.active).length}
              icon={<ShieldCheck size={15} strokeWidth={2} />}
              delta={null}
              subLabel={`of ${data.policies.length} total`}
              loading={loading}
              delay={0.25}
            />
          </div>

          {/* ── Row 2: Charts + Urgent ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 28 }}
            className="grid grid-cols-3 gap-[14px]"
          >
            {/* Left: Donut + Bar stacked */}
            <div className="col-span-2 grid grid-cols-2 gap-[14px]">
              <CategoryDonut
                data={categoryDonutData}
                total={receivedToday.length}
                loading={loading}
              />
              <WeeklyBarChart
                data={barData}
                categories={barCategories}
                loading={loading}
              />
            </div>

            {/* Right: Urgent feed */}
            <div className="col-span-1">
              <UrgentFeed emails={urgentAll} loading={loading} />
            </div>
          </motion.div>

          {/* ── Row 3: Activity + Staff ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38, type: 'spring', stiffness: 260, damping: 28 }}
            className="grid grid-cols-2 gap-[14px]"
          >
            <ActivityFeed emails={activityFeed} loading={loading} />
            <StaffAlertLog emails={staffAlertLog} loading={loading} />
          </motion.div>

          {/* ── Row 4: Contacts + Sent + Policies ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.46, type: 'spring', stiffness: 260, damping: 28 }}
            className="grid grid-cols-3 gap-[14px] pb-[24px]"
          >
            <TopContacts contacts={topContacts} loading={loading} />
            <SentToday emails={sentToday} loading={loading} />
            <PolicyCoverage policies={data.policies} loading={loading} />
          </motion.div>

        </div>
      </div>

    </AppLayout>
  );
}
