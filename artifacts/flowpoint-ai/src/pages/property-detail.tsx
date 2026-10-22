import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, Building2, Check, Loader2, MapPin, Pencil,
  RefreshCw, Trash2, Users, X,
} from 'lucide-react';
import { useLocation, useParams } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/lib/supabase';
import {
  HOSPITALITY_SPACE_TYPES,
  MIXED_USE_COMPONENTS,
  mixedUseOwnershipScopeLabel,
  propertyAddress,
  propertyCategoryLabel,
  propertyTypeLabel,
  RETAIL_CENTER_TYPES,
  mixedUseFloorPlanSummary,
  supportsPropertyRental,
  validateUnitOwnershipMap,
  type Property,
  type PropertyDraft,
} from '@/lib/propertiesTypes';
import PropertySetupForm, { type PropertyOwnerDraft, type PropertyRenterDraft } from '@/components/properties/PropertySetupForm';
import PropertyUnitManager, { type UnitSavePayload } from '@/components/PropertyUnitManager';
import { formatMoney, type Unit } from '@/lib/unitsTypes';
import type { Contact, ContactPropertyRelationship } from '@/lib/contactsTypes';

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return <div className="border-b border-[#f0eeeb] py-3 last:border-0"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#9b968d]">{label}</p><p data-testid={`value-property-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.5] text-[#37342f]">{value}</p></div>;
}

function facilityLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PropertySubtypeRows({ property }: { property: Property }) {
  if (property.property_type === 'office_building') {
    return <>
      <InfoRow label="Inside a building" value={property.office_in_building === null ? null : property.office_in_building ? 'Yes' : 'No'} />
      {property.office_in_building && <InfoRow label="Office floor" value={property.office_floor === 0 ? 'Ground floor' : property.office_floor} />}
    </>;
  }
  if (property.property_type === 'retail_center' || property.property_type === 'restaurant_hospitality') {
    const choices = property.property_type === 'retail_center' ? RETAIL_CENTER_TYPES : HOSPITALITY_SPACE_TYPES;
    const selectedType = choices.find((choice) => choice.value === property.commercial_space_type)?.label ?? property.commercial_space_type;
    return <InfoRow label={property.property_type === 'retail_center' ? 'Retail center type' : 'Hospitality space type'} value={selectedType} />;
  }
  if (property.property_type === 'mixed_use_development') {
    const uses = property.mixed_use_components
      ?.map((value) => MIXED_USE_COMPONENTS.find((component) => component.value === value)?.label ?? value)
      .join(', ');
    return <InfoRow label="Included uses" value={uses} />;
  }
  if (['warehouse', 'distribution_center', 'manufacturing_plant', 'research_development_facility'].includes(property.property_type ?? '')) {
    const locationRows = ['warehouse', 'distribution_center', 'research_development_facility'].includes(property.property_type ?? '');
    const location = property.industrial_in_building === null
      ? null
      : property.industrial_in_building ? 'Inside a building' : 'Standalone';
    return <>
      {locationRows && <InfoRow label="Industrial location" value={location} />}
      {locationRows && property.industrial_in_building && <InfoRow label="Industrial floor" value={property.industrial_floor === 0 ? 'Ground floor' : property.industrial_floor} />}
      {property.property_type === 'warehouse' && <InfoRow label="Goods stored" value={property.warehouse_goods?.join(', ')} />}
      {property.property_type === 'distribution_center' && <>
        <InfoRow label="Goods handled" value={property.distribution_goods?.join(', ')} />
        <InfoRow label="Distribution operations" value={property.distribution_services?.join(', ')} />
      </>}
      {property.property_type === 'manufacturing_plant' && <>
        <InfoRow label="Products manufactured" value={property.manufactured_products?.join(', ')} />
        <InfoRow label="Production inputs" value={property.production_inputs?.join(', ')} />
      </>}
      {property.property_type === 'research_development_facility' && <>
        <InfoRow label="Research focus" value={property.research_focus?.join(', ')} />
        <InfoRow label="Research inputs" value={property.research_inputs?.join(', ')} />
      </>}
    </>;
  }
  return null;
}

function OwnerSection({ property, contacts, ownerships }: { property: Property; contacts: Contact[]; ownerships: ContactPropertyRelationship[] }) {
  const linked = ownerships.filter((relationship) => relationship.property_id === property.id && !relationship.unit_id && relationship.relationship_type === 'owner');
  const mappedUnitProperty = property.property_type === 'multifamily_units' || property.property_type === 'apartment_building';
  return <section className="mt-4 rounded-[14px] border border-[#e9e6e1] bg-white p-5">
    <div className="mb-3 flex items-center justify-between">
      <div>
        <h2 className="text-[13px] font-semibold text-[#302d28]">Property owners</h2>
        <p className="mt-1 text-[11px] text-[#9a958d]">{mappedUnitProperty ? 'Ownership is mapped to units in this property.' : 'Contacts who own this property.'}</p>
      </div>
      <Users size={16} className="text-[#aaa59d]" />
    </div>
    {linked.length === 0
      ? <p className="rounded-[10px] border border-dashed border-[#d9d5ce] px-4 py-6 text-center text-[11px] text-[#97928a]">{mappedUnitProperty ? 'Add property owners and map them to units in property setup.' : 'No owners linked to this property.'}</p>
      : <div className="grid gap-2 sm:grid-cols-2">{linked.map((relationship) => {
        const contact = contacts.find((item) => String(item.id) === String(relationship.contact_id));
        const ownershipScope = relationship.ownership_scope
          ? property.property_type === 'mixed_use_development'
            ? mixedUseOwnershipScopeLabel(relationship.ownership_scope)
            : relationship.ownership_scope
          : null;
        const ownership = relationship.ownership_percentage !== null && relationship.ownership_percentage !== undefined
          ? `${relationship.ownership_percentage}% ownership${ownershipScope ? ` · ${ownershipScope}` : ''}`
          : ownershipScope || (mappedUnitProperty ? 'Mapped to units' : 'Sole property owner');
        return <div key={relationship.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-[#f0eeeb] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-[#35322e]">{contact?.name ?? 'Contact unavailable'}</p>
            <p className="mt-0.5 truncate text-[10px] text-[#9b968d]">{contact?.email ?? contact?.phone ?? 'No contact details'}</p>
          </div>
          <span className="max-w-[45%] text-right text-[10px] font-semibold text-[#625e57]">{ownership}</span>
        </div>;
      })}</div>}
  </section>;
}

function ConfirmDelete({ name, deleting, onCancel, onConfirm }: { name: string; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={deleting ? undefined : onCancel} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" /><motion.div initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} className="relative w-full max-w-[380px] rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] p-6 text-center shadow-[0_24px_80px_rgba(25,22,18,.18)]"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#f0cbc6] bg-[#fff3f1] text-[#b33d32]"><Trash2 size={17} /></div><h2 className="mt-4 text-[15px] font-semibold text-[#24211e]">Delete {name}?</h2><p className="mt-1 text-[12px] leading-[1.5] text-[#8f8980]">This property record will be permanently removed. This action cannot be undone.</p><div className="mt-5 flex gap-2"><button data-testid="button-cancel-delete-property" onClick={onCancel} disabled={deleting} className="h-9 flex-1 rounded-[9px] border border-[#e4e2de] text-[12px] font-medium text-[#625e57] hover:bg-[#f0eeea] disabled:opacity-50">Cancel</button><button data-testid="button-confirm-delete-property" onClick={onConfirm} disabled={deleting} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] bg-[#b33d32] text-[12px] font-semibold text-white hover:bg-[#96342b] disabled:opacity-50">{deleting && <Loader2 size={13} className="animate-spin" />}Delete property</button></div></motion.div></div>;
}

function ownerDraftsFor(property: Property | null, contacts: Contact[], relationships: ContactPropertyRelationship[]): PropertyOwnerDraft[] {
  if (!property) return [];
  return relationships
    .filter((row) => row.property_id === property.id && row.relationship_type === 'owner' && !row.unit_id)
    .map((row) => {
      const contact = contacts.find((item) => String(item.id) === String(row.contact_id));
      return {
        id: row.id,
        source: 'existing' as const,
        contact_id: String(row.contact_id),
        entity_type: contact?.contact_type === 'company' ? 'company' as const : 'individual' as const,
        name: contact?.name ?? '',
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
        ownership_percentage: row.ownership_percentage == null ? '' : String(row.ownership_percentage),
        ownership_scope: row.ownership_scope ?? '',
      };
    });
}

function renterDraftFor(property: Property | null, contacts: Contact[], relationships: ContactPropertyRelationship[]): PropertyRenterDraft | null {
  if (!property?.is_rented) return null;
  const row = relationships.find((item) => item.property_id === property.id && !item.unit_id && item.relationship_type === 'tenant');
  const contact = contacts.find((item) => String(item.id) === String(row?.contact_id));
  return {
    source: row ? 'existing' : 'new',
    contact_id: row ? String(row.contact_id) : '',
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    monthly_rent: property.monthly_rent == null ? '' : String(property.monthly_rent),
    lease_term_type: property.lease_term_type ?? 'fixed',
    lease_start_date: property.lease_start_date ?? row?.start_date ?? '',
    lease_end_date: property.lease_end_date ?? row?.end_date ?? '',
  };
}

export default function PropertyDetailPage() {
  useAuth();
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [property, setProperty] = useState<Property | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ownerships, setOwnerships] = useState<ContactPropertyRelationship[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const loadProperty = useCallback(async () => {
    if (!params.id) return;
    setLoading(true); setError(null);
    const [propertyResult, contactsResult, ownershipsResult, unitsResult] = await Promise.all([
      supabase.from('properties').select('*').eq('id', params.id).maybeSingle(),
      supabase.from('contacts').select('*').order('name', { ascending: true }),
      supabase.from('contact_property_relationships').select('id, company_id, contact_id, property_id, unit_id, relationship_type, start_date, end_date, notes, ownership_percentage, ownership_scope').eq('property_id', params.id),
      supabase.from('units').select('*').eq('property_id', params.id).order('unit_number', { ascending: true }),
    ]);
    const { data, error: loadError } = propertyResult;
    if (loadError || contactsResult.error || ownershipsResult.error || unitsResult.error) setError(loadError?.message ?? contactsResult.error?.message ?? ownershipsResult.error?.message ?? unitsResult.error?.message ?? 'Unable to load property records.');
    else if (!data) setError('This property could not be found.');
    else setProperty(data as Property);
    if (!contactsResult.error) setContacts((contactsResult.data as Contact[]) ?? []);
    if (!ownershipsResult.error) setOwnerships((ownershipsResult.data as ContactPropertyRelationship[]) ?? []);
    if (!unitsResult.error) setUnits((unitsResult.data as Unit[]) ?? []);
    setLoading(false);
  }, [params.id]);
  useEffect(() => { void loadProperty(); }, [loadProperty]);

  const initialOwners = useMemo(() => ownerDraftsFor(property, contacts, ownerships), [property, contacts, ownerships]);
  const initialRenter = useMemo(() => renterDraftFor(property, contacts, ownerships), [property, contacts, ownerships]);

  const resolveContact = async (
    selection: PropertyOwnerDraft | PropertyRenterDraft,
    role: 'owner' | 'tenant',
    resolvedContacts: Contact[],
  ) => {
    if (selection.source === 'existing') {
      const selected = resolvedContacts.find((item) => String(item.id) === selection.contact_id);
      if (!selected) throw new Error('The selected contact is no longer available.');
      if (role === 'owner' && 'entity_type' in selection) {
        const matches = selection.entity_type === 'company' ? selected.contact_type === 'company' : selected.contact_type !== 'company';
        if (!matches) throw new Error(`Choose a ${selection.entity_type} contact for this owner.`);
      }
      return selected;
    }
    const name = selection.name.trim();
    const email = selection.email.trim();
    const phone = selection.phone.trim();
    const sameName = resolvedContacts.filter((item) => item.name.trim().toLowerCase() === name.toLowerCase());
    let found = sameName.find((item) =>
      (email && item.email?.trim().toLowerCase() === email.toLowerCase())
      || (phone && item.phone?.replace(/\D/g, '') === phone.replace(/\D/g, '')),
    ) ?? (sameName.length === 1 ? sameName[0] : undefined);
    const entityType = 'entity_type' in selection ? selection.entity_type : 'individual';
    if (found && role === 'owner' && (entityType === 'company' ? found.contact_type !== 'company' : found.contact_type === 'company')) found = undefined;
    if (found) return found;
    const { data, error: insertError } = await supabase.from('contacts').insert([{
      name,
      email: email || null,
      phone: phone || null,
      contact_type: role === 'tenant' ? 'tenant' : entityType === 'company' ? 'company' : 'property_owner',
      status: 'active',
      preferred_channel: email ? 'email' : 'phone',
    }]).select().single();
    if (insertError) throw new Error(`Unable to add ${role === 'tenant' ? 'renter' : 'owner'} contact: ${insertError.message}`);
    const created = data as Contact;
    resolvedContacts.push(created);
    return created;
  };

  const updateProperty = async (draft: PropertyDraft, ownerDrafts: PropertyOwnerDraft[], renterDraft: PropertyRenterDraft | null) => {
    if (!property) return;
    const propertyUnits = units.filter((unit) => unit.property_id === property.id);
    const isMappedUnitProperty = draft.property_type === 'multifamily_units' || draft.property_type === 'apartment_building';
    if (property.property_type !== draft.property_type && propertyUnits.length) {
      throw new Error('This property has units. Its type cannot be changed until those units are removed.');
    }
    const duplicateOwner = ownerDrafts.filter((owner) => owner.source === 'existing')
      .some((owner, index, list) => list.findIndex((item) => item.contact_id === owner.contact_id) !== index);
    if (duplicateOwner) throw new Error('Each owner can only be added once.');
    if (isMappedUnitProperty) {
      const configuredUnitCount = Number(draft.units_count);
      if (!Number.isInteger(configuredUnitCount) || configuredUnitCount < 2) {
        throw new Error('Multifamily and apartment properties must have at least two units.');
      }
      if (propertyUnits.length > configuredUnitCount) {
        throw new Error(`This property is configured for ${configuredUnitCount} units, but ${propertyUnits.length} are already recorded.`);
      }
      if (propertyUnits.length < configuredUnitCount && !draft.units_under_construction) {
        throw new Error(`Add all ${configuredUnitCount} units, or select “Other units are still under construction” to save with units missing.`);
      }
      const ownerReferences = ownerDrafts.map((owner, index) => owner.source === 'new'
        ? String(owner.temp_contact_id ?? -(index + 1))
        : String(owner.contact_id));
      const mapError = validateUnitOwnershipMap(draft.unit_ownership_map, configuredUnitCount, ownerReferences);
      if (mapError) throw new Error(mapError);
    }
    const { error: updateError } = await supabase.from('properties').update(draft).eq('id', property.id).select().single();
    if (updateError) throw new Error(updateError.message);

    const resolvedContacts = [...contacts];
    const rows: Array<Record<string, unknown>> = [];
    const ownerContactIds: string[] = [];
    for (const owner of ownerDrafts) {
      const contact = await resolveContact(owner, 'owner', resolvedContacts);
      ownerContactIds.push(String(contact.id));
      rows.push({
        contact_id: contact.id,
        property_id: property.id,
        unit_id: null,
        relationship_type: 'owner',
        start_date: null,
        end_date: null,
        notes: null,
        ownership_percentage: owner.ownership_percentage ? Number(owner.ownership_percentage) : null,
        ownership_scope: owner.ownership_scope || null,
      });
    }
    if (supportsPropertyRental(draft.property_type) && renterDraft) {
      const contact = await resolveContact(renterDraft, 'tenant', resolvedContacts);
      rows.push({
        contact_id: contact.id,
        property_id: property.id,
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
      .delete().eq('property_id', property.id).is('unit_id', null).in('relationship_type', ['owner', 'tenant']);
    if (deleteError) throw new Error(`Unable to replace property contacts: ${deleteError.message}`);
    const { data: relationData, error: insertError } = rows.length
      ? await supabase.from('contact_property_relationships').insert(rows).select('id, company_id, contact_id, property_id, unit_id, relationship_type, start_date, end_date, notes, ownership_percentage, ownership_scope')
      : { data: [], error: null };
    if (insertError) throw new Error(`Unable to save property contacts: ${insertError.message}`);
    const ownerContactRemap = new Map<string, string>();
    ownerDrafts.forEach((owner, index) => {
      const originalId = owner.source === 'new'
        ? String(owner.temp_contact_id ?? -(index + 1))
        : String(owner.contact_id);
      const resolvedId = ownerContactIds[index];
      if (resolvedId) ownerContactRemap.set(originalId, resolvedId);
    });
    const resolvedUnitOwnershipMap = (draft.unit_ownership_map ?? []).map((allocation) => ({
      ...allocation,
      contact_id: ownerContactRemap.get(String(allocation.contact_id)) ?? String(allocation.contact_id),
    }));
    const { data: savedProperty, error: mapError } = await supabase.from('properties')
      .update({ unit_ownership_map: resolvedUnitOwnershipMap })
      .eq('id', property.id)
      .select()
      .single();
    if (mapError) throw new Error(`Unable to save unit ownership mapping: ${mapError.message}`);
    setContacts(resolvedContacts);
    setOwnerships((current) => [
      ...current.filter((item) => !(item.property_id === property.id && !item.unit_id && (item.relationship_type === 'owner' || item.relationship_type === 'tenant'))),
      ...((relationData as ContactPropertyRelationship[]) ?? []),
    ]);
    setProperty(savedProperty as Property);
    setFeedback({ tone: 'success', message: 'Property, ownership, and rental changes saved.' });
  };

  const saveUnit = async (payload: UnitSavePayload, existingUnit: Unit | null) => {
    if (!property) throw new Error('The property could not be loaded.');
    const isMappedUnitProperty = property.property_type === 'multifamily_units' || property.property_type === 'apartment_building';
    const isMixedUseSpace = property.property_type === 'mixed_use_development';
    const result = existingUnit
      ? await supabase.from('units').update(payload.draft).eq('id', existingUnit.id).select().single()
      : await supabase.from('units').insert([payload.draft]).select().single();
    if (result.error) throw new Error(result.error.message);
    const saved = result.data as Unit;
    const resolvedContacts = [...contacts];
    try {
      const rows: Array<Record<string, unknown>> = [];
      for (const owner of payload.owners) {
        const contact = await resolveContact(owner, 'owner', resolvedContacts);
        rows.push({
          contact_id: contact.id,
          property_id: saved.property_id,
          unit_id: saved.id,
          relationship_type: 'owner',
          start_date: null,
          end_date: null,
          notes: null,
          ownership_percentage: !owner.ownership_percentage.trim()
            ? null
            : Number(owner.ownership_percentage),
          ownership_scope: isMixedUseSpace ? 'Entire space' : owner.ownership_scope || null,
        });
      }
      if (payload.renter) {
        const contact = await resolveContact(payload.renter, 'tenant', resolvedContacts);
        rows.push({ contact_id: contact.id, property_id: saved.property_id, unit_id: saved.id, relationship_type: 'tenant', start_date: payload.renter.lease_start_date || null, end_date: payload.renter.lease_term_type === 'fixed' ? payload.renter.lease_end_date || null : null, notes: null, ownership_percentage: null, ownership_scope: null });
      }
      const { error: clearError } = await supabase.from('contact_property_relationships').delete().eq('unit_id', saved.id);
      if (clearError) throw new Error(`Unable to replace unit contacts: ${clearError.message}`);
      const { data, error: insertError } = rows.length
        ? await supabase.from('contact_property_relationships').insert(rows).select('id, company_id, contact_id, property_id, unit_id, relationship_type, start_date, end_date, notes, ownership_percentage, ownership_scope')
        : { data: [], error: null };
      if (insertError) throw new Error(`Unable to save unit contacts: ${insertError.message}`);
      if (isMappedUnitProperty) {
        const updatedUnitCount = units.filter((unit) => unit.property_id === saved.property_id && unit.id !== saved.id).length + 1;
        const stillUnderConstruction = updatedUnitCount < (property.units_count ?? 0);
        if (property.units_under_construction !== stillUnderConstruction) {
          const { data: updatedProperty, error: constructionError } = await supabase.from('properties')
            .update({ units_under_construction: stillUnderConstruction })
            .eq('id', property.id)
            .select()
            .single();
          if (constructionError) throw new Error(`Unable to update construction status: ${constructionError.message}`);
          setProperty(updatedProperty as Property);
        }
      }
      setContacts(resolvedContacts);
      setUnits((current) => existingUnit ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setOwnerships((current) => [...current.filter((item) => item.unit_id !== saved.id), ...((data as ContactPropertyRelationship[]) ?? [])]);
      setFeedback({ tone: 'success', message: existingUnit ? 'Unit changes saved.' : 'Unit added.' });
    } catch (error) {
      if (!existingUnit) await supabase.from('units').delete().eq('id', saved.id);
      throw error;
    }
  };

  const deleteUnit = async (unit: Unit) => {
    const { error: deleteError } = await supabase.from('units').delete().eq('id', unit.id);
    if (deleteError) throw new Error(deleteError.message);
    setUnits((current) => current.filter((item) => item.id !== unit.id));
    setOwnerships((current) => current.filter((item) => item.unit_id !== unit.id));
  };

  const deleteProperty = async () => {
    if (!property) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from('properties').delete().eq('id', property.id);
    if (deleteError) {
      setFeedback({ tone: 'error', message: deleteError.message });
      setDeleting(false); setDeleteOpen(false);
      return;
    }
    navigate('/properties');
  };

  const propertyUnits = units.filter((unit) => unit.property_id === property?.id);
  const isMixedUse = property?.property_type === 'mixed_use_development';
  const hasPlannedUnits = property?.property_type === 'multifamily_units' || property?.property_type === 'apartment_building' || isMixedUse;
  const totalUnits = isMixedUse
    ? (property?.mixed_use_floor_plan ?? []).reduce(
      (total, floor) => total + Object.values(floor).reduce((sum, value) => sum + Number(value || 0), 0),
      0,
    )
    : property?.units_count ?? null;
  const propertyRenter = ownerships.find((row) => row.property_id === property?.id && !row.unit_id && row.relationship_type === 'tenant');
  const propertyRenterName = contacts.find((contact) => String(contact.id) === String(propertyRenter?.contact_id))?.name;
  const selectedFacilities = [...new Set([...(property?.facilities ?? []), ...(property?.custom_facilities ?? [])])];

  return <AppLayout><div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f8f7f5]">
    <header className="flex flex-shrink-0 items-center justify-between border-b border-[#e9e6e1] bg-[#fbfaf8] px-5 py-3 sm:px-8"><button data-testid="button-back-to-properties" onClick={() => navigate('/properties')} className="flex items-center gap-2 text-[12px] font-medium text-[#77736d] hover:text-[#151412]"><ArrowLeft size={15} />Back to properties</button>{property && <div className="flex items-center gap-2"><button data-testid="button-edit-property" onClick={() => setEditOpen(true)} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e0ddd7] bg-white px-3 text-[11px] font-semibold text-[#4d4942] hover:bg-[#f2f0ec]"><Pencil size={12} />Edit</button><button data-testid="button-delete-property" onClick={() => setDeleteOpen(true)} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#efd0cc] bg-white px-3 text-[11px] font-semibold text-[#b33d32] hover:bg-[#fff2f0]"><Trash2 size={12} />Delete</button></div>}</header>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1120px] px-5 py-6 sm:px-8 sm:py-8">
      {feedback && <div data-testid={`feedback-property-detail-${feedback.tone}`} className={`mb-5 flex items-center justify-between rounded-[10px] border px-3 py-2.5 text-[12px] ${feedback.tone === 'success' ? 'border-[#d2ead7] bg-[#f2faf3] text-[#327443]' : 'border-[#f0c8c3] bg-[#fff7f6] text-[#a33a30]'}`}><span className="flex items-center gap-2">{feedback.tone === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}{feedback.message}</span><button data-testid="button-dismiss-property-feedback" onClick={() => setFeedback(null)}><X size={14} /></button></div>}
      {loading && <div data-testid="loading-property-detail" className="animate-pulse"><div className="h-8 w-64 rounded bg-[#eae7e2]" /><div className="mt-3 h-4 w-96 rounded bg-[#eeebe7]" /><div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><div className="h-[350px] rounded-[14px] bg-[#eeebe7]" /><div className="h-[350px] rounded-[14px] bg-[#eeebe7]" /></div></div>}
      {!loading && error && <div data-testid="error-property-detail" className="flex flex-col items-center justify-center rounded-[14px] border border-[#f0c8c3] bg-[#fff9f8] px-6 py-20 text-center"><AlertCircle size={24} className="text-[#b33d32]" /><p className="mt-3 text-[13px] font-semibold text-[#4d2c28]">Property could not be loaded</p><p className="mt-1 max-w-[380px] text-[12px] text-[#9d716b]">{error}</p><div className="mt-4 flex gap-2"><button data-testid="button-retry-property-detail" onClick={loadProperty} className="flex h-8 items-center gap-2 rounded-[8px] border border-[#e6c2bd] px-3 text-[12px] font-medium text-[#8e3a31] hover:bg-[#fff0ee]"><RefreshCw size={12} />Try again</button><button data-testid="button-return-properties-error" onClick={() => navigate('/properties')} className="h-8 rounded-[8px] bg-[#151412] px-3 text-[12px] font-medium text-white">Back to properties</button></div></div>}
       {!loading && !error && property && <><div className="mb-6"><div className="flex flex-wrap items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#eeebe5] text-[#706b62]"><Building2 size={18} strokeWidth={1.6} /></span><div><h1 data-testid="heading-property-detail" className="text-[21px] font-semibold tracking-[-.025em] text-[#151412]">{property.name}</h1><p data-testid="text-property-detail-address" className="mt-1 flex items-center gap-1.5 text-[12px] text-[#858078]"><MapPin size={12} />{propertyAddress(property) || 'Address unavailable'}</p></div></div></div>
           <section className="rounded-[14px] border border-[#e9e6e1] bg-white p-5">
             <div className="mb-3 flex items-center justify-between">
               <div><h2 className="text-[13px] font-semibold text-[#302d28]">Property overview</h2><p className="mt-1 text-[11px] text-[#9a958d]">Details entered for this property.</p></div>
               <Building2 size={16} className="text-[#aaa59d]" />
             </div>
             <div className="grid gap-x-7 sm:grid-cols-2">
               <InfoRow label="Category" value={propertyCategoryLabel(property.property_category)} />
               <InfoRow label="Property type" value={propertyTypeLabel(property.property_type)} />
               <PropertySubtypeRows property={property} />
               {isMixedUse && <InfoRow label="Mixed-use floor plan" value={mixedUseFloorPlanSummary(property.mixed_use_floor_plan, property.mixed_use_components)} />}
               {hasPlannedUnits && <InfoRow label={isMixedUse ? 'Planned spaces' : 'Planned units'} value={totalUnits} />}
               {property.units_under_construction && <InfoRow label="Construction status" value="Other units are still under construction" />}
               {hasPlannedUnits && <InfoRow label="Units recorded" value={propertyUnits.length} />}
               <InfoRow label="Building floors" value={property.floor_count} />
               <InfoRow label="Rooms" value={property.room_count} />
               <InfoRow label="Floor capacities" value={property.floor_unit_counts?.map((count, index) => `${index === 0 ? 'Ground floor' : `Floor ${index}`}: ${count}`).join(' · ')} />
               <InfoRow label="Address line 1" value={property.address_line1} />
               <InfoRow label="Address line 2" value={property.address_line2} />
               <InfoRow label="City" value={property.city} />
               <InfoRow label="State / region" value={property.state} />
               <InfoRow label="Postal code" value={property.postal_code} />
               <InfoRow label="Country" value={property.country} />
             </div>
           </section>
          <OwnerSection property={property} contacts={contacts} ownerships={ownerships} />
           {selectedFacilities.length > 0 && <section data-testid="section-property-facilities" className="mt-4 rounded-[14px] border border-[#e9e6e1] bg-white p-5">
             <div className="mb-4"><h2 className="text-[13px] font-semibold text-[#302d28]">Facilities & features</h2><p className="mt-1 text-[11px] text-[#9a958d]">Selected for this property.</p></div>
             <div className="flex flex-wrap gap-2">
               {selectedFacilities.map((facility) => {
                 const custom = (property.custom_facilities ?? []).includes(facility);
                 return <span key={facility} data-testid={`property-facility-${facility}`} className="inline-flex items-center gap-2 rounded-full border border-[#dce6dc] bg-[#f3f7f1] py-1.5 pl-2 pr-3 text-[10px] font-medium text-[#4d6a59]">
                   <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[.06em] text-[#7e8b7c]">{custom ? 'Custom' : 'Facility'}</span>
                   {facilityLabel(facility)}
                 </span>;
               })}
             </div>
           </section>}
           {supportsPropertyRental(property.property_type) && <section data-testid="section-property-rental-summary" className="mt-4 rounded-[14px] border border-[#e9e6e1] bg-white p-5">
             <div className="mb-3"><h2 className="text-[13px] font-semibold text-[#302d28]">Occupancy & lease</h2><p className="mt-1 text-[11px] text-[#9a958d]">Rental information entered for this property.</p></div>
             <div className="grid gap-x-7 sm:grid-cols-2">
               <InfoRow label="Rental status" value={property.is_rented === null ? null : property.is_rented ? 'Rented' : 'Not rented'} />
               <InfoRow label="Renter" value={property.is_rented ? propertyRenterName : null} />
               <InfoRow label="Monthly rent (USD)" value={property.is_rented ? formatMoney(property.monthly_rent) : null} />
               <InfoRow label="Lease duration" value={property.is_rented ? property.lease_term_type === 'until_termination' ? 'Until termination' : property.lease_term_type === 'fixed' ? 'Fixed term' : null : null} />
               <InfoRow label="Lease start" value={property.is_rented ? property.lease_start_date : null} />
               <InfoRow label="Lease end" value={property.is_rented && property.lease_term_type === 'fixed' ? property.lease_end_date : null} />
             </div>
           </section>}
          <PropertyUnitManager property={property} units={units} contacts={contacts} relationships={ownerships} onSave={saveUnit} onDelete={deleteUnit} />
      </>}
    </div></div>
    <AnimatePresence>{editOpen && property && <PropertySetupForm property={property} contacts={contacts} initialOwners={initialOwners} initialRenter={initialRenter} existingUnits={units} onSave={async (draft, owners, renter) => { await updateProperty(draft, owners, renter); setEditOpen(false); }} onClose={() => setEditOpen(false)} />}</AnimatePresence>
    <AnimatePresence>{deleteOpen && property && <ConfirmDelete name={property.name} deleting={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={deleteProperty} />}</AnimatePresence>
  </div></AppLayout>;
}