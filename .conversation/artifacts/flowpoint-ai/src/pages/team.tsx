import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  Users2,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import FlowPointSelect from '@/components/FlowPointSelect';
import StaffRoleSpecificFields from '@/components/StaffRoleSpecificFields';
import NotificationBell from '@/components/NotificationBell';
import PageFilterMenu from '@/components/PageFilterMenu';
import { supabase } from '@/lib/supabase';
import type { Property } from '@/lib/propertiesTypes';
import type { Service } from '@/lib/servicesTypes';
import { requestPriorityLabel, requestStatusLabel, type RequestRecord } from '@/lib/requestsTypes';
import {
  MAINTENANCE_SPECIALTIES,
  STAFF_ROLE_SUGGESTIONS,
  STAFF_CHANNELS,
  STAFF_STATUSES,
  isStaffEligibleForService,
  staffChannelLabel,
  staffRoleFamily,
  staffStatusLabel,
  type Contact,
  type Staff,
  type StaffDraft,
  type StaffPropertyRelationship,
  type StaffRoleAttributes,
} from '@/lib/contactsTypes';
import { useLocation } from 'wouter';

const inputClass =
  'w-full h-[39px] rounded-[9px] border border-[#e4e2de] bg-white px-[11px] text-[13px] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412] focus:ring-2 focus:ring-[#151412]/8 transition-all';
const textAreaClass =
  'w-full rounded-[9px] border border-[#e4e2de] bg-white px-[11px] py-[9px] text-[13px] leading-[1.5] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412] focus:ring-2 focus:ring-[#151412]/8 transition-all resize-none';

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function avatarStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(index);
    hash |= 0;
  }
  const colors = ['#5f6f52', '#7d5a50', '#4f6d7a', '#8064a2', '#8a6d3b', '#517a69'];
  return { background: colors[Math.abs(hash) % colors.length] };
}

function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  return <div className="flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ ...avatarStyle(name), width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.32)) }}>{initials(name)}</div>;
}

function Modal({ children, onClose, wide = false, extraWide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean; extraWide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" /><motion.div initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} className={`relative max-h-[92vh] w-full overflow-hidden rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] shadow-[0_24px_80px_rgba(25,22,18,.18)] ${extraWide ? 'max-w-[900px]' : wide ? 'max-w-[720px]' : 'max-w-[520px]'}`} onClick={(event) => event.stopPropagation()}>{children}</motion.div></div>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-[5px] block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">{label}{hint && <span className="ml-1 normal-case font-normal tracking-normal text-[#aaa59d]">{hint}</span>}</span>{children}</label>;
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const style = status === 'active' ? 'border-[#d2ead7] bg-[#f2faf3] text-[#327443]' : 'border-[#f1dfb8] bg-[#fff7e6] text-[#a36810]';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{staffStatusLabel(status)}</span>;
}

function StaffForm({ staff, onSave, onClose }: { staff: Staff | null; onSave: (draft: StaffDraft) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<StaffDraft>(() => ({
    name: staff?.name ?? '',
    email: staff?.email ?? '',
    phone: staff?.phone ?? '',
    role: staff?.role ?? '',
    role_description: staff?.role_description ?? '',
    department: staff?.department ?? '',
    status: staff?.status ?? 'active',
    notes: staff?.notes ?? '',
    preferred_internal_channel: staff?.preferred_internal_channel ?? 'email',
    responsibilities: staff?.responsibilities ?? '',
    role_attributes: staff?.role_attributes ?? {},
  }));
  const [roleAttributes, setRoleAttributes] = useState<StaffRoleAttributes>(() => staff?.role_attributes ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof StaffDraft>(key: K, value: StaffDraft[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.role.trim()) { setError('Choose or enter a staff role'); return; }
    if (!form.email?.trim() && !form.phone?.trim()) { setError('Add an email or phone number'); return; }
    if (form.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Enter a valid email'); return; }
    if (staffRoleFamily(form.role) === 'maintenance' && roleAttributes.maintenance_work_type !== 'generalist' && (!Array.isArray(roleAttributes.maintenance_specialties) || roleAttributes.maintenance_specialties.length === 0)) { setError('Select at least one maintenance specialty for this work type'); return; }
    setSaving(true); setError(null);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        role: form.role.trim(),
        role_description: form.role_description?.trim() || null,
        department: form.department?.trim() || null,
        notes: form.notes?.trim() || null,
        responsibilities: form.responsibilities?.trim() || null,
        role_attributes: roleAttributes,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save staff member');
      setSaving(false);
    }
  };
  return <Modal onClose={onClose} wide><div className="flex items-center justify-between border-b border-[#ebe8e3] px-5 py-4"><div><p className="text-[15px] font-semibold text-[#151412]">{staff ? 'Edit staff member' : 'Add staff member'}</p><p className="mt-1 text-[11px] text-[#8b877f]">Keep the information the team and future assistant need to route work well.</p></div><button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e4e2de] text-[#817d76] hover:bg-[#f0eeea]"><X size={14} /></button></div>
    <div className="max-h-[calc(92vh-72px)] overflow-y-auto px-5 py-5"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><p className="mb-3 border-b border-[#ebe8e3] pb-2 text-[12px] font-semibold text-[#35322e]">Identity and role</p></div>
      <Field label="Name"><input autoFocus className={inputClass} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Full name" /></Field>
       <Field label="Role"><input list="staff-role-suggestions" className={inputClass} value={form.role} onChange={(event) => set('role', event.target.value)} placeholder="Choose or enter a role" /><datalist id="staff-role-suggestions">{STAFF_ROLE_SUGGESTIONS.map((role) => <option key={role} value={role} />)}</datalist></Field>
       <Field label="Role summary" hint="optional"><input className={inputClass} value={form.role_description ?? ''} onChange={(event) => set('role_description', event.target.value)} placeholder="Short description of the position" /></Field>
      <Field label="Department" hint="optional"><input className={inputClass} value={form.department ?? ''} onChange={(event) => set('department', event.target.value)} placeholder="Operations" /></Field>
      <Field label="Status"><FlowPointSelect value={form.status ?? ''} onChange={(value) => set('status', value as StaffDraft['status'])} placeholder="Select status" options={STAFF_STATUSES.map((item) => ({ ...item }))} /></Field>
      <Field label="Preferred internal channel"><FlowPointSelect value={form.preferred_internal_channel ?? ''} onChange={(value) => set('preferred_internal_channel', value as StaffDraft['preferred_internal_channel'])} placeholder="Select channel" options={STAFF_CHANNELS.map((item) => ({ ...item }))} /></Field>
      <div className="sm:col-span-2"><p className="mb-3 mt-2 border-b border-[#ebe8e3] pb-2 text-[12px] font-semibold text-[#35322e]">Contact information</p></div>
      <Field label="Email" hint="optional"><input type="email" className={inputClass} value={form.email ?? ''} onChange={(event) => set('email', event.target.value)} placeholder="name@company.com" /></Field>
      <Field label="Phone" hint="optional"><input type="tel" className={inputClass} value={form.phone ?? ''} onChange={(event) => set('phone', event.target.value)} placeholder="+1 555 000 0000" /></Field>
       <StaffRoleSpecificFields role={form.role} attributes={roleAttributes} responsibilities={form.responsibilities} onAttributesChange={setRoleAttributes} onResponsibilitiesChange={(value) => set('responsibilities', value)} />
      <div className="sm:col-span-2"><Field label="Notes" hint="private"><textarea className={textAreaClass} rows={3} value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} placeholder="Private notes for the team" /></Field></div>
    </div>{error && <p className="mt-4 flex items-center gap-1 text-[11px] text-[#b33d32]"><AlertCircle size={11} />{error}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-[#ebe8e3] pt-4"><button onClick={onClose} disabled={saving} className="h-9 rounded-[9px] border border-[#e4e2de] px-4 text-[12px] font-medium text-[#625e57] hover:bg-[#f0eeea] disabled:opacity-50">Cancel</button><button onClick={submit} disabled={saving} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-4 text-[12px] font-semibold text-white hover:bg-[#312f2c] disabled:opacity-50">{saving && <RefreshCw size={13} className="animate-spin" />}{staff ? 'Save changes' : 'Add staff member'}</button></div></div>
  </Modal>;
}

function PropertyAssignments({ staff, relationships, properties, onAdd, onRemove, allowAdd }: { staff: Staff; relationships: StaffPropertyRelationship[]; properties: Property[]; onAdd: (data: { staff_id: number | string; property_id: string; notes: string | null }) => Promise<void>; onRemove: (relationship: StaffPropertyRelationship) => Promise<void>; allowAdd: boolean }) {
  const [propertyId, setPropertyId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const linked = relationships.filter((item) => String(item.staff_id) === String(staff.id));
  if (!allowAdd) return <div className="space-y-3"><p className="rounded-[10px] border border-[#f1dfb8] bg-[#fffaf0] px-3 py-2.5 text-[11px] leading-5 text-[#8d671b]">This role is not configured to manage a fixed property portfolio. Existing property links are retained as read-only; change the role to a property-management role to edit them.</p>{linked.map((relationship) => { const property = relationship.property ?? properties.find((item) => item.id === relationship.property_id); return <div key={String(relationship.id)} className="rounded-[10px] border border-[#e9e6e1] bg-white px-3 py-2"><p className="text-[11px] font-semibold text-[#35322e]">{property?.name ?? 'Property unavailable'}</p>{relationship.notes && <p className="mt-1 text-[10px] text-[#8e8981]">{relationship.notes}</p>}</div>; })}</div>;
  const add = async () => {
    if (!propertyId) return;
    setSaving(true);
    try { await onAdd({ staff_id: staff.id, property_id: propertyId, notes: notes.trim() || null }); setPropertyId(''); setNotes(''); } finally { setSaving(false); }
  };
  return <div className="space-y-4"><div className="rounded-[11px] border border-[#e9e6e1] bg-white p-4"><p className="text-[12px] font-semibold text-[#35322e]">Assign a property</p>{staff.status === 'inactive' && <p className="mt-1 text-[11px] text-[#9b6b20]">This staff member is inactive. Reactivate them before adding new property assignments.</p>}<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Property"><FlowPointSelect disabled={staff.status === 'inactive'} value={propertyId} onChange={setPropertyId} placeholder="Select property" options={properties.filter((property) => !linked.some((item) => item.property_id === property.id)).map((property) => ({ value: property.id, label: property.name, secondary: [property.city, property.address_line1].filter(Boolean).join(' · ') }))} emptyLabel="No unassigned properties" /></Field><Field label="Assignment notes" hint="optional"><input disabled={staff.status === 'inactive'} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Primary manager" /></Field></div><button onClick={add} disabled={staff.status === 'inactive' || !propertyId || saving} className="mt-3 flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-3.5 text-[12px] font-semibold text-white hover:bg-[#312f2c] disabled:opacity-40">{saving && <RefreshCw size={13} className="animate-spin" />}Assign property</button></div>{linked.length === 0 ? <div className="flex flex-col items-center justify-center rounded-[11px] border border-dashed border-[#d9d5ce] px-6 py-12 text-center"><Building2 size={22} className="text-[#aaa59d]" /><p className="mt-3 text-[13px] font-semibold text-[#4a4741]">No properties assigned</p><p className="mt-1 text-[11px] text-[#97928a]">Assign properties this staff member manages or supports.</p></div> : <div className="space-y-2">{linked.map((relationship) => { const property = relationship.property ?? properties.find((item) => item.id === relationship.property_id); return <div key={String(relationship.id)} className="flex items-start justify-between gap-3 rounded-[11px] border border-[#e9e6e1] bg-white p-3"><div className="flex min-w-0 gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#f1eee9] text-[#706b62]"><Building2 size={15} /></div><div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[#35322e]">{property?.name ?? 'Property unavailable'}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[#8e8981]"><MapPin size={10} />{[property?.city, property?.address_line1].filter(Boolean).join(' · ') || 'Address unavailable'}</p>{relationship.notes && <p className="mt-1 text-[10px] text-[#aaa59d]">{relationship.notes}</p>}</div></div><button onClick={() => onRemove(relationship)} className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[#f0c8c3] text-[#a33a30] hover:bg-[#fff7f6]"><Trash2 size={12} /></button></div>; })}</div>}</div>;
}

type StaffServiceAssignment = {
  id: string | number;
  staff_id: number | string;
  service_id: string;
  assignment_type: 'staff';
  assignment_role: string | null;
  notes: string | null;
  service?: Pick<Service, 'id' | 'name' | 'category' | 'status'> | null;
};

function ServiceAssignments({ staff, services, assignments, loadError, onAdd, onRemove }: {
  staff: Staff;
  services: Service[];
  assignments: StaffServiceAssignment[];
  loadError: string | null;
  onAdd: (data: { staff_id: number | string; service_id: string; assignment_role: string | null; notes: string | null }) => Promise<void>;
  onRemove: (assignment: StaffServiceAssignment) => Promise<void>;
}) {
  const [serviceId, setServiceId] = useState('');
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const linked = assignments.filter((item) => String(item.staff_id) === String(staff.id));
  const add = async () => {
    if (!serviceId) return;
    setSaving(true);
    setActionError('');
    try {
      await onAdd({ staff_id: staff.id, service_id: serviceId, assignment_role: role.trim() || null, notes: notes.trim() || null });
      setServiceId('');
      setRole('');
      setNotes('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to assign this service.');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (assignment: StaffServiceAssignment) => {
    setActionError('');
    try { await onRemove(assignment); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to remove this service assignment.'); }
  };
  return <div className="space-y-4">
    {loadError && <p className="rounded-[9px] border border-[#f1dfb8] bg-[#fffaf0] px-3 py-2 text-[11px] text-[#8d671b]">Service assignments could not be loaded: {loadError}</p>}
    {actionError && <p className="rounded-[9px] border border-[#f0c8c3] bg-[#fff7f6] px-3 py-2 text-[11px] text-[#a33a30]">{actionError}</p>}
    <div className="rounded-[11px] border border-[#e9e6e1] bg-white p-4">
      <p className="text-[12px] font-semibold text-[#35322e]">Assign a service</p>
      {staff.status === 'inactive' && <p className="mt-1 text-[11px] text-[#9b6b20]">Reactivate this team member before assigning new services.</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Service"><FlowPointSelect disabled={staff.status === 'inactive' || Boolean(loadError)} value={serviceId} onChange={setServiceId} placeholder="Select service" options={services.filter((service) => service.status === 'active' && isStaffEligibleForService(staff.role, service.name, service.category) && !linked.some((item) => item.service_id === service.id)).map((service) => ({ value: service.id, label: service.name, secondary: service.category }))} emptyLabel="No eligible unassigned active services" /></Field>
        <Field label="Assignment role" hint="optional"><input disabled={staff.status === 'inactive'} className={inputClass} value={role} onChange={(event) => setRole(event.target.value)} placeholder="Lead technician" /></Field>
        <Field label="Notes" hint="optional"><input disabled={staff.status === 'inactive'} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Coverage details" /></Field>
      </div>
      <button type="button" onClick={() => void add()} disabled={staff.status === 'inactive' || Boolean(loadError) || !serviceId || saving} className="mt-3 flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-3.5 text-[12px] font-semibold text-white hover:bg-[#312f2c] disabled:opacity-40">{saving && <RefreshCw size={13} className="animate-spin" />}Assign service</button>
    </div>
    {linked.length === 0 ? <div className="rounded-[11px] border border-dashed border-[#d9d5ce] px-6 py-10 text-center"><BriefcaseBusiness size={22} className="mx-auto text-[#aaa59d]" /><p className="mt-3 text-[13px] font-semibold text-[#4a4741]">No services assigned</p><p className="mt-1 text-[11px] text-[#97928a]">Assign a service above or from its profile in the Services page.</p></div> : <div className="space-y-2">{linked.map((assignment) => {
      const service = assignment.service ?? services.find((item) => item.id === assignment.service_id);
      return <article key={String(assignment.id)} className="flex items-start justify-between gap-3 rounded-[11px] border border-[#e9e6e1] bg-white p-4">
        <div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[#35322e]">{service?.name ?? 'Service unavailable'}</p><p className="mt-1 text-[10px] text-[#8e8981]">{service?.category ?? 'Category unavailable'}{assignment.assignment_role ? ` · ${assignment.assignment_role}` : ''}</p>{assignment.notes && <p className="mt-1 text-[10px] text-[#77736d]">{assignment.notes}</p>}</div>
        <div className="flex items-center gap-2">{service && <span className="text-[10px] text-[#8e8981]">{service.status}</span>}<button type="button" aria-label={`Remove ${service?.name ?? 'service'} assignment`} onClick={() => void remove(assignment)} className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[#f0c8c3] text-[#a33a30] hover:bg-[#fff7f6]"><Trash2 size={12} /></button></div>
      </article>;
    })}</div>}
  </div>;
}

function StaffProfile({ staff, initialTab = 'overview', relationships, properties, services, serviceAssignments, requests, contacts, serviceAssignmentError, requestLoadError, onClose, onEdit, onAdd, onRemove, onAddService, onRemoveService, onSaveNotes, onViewRequests }: { staff: Staff; initialTab?: 'overview' | 'responsibilities' | 'properties' | 'services' | 'requests' | 'communication' | 'notes'; relationships: StaffPropertyRelationship[]; properties: Property[]; services: Service[]; serviceAssignments: StaffServiceAssignment[]; requests: RequestRecord[]; contacts: Contact[]; serviceAssignmentError: string | null; requestLoadError: string | null; onClose: () => void; onEdit: () => void; onAdd: (data: { staff_id: number | string; property_id: string; notes: string | null }) => Promise<void>; onRemove: (relationship: StaffPropertyRelationship) => Promise<void>; onAddService: (data: { staff_id: number | string; service_id: string; assignment_role: string | null; notes: string | null }) => Promise<void>; onRemoveService: (assignment: StaffServiceAssignment) => Promise<void>; onSaveNotes: (notes: string | null) => Promise<void>; onViewRequests: () => void }) {
  const [tab, setTab] = useState(initialTab);
  const [notes, setNotes] = useState(staff.notes ?? '');
  const [saving, setSaving] = useState(false);
  const linkedServices = serviceAssignments.filter((item) => String(item.staff_id) === String(staff.id));
  const assignedRequests = requests.filter((item) => String(item.assigned_staff_id) === String(staff.id));
  const openRequests = assignedRequests.filter((item) => !['resolved', 'closed', 'cancelled'].includes(item.status));
  const roleFamily = staffRoleFamily(staff.role);
  const linkedPropertyRows = relationships.filter((item) => String(item.staff_id) === String(staff.id));
  const roleAttributeLabels: Record<string, string> = {
    maintenance_work_type: 'Maintenance work type',
    maintenance_specialties: 'Work specialties',
    other_maintenance_specialty: 'Other specialty',
    support_focus: 'Support areas',
    finance_focus: 'Financial responsibilities',
    leasing_focus: 'Leasing responsibilities',
    operations_focus: 'Operations responsibilities',
  };
  const roleDetails = Object.entries(staff.role_attributes ?? {}).flatMap(([key, value]) => {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return [];
    const formatted = Array.isArray(value) ? value.join(', ') : String(value);
    return [{ label: roleAttributeLabels[key] ?? key.replaceAll('_', ' '), value: formatted.replaceAll('_', ' ') }];
  });
  const tabs = [
    ['overview', 'Overview'],
    ...(roleFamily !== 'executive' ? [['responsibilities', 'Role details']] : []),
    ...(roleFamily === 'property_management' || linkedPropertyRows.length ? [['properties', 'Properties']] : []),
    ['services', serviceAssignmentError ? 'Services (unavailable)' : `Services (${linkedServices.length})`],
    ['requests', requestLoadError ? 'Requests (unavailable)' : `Requests (${openRequests.length})`],
    ['communication', 'Communication'],
    ['notes', 'Notes'],
  ] as const;
  const save = async () => { setSaving(true); try { await onSaveNotes(notes.trim() || null); } finally { setSaving(false); } };
  return <Modal onClose={onClose} extraWide><div className="flex items-start justify-between border-b border-[#ebe8e3] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><Avatar name={staff.name} size={48} /><div className="min-w-0"><p className="truncate text-[16px] font-semibold text-[#151412]">{staff.name}</p><p className="mt-1 text-[11px] text-[#8b877f]">{staff.role || 'Role not set'}{staff.department ? ` · ${staff.department}` : ''}</p></div></div><div className="flex items-center gap-2"><button onClick={onEdit} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e4e2de] px-2.5 text-[11px] font-medium text-[#625e57] hover:bg-[#f0eeea]"><Pencil size={12} />Edit</button><button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e4e2de] text-[#817d76] hover:bg-[#f0eeea]"><X size={14} /></button></div></div><div className="flex gap-1 overflow-x-auto border-b border-[#ebe8e3] px-5 pt-2">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value as typeof tab)} className={`whitespace-nowrap border-b-2 px-2 pb-2.5 text-[11px] font-semibold ${tab === value ? 'border-[#151412] text-[#151412]' : 'border-transparent text-[#9a958d]'}`}>{label}</button>)}</div><div className="max-h-[calc(92vh-138px)] overflow-y-auto px-5 py-5">
    {tab === 'overview' && <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="rounded-[11px] border border-[#e9e6e1] bg-white p-4"><p className="mb-3 text-[12px] font-semibold text-[#35322e]">Role and status</p><Detail label="Role" value={staff.role} /><Detail label="Role description" value={staff.role_description} /><Detail label="Department" value={staff.department} /><Detail label="Status" value={staffStatusLabel(staff.status)} /></div><div className="rounded-[11px] border border-[#e9e6e1] bg-white p-4"><p className="mb-3 text-[12px] font-semibold text-[#35322e]">Communication</p><Detail label="Email" value={staff.email} /><Detail label="Phone" value={staff.phone} /><Detail label="Preferred channel" value={staffChannelLabel(staff.preferred_internal_channel)} /></div><div className="rounded-[11px] border border-[#e9e6e1] bg-white p-4 md:col-span-2"><p className="mb-3 text-[12px] font-semibold text-[#35322e]">Operational workload</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-[9px] bg-[#faf9f7] p-3"><p className="text-[10px] text-[#8e8981]">Assigned properties</p><p className="mt-1 text-[18px] font-semibold text-[#35322e]">{relationships.filter((item) => item.staff_id === staff.id).length}</p></div><div className="rounded-[9px] bg-[#faf9f7] p-3"><p className="text-[10px] text-[#8e8981]">Provided services</p><p className="mt-1 text-[18px] font-semibold text-[#35322e]">{serviceAssignmentError ? '—' : linkedServices.length}</p></div><div className="rounded-[9px] bg-[#faf9f7] p-3"><p className="text-[10px] text-[#8e8981]">Open requests</p><p className="mt-1 text-[18px] font-semibold text-[#35322e]">{requestLoadError ? '—' : openRequests.length}</p></div></div></div></div>}
    {tab === 'responsibilities' && <div className="space-y-4"><div className="rounded-[11px] border border-[#e9e6e1] bg-white p-4"><p className="text-[12px] font-semibold text-[#35322e]">Role-specific responsibilities</p>{roleDetails.length ? <div className="mt-3 space-y-2">{roleDetails.map((item) => <Detail key={item.label} label={item.label} value={item.value} />)}</div> : <p className="mt-3 text-[12px] text-[#8e8981]">No structured role details have been set.</p>}{staff.responsibilities && <p className="mt-3 whitespace-pre-wrap border-t border-[#f0eeeb] pt-3 text-[12px] leading-[1.7] text-[#5f5a52]">{staff.responsibilities}</p>}</div><div className="rounded-[11px] border border-[#e9e6e1] bg-white p-4"><p className="text-[12px] font-semibold text-[#35322e]">Role summary</p><p className="mt-3 text-[13px] leading-[1.7] text-[#5f5a52]">{staff.role_description || 'No role summary has been documented yet.'}</p></div></div>}
    {tab === 'properties' && <PropertyAssignments staff={staff} relationships={relationships} properties={properties} onAdd={onAdd} onRemove={onRemove} allowAdd={roleFamily === 'property_management'} />}
    {tab === 'services' && <ServiceAssignments staff={staff} services={services} assignments={serviceAssignments} loadError={serviceAssignmentError} onAdd={onAddService} onRemove={onRemoveService} />}
    {tab === 'requests' && <div className="space-y-3">{requestLoadError && <p className="rounded-[9px] border border-[#f1dfb8] bg-[#fffaf0] px-3 py-2 text-[11px] text-[#8d671b]">Assigned requests could not be loaded: {requestLoadError}</p>}{!requestLoadError && assignedRequests.length ? assignedRequests.map((request) => { const contact = contacts.find((item) => String(item.id) === String(request.contact_id)); const property = properties.find((item) => item.id === request.property_id); const service = services.find((item) => item.id === request.service_id); const isOpen = !['resolved', 'closed', 'cancelled'].includes(request.status); return <article key={request.id} className="rounded-[11px] border border-[#e9e6e1] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[12px] font-semibold text-[#35322e]">{request.title}</p><p className="mt-1 text-[10px] text-[#8e8981]">{[contact?.name, property?.name, service?.name].filter(Boolean).join(' · ') || 'No contact, property, or service linked'}</p></div><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isOpen ? 'border-[#f1dfb8] bg-[#fff7e6] text-[#a36810]' : 'border-[#d2ead7] bg-[#f2faf3] text-[#327443]'}`}>{requestStatusLabel(request.status)}</span></div><div className="mt-3 flex items-center gap-3 border-t border-[#f0eeeb] pt-3 text-[10px] text-[#8e8981]"><span>{requestPriorityLabel(request.priority)} priority</span><span className="flex items-center gap-1"><Clock3 size={10} />{request.due_date ? `Due ${new Date(`${request.due_date}T00:00:00`).toLocaleDateString()}` : 'No due date'}</span></div></article>; }) : !requestLoadError && <div className="rounded-[11px] border border-dashed border-[#d9d5ce] px-6 py-12 text-center"><ClipboardList size={22} className="mx-auto text-[#aaa59d]" /><p className="mt-3 text-[13px] font-semibold text-[#4a4741]">No requests assigned</p><p className="mt-1 text-[11px] text-[#97928a]">Requests assigned to this staff member will appear here.</p></div>}{!requestLoadError && <button type="button" onClick={onViewRequests} className="flex h-9 items-center gap-2 rounded-[9px] border border-[#e4e2de] bg-white px-3 text-[11px] font-semibold text-[#625e57] hover:bg-[#f5f3f0]">View in Requests <ChevronRight size={13} /></button>}</div>}
    {tab === 'communication' && <div className="flex flex-col items-center justify-center rounded-[11px] border border-dashed border-[#d9d5ce] px-6 py-12 text-center"><Mail size={22} className="text-[#aaa59d]" /><p className="mt-3 text-[13px] font-semibold text-[#4a4741]">Internal communication is ready to connect</p><p className="mt-1 max-w-[360px] text-[11px] leading-[1.6] text-[#97928a]">Email, phone, SMS, Slack, and other internal channels can be attached to staff records here as those systems are connected.</p></div>}
    {tab === 'notes' && <div className="max-w-[700px]"><Field label="Notes" hint="private to the business"><textarea className={textAreaClass} rows={8} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Private notes for the team" /></Field><button onClick={save} disabled={saving} className="mt-4 flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-3.5 text-[12px] font-semibold text-white hover:bg-[#312f2c] disabled:opacity-50">{saving && <RefreshCw size={13} className="animate-spin" />}Save notes</button></div>}
  </div></Modal>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[#f0eeeb] py-2 last:border-0"><span className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#aaa59d]">{label}</span><span className="max-w-[68%] text-right text-[12px] text-[#4d4942]">{value || 'Not provided'}</span></div>;
}

function StaffCard({ staff, relationships, properties, serviceAssignments, requests, serviceAssignmentError, requestLoadError, onOpen, onEdit, onDelete, onNotes }: { staff: Staff; relationships: StaffPropertyRelationship[]; properties: Property[]; serviceAssignments: StaffServiceAssignment[]; requests: RequestRecord[]; serviceAssignmentError: string | null; requestLoadError: string | null; onOpen: () => void; onEdit: () => void; onDelete: () => void; onNotes: () => void }) {
  const linked = relationships.filter((item) => String(item.staff_id) === String(staff.id));
  const linkedServices = serviceAssignments.filter((item) => String(item.staff_id) === String(staff.id));
  const openRequests = requests.filter((item) => String(item.assigned_staff_id) === String(staff.id) && !['resolved', 'closed', 'cancelled'].includes(item.status));
  return <motion.article layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group w-full rounded-[13px] border border-[#e9e6e1] bg-white p-4 transition-all hover:-translate-y-[1px] hover:border-[#d2cec7] hover:shadow-[0_6px_22px_rgba(31,28,23,.06)]"><div className="flex items-start gap-3"><Avatar name={staff.name} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><button type="button" onClick={onOpen} className="truncate text-left text-[13px] font-semibold text-[#171512] hover:underline">{staff.name}</button><p className="mt-1 truncate text-[11px] text-[#8e8981]">{staff.role || 'Role not set'}{staff.department ? ` · ${staff.department}` : ''}</p></div><StatusPill status={staff.status} /></div><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#77736d]">{staff.email && <span className="flex items-center gap-1"><Mail size={11} />{staff.email}</span>}{staff.phone && <span className="flex items-center gap-1"><Phone size={11} />{staff.phone}</span>}</div><div className="mt-3 flex flex-wrap gap-1.5">{linked.slice(0, 2).map((relationship) => { const property = relationship.property ?? properties.find((item) => item.id === relationship.property_id); return <span key={String(relationship.id)} className="flex items-center gap-1 rounded-full border border-[#e9e6e1] bg-[#faf9f7] px-2 py-1 text-[10px] text-[#706b62]"><Building2 size={10} />{property?.name ?? 'Property'}</span>; })}{linked.length > 2 && <span className="rounded-full border border-[#e9e6e1] bg-[#faf9f7] px-2 py-1 text-[10px] text-[#706b62]">+{linked.length - 2} more</span>}{linked.length === 0 && <span className="text-[10px] italic text-[#aaa59d]">No properties assigned</span>}</div><div className="mt-3 flex flex-wrap gap-3 border-t border-[#f0eeeb] pt-3 text-[10px] text-[#8e8981]"><span className="flex items-center gap-1"><BriefcaseBusiness size={11} />{serviceAssignmentError ? 'Services unavailable' : `${linkedServices.length} ${linkedServices.length === 1 ? 'service' : 'services'}`}</span><span className="flex items-center gap-1"><ClipboardList size={11} />{requestLoadError ? 'Requests unavailable' : `${openRequests.length} open ${openRequests.length === 1 ? 'request' : 'requests'}`}</span><span className="ml-auto text-[#aaa59d]">{staff.responsibilities ? 'Responsibilities documented' : 'No responsibilities documented'}</span></div></div></div><div className="mt-3 flex justify-end gap-1 border-t border-[#f0eeeb] pt-3 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"><button title="Notes" onClick={onNotes} className="flex h-7 items-center gap-1 rounded-[7px] border border-[#e4e2de] px-2 text-[10px] text-[#77736d] hover:bg-[#f4f2ef]"><StickyNote size={11} />Notes</button><button title="Edit" onClick={onEdit} className="flex h-7 items-center gap-1 rounded-[7px] border border-[#e4e2de] px-2 text-[10px] text-[#77736d] hover:bg-[#f4f2ef]"><Pencil size={11} />Edit</button><button title="Delete" onClick={onDelete} className="flex h-7 items-center gap-1 rounded-[7px] border border-[#f0c8c3] px-2 text-[10px] text-[#a33a30] hover:bg-[#fff7f6]"><Trash2 size={11} />Delete</button></div></motion.article>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="flex flex-col items-center justify-center rounded-[11px] border border-dashed border-[#d9d5ce] bg-[#fbfaf8] px-6 py-14 text-center"><Users2 size={22} strokeWidth={1.5} className="text-[#aaa59d]" /><p className="mt-3 text-[13px] font-semibold text-[#4a4741]">{title}</p><p className="mt-1 max-w-[330px] text-[11px] leading-[1.6] text-[#97928a]">{description}</p></div>;
}

function ConfirmDelete({ name, deleting, onCancel, onConfirm }: { name: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={deleting ? undefined : onCancel} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" /><motion.div initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative w-full max-w-[380px] rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] p-6 text-center shadow-[0_24px_80px_rgba(25,22,18,.18)]"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#f0cbc6] bg-[#fff3f1] text-[#b33d32]"><Trash2 size={17} /></div><h2 className="mt-4 text-[15px] font-semibold text-[#24211e]">Delete {name}?</h2><p className="mt-1 text-[12px] leading-[1.5] text-[#8f8980]">Property and service assignments will be removed. Existing requests remain, but this staff assignment will be cleared. To preserve the links and work history, set this person to Inactive from Edit instead.</p><div className="mt-5 flex gap-2"><button onClick={onCancel} disabled={deleting} className="h-9 flex-1 rounded-[9px] border border-[#e4e2de] text-[12px] font-medium text-[#625e57] hover:bg-[#f0eeea] disabled:opacity-50">Cancel</button><button onClick={onConfirm} disabled={deleting} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#b33d32] text-[12px] font-semibold text-white hover:bg-[#96342b] disabled:opacity-50">{deleting && <RefreshCw size={13} className="animate-spin" />}Delete</button></div></motion.div></div>;
}

export default function TeamPage() {
  useAuth();
  const [, navigate] = useLocation();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [relationships, setRelationships] = useState<StaffPropertyRelationship[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceAssignments, setServiceAssignments] = useState<StaffServiceAssignment[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [serviceAssignmentError, setServiceAssignmentError] = useState<string | null>(null);
  const [requestLoadError, setRequestLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [formStaff, setFormStaff] = useState<Staff | null | undefined>(undefined);
  const [profileStaff, setProfileStaff] = useState<Staff | null>(null);
  const [notesStaff, setNotesStaff] = useState<Staff | null>(null);
  const [deleteStaff, setDeleteStaff] = useState<Staff | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    const [staffResult, relationshipResult, propertiesResult, serviceAssignmentResult, servicesResult, requestsResult, contactsResult] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('staff_property_relationships').select('id, company_id, staff_id, property_id, notes, property:properties(id, name, address_line1, city)'),
      supabase.from('properties').select('*').order('name'),
      supabase.from('service_staff').select('id, staff_id, service_id, assignment_type, assignment_role, notes, service:services(id, name, category, status)').eq('assignment_type', 'staff'),
      supabase.from('services').select('*').order('name'),
      supabase.from('requests').select('*').not('assigned_staff_id', 'is', null).order('updated_at', { ascending: false }),
      supabase.from('contacts').select('*').order('name'),
    ]);
    if (staffResult.error) setError(staffResult.error.message); else setStaff((staffResult.data as Staff[]) ?? []);
    if (relationshipResult.error || propertiesResult.error) { setRelationshipError(relationshipResult.error?.message ?? propertiesResult.error?.message ?? 'Property assignments could not be loaded.'); setRelationships([]); } else { setRelationshipError(null); setRelationships((relationshipResult.data as unknown as StaffPropertyRelationship[]) ?? []); }
    if (!propertiesResult.error) setProperties((propertiesResult.data as Property[]) ?? []);
    if (serviceAssignmentResult.error || servicesResult.error) { setServiceAssignmentError(serviceAssignmentResult.error?.message ?? servicesResult.error?.message ?? 'Service assignments could not be loaded.'); setServiceAssignments([]); } else { setServiceAssignmentError(null); setServiceAssignments((serviceAssignmentResult.data as unknown as StaffServiceAssignment[]) ?? []); }
    if (!servicesResult.error) setServices((servicesResult.data as Service[]) ?? []);
    if (requestsResult.error) { setRequestLoadError(requestsResult.error.message); setRequests([]); } else { setRequestLoadError(null); setRequests((requestsResult.data as RequestRecord[]) ?? []); }
    if (contactsResult.error) { setRequestLoadError((current) => current ? `${current} · ${contactsResult.error?.message}` : contactsResult.error?.message ?? 'Contacts could not be loaded.'); setContacts([]); } else { setContacts((contactsResult.data as Contact[]) ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const saveStaff = async (draft: StaffDraft) => {
    if (formStaff) {
      const { data, error: saveError } = await supabase.from('staff').update(draft).eq('id', formStaff.id).select().single();
      if (saveError) throw new Error(saveError.message);
      const updated = data as Staff;
      setStaff((current) => current.map((item) => item.id === updated.id ? updated : item));
      setProfileStaff((current) => current?.id === updated.id ? updated : current);
      setNotesStaff((current) => current?.id === updated.id ? updated : current);
      setFeedback({ tone: 'success', message: 'Staff changes saved.' });
    } else {
      const { data, error: saveError } = await supabase.from('staff').insert([draft]).select().single();
      if (saveError) throw new Error(saveError.message);
      setStaff((current) => [...current, data as Staff].sort((a, b) => a.name.localeCompare(b.name)));
      setFeedback({ tone: 'success', message: 'Staff member added.' });
    }
  };

  const saveNotes = async (member: Staff, notes: string | null) => {
    const { data, error: saveError } = await supabase.from('staff').update({ notes }).eq('id', member.id).select().single();
    if (saveError) throw new Error(saveError.message);
    const updated = data as Staff;
    setStaff((current) => current.map((item) => item.id === updated.id ? updated : item));
    setProfileStaff((current) => current?.id === updated.id ? updated : current);
    setNotesStaff((current) => current?.id === updated.id ? updated : current);
    setFeedback({ tone: 'success', message: 'Staff notes saved.' });
  };

  const addProperty = async (data: { staff_id: number | string; property_id: string; notes: string | null }) => {
    const { data: inserted, error: saveError } = await supabase.from('staff_property_relationships').insert([data]).select('id, company_id, staff_id, property_id, notes, property:properties(id, name, address_line1, city)').single();
    if (saveError) { setFeedback({ tone: 'error', message: `Unable to assign property: ${saveError.message}` }); throw new Error(saveError.message); }
    setRelationships((current) => [...current, inserted as unknown as StaffPropertyRelationship]);
    setFeedback({ tone: 'success', message: 'Property assignment added.' });
  };

  const addServiceAssignment = async (data: { staff_id: number | string; service_id: string; assignment_role: string | null; notes: string | null }) => {
    const { data: inserted, error: saveError } = await supabase.from('service_staff').insert([{ ...data, assignment_type: 'staff' }]).select('id, staff_id, service_id, assignment_type, assignment_role, notes, service:services(id, name, category, status)').single();
    if (saveError) throw new Error(saveError.message);
    setServiceAssignments((current) => [...current, inserted as unknown as StaffServiceAssignment]);
    setFeedback({ tone: 'success', message: 'Service assignment added.' });
  };

  const removeServiceAssignment = async (assignment: StaffServiceAssignment) => {
    const { error: deleteError } = await supabase.from('service_staff').delete().eq('id', assignment.id);
    if (deleteError) throw new Error(deleteError.message);
    setServiceAssignments((current) => current.filter((item) => item.id !== assignment.id));
    setFeedback({ tone: 'success', message: 'Service assignment removed.' });
  };

  const removeProperty = async (relationship: StaffPropertyRelationship) => {
    const { error: deleteError } = await supabase.from('staff_property_relationships').delete().eq('id', relationship.id);
    if (deleteError) { setFeedback({ tone: 'error', message: `Unable to remove property assignment: ${deleteError.message}` }); throw new Error(deleteError.message); }
    setRelationships((current) => current.filter((item) => item.id !== relationship.id));
    setFeedback({ tone: 'success', message: 'Property assignment removed.' });
  };

  const deleteSelected = async () => {
    if (!deleteStaff) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('staff').delete().eq('id', deleteStaff.id);
    if (deleteError) { setFeedback({ tone: 'error', message: deleteError.message }); setDeleting(false); return; }
    setStaff((current) => current.filter((item) => item.id !== deleteStaff.id));
    setRelationships((current) => current.filter((item) => String(item.staff_id) !== String(deleteStaff.id)));
    setServiceAssignments((current) => current.filter((item) => String(item.staff_id) !== String(deleteStaff.id)));
    setRequests((current) => current.map((item) => String(item.assigned_staff_id) === String(deleteStaff.id) ? { ...item, assigned_staff_id: null } : item));
    setDeleteStaff(null); setProfileStaff(null); setDeleting(false);
    setFeedback({ tone: 'success', message: 'Staff member deleted.' });
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return staff.filter((member) => (!needle || [member.name, member.email, member.phone, member.role, member.role_description, member.department, member.responsibilities].filter(Boolean).join(' ').toLowerCase().includes(needle)) && (!statusFilter || member.status === statusFilter) && (!channelFilter || member.preferred_internal_channel === channelFilter)).sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, search, statusFilter, channelFilter]);

  const clearFilters = () => { setSearch(''); setStatusFilter(''); setChannelFilter(''); };
  return <AppLayout><div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f8f7f5]">
    <header className="flex flex-shrink-0 items-center justify-between border-b border-[#e9e6e1] bg-[#fbfaf8] px-5 py-4 sm:px-8"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#a19c93]">People and operations</p><h1 className="mt-1 text-[20px] font-semibold tracking-[-.02em] text-[#151412]">Team / Staff</h1><p className="mt-1 max-w-[720px] text-[12px] text-[#77736d]">See each person’s property assignments, services they deliver, and operational requests they own.</p></div><div className="flex items-center gap-2"><NotificationBell /><button onClick={() => setFormStaff(null)} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-3.5 text-[12px] font-semibold text-white shadow-[0_2px_5px_rgba(0,0,0,.12)] hover:bg-[#312f2c]"><Plus size={14} />Add staff</button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-8">
      {feedback && <div className={`mb-5 flex items-center justify-between rounded-[10px] border px-3 py-2.5 text-[12px] ${feedback.tone === 'success' ? 'border-[#d2ead7] bg-[#f2faf3] text-[#327443]' : 'border-[#f0c8c3] bg-[#fff7f6] text-[#a33a30]'}`}><span className="flex items-center gap-2">{feedback.tone === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}{feedback.message}</span><button onClick={() => setFeedback(null)}><X size={14} /></button></div>}
       {relationshipError && <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[#f1dfb8] bg-[#fffaf0] px-3 py-2.5 text-[11px] text-[#8d671b]"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /><span>Property assignments could not be loaded. Check that the staff/property relationship migration is applied. {relationshipError}</span></div>}
       {serviceAssignmentError && <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[#f1dfb8] bg-[#fffaf0] px-3 py-2.5 text-[11px] text-[#8d671b]"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /><span>Staff records are available, but service assignments could not be loaded. Check the Services migration. {serviceAssignmentError}</span></div>}
       {requestLoadError && <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[#f1dfb8] bg-[#fffaf0] px-3 py-2.5 text-[11px] text-[#8d671b]"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" /><span>Staff and service records are available, but assigned requests could not be loaded. Check the Requests migration. {requestLoadError}</span></div>}
      <div className="rounded-[13px] border border-[#e9e6e1] bg-white p-3.5"><div className="flex items-center gap-2"><label className="relative min-w-0 flex-1"><Search size={12} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[#aaa59d]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, role, department, email, or responsibility" className="h-[30px] w-full rounded-[8px] border border-[#e5e2dd] bg-[#faf9f7] pl-7 pr-7 text-[12px] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#cfcac2] focus:bg-white" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#aaa59d] hover:text-[#151412]"><X size={11} /></button>}</label><PageFilterMenu testId="button-staff-filters" activeCount={[statusFilter, channelFilter].filter(Boolean).length} onReset={() => { setStatusFilter(''); setChannelFilter(''); }}><FlowPointSelect value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={STAFF_STATUSES.map((item) => ({ ...item }))} /><FlowPointSelect value={channelFilter} onChange={setChannelFilter} placeholder="All channels" options={STAFF_CHANNELS.map((item) => ({ ...item }))} /></PageFilterMenu><button type="button" onClick={loadData} disabled={loading} aria-label="Refresh staff" className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[#e5e2dd] bg-[#faf9f7] text-[#89847c] hover:border-[#cfcac2] hover:text-[#151412] disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button></div></div>
      {loading && <div className="flex items-center justify-center py-16"><RefreshCw size={18} className="animate-spin text-[#aaa59d]" /></div>}
      {!loading && error && <div className="mt-5 flex items-start gap-2 rounded-[9px] border border-[#f0c8c3] bg-[#fff7f6] px-3 py-2.5 text-[11px] text-[#a33a30]"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" />{error}</div>}
      {!loading && !error && filtered.length === 0 && <div className="mt-5"><EmptyState title={search || statusFilter || channelFilter ? 'No matching staff' : 'No staff yet'} description={search || statusFilter || channelFilter ? 'Try a different search or clear one of the filters.' : 'Add the first staff member to document who handles work inside the company.'} /></div>}
        {!loading && !error && filtered.length > 0 && <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence mode="popLayout">{filtered.map((member) => <StaffCard key={member.id} staff={member} relationships={relationships} properties={properties} serviceAssignments={serviceAssignments} requests={requests} serviceAssignmentError={serviceAssignmentError} requestLoadError={requestLoadError} onOpen={() => setProfileStaff(member)} onEdit={() => setFormStaff(member)} onDelete={() => setDeleteStaff(member)} onNotes={() => setNotesStaff(member)} />)}</AnimatePresence></div>}
    </div></div>
    <AnimatePresence>{formStaff !== undefined && <StaffForm staff={formStaff} onSave={saveStaff} onClose={() => setFormStaff(undefined)} />}</AnimatePresence>
    <AnimatePresence>{profileStaff && <StaffProfile staff={profileStaff} relationships={relationships} properties={properties} services={services} serviceAssignments={serviceAssignments} requests={requests} contacts={contacts} serviceAssignmentError={serviceAssignmentError} requestLoadError={requestLoadError} onClose={() => setProfileStaff(null)} onEdit={() => setFormStaff(profileStaff)} onAdd={addProperty} onRemove={removeProperty} onAddService={addServiceAssignment} onRemoveService={removeServiceAssignment} onSaveNotes={(notes) => saveNotes(profileStaff, notes)} onViewRequests={() => navigate(`/requests?staffId=${profileStaff.id}`)} />}</AnimatePresence>
    <AnimatePresence>{notesStaff && <StaffProfile staff={notesStaff} initialTab="notes" relationships={relationships} properties={properties} services={services} serviceAssignments={serviceAssignments} requests={requests} contacts={contacts} serviceAssignmentError={serviceAssignmentError} requestLoadError={requestLoadError} onClose={() => setNotesStaff(null)} onEdit={() => setFormStaff(notesStaff)} onAdd={addProperty} onRemove={removeProperty} onAddService={addServiceAssignment} onRemoveService={removeServiceAssignment} onSaveNotes={(notes) => saveNotes(notesStaff, notes)} onViewRequests={() => navigate(`/requests?staffId=${notesStaff.id}`)} />}</AnimatePresence>
    <AnimatePresence>{deleteStaff && <ConfirmDelete name={deleteStaff.name} deleting={deleting} onCancel={() => setDeleteStaff(null)} onConfirm={deleteSelected} />}</AnimatePresence>
  </div></AppLayout>;
}