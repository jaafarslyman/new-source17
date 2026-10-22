import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, DoorOpen, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import FlowPointSelect from '@/components/FlowPointSelect';
import { FacilityPicker } from '@/components/properties/FacilityPicker';
import {
  APARTMENT_BUILDING_FACILITIES,
  COMMERCIAL_FACILITIES,
  HOSPITALITY_FACILITIES,
  HOSPITALITY_SPACE_TYPES,
  HOME_FACILITIES,
  MIXED_USE_COMPONENTS,
  OFFICE_FACILITIES,
  RETAIL_UNIT_FACILITIES,
  RETAIL_UNIT_TYPES,
  WAREHOUSE_FACILITIES,
  MIXED_USE_SPACE_MAPPING_SCOPE,
  propertyTypeLabel,
  type Property,
} from '@/lib/propertiesTypes';
import {
  formatMoney,
  unitTypeLabel,
  type Unit,
  type UnitDraft,
} from '@/lib/unitsTypes';
import type { Contact, ContactPropertyRelationship } from '@/lib/contactsTypes';
import type { PropertyOwnerDraft, PropertyRenterDraft } from '@/components/properties/PropertySetupForm';

const inputClass = 'h-10 w-full rounded-[9px] border border-[#e4e2de] bg-white px-3 text-[12px] text-[#24211e] outline-none transition-colors placeholder:text-[#b3afa8] focus:border-[#587b70] focus:ring-2 focus:ring-[#587b70]/10 disabled:cursor-not-allowed disabled:bg-[#f5f3f0]';

export interface UnitSavePayload {
  draft: UnitDraft;
  owners: PropertyOwnerDraft[];
  renter: PropertyRenterDraft | null;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">{label}{required && <span className="ml-1 text-[#b24d40]">*</span>}</span>{children}</label>;
}

function FormError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-4 text-[#a33e34]"><AlertCircle size={11} className="mt-0.5 shrink-0" />{message}</p> : null;
}

function blankOwner(): PropertyOwnerDraft {
  return { source: 'new', contact_id: '', entity_type: 'individual', name: '', email: '', phone: '', ownership_percentage: '', ownership_scope: '' };
}

function blankRenter(): PropertyRenterDraft {
  return { source: 'new', contact_id: '', name: '', email: '', phone: '', monthly_rent: '', lease_term_type: 'fixed', lease_start_date: '', lease_end_date: '' };
}

function relationshipOwnerDraft(relationship: ContactPropertyRelationship, contact?: Contact): PropertyOwnerDraft {
  return {
    id: relationship.id,
    source: 'existing',
    contact_id: String(relationship.contact_id),
    entity_type: contact?.contact_type === 'company' ? 'company' : 'individual',
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    ownership_percentage: relationship.ownership_percentage == null ? '' : String(relationship.ownership_percentage),
    ownership_scope: relationship.ownership_scope ?? '',
  };
}

function groupedFacilityOptions(...groups: Array<{ label: string; options: readonly { value: string; label: string }[] }>) {
  const options = new Map<string, { value: string; label: string; group: string }>();
  groups.forEach(({ label, options: groupOptions }) => {
    groupOptions.forEach((option) => {
      if (!options.has(option.value)) options.set(option.value, { ...option, group: label });
    });
  });
  return Array.from(options.values());
}

function mixedUseUnitFacilities(unitType: string) {
  if (unitType === 'apartment') return groupedFacilityOptions(
    { label: 'Residential', options: HOME_FACILITIES },
    { label: 'Apartment building', options: APARTMENT_BUILDING_FACILITIES },
  );
  if (unitType === 'office') return groupedFacilityOptions(
    { label: 'Shared commercial', options: COMMERCIAL_FACILITIES },
    { label: 'Office', options: OFFICE_FACILITIES },
  );
  if (unitType === 'retail_store') return groupedFacilityOptions(
    { label: 'Shared commercial', options: COMMERCIAL_FACILITIES },
    { label: 'Retail', options: RETAIL_UNIT_FACILITIES },
  );
  if (unitType === 'restaurant_hospitality') return groupedFacilityOptions(
    { label: 'Shared commercial', options: COMMERCIAL_FACILITIES },
    { label: 'Hospitality', options: HOSPITALITY_FACILITIES },
  );
  if (unitType === 'warehouse') return groupedFacilityOptions(
    { label: 'Shared commercial', options: COMMERCIAL_FACILITIES },
    { label: 'Warehouse', options: WAREHOUSE_FACILITIES },
  );
  return groupedFacilityOptions({ label: 'Commercial', options: COMMERCIAL_FACILITIES });
}

function firstAvailableMixedUseSlot(property: Property, units: Unit[], exceptUnitId?: Unit['id']) {
  for (let floor = 0; floor < (property.floor_count ?? 0); floor += 1) {
    for (const component of MIXED_USE_COMPONENTS) {
      if (!property.mixed_use_components?.includes(component.value)) continue;
      const capacity = Number(property.mixed_use_floor_plan?.[floor]?.[component.value] ?? 0);
      const assigned = units.filter((item) =>
        item.id !== exceptUnitId && item.floor === floor && item.unit_type === component.value,
      ).length;
      if (assigned < capacity) return { floor, unitType: component.value };
    }
  }
  return null;
}

function firstAvailableFloorForMixedUseType(property: Property, units: Unit[], unitType: string, exceptUnitId?: Unit['id']) {
  for (let floor = 0; floor < (property.floor_count ?? 0); floor += 1) {
    const capacity = Number(property.mixed_use_floor_plan?.[floor]?.[unitType] ?? 0);
    const assigned = units.filter((item) =>
      item.id !== exceptUnitId && item.floor === floor && item.unit_type === unitType,
    ).length;
    if (assigned < capacity) return floor;
  }
  return null;
}

function firstAvailableApartmentFloor(property: Property, units: Unit[], exceptUnitId?: Unit['id']) {
  for (let floor = 0; floor < (property.floor_count ?? 0); floor += 1) {
    const capacity = Number(property.floor_unit_counts?.[floor] ?? 0);
    const assigned = units.filter((item) => item.id !== exceptUnitId && item.floor === floor).length;
    if (assigned < capacity) return floor;
  }
  return null;
}

function relationshipRenterDraft(relationship: ContactPropertyRelationship | undefined, contact?: Contact, unit?: Unit | null): PropertyRenterDraft {
  return {
    ...blankRenter(),
    source: relationship ? 'existing' : 'new',
    contact_id: relationship ? String(relationship.contact_id) : '',
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    monthly_rent: unit?.monthly_rent == null ? '' : String(unit.monthly_rent),
    lease_term_type: unit?.lease_term_type ?? 'fixed',
    lease_start_date: unit?.lease_start_date ?? relationship?.start_date ?? '',
    lease_end_date: unit?.lease_end_date ?? relationship?.end_date ?? '',
  };
}

function scopeIncludesUnit(scope: string | null | undefined, unitNumber: string) {
  const number = Number(unitNumber.trim());
  if (!scope || !Number.isInteger(number) || number < 0) return false;
  return scope.split(',').some((part) => {
    const token = part.trim();
    const range = token.match(/^(\d+)\s*(?:-|–|—|to)\s*(\d+)$/i);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      return number >= Math.min(start, end) && number <= Math.max(start, end);
    }
    return /^\d+$/.test(token) && Number(token) === number;
  });
}

function ContactEditor({
  row,
  index,
  kind,
  contacts,
  entityType,
  excludedContactIds = [],
  onChange,
}: {
  row: PropertyOwnerDraft | PropertyRenterDraft;
  index: number;
  kind: 'owner' | 'renter';
  contacts: Contact[];
  entityType?: PropertyOwnerDraft['entity_type'];
  excludedContactIds?: string[];
  onChange: (patch: Partial<PropertyOwnerDraft> | Partial<PropertyRenterDraft>) => void;
}) {
  const options = contacts.filter((contact) => {
    if (kind === 'owner') {
      if (excludedContactIds.includes(String(contact.id)) && String(contact.id) !== row.contact_id) return false;
      return entityType === 'company'
        ? contact.contact_type === 'company' || String(contact.id) === row.contact_id
        : contact.contact_type !== 'company' || String(contact.id) === row.contact_id;
    }
    return true;
  });
  return <div>
    <div className="mb-2 flex rounded-[8px] bg-[#f2f1ed] p-1" role="group" aria-label={`${kind} contact source`}>
      <button type="button" data-testid={`button-unit-${kind}-${index}-existing`} onClick={() => onChange({ source: 'existing', contact_id: '', name: '', email: '', phone: '' })} className={`flex-1 rounded-[6px] px-2 py-1.5 text-[10px] font-semibold ${row.source === 'existing' ? 'bg-white text-[#34332e] shadow-sm' : 'text-[#89867e]'}`}>Existing contact</button>
      <button type="button" data-testid={`button-unit-${kind}-${index}-new`} onClick={() => onChange({ source: 'new', contact_id: '', name: '', email: '', phone: '' })} className={`flex-1 rounded-[6px] px-2 py-1.5 text-[10px] font-semibold ${row.source === 'new' ? 'bg-white text-[#34332e] shadow-sm' : 'text-[#89867e]'}`}>New contact</button>
    </div>
    {row.source === 'existing' ? (
      <Field label={kind === 'owner' ? 'Owner' : 'Renter'} required>
        <FlowPointSelect
          testId={`select-unit-${kind}-${index}-contact`}
          value={row.contact_id}
          onChange={(value) => {
            const contact = contacts.find((item) => String(item.id) === value);
            onChange({ contact_id: value, name: contact?.name ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '' });
          }}
          placeholder={`Select ${kind}`}
          options={options.map((contact) => ({ value: String(contact.id), label: contact.name, secondary: contact.company_name ?? contact.email ?? contact.phone ?? undefined }))}
          emptyLabel="No matching contacts. Add a new contact instead."
        />
      </Field>
    ) : (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Name" required><input data-testid={`input-unit-${kind}-${index}-name`} className={inputClass} value={row.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Person or company" /></Field>
        <Field label="Email"><input data-testid={`input-unit-${kind}-${index}-email`} className={inputClass} type="email" value={row.email} onChange={(event) => onChange({ email: event.target.value })} placeholder="name@example.com" /></Field>
        <div className="sm:col-span-2"><Field label="Phone"><input data-testid={`input-unit-${kind}-${index}-phone`} className={inputClass} type="tel" value={row.phone} onChange={(event) => onChange({ phone: event.target.value })} placeholder="Phone number" /></Field></div>
      </div>
    )}
  </div>;
}

function UnitForm({
  property,
  unit,
  units,
  contacts,
  relationships,
  onSave,
  onClose,
}: {
  property: Property;
  unit: Unit | null;
  units: Unit[];
  contacts: Contact[];
  relationships: ContactPropertyRelationship[];
  onSave: (payload: UnitSavePayload, existingUnit: Unit | null) => Promise<void>;
  onClose: () => void;
}) {
  const apartmentBuilding = property.property_type === 'apartment_building';
  const multifamily = property.property_type === 'multifamily_units';
  const mixedUse = property.property_type === 'mixed_use_development';
  const unitMappedProperty = apartmentBuilding || multifamily;
  const hasUnitOwnership = unitMappedProperty || mixedUse;
  const existingUnitOwners = relationships.filter((item) => item.unit_id === unit?.id && item.relationship_type === 'owner');
  const propertyOwners = relationships.filter((item) => item.property_id === property.id && item.relationship_type === 'owner' && !item.unit_id);
  const mixedUseSpaceMapping = mixedUse && propertyOwners.length > 1
    && propertyOwners.some((owner) => owner.ownership_scope === MIXED_USE_SPACE_MAPPING_SCOPE);
  const nextMixedUseSlot = mixedUse ? firstAvailableMixedUseSlot(property, units, unit?.id) : null;
  const activeTenant = relationships.find((item) => item.unit_id === unit?.id && item.relationship_type === 'tenant');
  const initialUnitType = unit?.unit_type ?? (mixedUse ? nextMixedUseSlot?.unitType ?? property.mixed_use_components?.[0] ?? 'apartment' : apartmentBuilding ? 'apartment' : 'house');
  const initialFloor = unit?.floor ?? (mixedUse
    ? nextMixedUseSlot?.floor ?? null
    : apartmentBuilding ? firstAvailableApartmentFloor(property, units) : null);
  const ownerDraftFor = (relationship: ContactPropertyRelationship) => relationshipOwnerDraft(
    relationship,
    contacts.find((contact) => String(contact.id) === String(relationship.contact_id)),
  );
  const ownerDraftsForUnit = (unitNumber: string) => {
    const allocations = (property.unit_ownership_map ?? []).filter((allocation) =>
      String(allocation.unit_number) === String(unitNumber),
    );
    if (allocations.length) {
      return allocations.map((allocation) => {
        const relationship = propertyOwners.find((owner) => String(owner.contact_id) === String(allocation.contact_id));
        const contact = contacts.find((item) => String(item.id) === String(allocation.contact_id));
        return {
          ...(relationship ? ownerDraftFor(relationship) : blankOwner()),
          source: 'existing' as const,
          contact_id: String(allocation.contact_id),
          entity_type: contact?.contact_type === 'company' ? 'company' as const : 'individual' as const,
          name: contact?.name ?? String(relationship?.contact_id ?? ''),
          email: contact?.email ?? '',
          phone: contact?.phone ?? '',
          ownership_percentage: allocation.ownership_percentage == null ? '' : String(allocation.ownership_percentage),
          ownership_scope: allocation.ownership_percentage == null ? 'Entire unit' : '',
        };
      });
    }
    if (unitMappedProperty && propertyOwners.length === 1) {
      return [{ ...ownerDraftFor(propertyOwners[0]), ownership_percentage: '', ownership_scope: 'Entire unit' }];
    }
    if (apartmentBuilding) {
      const scoped = propertyOwners.filter((owner) => scopeIncludesUnit(owner.ownership_scope, unitNumber));
      if (scoped.length === 1) {
        return [{ ...ownerDraftFor(scoped[0]), ownership_percentage: '', ownership_scope: 'Entire unit' }];
      }
    }
    return [];
  };
  const [draft, setDraft] = useState<UnitDraft>(() => ({
    property_id: property.id,
    unit_number: unit?.unit_number ?? '',
    unit_type: initialUnitType,
    commercial_space_type: unit?.commercial_space_type ?? null,
    description: unit?.description ?? '',
     floor: initialFloor,
    floor_count: unit?.floor_count ?? null,
    room_count: unit?.room_count ?? null,
    bedrooms: unit?.bedrooms ?? null,
    bathrooms: unit?.bathrooms ?? null,
    square_footage: unit?.square_footage ?? null,
    monthly_rent: unit?.monthly_rent ?? null,
    security_deposit: unit?.security_deposit ?? null,
    rent_due_day: unit?.rent_due_day ?? 1,
    lease_start_date: unit?.lease_start_date ?? null,
    lease_end_date: unit?.lease_end_date ?? null,
    lease_term_type: unit?.lease_term_type ?? null,
    status: unit?.status ?? 'vacant',
    amenities: unit?.amenities ?? '',
    facilities: unit?.facilities ?? [],
    custom_facilities: unit?.custom_facilities ?? [],
    utilities_information: unit?.utilities_information ?? '',
    parking_information: unit?.parking_information ?? '',
    access_information: unit?.access_information ?? '',
    rules: unit?.rules ?? '',
    notes: unit?.notes ?? '',
  }));
  const [owners, setOwners] = useState<PropertyOwnerDraft[]>(() => {
    if (unitMappedProperty) {
      const mapped = ownerDraftsForUnit(unit?.unit_number ?? '');
      if (mapped.length) return mapped;
    }
    if (!hasUnitOwnership) return [];
    if (mixedUse && !mixedUseSpaceMapping && propertyOwners.length) return propertyOwners.map(ownerDraftFor);
    if (existingUnitOwners.length) return existingUnitOwners
      .filter((relationship) => !mixedUseSpaceMapping || propertyOwners.some((owner) => String(owner.contact_id) === String(relationship.contact_id)))
      .map((relationship) =>
        relationshipOwnerDraft(relationship, contacts.find((contact) => String(contact.id) === String(relationship.contact_id))),
      );
    if (mixedUse && mixedUseSpaceMapping && propertyOwners.length) return [];
    return [blankOwner()];
  });
  const [renter, setRenter] = useState<PropertyRenterDraft>(() => relationshipRenterDraft(activeTenant, contacts.find((contact) => String(contact.id) === String(activeTenant?.contact_id)), unit));
  const [rented, setRented] = useState(unit?.status === 'occupied');
  const [customFacility, setCustomFacility] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const inheritedOwner = useMemo(() => {
    if (!apartmentBuilding || (property.unit_ownership_map ?? []).some((allocation) => String(allocation.unit_number) === String(draft.unit_number))) return null;
    const matching = propertyOwners.length === 1
      ? propertyOwners
      : propertyOwners.filter((owner) => scopeIncludesUnit(owner.ownership_scope, draft.unit_number));
    return matching.length === 1 ? matching[0] : null;
  }, [apartmentBuilding, propertyOwners, property.unit_ownership_map, draft.unit_number]);
  const lockedUnitOwners = unitMappedProperty
    ? ownerDraftsForUnit(draft.unit_number)
    : mixedUse && !mixedUseSpaceMapping ? propertyOwners.map(ownerDraftFor) : [];
  const hasLockedUnitOwners = lockedUnitOwners.length > 0;
  const inheritedContact = contacts.find((contact) => String(contact.id) === String(inheritedOwner?.contact_id));
  const inheritedMixedUseOwner = mixedUse && propertyOwners.length === 1 ? propertyOwners[0] : null;
  const inheritedMixedUseContact = contacts.find((contact) => String(contact.id) === String(inheritedMixedUseOwner?.contact_id));
  const eligibleMixedUseOwners = propertyOwners;
  const eligibleMixedUseOwnerIds = new Set(eligibleMixedUseOwners.map((owner) => String(owner.contact_id)));
  const mixedUseOwnerOptions = propertyOwners;
  const occupiedTotal = units.filter((item) => item.id !== unit?.id).length;
  const duplicateUnit = units.some((item) => item.id !== unit?.id && item.unit_number.trim().toLocaleLowerCase() === draft.unit_number.trim().toLocaleLowerCase());
  const unitFacilityOptions = useMemo(() => {
    const options = mixedUse
      ? mixedUseUnitFacilities(draft.unit_type ?? '')
      : apartmentBuilding
        ? groupedFacilityOptions(
          { label: 'Residential', options: HOME_FACILITIES },
          { label: 'Apartment building', options: APARTMENT_BUILDING_FACILITIES },
        )
        : groupedFacilityOptions({ label: 'Home', options: HOME_FACILITIES });
    return options;
  }, [mixedUse, draft.unit_type, apartmentBuilding]);
  const mixedUseTypeOptions = MIXED_USE_COMPONENTS.filter((component) => {
    if (!property.mixed_use_components?.includes(component.value)) return false;
    if (unit?.unit_type === component.value) return true;
    return (property.mixed_use_floor_plan ?? []).some((floorPlan, floorIndex) => {
      const capacity = Number(floorPlan[component.value] ?? 0);
      const assigned = units.filter((item) =>
        item.id !== unit?.id && item.floor === floorIndex && item.unit_type === component.value,
      ).length;
      return assigned < capacity;
    });
  }).map((component) => ({ value: component.value, label: component.label }));

  const change = (key: keyof UnitDraft, value: string | number | null | string[]) => setDraft((current) => ({ ...current, [key]: value }));
  const changeUnitNumber = (value: string) => {
    change('unit_number', value);
    if (!unitMappedProperty) return;
    const mapped = ownerDraftsForUnit(value);
    if (mapped.length) setOwners(mapped);
    else if (!unit) setOwners([]);
  };
  const changeMixedUseType = (value: string) => {
    const nextFacilities = mixedUseUnitFacilities(value);
    const allowedFacilities = new Set<string>(nextFacilities.map((facility) => facility.value));
    setDraft((current) => ({
      ...current,
      unit_type: value,
      floor: firstAvailableFloorForMixedUseType(property, units, value, unit?.id),
      commercial_space_type: null,
      room_count: value === 'apartment' ? current.room_count : null,
      bedrooms: value === 'apartment' ? current.bedrooms : null,
      bathrooms: value === 'apartment' ? current.bathrooms : null,
      facilities: (current.facilities ?? []).filter((facility) => allowedFacilities.has(facility)),
    }));
    if (propertyOwners.length === 1) {
      setOwners([ownerDraftFor(propertyOwners[0])]);
    } else if (propertyOwners.length > 1 && !mixedUseSpaceMapping) {
      setOwners(propertyOwners.map(ownerDraftFor));
    }
  };
  const changeOwner = (index: number, patch: Partial<PropertyOwnerDraft>) => setOwners((current) => current.map((owner, i) => i === index ? { ...owner, ...patch } : owner));
  const toggleMixedUseOwner = (contactId: string, owner: ContactPropertyRelationship) => {
    setOwners((current) => {
      const selected = current.some((item) => item.contact_id === contactId);
      const next = selected
        ? current.filter((item) => item.contact_id !== contactId)
        : [...current, ownerDraftFor(owner)];
      return next.length <= 1
        ? next.map((item) => ({ ...item, ownership_percentage: '' }))
        : next;
    });
  };
  const changeRenter = (patch: Partial<PropertyRenterDraft>) => setRenter((current) => ({ ...current, ...patch }));
  const floorOptions = Array.from({ length: Math.max(0, property.floor_count ?? 0) }, (_, index) => {
    const assigned = units.filter((item) =>
      item.id !== unit?.id
      && item.floor === index
      && (!mixedUse || item.unit_type === draft.unit_type),
    ).length;
    const capacity = mixedUse
      ? Number(property.mixed_use_floor_plan?.[index]?.[draft.unit_type ?? ''] ?? 0)
      : Number(property.floor_unit_counts?.[index] ?? 0);
    const countLabel = mixedUse
      ? ` · ${assigned}/${capacity} planned`
      : property.floor_unit_counts?.[index] !== undefined ? ` · ${assigned}/${capacity} units` : '';
    return {
      value: String(index),
      label: `${index === 0 ? 'Ground floor (0)' : `Floor ${index}`}${countLabel}`,
    };
  });
  const floorCapacity = draft.floor === null
    ? 0
    : mixedUse
      ? Number(property.mixed_use_floor_plan?.[draft.floor]?.[draft.unit_type ?? ''] ?? 0)
      : property.floor_unit_counts?.[draft.floor] ?? 0;
  const unitsOnFloor = units.filter((item) =>
    item.id !== unit?.id
    && item.floor === draft.floor
    && (!mixedUse || item.unit_type === draft.unit_type),
  ).length;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.unit_number.trim()) next.unit_number = 'Unit name or number is required.';
    if (duplicateUnit) next.unit_number = 'A unit with this name already exists in the property.';
    if (unitMappedProperty && (!/^\d+$/.test(draft.unit_number.trim()) || Number(draft.unit_number) < 1 || Number(draft.unit_number) > (property.units_count ?? 0))) {
      next.unit_number = `Use a unit number from 1 to ${property.units_count ?? 0} so its mapped owner can be assigned.`;
    }
    if (!mixedUse && (!Number.isInteger(draft.room_count) || draft.room_count === null || draft.room_count < 1)) next.room_count = 'Enter a whole-number room count greater than 0.';
    if (multifamily && (!Number.isInteger(draft.floor_count) || draft.floor_count === null || draft.floor_count < 1)) next.floor_count = 'Enter a whole-number interior floor count greater than 0.';
    if (apartmentBuilding && (draft.floor === null || !Number.isInteger(draft.floor) || draft.floor < 0 || draft.floor >= (property.floor_count ?? 0))) next.floor = 'Choose a floor that exists in this building.';
    if (mixedUse && (!property.mixed_use_components?.includes(draft.unit_type ?? '') || !MIXED_USE_COMPONENTS.some((component) => component.value === draft.unit_type))) next.unit_type = 'Choose one of the uses selected for this property.';
    if (mixedUse && (draft.floor === null || !Number.isInteger(draft.floor) || draft.floor < 0 || draft.floor >= (property.floor_count ?? 0))) next.floor = 'Choose a floor within this property.';
    if (
      mixedUse
      && draft.floor !== null
      && draft.floor >= 0
      && draft.floor < (property.floor_count ?? 0)
      && draft.unit_type
      && property.mixed_use_components?.includes(draft.unit_type)
      && unitsOnFloor >= floorCapacity
    ) {
      next.floor = `No more ${unitTypeLabel(draft.unit_type).toLowerCase()} spaces fit on this floor; planned capacity is ${floorCapacity}.`;
    }
    if (mixedUse && draft.unit_type === 'apartment' && (!Number.isInteger(draft.room_count) || draft.room_count === null || draft.room_count < 1)) next.room_count = 'Enter a whole-number room count greater than 0.';
    if (mixedUse && ['retail_store', 'restaurant_hospitality'].includes(draft.unit_type ?? '') && !draft.commercial_space_type) next.commercial_space_type = 'Choose a space type.';
    if (!unit && !mixedUse && occupiedTotal >= (property.units_count ?? 0)) next.limit = 'This property already has its configured number of units.';
    if (apartmentBuilding && draft.floor !== null && unitsOnFloor >= floorCapacity) next.floor = `This floor already has its limit of ${floorCapacity} units. Choose another floor or update its planned capacity.`;
    if (hasUnitOwnership) {
      if (unitMappedProperty) {
        if (!hasLockedUnitOwners) next.owners = propertyOwners.length
          ? 'Map this unit to its property owner in the property setup form before adding or editing it.'
          : 'Add the property owner and map this unit in the property setup form first.';
      } else if (!owners.length) next.owners = 'Add at least one owner.';
      else if (mixedUse && mixedUseSpaceMapping && propertyOwners.length) {
        const allowedOwnerIds = new Set(eligibleMixedUseOwners.map((owner) => String(owner.contact_id)));
        if (owners.some((owner) => !owner.contact_id || !allowedOwnerIds.has(owner.contact_id))) {
          next.owners = 'Choose owners already assigned to this property.';
        }
        const distinctContacts = new Set(owners.map((owner) => owner.contact_id));
        if (distinctContacts.size !== owners.length) next.owners = 'Each owner can only be added once.';
        if (owners.length > 1) {
          const shares = owners.map((owner) => Number(owner.ownership_percentage));
          if (owners.some((owner) => !owner.ownership_percentage.trim() || !Number.isFinite(Number(owner.ownership_percentage)) || Number(owner.ownership_percentage) <= 0 || Number(owner.ownership_percentage) > 100)) {
            next.owners = 'Enter a valid share for every owner of this space.';
          } else if (Math.abs(shares.reduce((sum, share) => sum + share, 0) - 100) > 0.001) {
            next.owners = 'Shares for this space must total 100%.';
          }
        }
      } else {
        const distinctContacts = new Set<string>();
        owners.forEach((owner, index) => {
          if (owner.source === 'existing') {
            if (!owner.contact_id) next[`owner_${index}`] = 'Select an owner contact.';
            if (owner.contact_id && distinctContacts.has(owner.contact_id)) next[`owner_${index}`] = 'Each owner can only be added once.';
            if (owner.contact_id) distinctContacts.add(owner.contact_id);
          } else {
            if (!owner.name.trim()) next[`owner_${index}`] = 'Owner name is required.';
            if (!owner.email.trim() && !owner.phone.trim()) next[`owner_${index}`] = 'Add an email or phone number.';
            if (owner.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email.trim())) next[`owner_${index}`] = 'Enter a valid email.';
          }
          if (!mixedUse && !unitMappedProperty) {
            const share = Number(owner.ownership_percentage);
            if (!owner.ownership_percentage.trim() || !Number.isFinite(share) || share <= 0 || share > 100) next[`owner_${index}`] = 'Enter an ownership share greater than 0 and no more than 100.';
          }
        });
        if (!mixedUse && !unitMappedProperty && owners.length && owners.every((owner) => owner.ownership_percentage.trim() && Number.isFinite(Number(owner.ownership_percentage)) && Number(owner.ownership_percentage) > 0)) {
          const total = owners.reduce((sum, owner) => sum + Number(owner.ownership_percentage), 0);
          if (Math.abs(total - 100) > 0.001) next.owners = `Ownership shares must total 100% (currently ${total}%).`;
        }
      }
    }
    if (apartmentBuilding && !hasLockedUnitOwners) next.inherited_owner = propertyOwners.length > 1
      ? 'This unit number must match exactly one building owner’s unit scope.'
      : 'Add a building owner before adding apartment units.';
    if (rented) {
      if (renter.source === 'existing' && !renter.contact_id) next.renter = 'Select the renter contact.';
      if (renter.source === 'new' && !renter.name.trim()) next.renter = 'Renter name is required.';
      if (renter.source === 'new' && !renter.email.trim() && !renter.phone.trim()) next.renter = 'Add an email or phone number.';
      if (renter.source === 'new' && renter.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(renter.email.trim())) next.renter = 'Enter a valid email.';
      const amount = Number(renter.monthly_rent);
      if (!renter.monthly_rent.trim() || !Number.isFinite(amount) || amount <= 0) next.monthly_rent = 'Enter a monthly rent greater than $0.';
      if (!renter.lease_start_date) next.lease_start_date = 'Choose a lease start date.';
      if (renter.lease_term_type === 'fixed') {
        if (!renter.lease_end_date) next.lease_end_date = 'Choose a lease end date.';
        if (renter.lease_start_date && renter.lease_end_date && renter.lease_end_date < renter.lease_start_date) next.lease_end_date = 'End date must be on or after the start date.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    const rentedUnitDraft: UnitDraft = {
      ...draft,
      property_id: property.id,
      unit_number: draft.unit_number.trim(),
      unit_type: mixedUse ? draft.unit_type : apartmentBuilding ? 'apartment' : multifamily ? 'house' : draft.unit_type,
      commercial_space_type: mixedUse && ['retail_store', 'restaurant_hospitality'].includes(draft.unit_type ?? '') ? draft.commercial_space_type : null,
      floor: apartmentBuilding || mixedUse ? draft.floor : null,
      floor_count: multifamily ? Number(draft.floor_count) : null,
      room_count: mixedUse
        ? draft.unit_type === 'apartment' && draft.room_count !== null ? Number(draft.room_count) : null
        : Number(draft.room_count),
      bedrooms: mixedUse && draft.unit_type !== 'apartment' ? null : draft.bedrooms,
      bathrooms: mixedUse && draft.unit_type !== 'apartment' ? null : draft.bathrooms,
      facilities: (draft.facilities ?? []).filter((facility) => unitFacilityOptions.some((option) => option.value === facility)),
      custom_facilities: (draft.custom_facilities ?? []).filter(Boolean),
      status: rented ? 'occupied' : 'vacant',
      monthly_rent: rented ? Number(renter.monthly_rent) : null,
      lease_term_type: rented ? renter.lease_term_type : null,
      lease_start_date: rented ? renter.lease_start_date : null,
      lease_end_date: rented && renter.lease_term_type === 'fixed' ? renter.lease_end_date : null,
      security_deposit: null,
      rent_due_day: 1,
    };
    const ownerRows = hasUnitOwnership ? owners.map((owner) => ({
      ...owner,
      name: owner.name.trim(),
      email: owner.email.trim(),
      phone: owner.phone.trim(),
       ownership_percentage: owner.ownership_percentage.trim(),
      ownership_scope: mixedUse ? 'Entire space' : unitMappedProperty ? owner.ownership_scope || (owners.length === 1 ? 'Entire unit' : '') : '',
    })) : [];
    const renterRow = rented ? {
      ...renter,
      name: renter.name.trim(),
      email: renter.email.trim(),
      phone: renter.phone.trim(),
      monthly_rent: renter.monthly_rent.trim(),
    } : null;
    try {
      await onSave({ draft: rentedUnitDraft, owners: ownerRows, renter: renterRow }, unit);
      onClose();
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Unable to save this unit.' });
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5">
    <motion.button type="button" aria-label="Close unit form" data-testid="button-unit-form-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={saving ? undefined : onClose} className="absolute inset-0 cursor-default bg-[#171a17]/35 backdrop-blur-[3px]" />
    <motion.section role="dialog" aria-modal="true" aria-labelledby="unit-form-title" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative flex max-h-[94dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-[16px] border border-[#e6e3dd] bg-[#fbfaf8] shadow-[0_28px_90px_rgba(29,31,27,.2)]">
      <header className="flex shrink-0 items-start justify-between border-b border-[#e9e6e0] px-5 py-4 sm:px-7">
        <div><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#82948a]">{propertyTypeLabel(property.property_type)}</p><h2 id="unit-form-title" data-testid="text-unit-form-title" className="mt-1 text-[16px] font-semibold text-[#282722]">{unit ? 'Edit unit' : 'Add a unit'} · {property.name}</h2><p className="mt-1 text-[11px] text-[#8d8981]">Unit details, ownership, and rental information.</p></div>
        <button type="button" data-testid="button-close-unit-form" onClick={onClose} disabled={saving} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e2dc] text-[#817d75] hover:bg-[#f0eeea] disabled:opacity-50"><X size={14} /></button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label={mixedUse ? 'Space name or identifier' : 'Unit name or number'} required><input autoFocus data-testid="input-unit-name" className={inputClass} value={draft.unit_number} onChange={(event) => changeUnitNumber(event.target.value)} placeholder={mixedUse ? 'e.g. Suite 12 or West warehouse' : unitMappedProperty ? `1 to ${property.units_count ?? 'total units'}` : 'e.g. 1 or 2A'} /></Field><FormError message={errors.unit_number} /></div>
          {mixedUse && <Field label="Space type" required><FlowPointSelect testId="select-mixed-use-unit-type" value={draft.unit_type ?? ''} onChange={changeMixedUseType} placeholder="Choose a use with planned spaces" options={mixedUseTypeOptions} /><FormError message={errors.unit_type} /></Field>}
          {mixedUse && (draft.unit_type === 'retail_store' || draft.unit_type === 'restaurant_hospitality') && <Field label={draft.unit_type === 'retail_store' ? 'Retail store type' : 'Hospitality space type'} required><FlowPointSelect testId="select-mixed-use-commercial-space-type" value={draft.commercial_space_type ?? ''} onChange={(value) => change('commercial_space_type', value)} placeholder="Choose a space type" options={draft.unit_type === 'retail_store' ? [...RETAIL_UNIT_TYPES] : [...HOSPITALITY_SPACE_TYPES]} /><FormError message={errors.commercial_space_type} /></Field>}
          {(!mixedUse || draft.unit_type === 'apartment') && <Field label="Rooms" required><input data-testid="input-unit-room-count" className={inputClass} type="number" min="1" step="1" value={draft.room_count ?? ''} onChange={(event) => change('room_count', event.target.value === '' ? null : Number(event.target.value))} placeholder="e.g. 4" /><FormError message={errors.room_count} /></Field>}
          {multifamily && <Field label="Interior floors" required><input data-testid="input-unit-floor-count" className={inputClass} type="number" min="1" step="1" value={draft.floor_count ?? ''} onChange={(event) => change('floor_count', event.target.value === '' ? null : Number(event.target.value))} placeholder="e.g. 2" /><FormError message={errors.floor_count} /></Field>}
          {(apartmentBuilding || mixedUse) && <Field label="Building floor" required><FlowPointSelect testId="select-unit-building-floor" value={draft.floor === null ? '' : String(draft.floor)} onChange={(value) => change('floor', value === '' ? null : Number(value))} placeholder="Choose a floor" options={floorOptions} /><FormError message={errors.floor} />{mixedUse && draft.floor !== null && <p data-testid="text-mixed-use-floor-capacity" className="mt-1 text-[9px] text-[#8d8981]">{unitsOnFloor} of {floorCapacity} planned {unitTypeLabel(draft.unit_type)} spaces already recorded on this floor.</p>}</Field>}
          {mixedUse && <Field label="Square footage"><input data-testid="input-unit-square-footage" className={inputClass} type="number" min="0" step="1" value={draft.square_footage ?? ''} onChange={(event) => change('square_footage', event.target.value === '' ? null : Number(event.target.value))} placeholder="Optional" /></Field>}
          {(!mixedUse || draft.unit_type === 'apartment') && <>
            <Field label="Bedrooms"><input data-testid="input-unit-bedrooms" className={inputClass} type="number" min="0" step="0.5" value={draft.bedrooms ?? ''} onChange={(event) => change('bedrooms', event.target.value === '' ? null : Number(event.target.value))} placeholder="Optional" /></Field>
            <Field label="Bathrooms"><input data-testid="input-unit-bathrooms" className={inputClass} type="number" min="0" step="0.5" value={draft.bathrooms ?? ''} onChange={(event) => change('bathrooms', event.target.value === '' ? null : Number(event.target.value))} placeholder="Optional" /></Field>
          </>}
        </section>

        <section className="border-t border-[#ebe8e2] pt-5" data-testid="section-unit-facilities">
          <div className="mb-3"><p className="text-[12px] font-semibold text-[#35332e]">Unit facilities</p><p className="mt-1 text-[10px] text-[#938f86]">Shared property facilities stay on the property. Select features specific to this unit.</p></div>
          <FacilityPicker options={unitFacilityOptions} value={draft.facilities ?? []} onChange={(value) => change('facilities', value)} testId="unit-facility-picker" />
          <div className="mt-3 flex gap-2"><input data-testid="input-unit-custom-facility" className={inputClass} value={customFacility} onChange={(event) => setCustomFacility(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const value = customFacility.trim(); if (value && !draft.custom_facilities?.includes(value)) change('custom_facilities', [...(draft.custom_facilities ?? []), value]); setCustomFacility(''); } }} placeholder="Add a unit-specific facility" /><button type="button" data-testid="button-add-unit-facility" onClick={() => { const value = customFacility.trim(); if (value && !draft.custom_facilities?.includes(value)) change('custom_facilities', [...(draft.custom_facilities ?? []), value]); setCustomFacility(''); }} disabled={!customFacility.trim()} className="flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] border border-[#dcd9d2] px-3 text-[10px] font-semibold text-[#66635b] hover:bg-[#f3f2ee] disabled:opacity-45"><Plus size={12} />Add</button></div>
          {(draft.custom_facilities ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{draft.custom_facilities?.map((facility) => <span key={facility} data-testid={`chip-unit-custom-facility-${facility}`} className="inline-flex items-center gap-1 rounded-full bg-[#eaf0e9] px-2.5 py-1 text-[10px] text-[#526d5b]">{facility}<button type="button" aria-label={`Remove ${facility}`} data-testid={`button-remove-unit-facility-${facility}`} onClick={() => change('custom_facilities', (draft.custom_facilities ?? []).filter((item) => item !== facility))}><X size={10} /></button></span>)}</div>}
        </section>

        <section className="border-t border-[#ebe8e2] pt-5" data-testid="section-unit-ownership">
          <div className="mb-3"><p className="text-[12px] font-semibold text-[#35332e]">Ownership</p><p className="mt-1 text-[10px] text-[#938f86]">{unitMappedProperty ? 'Owners are mapped on the property and are locked to this unit.' : mixedUse ? mixedUseSpaceMapping ? 'Assign any property owner to this space. If multiple owners share it, their percentages must total 100%.' : 'Property owners and their property-wide shares are inherited and locked for this space.' : 'Unit ownership shares must total 100%.'}</p></div>
          {hasLockedUnitOwners ? (
            <div data-testid="unit-inherited-owner" className="space-y-2 rounded-[10px] border border-[#dbe5dc] bg-[#f4f7f2] px-3.5 py-3">
              {lockedUnitOwners.map((owner, index) => (
                <div key={`${owner.contact_id}-${index}`} className="flex items-center gap-2">
                  <DoorOpen size={14} className="shrink-0 text-[#698373]" />
                  <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#3f4f43]">{owner.name || contacts.find((contact) => String(contact.id) === owner.contact_id)?.name || 'Property owner'}</p><p className="mt-0.5 text-[10px] text-[#89867e]">{owner.ownership_percentage.trim() ? `${owner.ownership_percentage}% of this unit` : 'Owns the entire unit'}</p></div>
                  <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-[.08em] text-[#869087]">Locked</span>
                </div>
              ))}
              <FormError message={errors.inherited_owner || errors.owners} />
            </div>
          ) : unitMappedProperty ? (
            <div data-testid="unit-owner-map-required" className="rounded-[10px] border border-[#efd2ce] bg-[#fff7f5] px-3.5 py-3 text-[10px] leading-4 text-[#8e3a31]">
              Map this unit to a property owner in the property setup form first. Unit owners are locked to the property’s ownership map.
              <FormError message={errors.owners || errors.inherited_owner} />
            </div>
          ) : mixedUse && propertyOwners.length === 1 ? (
            <div data-testid="unit-inherited-owner" className="rounded-[10px] border border-[#dbe5dc] bg-[#f4f7f2] px-3.5 py-3">
              <div className="flex items-center gap-2"><DoorOpen size={14} className="text-[#698373]" /><p className="text-[11px] font-semibold text-[#3f4f43]">{inheritedMixedUseContact?.name ?? 'Property owner'}</p><span className="ml-auto text-[9px] font-semibold uppercase tracking-[.08em] text-[#869087]">Inherited</span></div>
              <p className="mt-1 text-[10px] text-[#89867e]">This space is assigned to the sole property owner.</p>
            </div>
          ) : mixedUse && propertyOwners.length > 1 && mixedUseSpaceMapping ? (
            <div data-testid="mixed-use-space-owner-selection" className="space-y-2">
              {mixedUseOwnerOptions.map((relationship) => {
                const contact = contacts.find((item) => String(item.id) === String(relationship.contact_id));
                const checked = owners.some((owner) => owner.contact_id === String(relationship.contact_id));
                return <button key={String(relationship.contact_id)} type="button" data-testid={`checkbox-mixed-use-owner-${relationship.contact_id}`} role="checkbox" aria-checked={checked} onClick={() => toggleMixedUseOwner(String(relationship.contact_id), relationship)} className={`flex w-full items-start gap-2.5 rounded-[9px] border px-3 py-2.5 text-left ${checked ? 'border-[#b9cabe] bg-[#edf4ee]' : 'border-[#e7e4de] bg-white hover:bg-[#f8faf7]'}`}>
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${checked ? 'border-[#63816e] bg-[#63816e] text-white' : 'border-[#d5d2ca] bg-white'}`}>{checked && <Check size={10} />}</span>
                  <span className="min-w-0"><span className="block text-[11px] font-semibold text-[#45443d]">{contact?.name ?? 'Property owner'}</span><span className="mt-0.5 block text-[10px] text-[#89867e]">Available to own this individual space</span></span>
                </button>;
              })}
              {owners.length > 1 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {owners.map((owner, index) => {
                  const contact = contacts.find((item) => String(item.id) === owner.contact_id);
                  return <Field key={`${owner.contact_id}-${index}`} label={`${(contact?.name ?? owner.name) || `Owner ${index + 1}`} share (%)`} required>
                    <input data-testid={`input-mixed-use-space-owner-${index}-percentage`} className={inputClass} type="number" min="0.01" max="100" step="0.01" value={owner.ownership_percentage} onChange={(event) => changeOwner(index, { ownership_percentage: event.target.value })} placeholder="e.g. 50" />
                  </Field>;
                })}
              </div>}
              {owners.length > 1 && <p className="text-[10px] text-[#89867e]">Shares for this space must add up to 100%. A sole selected owner owns the whole space.</p>}
              <FormError message={errors.owners} />
            </div>
          ) : (
            <>
              <div className="space-y-3">{owners.map((owner, index) => {
                const otherOwnerContactIds = owners.flatMap((otherOwner, otherIndex) =>
                  otherIndex !== index && otherOwner.source === 'existing' && otherOwner.contact_id
                    ? [otherOwner.contact_id]
                    : [],
                );
                return <article key={owner.id ?? index} data-testid={`card-unit-owner-${index}`} className="rounded-[10px] border border-[#e7e4de] bg-white p-3">
                <div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold text-[#45443d]">Owner {index + 1}</p>{owners.length > 1 && <button type="button" data-testid={`button-remove-unit-owner-${index}`} aria-label={`Remove owner ${index + 1}`} onClick={() => setOwners((current) => current.filter((_, i) => i !== index))} className="flex h-6 w-6 items-center justify-center rounded-full text-[#938e85] hover:bg-[#fbefed] hover:text-[#a33e34]"><Trash2 size={12} /></button>}</div>
                <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr]">
                  <Field label="Owner type" required><FlowPointSelect testId={`select-unit-owner-${index}-type`} value={owner.entity_type} onChange={(value) => changeOwner(index, { entity_type: value as PropertyOwnerDraft['entity_type'], contact_id: '', source: 'existing' })} placeholder="Choose owner type" options={[{ value: 'individual', label: 'Individual' }, { value: 'company', label: 'Company' }]} /></Field>
                  {!mixedUse && <Field label="Share" required><div className="relative"><input data-testid={`input-unit-owner-${index}-percentage`} className={`${inputClass} pr-8`} type="number" min="0.01" max="100" step="0.01" value={owner.ownership_percentage} onChange={(event) => changeOwner(index, { ownership_percentage: event.target.value })} placeholder="e.g. 50" /><span className="absolute right-3 top-3 text-[10px] text-[#929087]">%</span></div></Field>}
                </div>
                <ContactEditor row={owner} index={index} kind="owner" contacts={contacts} entityType={owner.entity_type} excludedContactIds={otherOwnerContactIds} onChange={(patch) => changeOwner(index, patch as Partial<PropertyOwnerDraft>)} />
                <FormError message={errors[`owner_${index}`]} />
              </article>;
              })}</div>
              <button type="button" data-testid="button-add-unit-owner" onClick={() => setOwners((current) => [...current, blankOwner()])} className="mt-2 flex h-8 items-center gap-1.5 rounded-[8px] border border-dashed border-[#d8d5ce] px-3 text-[10px] font-semibold text-[#6f6b63] hover:bg-[#f3f6f1]"><Plus size={12} />Add another owner</button>
              {mixedUse && <p className="mt-2 text-[10px] text-[#89867e]">Each selected owner is recorded as an owner of the whole space.</p>}
              <FormError message={errors.owners} />
            </>
          )}
        </section>

        <section className="border-t border-[#ebe8e2] pt-5" data-testid="section-unit-rental">
          <div className="mb-3"><p className="text-[12px] font-semibold text-[#35332e]">Rental status</p><p className="mt-1 text-[10px] text-[#938f86]">A unit can have only one active renter.</p></div>
          <div className="grid grid-cols-2 gap-2">
            {[{ value: false, label: 'Not rented' }, { value: true, label: 'Rented' }].map((choice) => <button key={String(choice.value)} type="button" data-testid={`button-unit-rented-${choice.value ? 'yes' : 'no'}`} aria-pressed={rented === choice.value} onClick={() => setRented(choice.value)} className={`rounded-[9px] border p-2.5 text-left text-[11px] font-semibold ${rented === choice.value ? 'border-[#97ad9b] bg-[#eff4ee] text-[#455c4b]' : 'border-[#e7e4de] bg-white text-[#6f6b63]'}`}>{choice.label}</button>)}
          </div>
          {rented && <div className="mt-3 rounded-[10px] border border-[#e7e4de] bg-white p-3">
            <ContactEditor row={renter} index={0} kind="renter" contacts={contacts} onChange={(patch) => changeRenter(patch as Partial<PropertyRenterDraft>)} />
            <FormError message={errors.renter} />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Monthly rent (USD)" required><div className="relative"><span className="absolute left-3 top-3 text-[11px] text-[#89867e]">$</span><input data-testid="input-unit-monthly-rent" className={`${inputClass} pl-7`} type="number" min="0.01" step="0.01" value={renter.monthly_rent} onChange={(event) => changeRenter({ monthly_rent: event.target.value })} placeholder="2,450" /></div><FormError message={errors.monthly_rent} /></Field>
              <Field label="Contract duration" required><FlowPointSelect testId="select-unit-lease-term" value={renter.lease_term_type} onChange={(value) => changeRenter({ lease_term_type: value as PropertyRenterDraft['lease_term_type'] })} placeholder="Choose duration" options={[{ value: 'fixed', label: 'Fixed term' }, { value: 'until_termination', label: 'Until termination' }]} /></Field>
              <Field label="Lease start date" required><input data-testid="input-unit-lease-start" className={inputClass} type="date" value={renter.lease_start_date} onChange={(event) => changeRenter({ lease_start_date: event.target.value })} /><FormError message={errors.lease_start_date} /></Field>
              {renter.lease_term_type === 'fixed' && <Field label="Lease end date" required><input data-testid="input-unit-lease-end" className={inputClass} type="date" min={renter.lease_start_date || undefined} value={renter.lease_end_date} onChange={(event) => changeRenter({ lease_end_date: event.target.value })} /><FormError message={errors.lease_end_date} /></Field>}
            </div>
          </div>}
        </section>

        {(errors.limit || errors.form) && <div data-testid="error-unit-form" role="alert" className="flex items-start gap-2 rounded-[9px] border border-[#efd2ce] bg-[#fff7f5] px-3 py-2.5 text-[10px] leading-4 text-[#a33e34]"><AlertCircle size={12} className="mt-0.5 shrink-0" />{errors.form ?? errors.limit}</div>}
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-[#e9e6e0] bg-[#faf9f6] px-5 py-3.5 sm:px-7"><button type="button" data-testid="button-cancel-unit" onClick={onClose} disabled={saving} className="h-9 rounded-[9px] border border-[#e2dfd8] px-4 text-[10px] font-semibold text-[#66635c] hover:bg-[#f1efeb]">Cancel</button><button type="button" data-testid="button-save-unit" onClick={submit} disabled={saving} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#55776b] px-4 text-[10px] font-semibold text-white hover:bg-[#456357] disabled:opacity-55">{saving && <Loader2 size={12} className="animate-spin" />}{unit ? 'Save unit' : 'Add unit'}</button></footer>
    </motion.section>
  </div>;
}

function ConfirmUnitDelete({ unit, onCancel, onConfirm }: { unit: Unit; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this unit.');
      setDeleting(false);
    }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
    <button type="button" aria-label="Close delete confirmation" onClick={deleting ? undefined : onCancel} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" />
    <div role="dialog" aria-modal="true" className="relative w-full max-w-[360px] rounded-[14px] border border-[#e4e2de] bg-[#fbfaf8] p-5 shadow-[0_24px_80px_rgba(25,22,18,.18)]">
      <p className="text-[13px] font-semibold text-[#24211e]">Delete unit {unit.unit_number}?</p>
      <p className="mt-1 text-[11px] leading-5 text-[#8f8980]">Linked unit contacts will be removed. Requests will keep their records but lose this unit link.</p>
      <FormError message={error} />
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={deleting} className="h-8 rounded-[8px] border border-[#e4e2de] px-3 text-[10px] font-semibold text-[#625e57]">Cancel</button><button type="button" data-testid="button-confirm-delete-unit" onClick={remove} disabled={deleting} className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#b33d32] px-3 text-[10px] font-semibold text-white disabled:opacity-50">{deleting && <Loader2 size={11} className="animate-spin" />}Delete unit</button></div>
    </div>
  </div>;
}

export function UnitSetupModal({
  property,
  units,
  contacts,
  relationships,
  onSave,
  onClose,
}: {
  property: Property;
  units: Unit[];
  contacts: Contact[];
  relationships: ContactPropertyRelationship[];
  onSave: (payload: UnitSavePayload, existingUnit: Unit | null) => Promise<void>;
  onClose: () => void;
}) {
  return <UnitForm property={property} unit={null} units={units} contacts={contacts} relationships={relationships} onSave={onSave} onClose={onClose} />;
}

export default function PropertyUnitManager({
  property,
  units,
  contacts,
  relationships,
  onSave,
  onDelete,
}: {
  property: Property;
  units: Unit[];
  contacts: Contact[];
  relationships: ContactPropertyRelationship[];
  onSave: (payload: UnitSavePayload, existingUnit: Unit | null) => Promise<void>;
  onDelete: (unit: Unit) => Promise<void>;
}) {
  const supportsUnits = property.property_type === 'multifamily_units' || property.property_type === 'apartment_building' || property.property_type === 'mixed_use_development';
  const [formUnit, setFormUnit] = useState<Unit | null | undefined>(undefined);
  const [deleteUnit, setDeleteUnit] = useState<Unit | null>(null);
  const [feedback, setFeedback] = useState('');
  const propertyUnits = units.filter((unit) => unit.property_id === property.id);
  const mixedUseCapacity = (property.mixed_use_floor_plan ?? []).reduce(
    (total, floor) => total + Object.values(floor).reduce((floorTotal, count) => floorTotal + Number(count || 0), 0),
    0,
  );
  const mixedUse = property.property_type === 'mixed_use_development';
  const atCapacity = mixedUse
    ? propertyUnits.length >= mixedUseCapacity
    : property.units_count !== null && propertyUnits.length >= property.units_count;
  if (!supportsUnits) return null;

  const deleteSelectedUnit = async () => {
    if (!deleteUnit) return;
    try {
      await onDelete(deleteUnit);
      setDeleteUnit(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to delete the unit.');
      throw error;
    }
  };

  return <>
    <section data-testid={`property-units-${property.id}`} className="mt-4 border-t border-[#f0eeeb] pt-3">
      <div className="flex items-center justify-between gap-2">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">{mixedUse ? 'Spaces' : 'Units'}</p><p data-testid={`text-property-unit-count-${property.id}`} className="mt-1 text-[10px] text-[#9a958d]">{mixedUse ? `${propertyUnits.length} of ${mixedUseCapacity} planned spaces recorded` : `${propertyUnits.length} of ${property.units_count ?? 0} added`}</p></div>
        <button type="button" data-testid={`button-add-unit-${property.id}`} onClick={() => { setFeedback(''); setFormUnit(null); }} disabled={atCapacity} className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#55776b] px-3 text-[10px] font-semibold text-white hover:bg-[#456357] disabled:cursor-not-allowed disabled:bg-[#b9c4bb]"><Plus size={12} />{property.property_type === 'mixed_use_development' ? 'Add space' : 'Add unit'}</button>
      </div>
      {mixedUse && mixedUseCapacity === 0 && <p data-testid={`text-property-unit-capacity-${property.id}`} className="mt-2 text-[10px] text-[#8c887f]">Set a count for each selected use and floor before adding spaces.</p>}
      {atCapacity && mixedUseCapacity > 0 && <p data-testid={`text-property-unit-capacity-${property.id}`} className="mt-2 text-[10px] text-[#8c887f]">The configured unit capacity has been reached.</p>}
      {feedback && <p className="mt-2 text-[10px] text-[#a33e34]">{feedback}</p>}
      {propertyUnits.length === 0 ? <div className="mt-3 rounded-[9px] border border-dashed border-[#e4e1da] px-3 py-4 text-center text-[10px] text-[#99948b]">No units added yet.</div> : <div className="mt-3 space-y-2">
        {propertyUnits.map((unit) => {
          const tenant = relationships.find((item) => item.unit_id === unit.id && item.relationship_type === 'tenant');
          const tenantName = contacts.find((contact) => String(contact.id) === String(tenant?.contact_id))?.name;
          const facilitySummary = [...(unit.facilities ?? []), ...(unit.custom_facilities ?? [])].slice(0, 3).join(', ');
          const floorLabel = unit.floor === null ? null : unit.floor === 0 ? 'Ground floor' : `Floor ${unit.floor}`;
          const commercialSubtypeLabel = unit.commercial_space_type
            ? [...RETAIL_UNIT_TYPES, ...HOSPITALITY_SPACE_TYPES].find((option) => option.value === unit.commercial_space_type)?.label ?? unit.commercial_space_type
            : null;
          return <article key={unit.id} data-testid={`row-property-unit-${unit.id}`} className="flex items-center justify-between gap-3 rounded-[9px] border border-[#eeece7] bg-[#fdfdfc] px-3 py-2.5">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold text-[#37342f]">{unit.unit_number}</p>{property.property_type === 'mixed_use_development' && <span className="rounded-full bg-[#f1f0ec] px-2 py-0.5 text-[9px] font-medium text-[#77736d]">{unitTypeLabel(unit.unit_type)}</span>}{commercialSubtypeLabel && <span className="rounded-full bg-[#f6f4ef] px-2 py-0.5 text-[9px] font-medium text-[#77736d]">{commercialSubtypeLabel}</span>}<span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${unit.status === 'occupied' ? 'bg-[#edf7ef] text-[#327443]' : 'bg-[#eef5fb] text-[#39709c]'}`}>{unit.status === 'occupied' ? 'Rented' : 'Not rented'}</span>{floorLabel && <span className="text-[9px] text-[#8d8981]">{floorLabel}</span>}</div><p className="mt-1 truncate text-[9px] text-[#928d84]">{tenantName ? `Renter: ${tenantName}` : unit.room_count ? `${unit.room_count} rooms` : 'No renter'}{unit.monthly_rent ? ` · ${formatMoney(unit.monthly_rent)}/mo` : ''}{facilitySummary ? ` · ${facilitySummary}` : ''}</p></div>
            <div className="flex shrink-0 gap-1"><button type="button" aria-label={`Edit unit ${unit.unit_number}`} data-testid={`button-edit-unit-${unit.id}`} onClick={() => { setFeedback(''); setFormUnit(unit); }} className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[#e6e3dd] text-[#77736d] hover:bg-[#f2f0ec]"><Pencil size={11} /></button><button type="button" aria-label={`Delete unit ${unit.unit_number}`} data-testid={`button-delete-unit-${unit.id}`} onClick={() => setDeleteUnit(unit)} className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[#efd0cc] text-[#a33e34] hover:bg-[#fff2f0]"><Trash2 size={11} /></button></div>
          </article>;
        })}
      </div>}
    </section>
    <AnimatePresence>{formUnit !== undefined && <UnitForm key={formUnit?.id ?? 'new'} property={property} unit={formUnit} units={propertyUnits} contacts={contacts} relationships={relationships} onSave={(payload, existing) => onSave(payload, existing)} onClose={() => setFormUnit(undefined)} />}</AnimatePresence>
    {deleteUnit && <ConfirmUnitDelete unit={deleteUnit} onCancel={() => setDeleteUnit(null)} onConfirm={deleteSelectedUnit} />}
  </>;
}
