import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import FlowPointSelect from '@/components/FlowPointSelect';
import type { Property } from '@/lib/propertiesTypes';
import type { Unit } from '@/lib/unitsTypes';
import { RELATIONSHIP_TYPES, type ContactType, type RelationshipType } from '@/lib/contactsTypes';

export type ContactPropertyLinkDraft = {
  id: string | number | null;
  clientKey: string;
  property_id: string;
  unit_id: string;
  relationship_type: RelationshipType;
  start_date: string;
  end_date: string;
  ownership_percentage: string;
  ownership_scope: string;
  notes: string;
};

const inputClass = 'w-full h-[36px] rounded-[8px] border border-[#e4e2de] bg-white px-[9px] text-[12px] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412]';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[9px] font-semibold uppercase tracking-[.07em] text-[#77736d]">{label}</span>{children}</label>;
}

function defaultRelationship(contactType: ContactType | null): RelationshipType {
  if (contactType === 'property_owner' || contactType === 'former_owner' || contactType === 'company') return 'owner';
  if (contactType === 'tenant' || contactType === 'former_tenant') return 'tenant';
  if (contactType === 'applicant' || contactType === 'prospect') return 'applicant';
  if (contactType === 'vendor') return 'vendor';
  if (contactType === 'contractor') return 'contractor';
  return 'other';
}

function sectionCopy(contactType: ContactType | null) {
  if (contactType === 'property_owner' || contactType === 'former_owner') return ['Ownership and properties', 'Record each property or unit, the owner’s share, and the relevant dates. Owner shares for each property or unit must total 100%.'];
  if (contactType === 'tenant' || contactType === 'former_tenant') return ['Tenancies and units', 'Link this tenant to a property or unit and record the tenancy dates.'];
  if (contactType === 'applicant' || contactType === 'prospect') return ['Property interests', 'Track the properties or units this applicant or prospect is interested in.'];
  if (contactType === 'vendor') return ['Vendor coverage', 'Link properties where this vendor works and choose the services they provide below.'];
  if (contactType === 'contractor') return ['Contractor coverage', 'Link properties where this contractor works and choose the services they provide below.'];
  if (contactType === 'company') return ['Company property relationships', 'Link owned, managed, leased, or serviced properties to this company.'];
  return ['Property relationships', 'Link this contact to properties or units and describe the relationship.'];
}

export default function ContactPropertyLinksEditor({
  contactType,
  properties,
  units,
  links,
  onChange,
  loadError,
}: {
  contactType: ContactType | null;
  properties: Property[];
  units: Unit[];
  links: ContactPropertyLinkDraft[];
  onChange: (links: ContactPropertyLinkDraft[]) => void;
  loadError: string | null;
}) {
  const [title, description] = sectionCopy(contactType);
  const relationDefault = defaultRelationship(contactType);
  const updateLink = (clientKey: string, patch: Partial<ContactPropertyLinkDraft>) => {
    onChange(links.map((link) => link.clientKey === clientKey ? { ...link, ...patch } : link));
  };

  return <section className="sm:col-span-2 rounded-[11px] border border-[#e9e2d8] bg-[#faf8f4] p-4">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[12px] font-semibold text-[#35322e]">{title}</p><p className="mt-1 max-w-[620px] text-[10px] leading-4 text-[#89847c]">{description}</p></div>
      <button type="button" disabled={Boolean(loadError)} onClick={() => onChange([...links, { id: null, clientKey: `new-${Date.now()}-${links.length}`, property_id: '', unit_id: '', relationship_type: relationDefault, start_date: '', end_date: '', ownership_percentage: '', ownership_scope: '', notes: '' }])} className="flex h-8 shrink-0 items-center gap-1 rounded-[8px] border border-[#e4e2de] bg-white px-2.5 text-[10px] font-semibold text-[#625e57] hover:bg-[#f4f2ef] disabled:opacity-40"><Plus size={12} />Add link</button>
    </div>
    {loadError && <p className="mt-3 rounded-[8px] border border-[#f1dfb8] bg-[#fffaf0] px-3 py-2 text-[10px] text-[#8d671b]">Property links could not be loaded or edited. Refresh after fixing the database query: {loadError}</p>}
    {links.length ? <div className="mt-3 space-y-3">{links.map((link) => <div key={link.clientKey} className="rounded-[10px] border border-[#e9e6e1] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Property"><FlowPointSelect disabled={Boolean(loadError)} value={link.property_id} onChange={(property_id) => updateLink(link.clientKey, { property_id, unit_id: '' })} placeholder="Select property" options={properties.map((property) => ({ value: property.id, label: property.name, secondary: [property.city, property.address_line1].filter(Boolean).join(' · ') }))} emptyLabel="Add a property first" /></Field>
          <Field label="Unit (optional)"><FlowPointSelect disabled={Boolean(loadError) || !link.property_id} value={link.unit_id} onChange={(unit_id) => updateLink(link.clientKey, { unit_id })} placeholder="Whole property" options={units.filter((unit) => unit.property_id === link.property_id).map((unit) => ({ value: unit.id, label: unit.unit_number }))} emptyLabel="No units for this property" /></Field>
          <Field label="Relationship type"><FlowPointSelect disabled={Boolean(loadError)} value={link.relationship_type} onChange={(value) => updateLink(link.clientKey, { relationship_type: value as RelationshipType })} placeholder="Select relationship" options={RELATIONSHIP_TYPES.map((item) => ({ ...item }))} /></Field>
          {(link.relationship_type === 'owner' || link.relationship_type === 'tenant' || link.relationship_type === 'applicant') && <div className="grid grid-cols-2 gap-2">
            <Field label={link.relationship_type === 'applicant' ? 'Interest date' : 'Start date'}><input disabled={Boolean(loadError)} type="date" className={inputClass} value={link.start_date} onChange={(event) => updateLink(link.clientKey, { start_date: event.target.value })} /></Field>
            <Field label={link.relationship_type === 'applicant' ? 'Follow-up / end date' : 'End date'}><input disabled={Boolean(loadError)} type="date" className={inputClass} value={link.end_date} onChange={(event) => updateLink(link.clientKey, { end_date: event.target.value })} /></Field>
          </div>}
          {link.relationship_type === 'owner' && <Field label="Ownership share (%)"><input disabled={Boolean(loadError)} type="number" min="0.01" max="100" step="0.01" className={inputClass} value={link.ownership_percentage} onChange={(event) => updateLink(link.clientKey, { ownership_percentage: event.target.value })} placeholder="e.g. 70" /></Field>}
          {link.relationship_type === 'owner' && <Field label="Ownership scope (optional)"><input disabled={Boolean(loadError)} className={inputClass} value={link.ownership_scope} onChange={(event) => updateLink(link.clientKey, { ownership_scope: event.target.value })} placeholder="Units, use, or share details" /></Field>}
          <div className="sm:col-span-2"><Field label="Notes (optional)"><input disabled={Boolean(loadError)} className={inputClass} value={link.notes} onChange={(event) => updateLink(link.clientKey, { notes: event.target.value })} placeholder="Relevant context about this link" /></Field></div>
        </div>
        <button type="button" disabled={Boolean(loadError)} aria-label="Remove property relationship" onClick={() => onChange(links.filter((item) => item.clientKey !== link.clientKey))} className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-[#f0c8c3] text-[#a33a30] hover:bg-[#fff7f6] disabled:opacity-40"><Trash2 size={12} /></button>
      </div>
    </div>)}</div> : <p className="mt-3 rounded-[9px] border border-dashed border-[#d9d5ce] px-3 py-4 text-center text-[10px] text-[#97928a]">No property or unit links yet. Add one above when this contact is connected to a property.</p>}
  </section>;
}
