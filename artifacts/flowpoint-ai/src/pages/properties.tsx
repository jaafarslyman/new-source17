import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, Building2, Check, Filter, Loader2, MapPin, Plus, RefreshCw,
  Search, Trash2, Users, X, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import FlowPointSelect from '@/components/FlowPointSelect';
import PageFilterMenu from '@/components/PageFilterMenu';
import PropertyProfileModal from '@/components/PropertyProfileModal';
import PropertyUnitManager, { type UnitSavePayload } from '@/components/PropertyUnitManager';
import PropertySetupForm, {
  type PropertyOwnerDraft,
  type PropertyRenterDraft,
} from '@/components/properties/PropertySetupForm';
import { supabase } from '@/lib/supabase';
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  propertyAddress,
  propertyCategoryLabel,
  propertyStatusLabel,
  propertyTypeLabel,
  MIXED_USE_SPACE_MAPPING_SCOPE,
  supportsPropertyRental,
  validateUnitOwnershipMap,
  type Property,
  type PropertyDraft,
} from '@/lib/propertiesTypes';
import type { Contact, ContactPropertyRelationship } from '@/lib/contactsTypes';
import type { Unit } from '@/lib/unitsTypes';

type ContactDraft = Pick<PropertyOwnerDraft, 'source' | 'contact_id' | 'name' | 'email' | 'phone'> & {
  entity_type?: 'individual' | 'company';
};

const ownerRelationshipSelect = 'id, company_id, contact_id, property_id, unit_id, relationship_type, start_date, end_date, notes, ownership_percentage, ownership_scope';

function blankRenter(): PropertyRenterDraft {
  return {
    source: 'new',
    contact_id: '',
    name: '',
    email: '',
    phone: '',
    monthly_rent: '',
    lease_term_type: 'fixed',
    lease_start_date: '',
    lease_end_date: '',
  };
}

function ownerDraftsFor(property: Property | null, contacts: Contact[], relationships: ContactPropertyRelationship[]): PropertyOwnerDraft[] {
  if (!property) return [];
  return relationships
    .filter((item) => item.property_id === property.id && item.relationship_type === 'owner' && !item.unit_id)
    .map((item) => {
      const contact = contacts.find((candidate) => String(candidate.id) === String(item.contact_id));
      return {
        id: item.id,
        source: 'existing' as const,
        contact_id: String(item.contact_id),
        entity_type: contact?.contact_type === 'company' ? 'company' as const : 'individual' as const,
        name: contact?.name ?? '',
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
        ownership_percentage: item.ownership_percentage == null ? '' : String(item.ownership_percentage),
        ownership_scope: item.ownership_scope ?? '',
      };
    });
}

function renterDraftFor(property: Property | null, contacts: Contact[], relationships: ContactPropertyRelationship[]): PropertyRenterDraft | null {
  if (!property?.is_rented) return null;
  const relationship = relationships.find((item) => item.property_id === property.id && !item.unit_id && item.relationship_type === 'tenant');
  const contact = contacts.find((candidate) => String(candidate.id) === String(relationship?.contact_id));
  return {
    ...blankRenter(),
    source: relationship ? 'existing' : 'new',
    contact_id: relationship ? String(relationship.contact_id) : '',
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    monthly_rent: property.monthly_rent == null ? '' : String(property.monthly_rent),
    lease_term_type: property.lease_term_type ?? 'fixed',
    lease_start_date: property.lease_start_date ?? relationship?.start_date ?? '',
    lease_end_date: property.lease_end_date ?? relationship?.end_date ?? '',
  };
}

function contactFitsOwnerKind(contact: Contact, entityType: 'individual' | 'company') {
  return entityType === 'company' ? contact.contact_type === 'company' : contact.contact_type !== 'company';
}

function validOwnershipShare(value: string) {
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value.trim())) return false;
  const share = Number(value);
  return Number.isFinite(share) && share > 0 && share <= 100;
}

function validateMixedUseOwnership(ownerDrafts: PropertyOwnerDraft[], inlineUnits: UnitSavePayload[]) {
  if (!ownerDrafts.length) return 'Add at least one owner.';
  const mappedBySpace = ownerDrafts.some((owner) => owner.ownership_scope === MIXED_USE_SPACE_MAPPING_SCOPE);
  if (mappedBySpace) {
    if (ownerDrafts.length < 2 || ownerDrafts.some((owner) => owner.ownership_scope !== MIXED_USE_SPACE_MAPPING_SCOPE)) {
      return 'Choose one ownership method for all mixed-use property owners.';
    }
    const propertyOwnerReferences = new Set(ownerDrafts.map((owner, index) => owner.source === 'new'
      ? String(owner.temp_contact_id ?? -(index + 1))
      : String(owner.contact_id)));
    for (const space of inlineUnits) {
      const spaceOwnerReferences = space.owners.map((owner, index) => owner.source === 'new'
        ? String(owner.temp_contact_id ?? -(index + 1))
        : String(owner.contact_id));
      if (!spaceOwnerReferences.length || spaceOwnerReferences.some((reference) => !propertyOwnerReferences.has(reference))) {
        return 'Assign current property owners to every space.';
      }
      if (new Set(spaceOwnerReferences).size !== spaceOwnerReferences.length) {
        return 'Each owner can only be assigned once to a space.';
      }
      if (space.owners.length > 1) {
        const shares = space.owners.map((owner) => owner.ownership_percentage);
        if (shares.some((share) => !validOwnershipShare(share))) {
          return 'Enter a valid share for every owner of a shared space.';
        }
        const total = shares.reduce((sum, share) => sum + Number(share), 0);
        if (Math.abs(total - 100) > 0.001) return 'Ownership shares for each shared space must total 100%.';
      }
    }
    return null;
  }
  if (ownerDrafts.some((owner) => !validOwnershipShare(owner.ownership_percentage))) {
    return 'Enter a valid ownership percentage for every owner.';
  }
  const total = ownerDrafts.reduce((sum, owner) => sum + Number(owner.ownership_percentage), 0);
  return Math.abs(total - 100) > 0.001 ? `Ownership percentages must total 100% (currently ${Number(total.toFixed(2))}%).` : null;
}

function StatusPill({ status }: { status: string | null }) {
  const tone = status === 'active'
    ? 'border-[#d6ecd9] bg-[#edf7ef] text-[#327443]'
    : status === 'inactive'
      ? 'border-[#f1dfb8] bg-[#fff7e6] text-[#a36810]'
      : 'border-[#e1dfda] bg-[#f1f0ee] text-[#77736d]';
  return <span data-testid={`status-property-${status ?? 'unknown'}`} className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold` + ' ' + tone}>{propertyStatusLabel(status)}</span>;
}

function PropertyCard({
  property,
  units,
  contacts,
  relationships,
  onOpen,
  onUnitSave,
  onUnitDelete,
}: {
  property: Property;
  units: Unit[];
  contacts: Contact[];
  relationships: ContactPropertyRelationship[];
  onOpen: () => void;
  onUnitSave: (payload: UnitSavePayload, existingUnit: Unit | null) => Promise<void>;
  onUnitDelete: (unit: Unit) => Promise<void>;
}) {
  const propertyUnits = units.filter((unit) => unit.property_id === property.id);
  const mixedUse = property.property_type === 'mixed_use_development';
  const propertyLevelRental = supportsPropertyRental(property.property_type);
  const rented = propertyLevelRental
    ? Number(Boolean(property.is_rented))
    : propertyUnits.filter((unit) => unit.status === 'occupied').length;
  const notRented = propertyLevelRental
    ? Number(!property.is_rented)
    : propertyUnits.filter((unit) => unit.status === 'vacant').length;
  const ownerCount = new Set(relationships
    .filter((item) => item.property_id === property.id && item.relationship_type === 'owner')
    .map((item) => String(item.contact_id))).size;

  return <motion.article layout initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} data-testid={`card-property-${property.id}`} className="rounded-[13px] border border-[#e9e6e1] bg-white p-4 transition-all hover:border-[#d2cec7] hover:shadow-[0_6px_22px_rgba(31,28,23,.06)]">
    <div className="flex items-start justify-between gap-3">
      <button type="button" data-testid={`button-open-property-${property.id}`} onClick={onOpen} className="group flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eef1eb] text-[#657d6b]"><Building2 size={17} strokeWidth={1.7} /></span>
        <span className="min-w-0"><span data-testid={`text-property-name-${property.id}`} className="block truncate text-[13px] font-semibold text-[#171512]">{property.name}</span><span className="mt-1 flex items-center gap-1 truncate text-[10px] text-[#97928a]"><MapPin size={10} />{propertyAddress(property) || 'Address unavailable'}</span></span>
        <ChevronRight size={14} className="mt-1 shrink-0 text-[#bbb6ae] transition-transform group-hover:translate-x-0.5" />
      </button>
      <button type="button" data-testid={`button-manage-property-${property.id}`} onClick={onOpen} className="rounded-[8px] border border-[#e4e2de] px-2 py-1 text-[9px] font-semibold text-[#625e57] hover:bg-[#f5f3f0]">Manage</button>
    </div>
    <div className="mt-3 border-t border-[#f0eeeb] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[10px] font-medium text-[#6e6a62]">{propertyCategoryLabel(property.property_category)}</span><span className="h-1 w-1 rounded-full bg-[#d2cec7]" /><span className="text-[10px] text-[#77736d]">{propertyTypeLabel(property.property_type)}</span></div><StatusPill status={property.status} /></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        <div><p className="text-[#aaa59d]">{mixedUse ? 'Spaces' : 'Units'}</p><p className="mt-0.5 font-semibold text-[#625e57]">{propertyLevelRental ? 1 : mixedUse ? propertyUnits.length : property.units_count ?? '—'}</p></div>
        <div><p className="text-[#aaa59d]">{propertyLevelRental ? 'Rented' : 'Rented units'}</p><p className="mt-0.5 font-semibold text-[#625e57]">{rented}</p></div>
        <div><p className="text-[#aaa59d]">Owners</p><p className="mt-0.5 flex items-center gap-1 font-semibold text-[#625e57]"><Users size={10} />{ownerCount}</p></div>
      </div>
      {notRented > 0 && <p data-testid={`text-property-not-rented-${property.id}`} className="mt-2 text-[9px] text-[#939087]">{notRented} not rented</p>}
      <PropertyUnitManager property={property} units={units} contacts={contacts} relationships={relationships} onSave={onUnitSave} onDelete={onUnitDelete} />
    </div>
  </motion.article>;
}

function ConfirmDelete({ name, deleting, onCancel, onConfirm }: { name: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
    <button type="button" aria-label="Close delete confirmation" data-testid="button-cancel-delete-backdrop" onClick={deleting ? undefined : onCancel} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" />
    <motion.div role="dialog" aria-modal="true" initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative w-full max-w-[380px] rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] p-6 text-center shadow-[0_24px_80px_rgba(25,22,18,.18)]">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#f0cbc6] bg-[#fff3f1] text-[#b33d32]"><Trash2 size={17} /></div>
      <h2 className="mt-4 text-[15px] font-semibold text-[#24211e]">Delete {name}?</h2>
      <p className="mt-1 text-[11px] leading-[1.6] text-[#8f8980]">This removes the property and its units and contact links. Related requests remain, but their property link is cleared.</p>
      <div className="mt-5 flex gap-2"><button data-testid="button-cancel-delete-property" type="button" onClick={onCancel} disabled={deleting} className="h-9 flex-1 rounded-[9px] border border-[#e4e2de] text-[11px] font-medium text-[#625e57] hover:bg-[#f0eeea] disabled:opacity-50">Cancel</button><button data-testid="button-confirm-delete-property" type="button" onClick={onConfirm} disabled={deleting} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#b33d32] text-[11px] font-semibold text-white hover:bg-[#96342b] disabled:opacity-50">{deleting && <Loader2 size={12} className="animate-spin" />}Delete property</button></div>
    </motion.div>
  </div>;
}

export default function PropertiesPage() {
  useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [relationships, setRelationships] = useState<ContactPropertyRelationship[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formProperty, setFormProperty] = useState<Property | null | undefined>(undefined);
  const [profileProperty, setProfileProperty] = useState<Property | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const loadProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [propertyResult, contactResult, relationshipResult, unitResult] = await Promise.all([
      supabase.from('properties').select('*').order('name', { ascending: true }),
      supabase.from('contacts').select('*').order('name', { ascending: true }),
      supabase.from('contact_property_relationships').select(ownerRelationshipSelect),
      supabase.from('units').select('*').order('unit_number', { ascending: true }),
    ]);
    const criticalError = propertyResult.error ?? unitResult.error ?? relationshipResult.error ?? contactResult.error;
    if (criticalError) setError(criticalError.message);
    else {
      setProperties((propertyResult.data as Property[]) ?? []);
      setContacts((contactResult.data as Contact[]) ?? []);
      setRelationships((relationshipResult.data as ContactPropertyRelationship[]) ?? []);
      setUnits((unitResult.data as Unit[]) ?? []);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void loadProperties(); }, [loadProperties]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return properties.filter((property) => {
      const searchable = [property.name, property.address_line1, property.address_line2, property.city, property.state, property.postal_code].filter(Boolean).join(' ').toLowerCase();
      return (!needle || searchable.includes(needle))
        && (!typeFilter || property.property_type === typeFilter)
        && (!statusFilter || property.status === statusFilter);
    });
  }, [properties, search, typeFilter, statusFilter]);

  const formOwners = useMemo(() => ownerDraftsFor(formProperty ?? null, contacts, relationships), [formProperty, contacts, relationships]);
  const formRenter = useMemo(() => renterDraftFor(formProperty ?? null, contacts, relationships), [formProperty, contacts, relationships]);

  const resolveContact = async (
    selection: ContactDraft,
    role: 'owner' | 'tenant',
    resolvedContacts: Contact[],
  ): Promise<Contact> => {
    if (selection.source === 'existing') {
      const contact = resolvedContacts.find((item) => String(item.id) === selection.contact_id);
      if (!contact) throw new Error('The selected contact is no longer available.');
      if (role === 'owner' && selection.entity_type && !contactFitsOwnerKind(contact, selection.entity_type)) {
        throw new Error(`Choose a ${selection.entity_type} contact for this owner.`);
      }
      return contact;
    }
    const name = selection.name.trim();
    const email = selection.email.trim();
    const phone = selection.phone.trim();
    const normalizedName = name.toLowerCase();
    const normalizedEmail = email.toLowerCase();
    const normalizedPhone = phone.replace(/\D/g, '');
    const sameName = resolvedContacts.filter((item) => item.name.trim().toLowerCase() === normalizedName);
    const existing = sameName.find((item) => (
      (normalizedEmail && item.email?.trim().toLowerCase() === normalizedEmail)
      || (normalizedPhone && item.phone?.replace(/\D/g, '') === normalizedPhone)
    )) ?? (sameName.length === 1 ? sameName[0] : undefined);
    if (existing && (role !== 'owner' || !selection.entity_type || contactFitsOwnerKind(existing, selection.entity_type))) return existing;
    const { data, error: insertError } = await supabase.from('contacts').insert([{
      name,
      email: email || null,
      phone: phone || null,
      contact_type: role === 'tenant' ? 'tenant' : selection.entity_type === 'company' ? 'company' : 'property_owner',
      status: 'active',
      preferred_channel: email ? 'email' : 'phone',
    }]).select().single();
    if (insertError) throw new Error(`Unable to add ${role === 'tenant' ? 'renter' : 'owner'} contact: ${insertError.message}`);
    const created = data as Contact;
    resolvedContacts.push(created);
    return created;
  };

  const syncPropertyRelationships = async (
    propertyId: string,
    propertyType: string | null,
    ownerDrafts: PropertyOwnerDraft[],
    renterDraft: PropertyRenterDraft | null,
  ) => {
    const resolvedContacts = [...contacts];
    const relationshipRows: Array<Record<string, unknown>> = [];
    const ownerContactIds: string[] = [];
    for (const owner of ownerDrafts) {
      const contact = await resolveContact(owner, 'owner', resolvedContacts);
      ownerContactIds.push(String(contact.id));
      relationshipRows.push({
        contact_id: contact.id,
        property_id: propertyId,
        unit_id: null,
        relationship_type: 'owner',
        start_date: null,
        end_date: null,
        notes: null,
        ownership_percentage: owner.ownership_percentage ? Number(owner.ownership_percentage) : null,
        ownership_scope: owner.ownership_scope || null,
      });
    }
    if (supportsPropertyRental(propertyType) && renterDraft) {
      const contact = await resolveContact(renterDraft, 'tenant', resolvedContacts);
      relationshipRows.push({
        contact_id: contact.id,
        property_id: propertyId,
        unit_id: null,
        relationship_type: 'tenant',
        start_date: renterDraft.lease_start_date || null,
        end_date: renterDraft.lease_term_type === 'fixed' ? renterDraft.lease_end_date || null : null,
        notes: null,
        ownership_percentage: null,
        ownership_scope: null,
      });
    }
    const { error: deleteError } = await supabase.from('contact_property_relationships')
      .delete().eq('property_id', propertyId).is('unit_id', null).in('relationship_type', ['owner', 'tenant']);
    if (deleteError) throw new Error(`Unable to replace property contacts: ${deleteError.message}`);
    const { data, error: insertError } = relationshipRows.length
      ? await supabase.from('contact_property_relationships').insert(relationshipRows).select(ownerRelationshipSelect)
      : { data: [], error: null };
    if (insertError) throw new Error(`Unable to save property contacts: ${insertError.message}`);
    setContacts(resolvedContacts);
    setRelationships((current) => [
      ...current.filter((item) => !(item.property_id === propertyId && !item.unit_id && (item.relationship_type === 'owner' || item.relationship_type === 'tenant'))),
      ...((data as ContactPropertyRelationship[]) ?? []),
    ]);
    return { contacts: resolvedContacts, ownerContactIds };
  };

  const saveProperty = async (draft: PropertyDraft, ownerDrafts: PropertyOwnerDraft[], renterDraft: PropertyRenterDraft | null, inlineUnits: UnitSavePayload[]) => {
    const current = formProperty;
    const currentUnits = current ? units.filter((unit) => unit.property_id === current.id) : [];
    const isMappedUnitProperty = draft.property_type === 'multifamily_units' || draft.property_type === 'apartment_building';
    if (current && current.property_type !== draft.property_type && currentUnits.length > 0) {
      throw new Error('This property has units. Its type cannot be changed until those units are removed.');
    }
    if (isMappedUnitProperty) {
      const configuredUnitCount = Number(draft.units_count);
      const recordedUnitCount = currentUnits.length + inlineUnits.length;
      if (!Number.isInteger(configuredUnitCount) || configuredUnitCount < 2) {
        throw new Error('Multifamily and apartment properties must have at least two units.');
      }
      if (recordedUnitCount > configuredUnitCount) {
        throw new Error(`This property is configured for ${configuredUnitCount} units, but ${recordedUnitCount} are already recorded.`);
      }
      if (recordedUnitCount < configuredUnitCount && !draft.units_under_construction) {
        throw new Error(`Add all ${configuredUnitCount} units, or select “Other units are still under construction” to save with units missing.`);
      }
      const ownerReferences = ownerDrafts.map((owner, index) => owner.source === 'new'
        ? String(owner.temp_contact_id ?? -(index + 1))
        : String(owner.contact_id));
      const mapError = validateUnitOwnershipMap(draft.unit_ownership_map, configuredUnitCount, ownerReferences);
      if (mapError) throw new Error(mapError);
    }
    if (draft.property_type === 'mixed_use_development') {
      const ownershipError = validateMixedUseOwnership(ownerDrafts, inlineUnits);
      if (ownershipError) throw new Error(ownershipError);
    }
    const duplicateOwner = ownerDrafts.filter((owner) => owner.source === 'existing').some((owner, index, list) => list.findIndex((item) => item.contact_id === owner.contact_id) !== index);
    if (duplicateOwner) throw new Error('Each owner can only be added once.');

    const initialDraft: PropertyDraft = {
      ...draft,
      units_under_construction: !current && isMappedUnitProperty
        ? true
        : Boolean(draft.units_under_construction),
      unit_ownership_map: current ? current.unit_ownership_map ?? [] : [],
    };
    const saveResult = current
      ? await supabase.from('properties').update(initialDraft).eq('id', current.id).select().single()
      : await supabase.from('properties').insert([initialDraft]).select().single();
    if (saveResult.error) throw new Error(saveResult.error.message);
    let saved = saveResult.data as Property;
    try {
      const syncedContacts = await syncPropertyRelationships(saved.id, saved.property_type, ownerDrafts, renterDraft);
      const contactCache = syncedContacts.contacts;
      const syntheticOwnerIds = new Map<string, string>();
      const ownerContactRemap = new Map<string, string>();
      ownerDrafts.forEach((owner, index) => {
        const resolvedId = syncedContacts.ownerContactIds[index];
        if (!resolvedId) return;
        const originalId = owner.source === 'new'
          ? String(owner.temp_contact_id ?? -(index + 1))
          : String(owner.contact_id);
        ownerContactRemap.set(originalId, resolvedId);
        if (owner.source === 'new') syntheticOwnerIds.set(originalId, resolvedId);
      });
      const resolvedUnitOwnershipMap = (draft.unit_ownership_map ?? []).map((allocation) => ({
        ...allocation,
        contact_id: ownerContactRemap.get(String(allocation.contact_id)) ?? String(allocation.contact_id),
      }));
      const { data: updatedProperty, error: ownershipMapError } = await supabase.from('properties')
        .update({ unit_ownership_map: resolvedUnitOwnershipMap })
        .eq('id', saved.id)
        .select()
        .single();
      if (ownershipMapError) throw new Error(`Unable to save unit ownership mapping: ${ownershipMapError.message}`);
      saved = updatedProperty as Property;
      for (const payload of inlineUnits) {
        const resolvedPayload = {
          ...payload,
          owners: payload.owners.map((owner) => {
            const contactId = syntheticOwnerIds.get(owner.contact_id);
            return contactId ? { ...owner, source: 'existing' as const, contact_id: contactId } : owner;
          }),
          draft: { ...payload.draft, property_id: saved.id },
        };
        await saveUnit(resolvedPayload, null, contactCache, saved.property_type);
      }
      if (!current && isMappedUnitProperty) {
        const configuredUnitCount = Number(draft.units_count) || 0;
        const finalConstructionState = inlineUnits.length < configuredUnitCount && Boolean(draft.units_under_construction);
        const { data: finalizedProperty, error: constructionError } = await supabase.from('properties')
          .update({ units_under_construction: finalConstructionState })
          .eq('id', saved.id)
          .select()
          .single();
        if (constructionError) throw new Error(`Unable to finalize unit construction status: ${constructionError.message}`);
        saved = finalizedProperty as Property;
      }
    } catch (saveError) {
      if (!current) {
        await supabase.from('properties').delete().eq('id', saved.id);
        setUnits((items) => items.filter((unit) => unit.property_id !== saved.id));
        setRelationships((items) => items.filter((relationship) => relationship.property_id !== saved.id));
      }
      throw saveError;
    }
    setProperties((items) => current
      ? items.map((item) => item.id === saved.id ? saved : item).sort((a, b) => a.name.localeCompare(b.name))
      : [...items, saved].sort((a, b) => a.name.localeCompare(b.name)));
    setProfileProperty((item) => item?.id === saved.id ? saved : item);
    setFeedback({ tone: 'success', message: current ? 'Property changes saved.' : 'Property added.' });
  };

  const saveUnit = async (payload: UnitSavePayload, existingUnit: Unit | null, contactCache?: Contact[], propertyTypeOverride?: string | null) => {
    const unitResult = existingUnit
      ? await supabase.from('units').update(payload.draft).eq('id', existingUnit.id).select().single()
      : await supabase.from('units').insert([payload.draft]).select().single();
    if (unitResult.error) throw new Error(unitResult.error.message);
    const savedUnit = unitResult.data as Unit;
    const unitPropertyType = propertyTypeOverride ?? properties.find((item) => item.id === savedUnit.property_id)?.property_type ?? null;
    const isMixedUseSpace = unitPropertyType === 'mixed_use_development';
    const isMappedUnitProperty = unitPropertyType === 'multifamily_units' || unitPropertyType === 'apartment_building';
    const resolvedContacts = contactCache ?? [...contacts];
    try {
      const rows: Array<Record<string, unknown>> = [];
      if (payload.owners.length > 0) {
        for (const owner of payload.owners) {
          const contact = await resolveContact(owner, 'owner', resolvedContacts);
          rows.push({
            contact_id: contact.id,
            property_id: savedUnit.property_id,
            unit_id: savedUnit.id,
            relationship_type: 'owner',
            start_date: null,
            end_date: null,
            notes: null,
            ownership_percentage: !owner.ownership_percentage.trim() ? null : Number(owner.ownership_percentage),
            ownership_scope: isMixedUseSpace ? 'Entire space' : owner.ownership_scope || null,
          });
        }
      }
      if (payload.renter) {
        const contact = await resolveContact(payload.renter, 'tenant', resolvedContacts);
        rows.push({
          contact_id: contact.id,
          property_id: savedUnit.property_id,
          unit_id: savedUnit.id,
          relationship_type: 'tenant',
          start_date: payload.renter.lease_start_date || null,
          end_date: payload.renter.lease_term_type === 'fixed' ? payload.renter.lease_end_date || null : null,
          notes: null,
          ownership_percentage: null,
          ownership_scope: null,
        });
      }
      const { error: clearError } = await supabase.from('contact_property_relationships').delete().eq('unit_id', savedUnit.id);
      if (clearError) throw new Error(`Unable to replace unit contacts: ${clearError.message}`);
      const { data, error: insertError } = rows.length
        ? await supabase.from('contact_property_relationships').insert(rows).select(ownerRelationshipSelect)
        : { data: [], error: null };
      if (insertError) throw new Error(`Unable to save unit contacts: ${insertError.message}`);
      const parentProperty = properties.find((item) => item.id === savedUnit.property_id);
      if (isMappedUnitProperty && parentProperty) {
        const unitsAfterSave = units.filter((item) => item.property_id === savedUnit.property_id && item.id !== savedUnit.id).length + 1;
        const stillBuildingUnits = unitsAfterSave < (parentProperty.units_count ?? 0);
        if (parentProperty.units_under_construction !== stillBuildingUnits) {
          const { error: constructionError } = await supabase.from('properties')
            .update({ units_under_construction: stillBuildingUnits })
            .eq('id', parentProperty.id);
          if (constructionError) throw new Error(`Unable to update construction status: ${constructionError.message}`);
          const updatedProperty = { ...parentProperty, units_under_construction: stillBuildingUnits };
          setProperties((current) => current.map((item) => item.id === updatedProperty.id ? updatedProperty : item));
          setProfileProperty((current) => current?.id === updatedProperty.id ? updatedProperty : current);
        }
      }
      setContacts([...resolvedContacts]);
      setUnits((current) => {
        const next = existingUnit ? current.map((item) => item.id === savedUnit.id ? savedUnit : item) : [...current, savedUnit];
        return next.sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }));
      });
      setRelationships((current) => [...current.filter((item) => item.unit_id !== savedUnit.id), ...((data as ContactPropertyRelationship[]) ?? [])]);
      setFeedback({ tone: 'success', message: existingUnit ? 'Unit changes saved.' : 'Unit added.' });
    } catch (error) {
      if (!existingUnit) await supabase.from('units').delete().eq('id', savedUnit.id);
      throw error;
    }
  };

  const deleteUnit = async (unit: Unit) => {
    const { error: deleteError } = await supabase.from('units').delete().eq('id', unit.id);
    if (deleteError) throw new Error(deleteError.message);
    const parentProperty = properties.find((item) => item.id === unit.property_id);
    const remainingUnits = units.filter((item) => item.property_id === unit.property_id && item.id !== unit.id).length;
    if (
      parentProperty
      && (parentProperty.property_type === 'multifamily_units' || parentProperty.property_type === 'apartment_building')
      && remainingUnits < (parentProperty.units_count ?? 0)
      && !parentProperty.units_under_construction
    ) {
      const { error: constructionError } = await supabase.from('properties')
        .update({ units_under_construction: true })
        .eq('id', parentProperty.id);
      if (constructionError) throw new Error(`Unit deleted, but construction status could not be updated: ${constructionError.message}`);
      const updatedProperty = { ...parentProperty, units_under_construction: true };
      setProperties((current) => current.map((item) => item.id === updatedProperty.id ? updatedProperty : item));
      setProfileProperty((current) => current?.id === updatedProperty.id ? updatedProperty : current);
    }
    setUnits((current) => current.filter((item) => item.id !== unit.id));
    setRelationships((current) => current.filter((item) => item.unit_id !== unit.id));
    setFeedback({ tone: 'success', message: 'Unit deleted.' });
  };

  const deleteProperty = async () => {
    if (!profileProperty) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('properties').delete().eq('id', profileProperty.id);
    if (deleteError) {
      setFeedback({ tone: 'error', message: deleteError.message });
      setDeleting(false);
      setDeleteOpen(false);
      return;
    }
    setProperties((current) => current.filter((property) => property.id !== profileProperty.id));
    setUnits((current) => current.filter((unit) => unit.property_id !== profileProperty.id));
    setRelationships((current) => current.filter((item) => item.property_id !== profileProperty.id));
    setProfileProperty(null);
    setDeleteOpen(false);
    setDeleting(false);
    setFeedback({ tone: 'success', message: 'Property deleted.' });
  };

  return <AppLayout>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f8f7f5]">
      <header className="flex shrink-0 items-center justify-between border-b border-[#e9e6e1] bg-[#fbfaf8] px-5 py-4 sm:px-8">
        <div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#82948a]">Operations</p><h1 data-testid="heading-properties" className="mt-1 text-[20px] font-semibold tracking-[-.025em] text-[#151412]">Properties</h1></div>
        <button type="button" data-testid="button-add-property" onClick={() => setFormProperty(null)} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#55776b] px-3.5 text-[11px] font-semibold text-white shadow-[0_2px_5px_rgba(0,0,0,.12)] hover:bg-[#456357]"><Plus size={13} />Add property</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8 sm:py-8">
          {feedback && <div data-testid={`feedback-properties-${feedback.tone}`} className={`mb-5 flex items-center justify-between rounded-[10px] border px-3 py-2.5 text-[11px] ${feedback.tone === 'success' ? 'border-[#d2ead7] bg-[#f2faf3] text-[#327443]' : 'border-[#f0c8c3] bg-[#fff7f6] text-[#a33a30]'}`}><span className="flex items-center gap-2">{feedback.tone === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}{feedback.message}</span><button type="button" data-testid="button-dismiss-properties-feedback" onClick={() => setFeedback(null)} aria-label="Dismiss message"><X size={13} /></button></div>}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] text-[#706c64]">A clear home for every place your team looks after.</p>
            <p className="text-[10px] text-[#a19c93]">{properties.length} {properties.length === 1 ? 'property' : 'properties'} in your portfolio</p>
          </div>
          <div className="rounded-[13px] border border-[#e9e6e1] bg-white p-3.5">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <Search size={12} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[#aaa59d]" />
                <input data-testid="input-property-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or address" className="h-[30px] w-full rounded-[8px] border border-[#e5e2dd] bg-[#faf9f7] pl-7 pr-7 text-[12px] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#cfcac2] focus:bg-white" />
                {search && <button type="button" data-testid="button-clear-property-search" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#aaa59d] hover:text-[#151412]"><X size={11} /></button>}
              </label>
              <PageFilterMenu testId="button-property-filters" activeCount={[typeFilter, statusFilter].filter(Boolean).length} onReset={() => { setTypeFilter(''); setStatusFilter(''); }}>
                <FlowPointSelect testId="select-property-type-filter" value={typeFilter} onChange={setTypeFilter} placeholder="All subtypes" options={PROPERTY_TYPES.map((type) => ({ value: type.value, label: type.label }))} />
                <FlowPointSelect testId="select-property-status-filter" value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" options={[...PROPERTY_STATUSES]} />
              </PageFilterMenu>
              <button type="button" onClick={() => void loadProperties()} disabled={loading} aria-label="Refresh properties" data-testid="button-refresh-properties" className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[#e5e2dd] bg-[#faf9f7] text-[#89847c] hover:border-[#cfcac2] hover:text-[#151412] disabled:opacity-50">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          {loading && <div data-testid="loading-properties" className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-[150px] animate-pulse rounded-[13px] border border-[#eeeae5] bg-[#f0eeeb]" />)}</div>}
          {!loading && error && <div data-testid="error-properties" className="mt-5 flex flex-col items-center justify-center rounded-[14px] border border-[#f0c8c3] bg-[#fff9f8] px-6 py-16 text-center"><AlertCircle size={23} className="text-[#b33d32]" /><p className="mt-3 text-[12px] font-semibold text-[#4d2c28]">Properties could not be loaded</p><p className="mt-1 max-w-[380px] text-[11px] text-[#9d716b]">{error}</p><button type="button" data-testid="button-retry-properties" onClick={() => void loadProperties()} className="mt-4 flex h-8 items-center gap-2 rounded-[8px] border border-[#e6c2bd] px-3 text-[11px] font-medium text-[#8e3a31] hover:bg-[#fff0ee]"><RefreshCw size={11} />Try again</button></div>}
          {!loading && !error && properties.length === 0 && <div data-testid="empty-properties" className="mt-5 flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#d9d5ce] bg-[#fbfaf8] px-6 py-20 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#eef1eb] text-[#657d6b]"><Building2 size={22} strokeWidth={1.5} /></span><p className="mt-4 text-[13px] font-semibold text-[#34312c]">No properties yet</p><p className="mt-1 max-w-[360px] text-[11px] leading-[1.6] text-[#97928a]">Add a property to give your operations team a shared source of truth.</p><button type="button" data-testid="button-empty-add-property" onClick={() => setFormProperty(null)} className="mt-5 flex h-9 items-center gap-2 rounded-[9px] bg-[#55776b] px-3.5 text-[11px] font-semibold text-white hover:bg-[#456357]"><Plus size={13} />Add property</button></div>}
          {!loading && !error && properties.length > 0 && filtered.length === 0 && <div data-testid="empty-filtered-properties" className="mt-5 rounded-[14px] border border-[#e9e6e1] bg-white px-6 py-16 text-center"><Filter size={19} className="mx-auto text-[#bbb6ae]" /><p className="mt-3 text-[12px] font-semibold text-[#4a4741]">No matching properties</p><p className="mt-1 text-[11px] text-[#99948b]">Try another search or clear the filters.</p><button type="button" data-testid="button-clear-property-filters" onClick={() => { setSearch(''); setTypeFilter(''); setStatusFilter(''); }} className="mt-4 text-[11px] font-semibold text-[#4a4741] underline underline-offset-2">Clear filters</button></div>}
          {!loading && !error && filtered.length > 0 && <div data-testid="list-properties" className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence mode="popLayout">{filtered.map((property) => <PropertyCard key={property.id} property={property} units={units} contacts={contacts} relationships={relationships} onOpen={() => setProfileProperty(property)} onUnitSave={saveUnit} onUnitDelete={deleteUnit} />)}</AnimatePresence></div>}
        </div>
      </div>
      <AnimatePresence>{formProperty !== undefined && <PropertySetupForm key={formProperty?.id ?? 'new'} property={formProperty} contacts={contacts} initialOwners={formOwners} initialRenter={formRenter} existingUnits={units} onSave={saveProperty} onClose={() => setFormProperty(undefined)} />}</AnimatePresence>
      {profileProperty && !deleteOpen && <PropertyProfileModal property={profileProperty} contacts={contacts} ownerships={relationships} units={units} onClose={() => setProfileProperty(null)} onEdit={() => { setFormProperty(profileProperty); setProfileProperty(null); }} onDelete={() => setDeleteOpen(true)} />}
      <AnimatePresence>{deleteOpen && profileProperty && <ConfirmDelete name={profileProperty.name} deleting={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={() => void deleteProperty()} />}</AnimatePresence>
    </div>
  </AppLayout>;
}
