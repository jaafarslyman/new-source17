import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, BriefcaseBusiness, Building2, CalendarDays, Check, Clock3,
  Filter, Home, Loader2, MessageSquare, Pencil, Plus, RefreshCw, Search,
  Trash2, UserRound, Users2, Wrench, X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import FlowPointSelect from '@/components/FlowPointSelect';
import NotificationBell from '@/components/NotificationBell';
import { supabase } from '@/lib/supabase';
import type { Contact, Staff } from '@/lib/contactsTypes';
import type { Property } from '@/lib/propertiesTypes';
import type { Unit } from '@/lib/unitsTypes';
import type { Service } from '@/lib/servicesTypes';
import {
  ageLabel, DEFAULT_REQUEST_TYPES, REQUEST_PRIORITIES, REQUEST_STATUSES,
  requestPriorityLabel, requestStatusLabel, type IssueActivity, type RequestPriority,
  type RequestRecord, type RequestStatus, type RequestType,
} from '@/lib/requestsTypes';

const inputClass = 'w-full h-[39px] rounded-[9px] border border-[#e4e2de] bg-white px-[11px] text-[13px] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412] focus:ring-2 focus:ring-[#151412]/8 transition-all';
const textAreaClass = 'w-full rounded-[9px] border border-[#e4e2de] bg-white px-[11px] py-[9px] text-[13px] leading-[1.5] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412] focus:ring-2 focus:ring-[#151412]/8 transition-all resize-none';

function Modal({ children, onClose, extraWide = false }: { children: React.ReactNode; onClose: () => void; extraWide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" />
    <motion.div initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`relative max-h-[94vh] w-full overflow-hidden rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] shadow-[0_24px_80px_rgba(25,22,18,.18)] ${extraWide ? 'max-w-[1080px]' : 'max-w-[700px]'}`}>
      {children}
    </motion.div>
  </div>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.07em] text-[#8f8a82]">{label}{hint && <span className="font-normal normal-case tracking-normal text-[#b5b0a8]">· {hint}</span>}</span>{children}</label>;
}

function InlineError({ message }: { message: string }) {
  return <div className="flex items-start gap-2 rounded-[10px] border border-[#f0c8c3] bg-[#fff7f6] px-3 py-2.5 text-[12px] text-[#a33a30]"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /><span>{message}</span></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-[13px] border border-dashed border-[#d9d5ce] bg-white px-6 py-14 text-center"><Wrench size={22} className="mx-auto text-[#aaa59d]" /><p className="mt-3 text-[13px] font-semibold text-[#4d4942]">{title}</p><p className="mx-auto mt-1 max-w-[420px] text-[11px] leading-[1.5] text-[#9b968d]">{description}</p></div>;
}

function statusTone(status: RequestStatus) {
  if (status === 'resolved' || status === 'closed') return 'border-[#d2ead7] bg-[#f2faf3] text-[#327443]';
  if (status === 'cancelled') return 'border-[#e3dfd9] bg-[#f5f3f0] text-[#77736d]';
  if (status === 'in_progress') return 'border-[#d8e4f3] bg-[#f2f7fc] text-[#42688c]';
  return 'border-[#f1dfb8] bg-[#fffaf0] text-[#946b20]';
}

function priorityTone(priority: RequestPriority) {
  if (priority === 'urgent') return 'border-[#f0c8c3] bg-[#fff4f2] text-[#b33d32]';
  if (priority === 'high') return 'border-[#f1dfb8] bg-[#fffaf0] text-[#946b20]';
  return 'border-[#e3dfd9] bg-[#f5f3f0] text-[#77736d]';
}

function Pill({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{children}</span>;
}

function displayDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

type RequestDraft = {
  title: string;
  description: string;
  request_type_id: string;
  status: RequestStatus;
  priority: RequestPriority;
  contact_id: string;
  property_id: string;
  unit_id: string;
  service_id: string;
  assigned_staff_id: string;
  due_date: string;
  internal_notes: string;
  customer_notes: string;
  resolution_notes: string;
};

const blankDraft: RequestDraft = {
  title: '', description: '', request_type_id: '', status: 'open', priority: 'normal',
  contact_id: '', property_id: '', unit_id: '', service_id: '', assigned_staff_id: '',
  due_date: '', internal_notes: '', customer_notes: '', resolution_notes: '',
};

function draftFromRequest(request: RequestRecord): RequestDraft {
  return {
    title: request.title,
    description: request.description ?? '',
    request_type_id: request.request_type_id ?? '',
    status: request.status,
    priority: request.priority,
    contact_id: request.contact_id === null ? '' : String(request.contact_id),
    property_id: request.property_id ?? '',
    unit_id: request.unit_id ?? '',
    service_id: request.service_id ?? '',
    assigned_staff_id: request.assigned_staff_id === null ? '' : String(request.assigned_staff_id),
    due_date: request.due_date ?? '',
    internal_notes: request.internal_notes ?? '',
    customer_notes: request.customer_notes ?? '',
    resolution_notes: request.resolution_notes ?? '',
  };
}

function RequestForm({
  request, types, contacts, staff, properties, units, services, onClose, onSave,
}: {
  request: RequestRecord | null;
  types: RequestType[];
  contacts: Contact[];
  staff: Staff[];
  properties: Property[];
  units: Unit[];
  services: Service[];
  onClose: () => void;
  onSave: (draft: RequestDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RequestDraft>(request ? draftFromRequest(request) : blankDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propertyUnits = units.filter((unit) => !draft.property_id || unit.property_id === draft.property_id);
  const set = (patch: Partial<RequestDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const submit = async () => {
    if (!draft.title.trim()) { setError('A title is required.'); return; }
    setSaving(true); setError(null);
    try { await onSave(draft); onClose(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save this request.'); } finally { setSaving(false); }
  };
  return <Modal onClose={saving ? () => undefined : onClose} extraWide>
    <div className="flex items-start justify-between border-b border-[#ebe8e3] px-5 py-4 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#a19c93]">{request ? 'Update request' : 'New request'}</p><h2 className="mt-1 text-[17px] font-semibold tracking-[-.02em] text-[#151412]">{request ? 'Edit request / issue' : 'Create request / issue'}</h2></div><button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e4e2de] text-[#817d76] hover:bg-[#f0eeea]"><X size={14} /></button></div>
    <div className="max-h-[calc(94vh-76px)] overflow-y-auto px-5 py-5 sm:px-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="Title"><input autoFocus className={inputClass} value={draft.title} onChange={(event) => set({ title: event.target.value })} placeholder="e.g. Water leak reported in unit 204" /></Field></div>
        <div className="md:col-span-2"><Field label="Description" hint="optional"><textarea className={textAreaClass} rows={3} value={draft.description} onChange={(event) => set({ description: event.target.value })} placeholder="What happened and what does the team need to know?" /></Field></div>
        <Field label="Issue type"><FlowPointSelect value={draft.request_type_id} onChange={(value) => set({ request_type_id: value })} placeholder="Select issue type" options={types.filter((type) => type.active).map((type) => ({ value: type.id, label: type.name }))} emptyLabel="No issue types found" /></Field>
        <Field label="Status"><FlowPointSelect value={draft.status} onChange={(value) => set({ status: value as RequestStatus })} placeholder="Select status" options={REQUEST_STATUSES.map((item) => ({ ...item }))} /></Field>
        <Field label="Priority"><FlowPointSelect value={draft.priority} onChange={(value) => set({ priority: value as RequestPriority })} placeholder="Select priority" options={REQUEST_PRIORITIES.map((item) => ({ ...item }))} /></Field>
        <Field label="Due date" hint="optional"><input type="date" className={inputClass} value={draft.due_date} onChange={(event) => set({ due_date: event.target.value })} /></Field>
      </div>
      <div className="mt-6 border-t border-[#ebe8e3] pt-5"><p className="mb-3 text-[12px] font-semibold text-[#35322e]">Relationships</p><div className="grid gap-4 md:grid-cols-2">
        <Field label="Contact" hint="optional"><FlowPointSelect value={draft.contact_id} onChange={(value) => set({ contact_id: value })} placeholder="Select contact" options={contacts.map((contact) => ({ value: String(contact.id), label: contact.name, secondary: contact.customer_id ?? contact.email ?? undefined }))} /></Field>
        <Field label="Property" hint="optional"><FlowPointSelect value={draft.property_id} onChange={(value) => set({ property_id: value, unit_id: '' })} placeholder="Select property" options={properties.map((property) => ({ value: property.id, label: property.name, secondary: [property.city, property.address_line1].filter(Boolean).join(' · ') }))} /></Field>
        <Field label="Unit" hint="optional"><FlowPointSelect disabled={!draft.property_id} value={draft.unit_id} onChange={(value) => set({ unit_id: value })} placeholder={draft.property_id ? 'Select unit' : 'Select property first'} options={propertyUnits.map((unit) => ({ value: unit.id, label: `Unit ${unit.unit_number}`, secondary: unit.unit_type ?? undefined }))} emptyLabel="No units for this property" /></Field>
        <Field label="Related service" hint="optional"><FlowPointSelect value={draft.service_id} onChange={(value) => set({ service_id: value })} placeholder="Select service" options={services.map((service) => ({ value: service.id, label: service.name, secondary: service.category }))} /></Field>
        <Field label="Assigned staff" hint="optional"><FlowPointSelect value={draft.assigned_staff_id} onChange={(value) => set({ assigned_staff_id: value })} placeholder="Leave unassigned" options={staff.filter((member) => member.status !== 'inactive' || String(member.id) === draft.assigned_staff_id).map((member) => ({ value: String(member.id), label: member.name, secondary: [member.role, member.department, member.status === 'inactive' ? 'Inactive · currently assigned' : ''].filter(Boolean).join(' · ') }))} /></Field>
        {draft.contact_id && <div className="flex items-center rounded-[9px] bg-[#f5f3f0] px-3 text-[11px] text-[#77736d]">Customer ID: <span className="ml-1 font-semibold text-[#4d4942]">{contacts.find((contact) => String(contact.id) === draft.contact_id)?.customer_id ?? 'Not provided'}</span></div>}
      </div></div>
      <div className="mt-6 border-t border-[#ebe8e3] pt-5"><p className="mb-3 text-[12px] font-semibold text-[#35322e]">Additional information</p><div className="grid gap-4 md:grid-cols-2">
        <Field label="Internal notes" hint="private"><textarea className={textAreaClass} rows={3} value={draft.internal_notes} onChange={(event) => set({ internal_notes: event.target.value })} placeholder="Notes for your team" /></Field>
        <Field label="Customer-facing notes" hint="optional"><textarea className={textAreaClass} rows={3} value={draft.customer_notes} onChange={(event) => set({ customer_notes: event.target.value })} placeholder="Information safe to share with the customer" /></Field>
        <div className="md:col-span-2"><Field label="Resolution notes" hint="optional"><textarea className={textAreaClass} rows={3} value={draft.resolution_notes} onChange={(event) => set({ resolution_notes: event.target.value })} placeholder="Document the resolution when the request is resolved or closed" /></Field></div>
      </div></div>
      {error && <div className="mt-5"><InlineError message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2 border-t border-[#ebe8e3] pt-4"><button onClick={onClose} disabled={saving} className="h-9 rounded-[9px] border border-[#e4e2de] px-4 text-[12px] font-medium text-[#625e57] hover:bg-[#f0eeea] disabled:opacity-50">Cancel</button><button onClick={submit} disabled={saving} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-4 text-[12px] font-semibold text-white hover:bg-[#312f2c] disabled:opacity-50">{saving && <Loader2 size={13} className="animate-spin" />}{request ? 'Save changes' : 'Create request'}</button></div>
    </div>
  </Modal>;
}

function RequestProfile({
  request, types, contacts, staff, properties, units, services, activities, onClose, onEdit, onDelete,
}: {
  request: RequestRecord; types: RequestType[]; contacts: Contact[]; staff: Staff[]; properties: Property[]; units: Unit[]; services: Service[]; activities: IssueActivity[]; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'relationships' | 'timeline' | 'notes'>('overview');
  const type = types.find((item) => item.id === request.request_type_id);
  const contact = contacts.find((item) => String(item.id) === String(request.contact_id));
  const property = properties.find((item) => item.id === request.property_id);
  const unit = units.find((item) => item.id === request.unit_id);
  const service = services.find((item) => item.id === request.service_id);
  const assignee = staff.find((item) => String(item.id) === String(request.assigned_staff_id));
  const tabs = [['overview', 'Overview'], ['relationships', 'Relationships'], ['timeline', 'Timeline'], ['notes', 'Notes']] as const;
  return <Modal onClose={onClose} extraWide>
    <div className="flex items-start justify-between border-b border-[#ebe8e3] px-5 py-4 sm:px-6"><div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] bg-[#f1eee9] text-[#706b62]"><Wrench size={20} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-[17px] font-semibold tracking-[-.02em] text-[#151412]">{request.title}</h2><Pill tone={statusTone(request.status)}>{requestStatusLabel(request.status)}</Pill><Pill tone={priorityTone(request.priority)}>{requestPriorityLabel(request.priority)}</Pill></div><p className="mt-1 text-[11px] text-[#8b877f]">{type?.name ?? 'Issue type unavailable'} · Created {displayDate(request.created_at)}</p></div></div><div className="ml-3 flex flex-shrink-0 items-center gap-2"><button onClick={onEdit} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e4e2de] px-2.5 text-[11px] font-medium text-[#625e57] hover:bg-[#f0eeea]"><Pencil size={12} />Edit</button><button onClick={onDelete} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#f0c8c3] px-2.5 text-[11px] font-medium text-[#a33a30] hover:bg-[#fff7f6]"><Trash2 size={12} />Delete</button><button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e4e2de] text-[#817d76] hover:bg-[#f0eeea]"><X size={14} /></button></div></div>
    <div className="flex gap-1 overflow-x-auto border-b border-[#ebe8e3] px-5 pt-2">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-2 pb-2.5 text-[11px] font-semibold ${tab === value ? 'border-[#151412] text-[#151412]' : 'border-transparent text-[#9a958d] hover:text-[#4d4942]'}`}>{label}</button>)}</div>
    <div className="max-h-[calc(94vh-138px)] overflow-y-auto px-5 py-5 sm:px-6">
      {tab === 'overview' && <div className="grid gap-4 md:grid-cols-2"><section className="rounded-[12px] border border-[#e9e6e1] bg-white p-4"><p className="mb-3 text-[12px] font-semibold text-[#35322e]">Request details</p><Detail label="Type" value={type?.name} /><Detail label="Status" value={requestStatusLabel(request.status)} /><Detail label="Priority" value={requestPriorityLabel(request.priority)} /><Detail label="Created" value={displayDate(request.created_at)} /><Detail label="Updated" value={displayDate(request.updated_at)} /><Detail label="Age / time open" value={ageLabel(request.created_at, request.closed_at)} /><Detail label="Due date" value={displayDate(request.due_date)} /></section><section className="rounded-[12px] border border-[#e9e6e1] bg-white p-4"><p className="mb-3 text-[12px] font-semibold text-[#35322e]">Description</p><p className="whitespace-pre-wrap text-[12px] leading-[1.6] text-[#4d4942]">{request.description || 'No description documented.'}</p></section></div>}
      {tab === 'relationships' && <div className="grid gap-4 md:grid-cols-2"><RelationshipCard icon={Users2} title="Contact" primary={contact?.name ?? 'No contact linked'} secondary={contact ? `${contact.customer_id ?? 'Customer ID unavailable'} · ${contact.email ?? contact.phone ?? 'No contact details'}` : 'This request is not linked to a contact.'} /><RelationshipCard icon={Building2} title="Property / unit" primary={property?.name ?? 'No property linked'} secondary={unit ? `Unit ${unit.unit_number}${unit.status ? ` · ${unit.status}` : ''}` : property ? 'No unit linked' : 'This request is not linked to a property.'} /><RelationshipCard icon={BriefcaseBusiness} title="Related service" primary={service?.name ?? 'No service linked'} secondary={service?.category ?? 'A request can exist without a service.'} /><RelationshipCard icon={UserRound} title="Assignment" primary={assignee?.name ?? 'Unassigned'} secondary={assignee ? `${assignee.role}${assignee.department ? ` · ${assignee.department}` : ''}` : 'No staff member is assigned.'} /></div>}
      {tab === 'timeline' && <div className="rounded-[12px] border border-[#e9e6e1] bg-white p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-[12px] font-semibold text-[#35322e]">Activity timeline</p><p className="mt-1 text-[11px] text-[#9b968d]">Database-backed events for this request.</p></div><Clock3 size={16} className="text-[#aaa59d]" /></div>{activities.length === 0 ? <p className="py-8 text-center text-[11px] text-[#9b968d]">No activity recorded yet.</p> : <div className="space-y-4">{activities.map((activity) => <div key={activity.id} className="relative flex gap-3"><div className="relative flex w-5 flex-shrink-0 justify-center"><span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#151412]" />{activity !== activities[activities.length - 1] && <span className="absolute top-4 h-full w-px bg-[#e9e6e1]" />}</div><div className="min-w-0 pb-1"><p className="text-[12px] font-medium text-[#4d4942]">{activity.description}</p><p className="mt-1 text-[10px] text-[#aaa59d]">{displayDate(activity.created_at)} · {new Date(activity.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p></div></div>)}</div>}</div>}
      {tab === 'notes' && <div className="grid gap-4 md:grid-cols-3"><NoteCard icon={MessageSquare} title="Internal notes" value={request.internal_notes} /><NoteCard icon={MessageSquare} title="Customer-facing notes" value={request.customer_notes} /><NoteCard icon={Check} title="Resolution notes" value={request.resolution_notes} /></div>}
    </div>
  </Modal>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[#f0eeeb] py-2 last:border-0"><span className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#aaa59d]">{label}</span><span className="max-w-[65%] text-right text-[12px] text-[#4d4942]">{value || 'Not provided'}</span></div>;
}

function RelationshipCard({ icon: Icon, title, primary, secondary }: { icon: React.ElementType; title: string; primary: string; secondary: string }) {
  return <section className="rounded-[12px] border border-[#e9e6e1] bg-white p-4"><div className="flex items-start gap-3"><div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#f1eee9] text-[#706b62]"><Icon size={15} /></div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#aaa59d]">{title}</p><p className="mt-1 truncate text-[13px] font-semibold text-[#35322e]">{primary}</p><p className="mt-1 text-[11px] leading-[1.5] text-[#8e8981]">{secondary}</p></div></div></section>;
}

function NoteCard({ icon: Icon, title, value }: { icon: React.ElementType; title: string; value: string | null }) {
  return <section className="rounded-[12px] border border-[#e9e6e1] bg-white p-4"><div className="flex items-center gap-2 text-[#706b62]"><Icon size={14} /><p className="text-[12px] font-semibold text-[#35322e]">{title}</p></div><p className="mt-3 whitespace-pre-wrap text-[12px] leading-[1.6] text-[#625e57]">{value || 'No notes documented.'}</p></section>;
}

function ConfirmDelete({ title, deleting, onCancel, onConfirm }: { title: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={deleting ? undefined : onCancel} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" /><motion.div initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative w-full max-w-[380px] rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] p-6 text-center shadow-[0_24px_80px_rgba(25,22,18,.18)]"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#f0cbc6] bg-[#fff3f1] text-[#b33d32]"><Trash2 size={17} /></div><h2 className="mt-4 text-[15px] font-semibold text-[#24211e]">Delete request?</h2><p className="mt-1 text-[12px] leading-[1.5] text-[#8f8980]">“{title}” and its activity timeline will be permanently removed.</p><div className="mt-5 flex gap-2"><button onClick={onCancel} disabled={deleting} className="h-9 flex-1 rounded-[9px] border border-[#e4e2de] text-[12px] font-medium text-[#625e57] hover:bg-[#f0eeea] disabled:opacity-50">Cancel</button><button onClick={onConfirm} disabled={deleting} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#b33d32] text-[12px] font-semibold text-white hover:bg-[#96342b] disabled:opacity-50">{deleting && <Loader2 size={13} className="animate-spin" />}Delete</button></div></motion.div></div>;
}

export default function RequestsPage() {
  useAuth();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [types, setTypes] = useState<RequestType[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [activities, setActivities] = useState<IssueActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [formRequest, setFormRequest] = useState<RequestRecord | null | undefined>(undefined);
  const [profileRequest, setProfileRequest] = useState<RequestRecord | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<RequestRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const staffId = params.get('staffId');
    const propertyId = params.get('propertyId');
    const serviceId = params.get('serviceId');
    const contactId = params.get('contactId');
    if (staffId) setStaffFilter(staffId);
    if (propertyId) setPropertyFilter(propertyId);
    if (serviceId) setServiceFilter(serviceId);
    if (contactId) setContactFilter(contactId);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    const results = await Promise.all([
      supabase.from('requests').select('*').order('updated_at', { ascending: false }),
      supabase.from('request_types').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('contacts').select('*').order('name'),
      supabase.from('staff').select('*').order('name'),
      supabase.from('properties').select('*').order('name'),
      supabase.from('units').select('*').order('unit_number'),
      supabase.from('services').select('*').order('name'),
    ]);
    const requestResult = results[0];
    if (requestResult.error) { setError(requestResult.error.message); setLoading(false); return; }
    setRequests((requestResult.data as RequestRecord[]) ?? []);
    setContacts((results[2].data as Contact[]) ?? []);
    setStaff((results[3].data as Staff[]) ?? []);
    setProperties((results[4].data as Property[]) ?? []);
    setUnits((results[5].data as Unit[]) ?? []);
    setServices((results[6].data as Service[]) ?? []);
    if (!results[1].error && results[1].data) {
      let loadedTypes = results[1].data as RequestType[];
      const existingNames = new Set(loadedTypes.map((type) => type.name.toLowerCase()));
      const missingNames = DEFAULT_REQUEST_TYPES.filter((name) => !existingNames.has(name.toLowerCase()));
      if (missingNames.length) {
        await supabase.from('request_types').insert(missingNames.map((name, index) => ({ name, sort_order: index })));
        const refreshed = await supabase.from('request_types').select('*').eq('active', true).order('sort_order').order('name');
        if (!refreshed.error && refreshed.data) loadedTypes = refreshed.data as RequestType[];
      }
      setTypes(loadedTypes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadActivities = useCallback(async (requestId: string) => {
    const { data, error: activityError } = await supabase.from('issue_activity').select('*').eq('issue_id', requestId).order('created_at', { ascending: false });
    if (!activityError) setActivities((data as IssueActivity[]) ?? []);
  }, []);

  useEffect(() => { if (profileRequest) loadActivities(profileRequest.id); else setActivities([]); }, [profileRequest, loadActivities]);

  const saveRequest = async (draft: RequestDraft) => {
    const payload = {
      title: draft.title.trim(), description: draft.description.trim() || null,
      request_type_id: draft.request_type_id || null, status: draft.status, priority: draft.priority,
      contact_id: draft.contact_id || null, property_id: draft.property_id || null,
      unit_id: draft.unit_id || null, service_id: draft.service_id || null,
      assigned_staff_id: draft.assigned_staff_id || null,
      due_date: draft.due_date || null, internal_notes: draft.internal_notes.trim() || null,
      customer_notes: draft.customer_notes.trim() || null, resolution_notes: draft.resolution_notes.trim() || null,
    };
    if (formRequest) {
      const previous = formRequest;
      const { data, error: updateError } = await supabase.from('requests').update(payload).eq('id', previous.id).select().single();
      if (updateError) throw new Error(updateError.message);
      const updated = data as RequestRecord;
      const events: { activity_type: string; description: string }[] = [];
      if (previous.status !== updated.status) events.push({ activity_type: updated.status === 'resolved' ? 'resolved' : updated.status === 'closed' ? 'closed' : 'status_changed', description: `Status changed to ${requestStatusLabel(updated.status)}` });
      if (previous.priority !== updated.priority) events.push({ activity_type: 'priority_changed', description: `Priority changed to ${requestPriorityLabel(updated.priority)}` });
      if (String(previous.assigned_staff_id ?? '') !== String(updated.assigned_staff_id ?? '')) events.push({ activity_type: previous.assigned_staff_id ? 'reassigned' : 'assigned', description: updated.assigned_staff_id ? `Assigned to ${staff.find((member) => String(member.id) === String(updated.assigned_staff_id))?.name ?? 'staff member'}` : 'Request unassigned' });
      if (previous.internal_notes !== updated.internal_notes || previous.customer_notes !== updated.customer_notes || previous.resolution_notes !== updated.resolution_notes) events.push({ activity_type: 'note_added', description: 'Notes updated' });
      if (events.length) { await supabase.from('issue_activity').insert(events.map((event) => ({ issue_id: updated.id, activity_type: event.activity_type, description: event.description, actor_type: 'user' }))); }
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
      setProfileRequest((current) => current?.id === updated.id ? updated : current);
      setFeedback({ tone: 'success', message: 'Request changes saved.' });
    } else {
      const { data, error: insertError } = await supabase.from('requests').insert([payload]).select().single();
      if (insertError) throw new Error(insertError.message);
      const inserted = data as RequestRecord;
      setRequests((current) => [inserted, ...current]);
      setFeedback({ tone: 'success', message: 'Request created.' });
    }
  };

  const deleteSelected = async () => {
    if (!deleteRequest) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('requests').delete().eq('id', deleteRequest.id);
    if (deleteError) { setFeedback({ tone: 'error', message: deleteError.message }); setDeleting(false); return; }
    setRequests((current) => current.filter((item) => item.id !== deleteRequest.id));
    setDeleteRequest(null); setProfileRequest(null); setDeleting(false);
    setFeedback({ tone: 'success', message: 'Request deleted.' });
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter((request) => {
      const contact = contacts.find((item) => String(item.id) === String(request.contact_id));
      const property = properties.find((item) => item.id === request.property_id);
      const unit = units.find((item) => item.id === request.unit_id);
      const service = services.find((item) => item.id === request.service_id);
      const assignee = staff.find((item) => String(item.id) === String(request.assigned_staff_id));
      const type = types.find((item) => item.id === request.request_type_id);
      const haystack = [request.title, request.description, contact?.name, contact?.customer_id, property?.name, unit?.unit_number, service?.name, assignee?.name, type?.name].filter(Boolean).join(' ').toLowerCase();
      return (!needle || haystack.includes(needle)) && (!statusFilter || request.status === statusFilter) && (!priorityFilter || request.priority === priorityFilter) && (!typeFilter || request.request_type_id === typeFilter) && (!propertyFilter || request.property_id === propertyFilter) && (!unitFilter || request.unit_id === unitFilter) && (!serviceFilter || request.service_id === serviceFilter) && (!staffFilter || String(request.assigned_staff_id) === staffFilter) && (!contactFilter || String(request.contact_id) === contactFilter);
    });
  }, [requests, contacts, properties, units, services, staff, types, search, statusFilter, priorityFilter, typeFilter, propertyFilter, unitFilter, serviceFilter, staffFilter, contactFilter]);

  const clearFilters = () => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); setTypeFilter(''); setPropertyFilter(''); setUnitFilter(''); setServiceFilter(''); setStaffFilter(''); setContactFilter(''); };
  const unitsForFilter = units.filter((unit) => !propertyFilter || unit.property_id === propertyFilter);

  return <AppLayout><div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f8f7f5]">
    <header className="flex flex-shrink-0 items-center justify-between border-b border-[#e9e6e1] bg-[#fbfaf8] px-5 py-4 sm:px-8"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#a19c93]">Operations workspace</p><h1 className="mt-1 text-[20px] font-semibold tracking-[-.02em] text-[#151412]">Requests / Issues</h1><p className="mt-1 max-w-[720px] text-[12px] text-[#77736d]">Track problems, requests, complaints, and operational work across your contacts, properties, units, services, and staff.</p></div><div className="flex items-center gap-2"><NotificationBell /><button onClick={() => setFormRequest(null)} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-3.5 text-[12px] font-semibold text-white shadow-[0_2px_5px_rgba(0,0,0,.12)] hover:bg-[#312f2c]"><Plus size={14} />New request</button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8 sm:py-8">
      {feedback && <div className={`mb-5 flex items-center justify-between rounded-[10px] border px-3 py-2.5 text-[12px] ${feedback.tone === 'success' ? 'border-[#d2ead7] bg-[#f2faf3] text-[#327443]' : 'border-[#f0c8c3] bg-[#fff7f6] text-[#a33a30]'}`}><span className="flex items-center gap-2">{feedback.tone === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}{feedback.message}</span><button onClick={() => setFeedback(null)}><X size={14} /></button></div>}
      <div className="rounded-[13px] border border-[#e9e6e1] bg-white p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><label className="relative block min-w-[250px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a39b]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, contact, property, unit, service, or staff" className={`${inputClass} pl-9`} /></label><button onClick={clearFilters} className="flex h-[39px] items-center justify-center gap-2 rounded-[9px] border border-[#e4e2de] px-3 text-[12px] font-medium text-[#625e57] hover:bg-[#f4f2ef]"><Filter size={13} />Clear filters</button><button onClick={loadData} disabled={loading} className="flex h-[39px] items-center justify-center rounded-[9px] border border-[#e4e2de] px-3 text-[#817d76] hover:bg-[#f4f2ef] disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><FlowPointSelect value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={REQUEST_STATUSES.map((item) => ({ ...item }))} /><FlowPointSelect value={priorityFilter} onChange={setPriorityFilter} placeholder="All priorities" options={REQUEST_PRIORITIES.map((item) => ({ ...item }))} /><FlowPointSelect value={typeFilter} onChange={setTypeFilter} placeholder="All issue types" options={types.map((type) => ({ value: type.id, label: type.name }))} /><FlowPointSelect value={propertyFilter} onChange={(value) => { setPropertyFilter(value); setUnitFilter(''); }} placeholder="All properties" options={properties.map((property) => ({ value: property.id, label: property.name }))} /><FlowPointSelect value={unitFilter} onChange={setUnitFilter} placeholder="All units" options={unitsForFilter.map((unit) => ({ value: unit.id, label: `Unit ${unit.unit_number}`, secondary: properties.find((property) => property.id === unit.property_id)?.name }))} /><FlowPointSelect value={serviceFilter} onChange={setServiceFilter} placeholder="All services" options={services.map((service) => ({ value: service.id, label: service.name, secondary: service.category }))} /><FlowPointSelect value={staffFilter} onChange={setStaffFilter} placeholder="All assigned staff" options={staff.map((member) => ({ value: String(member.id), label: member.name, secondary: member.role }))} /><FlowPointSelect value={contactFilter} onChange={setContactFilter} placeholder="All contacts" options={contacts.map((contact) => ({ value: String(contact.id), label: contact.name, secondary: contact.customer_id ?? undefined }))} /></div></div>
      {loading && <div className="flex items-center justify-center py-20 text-[12px] text-[#8e8981]"><Loader2 size={16} className="mr-2 animate-spin" />Loading requests…</div>}
      {!loading && error && <div className="mt-5"><InlineError message={`${error} Apply supabase/requests-issues-migration.sql before using this page.`} /></div>}
      {!loading && !error && filtered.length === 0 && <div className="mt-5"><EmptyState title={requests.length ? 'No matching requests' : 'No requests yet'} description={requests.length ? 'Try a different search or clear one of the filters.' : 'Create the first request to give your team a shared operational record.'} /></div>}
      {!loading && !error && filtered.length > 0 && <div className="mt-5 overflow-hidden rounded-[13px] border border-[#e9e6e1] bg-white"><div className="overflow-x-auto"><table className="min-w-[1160px] w-full text-left"><thead className="border-b border-[#ebe8e3] bg-[#fbfaf8]"><tr>{['Request / issue', 'Type', 'Status', 'Priority', 'Contact', 'Property / unit', 'Service', 'Assigned', 'Created', 'Updated', 'Age'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[.07em] text-[#9b968d]">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#f0eeeb]">{filtered.map((request) => { const contact = contacts.find((item) => String(item.id) === String(request.contact_id)); const property = properties.find((item) => item.id === request.property_id); const unit = units.find((item) => item.id === request.unit_id); const service = services.find((item) => item.id === request.service_id); const assignee = staff.find((item) => String(item.id) === String(request.assigned_staff_id)); const type = types.find((item) => item.id === request.request_type_id); return <tr key={request.id} onClick={() => setProfileRequest(request)} className="cursor-pointer transition-colors hover:bg-[#fcfbf9]"><td className="max-w-[260px] px-4 py-3"><p className="truncate text-[12px] font-semibold text-[#35322e]">{request.title}</p><p className="mt-1 truncate text-[10px] text-[#aaa59d]">{request.description || 'No description'}</p></td><td className="px-4 py-3 text-[11px] text-[#625e57]">{type?.name ?? '—'}</td><td className="px-4 py-3"><Pill tone={statusTone(request.status)}>{requestStatusLabel(request.status)}</Pill></td><td className="px-4 py-3"><Pill tone={priorityTone(request.priority)}>{requestPriorityLabel(request.priority)}</Pill></td><td className="max-w-[160px] px-4 py-3"><p className="truncate text-[11px] font-medium text-[#4d4942]">{contact?.name ?? '—'}</p><p className="mt-1 truncate text-[10px] text-[#aaa59d]">{contact?.customer_id ?? ''}</p></td><td className="max-w-[170px] px-4 py-3"><p className="truncate text-[11px] text-[#4d4942]">{property?.name ?? '—'}</p><p className="mt-1 text-[10px] text-[#aaa59d]">{unit ? `Unit ${unit.unit_number}` : ''}</p></td><td className="max-w-[140px] px-4 py-3 truncate text-[11px] text-[#625e57]">{service?.name ?? '—'}</td><td className="max-w-[140px] px-4 py-3 truncate text-[11px] text-[#625e57]">{assignee?.name ?? 'Unassigned'}</td><td className="whitespace-nowrap px-4 py-3 text-[11px] text-[#77736d]">{displayDate(request.created_at)}</td><td className="whitespace-nowrap px-4 py-3 text-[11px] text-[#77736d]">{displayDate(request.updated_at)}</td><td className="whitespace-nowrap px-4 py-3 text-[11px] text-[#77736d]">{ageLabel(request.created_at, request.closed_at)}</td></tr>; })}</tbody></table></div><div className="border-t border-[#ebe8e3] px-4 py-3 text-[11px] text-[#9b968d]">{filtered.length} {filtered.length === 1 ? 'request' : 'requests'}</div></div>}
    </div></div>
    <AnimatePresence>{formRequest !== undefined && <RequestForm request={formRequest} types={types} contacts={contacts} staff={staff} properties={properties} units={units} services={services} onClose={() => setFormRequest(undefined)} onSave={saveRequest} />}</AnimatePresence>
    <AnimatePresence>{profileRequest && <RequestProfile request={profileRequest} types={types} contacts={contacts} staff={staff} properties={properties} units={units} services={services} activities={activities} onClose={() => setProfileRequest(null)} onEdit={() => setFormRequest(profileRequest)} onDelete={() => setDeleteRequest(profileRequest)} />}</AnimatePresence>
    <AnimatePresence>{deleteRequest && <ConfirmDelete title={deleteRequest.title} deleting={deleting} onCancel={() => setDeleteRequest(null)} onConfirm={deleteSelected} />}</AnimatePresence>
  </div></AppLayout>;
}