import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, Building2, Check, CheckCheck, ChevronRight, Loader2, Plus, Trash2, UserRound, X,
} from 'lucide-react';
import FlowPointSelect from '@/components/FlowPointSelect';
import { UnitSetupModal, type UnitSavePayload } from '@/components/PropertyUnitManager';
import { FacilityPicker } from '@/components/properties/FacilityPicker';
import {
  APARTMENT_BUILDING_FACILITIES,
  blankProperty,
  COMMERCIAL_FACILITIES,
  DISTRIBUTION_GOODS,
  DISTRIBUTION_SERVICES,
  DISTRIBUTION_CENTER_FACILITIES,
  HOSPITALITY_FACILITIES,
  HOSPITALITY_SPACE_TYPES,
  HOME_FACILITIES,
  INDUSTRIAL_SHARED_FACILITIES,
  MANUFACTURED_PRODUCT_SUGGESTIONS,
  MANUFACTURING_PLANT_FACILITIES,
  MIXED_USE_COMPONENTS,
  OFFICE_FACILITIES,
  PROPERTY_CATEGORIES,
  PROPERTY_TYPES_BY_CATEGORY,
  PRODUCTION_INPUT_SUGGESTIONS,
  RESEARCH_FOCUS_SUGGESTIONS,
  RESEARCH_INPUT_SUGGESTIONS,
  RESEARCH_FACILITY_FACILITIES,
  RETAIL_CENTER_TYPES,
  RETAIL_CENTER_FACILITIES,
  RETAIL_UNIT_FACILITIES,
  WAREHOUSE_GOODS,
  type Property,
  type PropertyDraft,
  WAREHOUSE_FACILITIES,
  mixedUseOwnershipScopeValues,
  supportsPropertyRental,
} from '@/lib/propertiesTypes';
import type { Contact, ContactPropertyRelationship } from '@/lib/contactsTypes';
import { unitTypeLabel, type Unit } from '@/lib/unitsTypes';
import { TagListInput } from '@/components/properties/TagListInput';

export interface PropertyOwnerDraft {
  id?: string | number;
  temp_contact_id?: number;
  source: 'existing' | 'new';
  contact_id: string;
  entity_type: 'individual' | 'company';
  name: string;
  email: string;
  phone: string;
  ownership_percentage: string;
  ownership_scope: string;
}

export interface PropertyRenterDraft {
  source: 'existing' | 'new';
  contact_id: string;
  name: string;
  email: string;
  phone: string;
  monthly_rent: string;
  lease_term_type: 'fixed' | 'until_termination';
  lease_start_date: string;
  lease_end_date: string;
}

interface PropertySetupFormProps {
  property: Property | null;
  contacts: Contact[];
  initialOwners: PropertyOwnerDraft[];
  initialRenter: PropertyRenterDraft | null;
  existingUnits: Unit[];
  onSave: (draft: PropertyDraft, owners: PropertyOwnerDraft[], renter: PropertyRenterDraft | null, units: UnitSavePayload[]) => Promise<void>;
  onClose: () => void;
}

type PropertyCategory = keyof typeof PROPERTY_TYPES_BY_CATEGORY;
type OwnerDraft = PropertyOwnerDraft;
type Errors = Record<string, string>;
type IndustrialArrayField = 'warehouse_goods' | 'distribution_goods' | 'distribution_services' | 'manufactured_products' | 'production_inputs' | 'research_focus' | 'research_inputs';

const PROPERTY_SETUP_STEPS = [
  { title: 'Identity', caption: 'Name and classify the property' },
  { title: 'Location', caption: 'Where is it located?' },
  { title: 'Mapping', caption: 'Define the property layout' },
  { title: 'Ownership', caption: 'Assign owners and shares' },
  { title: 'Details', caption: 'Add facilities, units, and occupancy' },
  { title: 'Review', caption: 'Confirm before saving' },
] as const;

const PROPERTY_MAPPING_ERROR_KEYS = [
  'room_count',
  'floor_count',
  'units_count',
  'floor_capacities',
  'office_in_building',
  'office_floor',
  'industrial_in_building',
  'industrial_floor',
  'commercial_space_type',
  'mixed_use_components',
  'mixed_use_floor_plan',
];

function hasPropertyStepErrors(errors: Errors, step: number) {
  const keys = Object.keys(errors);
  if (step === 0) return keys.some((key) => key === 'name' || key === 'subtype');
  if (step === 1) return keys.some((key) => key === 'address_line1' || key === 'city');
  if (step === 2) return keys.some((key) => PROPERTY_MAPPING_ERROR_KEYS.includes(key));
  if (step === 3) return keys.some((key) => key === 'owners' || key === 'unit_ownership_map' || key.startsWith('owner_'));

  const earlierStepKeys = new Set([
    'name',
    'subtype',
    'address_line1',
    'city',
    ...PROPERTY_MAPPING_ERROR_KEYS,
    'owners',
    'unit_ownership_map',
  ]);
  return keys.some((key) => !earlierStepKeys.has(key) && !key.startsWith('owner_'));
}

const inputClass = 'h-10 w-full rounded-[9px] border border-[#e4e2de] bg-white px-3 text-[13px] text-[#24211e] outline-none transition-colors placeholder:text-[#b3afa8] focus:border-[#587b70] focus:ring-2 focus:ring-[#587b70]/10 disabled:cursor-not-allowed disabled:bg-[#f5f3f0]';
let nextSyntheticContactId = -1;
type FacilityOption = { value: string; label: string; group?: string };
type FacilityGroup = { label: string; options: readonly FacilityOption[] };
type MixedUseFloorDraft = Record<string, string>;
type UnitOwnerAssignmentDraft = {
  unit_number: string;
  owner_key: string;
  ownership_percentage: string;
};

function ownerAssignmentKey(owner: OwnerDraft, index: number) {
  return owner.id !== undefined
    ? `relationship:${String(owner.id)}`
    : `draft:${String(owner.temp_contact_id ?? index)}`;
}

function ownerContactReference(owner: OwnerDraft, index: number) {
  return owner.source === 'existing' && owner.contact_id
    ? String(owner.contact_id)
    : String(owner.temp_contact_id ?? -(index + 1));
}

function unitNumbersFromScope(scope: string, unitCount: number) {
  const numbers = new Set<string>();
  scope.split(',').forEach((part) => {
    const token = part.trim();
    const range = token.match(/^(\d+)\s*(?:-|–|—|to)\s*(\d+)$/i);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let number = Math.min(start, end); number <= Math.max(start, end) && number <= unitCount; number += 1) {
        if (number > 0) numbers.add(String(number));
      }
    } else if (/^\d+$/.test(token) && Number(token) > 0 && Number(token) <= unitCount) {
      numbers.add(String(Number(token)));
    }
  });
  return [...numbers];
}

function groupedFacilityOptions(...groups: FacilityGroup[]) {
  const options = new Map<string, FacilityOption>();
  groups.forEach(({ label, options: groupOptions }) => {
    groupOptions.forEach((option) => {
      if (!options.has(option.value)) options.set(option.value, { ...option, group: label });
    });
  });
  return Array.from(options.values());
}

function resizeMixedUseFloorPlan(
  plan: Array<Record<string, number | string>>,
  floorCount: number,
  components: string[],
): MixedUseFloorDraft[] {
  const safeFloorCount = Number.isInteger(floorCount) && floorCount > 0
    ? Math.min(floorCount, 100)
    : 0;
  return Array.from({ length: safeFloorCount }, (_, floorIndex) => {
    const currentFloor = plan[floorIndex] ?? {};
    return Object.fromEntries(components.map((component) => [
      component,
      String(currentFloor[component] ?? 0),
    ]));
  });
}

function normalizedMixedUseFloorPlan(plan: MixedUseFloorDraft[], components: string[]) {
  return plan.map((floor) => Object.fromEntries(
    components.map((component) => [component, Number(floor[component] ?? 0)]),
  ));
}

function isMixedUseFloorPlanComplete(
  plan: MixedUseFloorDraft[],
  floorCount: number,
  components: string[],
) {
  if (!components.length || !Number.isInteger(floorCount) || floorCount < 1 || floorCount > 100 || plan.length !== floorCount) {
    return false;
  }

  return components.every((component) => {
    const counts = plan.map((floor) => floor[component]);
    return counts.every((value) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0)
      && counts.reduce((total, value) => total + Number(value), 0) > 0;
  });
}

function plannedMixedUseSpaceCount(plan: MixedUseFloorDraft[], components: string[]) {
  return plan.reduce((total, floor) => total + components.reduce(
    (floorTotal, component) => floorTotal + (Number(floor[component]) || 0),
    0,
  ), 0);
}
function categoryForType(type: string | null | undefined): PropertyCategory | '' {
  if (type && PROPERTY_TYPES_BY_CATEGORY.residential.some((option) => option.value === type) || ['single_family', 'condo', 'townhouse'].includes(type ?? '')) return 'residential';
  if (type && PROPERTY_TYPES_BY_CATEGORY.commercial.some((option) => option.value === type) || type === 'commercial' || type === 'mixed_use') return 'commercial';
  if (type && PROPERTY_TYPES_BY_CATEGORY.industrial.some((option) => option.value === type)) return 'industrial';
  return '';
}

function normalizedSubtype(type: string | null | undefined): string {
  if (type === 'single_family') return 'single_family_home';
  if (type === 'mixed_use') return 'mixed_use_development';
  return type ?? '';
}

function blankOwner(): OwnerDraft {
  return { temp_contact_id: nextSyntheticContactId--, source: 'new', contact_id: '', entity_type: 'individual', name: '', email: '', phone: '', ownership_percentage: '', ownership_scope: '' };
}

function blankRenter(): PropertyRenterDraft {
  return { source: 'new', contact_id: '', name: '', email: '', phone: '', monthly_rent: '', lease_term_type: 'fixed', lease_start_date: '', lease_end_date: '' };
}

function readExtra(property: Property | null, key: string, fallback = ''): string {
  const value = property as (Property & Record<string, unknown>) | null;
  const extra = value?.[key];
  return extra === null || extra === undefined ? fallback : String(extra);
}

function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.085em] text-[#77736d]">
        {label}{required && <span className="ml-1 text-[#b24d40]">*</span>}
        {hint && <span className="ml-1.5 normal-case font-normal tracking-normal text-[#a19b92]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function FormError({ message, testId }: { message?: string; testId?: string }) {
  if (!message) return null;
  return <p data-testid={testId} className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-4 text-[#a33e34]"><AlertCircle size={12} className="mt-0.5 shrink-0" />{message}</p>;
}

function SectionHeading({ eyebrow, title, description, index }: { eyebrow: string; title: string; description: string; index: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#d8e1da] bg-[#edf3ee] font-mono text-[10px] font-semibold text-[#55776b]">{index}</span>
      <div><p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#82948a]">{eyebrow}</p><h3 className="mt-0.5 text-[14px] font-semibold tracking-[-.02em] text-[#282722]">{title}</h3><p className="mt-1 text-[11px] leading-4 text-[#8b877f]">{description}</p></div>
    </div>
  );
}

function PropertyStepIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-5">
    <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#a16a52]">{eyebrow}</p>
    <h3 className="mt-1 text-[19px] font-semibold tracking-[-.03em] text-[#25221e]">{title}</h3>
    <p className="mt-1 text-[11px] leading-5 text-[#89847c]">{description}</p>
  </div>;
}

function PropertyReviewCard({
  title,
  testId,
  onEdit,
  children,
}: {
  title: string;
  testId: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="overflow-hidden rounded-[13px] border border-[#e9e6e1] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#f0eeeb] bg-[#fbfaf8] px-4 py-3">
        <h4 className="text-[11px] font-semibold text-[#403c35]">{title}</h4>
        <button type="button" data-testid={`button-edit-${testId}`} onClick={onEdit} className="shrink-0 text-[10px] font-semibold text-[#965d45] hover:underline">Edit</button>
      </div>
      <div className="px-4 py-2">{children}</div>
    </section>
  );
}

function PropertyReviewDetail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#f0eeeb] py-2 last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-[.06em] text-[#aaa59d]">{label}</span>
      <span className="max-w-[68%] whitespace-pre-wrap text-right text-[11px] leading-5 text-[#4d4942]">{value || 'Not provided'}</span>
    </div>
  );
}

function ContactFields({
  row, index, kind, contacts, entityType, excludedContactIds = [], onChange,
}: {
  row: OwnerDraft | PropertyRenterDraft;
  index: number;
  kind: 'owner' | 'renter';
  contacts: Contact[];
  entityType?: OwnerDraft['entity_type'];
  excludedContactIds?: string[];
  onChange: (patch: Partial<OwnerDraft> | Partial<PropertyRenterDraft>) => void;
}) {
  const selected = contacts.find((contact) => String(contact.id) === row.contact_id);
  const contactOptions = contacts.filter((contact) => {
    if (kind === 'owner') {
      if (excludedContactIds.includes(String(contact.id)) && String(contact.id) !== row.contact_id) return false;
      if (entityType === 'company') return contact.contact_type === 'company' || String(contact.id) === row.contact_id;
      return contact.contact_type !== 'company' || String(contact.id) === row.contact_id;
    }
    return true;
  });
  return (
    <>
      <div className="mb-3 flex rounded-[9px] bg-[#f2f1ed] p-1" role="group" aria-label={`${kind} contact source`}>
        <button type="button" data-testid={`button-${kind}-${index}-existing`} onClick={() => onChange({ source: 'existing', contact_id: '', name: '', email: '', phone: '' })} className={`flex-1 rounded-[7px] px-2 py-2 text-[11px] font-semibold transition-colors ${row.source === 'existing' ? 'bg-white text-[#34332e] shadow-[0_1px_3px_rgba(32,29,24,.10)]' : 'text-[#89867e] hover:text-[#4b4943]'}`}>Existing contact</button>
        <button type="button" data-testid={`button-${kind}-${index}-new`} onClick={() => onChange({ source: 'new', contact_id: '', name: '', email: '', phone: '' })} className={`flex-1 rounded-[7px] px-2 py-2 text-[11px] font-semibold transition-colors ${row.source === 'new' ? 'bg-white text-[#34332e] shadow-[0_1px_3px_rgba(32,29,24,.10)]' : 'text-[#89867e] hover:text-[#4b4943]'}`}>New contact</button>
      </div>
      {row.source === 'existing' ? (
        <Field label="Contact" required>
          <FlowPointSelect
            testId={`select-${kind}-${index}-contact`}
            value={row.contact_id}
            onChange={(value) => {
              const contact = contacts.find((item) => String(item.id) === value);
              onChange({ contact_id: value, name: contact?.name ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '' });
            }}
            placeholder={`Select a ${kind}`}
            options={contactOptions.map((contact) => ({ value: String(contact.id), label: contact.name, secondary: contact.company_name ?? contact.email ?? contact.phone ?? undefined }))}
            emptyLabel="No contacts found. Add a new contact instead."
          />
          {selected && <p data-testid={`text-${kind}-${index}-contact-summary`} className="mt-1.5 text-[10px] text-[#8c8981]">{selected.email || selected.phone || selected.customer_id || 'Contact selected'}</p>}
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required><input data-testid={`input-${kind}-${index}-name`} className={inputClass} value={row.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Person or company" /></Field>
          <Field label="Email" hint="or phone"><input data-testid={`input-${kind}-${index}-email`} className={inputClass} type="email" value={row.email} onChange={(event) => onChange({ email: event.target.value })} placeholder="name@example.com" /></Field>
          <div className="sm:col-span-2"><Field label="Phone" hint="optional if email is provided"><input data-testid={`input-${kind}-${index}-phone`} className={inputClass} type="tel" value={row.phone} onChange={(event) => onChange({ phone: event.target.value })} placeholder="Phone number" /></Field></div>
        </div>
      )}
    </>
  );
}

export default function PropertySetupForm({ property, contacts, initialOwners, initialRenter, existingUnits, onSave, onClose }: PropertySetupFormProps) {
  const [form, setForm] = useState<PropertyDraft>(() => ({ ...blankProperty }));
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<PropertyCategory | ''>('');
  const [roomCount, setRoomCount] = useState('');
  const [floorCount, setFloorCount] = useState('');
  const [floorCapacities, setFloorCapacities] = useState<string[]>([]);
  const [officeInBuilding, setOfficeInBuilding] = useState<boolean | null>(null);
  const [officeFloor, setOfficeFloor] = useState('');
  const [commercialSpaceType, setCommercialSpaceType] = useState('');
  const [mixedUseComponents, setMixedUseComponents] = useState<string[]>([]);
  const [mixedUseFloorPlan, setMixedUseFloorPlan] = useState<MixedUseFloorDraft[]>([]);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [customFacilities, setCustomFacilities] = useState<string[]>([]);
  const [customFacility, setCustomFacility] = useState('');
  const [owners, setOwners] = useState<OwnerDraft[]>([blankOwner()]);
  const [unitOwnerAssignments, setUnitOwnerAssignments] = useState<UnitOwnerAssignmentDraft[]>([]);
  const [rented, setRented] = useState<boolean | null>(null);
  const [renter, setRenter] = useState<PropertyRenterDraft>(blankRenter());
  const [pendingUnits, setPendingUnits] = useState<UnitSavePayload[]>([]);
  const [unitEditorOpen, setUnitEditorOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const ownersSignature = JSON.stringify(initialOwners);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [step]);

  useEffect(() => {
    const propertyType = normalizedSubtype(property?.property_type);
    const initialCategory = (property?.property_category as PropertyCategory | null) || categoryForType(propertyType);
    const current = property ? {
      ...blankProperty,
      ...property,
      property_type: propertyType,
      name: property.name ?? '',
      address_line1: property.address_line1 ?? '',
      address_line2: property.address_line2 ?? '',
      city: property.city ?? '',
      state: property.state ?? '',
      postal_code: property.postal_code ?? '',
      country: property.country ?? '',
      description: property.description ?? '',
      amenities: property.amenities ?? '',
      property_rules: property.property_rules ?? '',
      parking_information: property.parking_information ?? '',
      access_information: property.access_information ?? '',
      utilities_information: property.utilities_information ?? '',
      emergency_information: property.emergency_information ?? '',
      notes: property.notes ?? '',
      industrial_in_building: property.industrial_in_building ?? null,
      industrial_floor: property.industrial_floor ?? null,
      warehouse_goods: property.warehouse_goods ?? [],
      distribution_goods: property.distribution_goods ?? [],
      distribution_services: property.distribution_services ?? [],
      manufactured_products: property.manufactured_products ?? [],
      production_inputs: property.production_inputs ?? [],
      research_focus: property.research_focus ?? [],
      research_inputs: property.research_inputs ?? [],
    } : { ...blankProperty, property_type: '' };
    setForm(current);
    setCategory(initialCategory);
    setRoomCount(readExtra(property, 'room_count'));
    setFloorCount(readExtra(property, 'floor_count'));
    const savedOfficeInBuilding = property?.office_in_building;
    setOfficeInBuilding(typeof savedOfficeInBuilding === 'boolean' ? savedOfficeInBuilding : null);
    setOfficeFloor(readExtra(property, 'office_floor'));
    setCommercialSpaceType(readExtra(property, 'commercial_space_type'));
    const savedMixedUseComponents = property?.mixed_use_components ?? [];
    setMixedUseComponents(savedMixedUseComponents);
    setMixedUseFloorPlan(resizeMixedUseFloorPlan(
      property?.mixed_use_floor_plan ?? [],
      Number(readExtra(property, 'floor_count')),
      savedMixedUseComponents,
    ));
    const savedCapacities = property?.floor_unit_counts ?? [];
    let capacities = savedCapacities.map(String);
    if (!capacities.length && Number(readExtra(property, 'floor_count')) > 0) capacities = Array.from({ length: Math.min(Number(readExtra(property, 'floor_count')), 100) }, () => '');
    setFloorCapacities(capacities);
    setFacilities(property?.facilities ?? []);
    setCustomFacilities(property?.custom_facilities ?? []);
    setCustomFacility('');
    const ownerRows = initialOwners.length
      ? initialOwners.map((owner) => ({ ...owner, entity_type: owner.entity_type ?? 'individual' }))
      : [blankOwner()];
    setOwners(ownerRows);
    const savedUnitMap = (property?.unit_ownership_map ?? []).flatMap((allocation) => {
      const ownerIndex = ownerRows.findIndex((owner) =>
        owner.source === 'existing' && String(owner.contact_id) === String(allocation.contact_id),
      );
      if (ownerIndex < 0) return [];
      return [{
        unit_number: String(allocation.unit_number),
        owner_key: ownerAssignmentKey(ownerRows[ownerIndex], ownerIndex),
        ownership_percentage: allocation.ownership_percentage == null ? '' : String(allocation.ownership_percentage),
      }];
    });
    const legacyScopeMap = savedUnitMap.length || !property
      ? []
      : ownerRows.flatMap((owner, index) => unitNumbersFromScope(owner.ownership_scope, Number(property.units_count) || 0).map((unitNumber) => ({
        unit_number: unitNumber,
        owner_key: ownerAssignmentKey(owner, index),
        ownership_percentage: '',
      })));
    setUnitOwnerAssignments(savedUnitMap.length ? savedUnitMap : legacyScopeMap);
    setRented(property?.is_rented ?? null);
    setRenter({
      ...blankRenter(),
      ...(initialRenter ?? {}),
      source: initialRenter?.source ?? 'new',
      contact_id: initialRenter?.contact_id ?? '',
      name: initialRenter?.name ?? '',
      email: initialRenter?.email ?? '',
      phone: initialRenter?.phone ?? '',
      monthly_rent: initialRenter?.monthly_rent ?? (property?.monthly_rent == null ? '' : String(property.monthly_rent)),
      lease_term_type: property?.lease_term_type ?? initialRenter?.lease_term_type ?? 'fixed',
      lease_start_date: property?.lease_start_date ?? initialRenter?.lease_start_date ?? '',
      lease_end_date: property?.lease_end_date ?? initialRenter?.lease_end_date ?? '',
    });
    setPendingUnits([]);
    if (!property) setUnitOwnerAssignments([]);
    setUnitEditorOpen(false);
    setSaveError('');
  }, [property, ownersSignature, initialRenter]);

  const subtype = form.property_type ?? '';
  const residential = category === 'residential';
  const singleFamily = subtype === 'single_family_home';
  const multifamily = subtype === 'multifamily_units';
  const apartment = subtype === 'apartment_building';
  const unitMappedProperty = multifamily || apartment;
  const commercial = category === 'commercial';
  const industrial = category === 'industrial';
  const officeBuilding = subtype === 'office_building';
  const retailCenter = subtype === 'retail_center';
  const hospitalitySpace = subtype === 'restaurant_hospitality';
  const mixedUse = subtype === 'mixed_use_development';
  const warehouse = subtype === 'warehouse';
  const distributionCenter = subtype === 'distribution_center';
  const manufacturingPlant = subtype === 'manufacturing_plant';
  const researchFacility = subtype === 'research_development_facility';
  const industrialBuildingSubtype = warehouse || distributionCenter || researchFacility;
  const propertyCanRent = supportsPropertyRental(subtype);
  const isValidOwnershipShare = (value: string) => {
    const normalized = value.trim();
    if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(normalized)) return false;
    const share = Number(normalized);
    return Number.isFinite(share) && share > 0 && share <= 100;
  };
  const ownerSharesAreValid = owners.length > 0 && owners.every((owner) => isValidOwnershipShare(owner.ownership_percentage));
  const ownerSharesCanBeSummed = owners.every((owner) => !owner.ownership_percentage.trim() || isValidOwnershipShare(owner.ownership_percentage));
  const hasEnteredOwnerShare = owners.some((owner) => isValidOwnershipShare(owner.ownership_percentage));
  const hasUnenteredOwnerShare = owners.some((owner) => !owner.ownership_percentage.trim());
  const ownerShareTotal = owners.reduce((total, owner) => total + (isValidOwnershipShare(owner.ownership_percentage) ? Number(owner.ownership_percentage) : 0), 0);
  const formatOwnershipShare = (share: number) => Number(share.toFixed(2)).toString();
  const unitOwnershipMap = useMemo(() => {
    if (!unitMappedProperty) return [];
    const unitCount = Number(form.units_count);
    if (!Number.isInteger(unitCount) || unitCount < 1) return [];
    return Array.from({ length: unitCount }, (_, index) => String(index + 1)).flatMap((unitNumber) => {
      if (owners.length === 1) {
        return [{
          unit_number: unitNumber,
          contact_id: ownerContactReference(owners[0], 0),
          ownership_percentage: null,
        }];
      }
      const assignments = unitOwnerAssignments.filter((assignment) =>
        assignment.unit_number === unitNumber
        && owners.some((owner, ownerIndex) => ownerAssignmentKey(owner, ownerIndex) === assignment.owner_key),
      );
      return assignments.map((assignment) => {
        const ownerIndex = owners.findIndex((owner, index) => ownerAssignmentKey(owner, index) === assignment.owner_key);
        return {
          unit_number: unitNumber,
          contact_id: ownerIndex >= 0 ? ownerContactReference(owners[ownerIndex], ownerIndex) : '',
          ownership_percentage: assignments.length > 1 && assignment.ownership_percentage.trim()
            ? Number(assignment.ownership_percentage)
            : null,
        };
      }).filter((allocation) => allocation.contact_id);
    });
  }, [unitMappedProperty, form.units_count, owners, unitOwnerAssignments]);
  const summarizeOwnerUnits = (ownerKey: string) => unitOwnerAssignments
    .filter((assignment) => assignment.owner_key === ownerKey)
    .sort((a, b) => Number(a.unit_number) - Number(b.unit_number))
    .map((assignment) => {
      const allocations = unitOwnerAssignments.filter((item) => item.unit_number === assignment.unit_number);
      return allocations.length > 1 && assignment.ownership_percentage.trim()
        ? `Unit ${assignment.unit_number} (${assignment.ownership_percentage}%)`
        : `Unit ${assignment.unit_number}`;
    })
    .join(', ');
  const sharedFacilityOptions = useMemo(() => {
    if (mixedUse) {
      const groups: FacilityGroup[] = [];
      if (mixedUseComponents.includes('apartment')) {
        groups.push({ label: 'Residential', options: HOME_FACILITIES });
        groups.push({ label: 'Apartment building', options: APARTMENT_BUILDING_FACILITIES });
      }
      if (mixedUseComponents.includes('office')) {
        groups.push({ label: 'Shared commercial', options: COMMERCIAL_FACILITIES });
        groups.push({ label: 'Office spaces', options: OFFICE_FACILITIES });
      }
      if (mixedUseComponents.includes('retail_store')) {
        groups.push({ label: 'Shared commercial', options: COMMERCIAL_FACILITIES });
        groups.push({ label: 'Retail', options: RETAIL_CENTER_FACILITIES });
        groups.push({ label: 'Retail spaces', options: RETAIL_UNIT_FACILITIES });
      }
      if (mixedUseComponents.includes('restaurant_hospitality')) {
        groups.push({ label: 'Shared commercial', options: COMMERCIAL_FACILITIES });
        groups.push({ label: 'Hospitality', options: HOSPITALITY_FACILITIES });
      }
      if (mixedUseComponents.includes('warehouse')) {
        groups.push({ label: 'Shared commercial', options: COMMERCIAL_FACILITIES });
        groups.push({ label: 'Warehouse', options: WAREHOUSE_FACILITIES });
      }
      return groupedFacilityOptions(...groups);
    }
    if (officeBuilding) return groupedFacilityOptions(
      { label: 'Shared commercial', options: COMMERCIAL_FACILITIES },
      { label: 'Office building', options: OFFICE_FACILITIES },
    );
    if (retailCenter) return groupedFacilityOptions(
      { label: 'Shared commercial', options: COMMERCIAL_FACILITIES },
      { label: 'Retail center', options: RETAIL_CENTER_FACILITIES },
    );
    if (hospitalitySpace) return groupedFacilityOptions(
      { label: 'Shared commercial', options: COMMERCIAL_FACILITIES },
      { label: 'Hospitality', options: HOSPITALITY_FACILITIES },
    );
    if (industrial) {
      const industrialOptions = subtype === 'warehouse'
        ? WAREHOUSE_FACILITIES
        : subtype === 'distribution_center'
          ? DISTRIBUTION_CENTER_FACILITIES
          : subtype === 'manufacturing_plant'
            ? MANUFACTURING_PLANT_FACILITIES
            : RESEARCH_FACILITY_FACILITIES;
      return groupedFacilityOptions(
        { label: 'Shared industrial', options: INDUSTRIAL_SHARED_FACILITIES },
        { label: PROPERTY_TYPES_BY_CATEGORY.industrial.find((type) => type.value === subtype)?.label ?? 'Property type', options: industrialOptions },
      );
    }
    if (apartment || multifamily) return groupedFacilityOptions(
      { label: 'Residential', options: HOME_FACILITIES },
      { label: 'Apartment building', options: APARTMENT_BUILDING_FACILITIES },
    );
    return groupedFacilityOptions({ label: 'Home', options: HOME_FACILITIES });
  }, [mixedUse, mixedUseComponents, officeBuilding, retailCenter, hospitalitySpace, industrial, subtype, apartment, multifamily]);
  const propertyFacilities = useMemo(
    () => facilities.filter((facility) => sharedFacilityOptions.some((option) => option.value === facility)),
    [facilities, sharedFacilityOptions],
  );
  const previewProperty = useMemo<Property>(() => ({
    ...blankProperty,
    ...(property ?? {}),
    id: property?.id ?? 'pending-property',
    company_id: property?.company_id ?? null,
    created_at: property?.created_at ?? '',
    updated_at: property?.updated_at ?? '',
    name: form.name || 'New property',
    property_category: category || 'residential',
    property_type: subtype,
    units_count: multifamily || apartment ? form.units_count : null,
    units_under_construction: Boolean(form.units_under_construction),
    unit_ownership_map: unitOwnershipMap,
    floor_count: singleFamily || apartment || mixedUse ? (floorCount ? Number(floorCount) : null) : null,
    floor_unit_counts: apartment ? floorCapacities.map((capacity) => Number(capacity) || 0) : [],
    room_count: singleFamily ? (roomCount ? Number(roomCount) : null) : null,
    facilities: propertyFacilities,
    custom_facilities: customFacilities,
    office_in_building: officeBuilding ? officeInBuilding : null,
    office_floor: officeBuilding && officeInBuilding ? Number(officeFloor) : null,
    commercial_space_type: retailCenter || hospitalitySpace ? commercialSpaceType || null : null,
    mixed_use_components: mixedUse ? mixedUseComponents : [],
    mixed_use_floor_plan: mixedUse ? normalizedMixedUseFloorPlan(mixedUseFloorPlan, mixedUseComponents) : [],
    is_rented: propertyCanRent ? Boolean(rented) : false,
    monthly_rent: propertyCanRent && rented ? Number(renter.monthly_rent) || null : null,
    lease_term_type: propertyCanRent && rented ? renter.lease_term_type : null,
    lease_start_date: propertyCanRent && rented ? renter.lease_start_date || null : null,
    lease_end_date: propertyCanRent && rented && renter.lease_term_type === 'fixed' ? renter.lease_end_date || null : null,
  }), [property, form, category, subtype, multifamily, apartment, singleFamily, officeBuilding, officeInBuilding, officeFloor, retailCenter, hospitalitySpace, commercialSpaceType, mixedUse, mixedUseComponents, mixedUseFloorPlan, propertyCanRent, floorCount, floorCapacities, roomCount, propertyFacilities, customFacilities, rented, renter, unitOwnershipMap]);
  const inlineOwnerData = useMemo(() => {
    const syntheticContacts: Contact[] = [];
    const relations: ContactPropertyRelationship[] = [];
    if (unitMappedProperty || mixedUse) owners.forEach((owner, index) => {
      const selectedContact = contacts.find((contact) => String(contact.id) === owner.contact_id);
      const contactId = owner.source === 'existing' && owner.contact_id ? owner.contact_id : owner.temp_contact_id ?? -(index + 1);
      if (owner.source === 'new') syntheticContacts.push({
        id: contactId,
        company_id: null,
        created_at: '',
        updated_at: null,
        name: owner.name,
        email: owner.email || null,
        phone: owner.phone || null,
        business_name: null,
        notes: null,
        customer_id: null,
        contact_type: owner.entity_type === 'company' ? 'company' : 'property_owner',
        status: 'active',
        preferred_channel: owner.email ? 'email' : 'phone',
        alternate_phone: null,
        address: null,
        city: null,
        state: null,
        zip_code: null,
        country: null,
        company_name: null,
        ai_summary: null,
        internal_notes: null,
        last_contacted_at: null,
      });
      relations.push({
        id: `pending-building-owner-${index}`,
        company_id: null,
        contact_id: selectedContact ? selectedContact.id : contactId,
        property_id: previewProperty.id,
        unit_id: null,
        relationship_type: 'owner',
        start_date: null,
        end_date: null,
        notes: null,
        ownership_percentage: unitMappedProperty
          ? owners.length === 1 ? 100 : null
          : Number(owner.ownership_percentage) || null,
        ownership_scope: unitMappedProperty
          ? owners.length === 1 ? 'Entire property' : summarizeOwnerUnits(ownerAssignmentKey(owner, index)) || null
          : mixedUse && owners.length > 1 ? owner.ownership_scope || null : null,
      });
    });
    return { contacts: [...contacts, ...syntheticContacts], relationships: relations };
  }, [unitMappedProperty, mixedUse, owners, contacts, previewProperty.id, summarizeOwnerUnits]);
  const inlineUnitRecords = useMemo<Unit[]>(() => pendingUnits.map((item, index) => ({
    ...item.draft,
    id: `pending-unit-${index}`,
    company_id: null,
    created_at: '',
    updated_at: '',
    property_id: previewProperty.id,
  })), [pendingUnits, previewProperty.id]);
  const configuredUnits = Number(previewProperty.units_count) || 0;
  const recordedUnitCount = property
    ? existingUnits.filter((unit) => unit.property_id === property.id).length
    : pendingUnits.length;
  const unitsAreMissing = configuredUnits > 0 && recordedUnitCount < configuredUnits;
  const mixedUsePlannedSpaces = plannedMixedUseSpaceCount(mixedUseFloorPlan, mixedUseComponents);
  const mixedUsePlanReady = isMixedUseFloorPlanComplete(mixedUseFloorPlan, Number(floorCount), mixedUseComponents);
  const inlineUnitLimitReached = mixedUse
    ? mixedUsePlanReady && inlineUnitRecords.length >= mixedUsePlannedSpaces
    : configuredUnits > 0 && inlineUnitRecords.length >= configuredUnits;
  const unitOwnerMappingReady = !unitMappedProperty || (
    owners.length > 0
    && owners.every((owner) => owner.source === 'existing'
      ? Boolean(owner.contact_id)
      : Boolean(owner.name.trim() && (owner.email.trim() || owner.phone.trim())))
    && (owners.length === 1 || Array.from({ length: configuredUnits }, (_, index) => String(index + 1)).every((unitNumber) => {
      const allocations = unitOwnerAssignments.filter((assignment) =>
        assignment.unit_number === unitNumber
        && owners.some((owner, index) => ownerAssignmentKey(owner, index) === assignment.owner_key),
      );
      return allocations.length > 0 && (allocations.length === 1
        || (allocations.every((allocation) => isValidOwnershipShare(allocation.ownership_percentage))
          && Math.abs(allocations.reduce((sum, allocation) => sum + Number(allocation.ownership_percentage), 0) - 100) < 0.001));
    }))
  );
  const inlineLayoutReady = mixedUse
    ? mixedUsePlanReady
    : configuredUnits > 0 && Number.isInteger(configuredUnits)
    && unitOwnerMappingReady
    && (!apartment || (
      Number(floorCount) > 0
      && floorCapacities.length === Number(floorCount)
      && floorCapacities.every((capacity) => capacity.trim() !== '' && Number.isInteger(Number(capacity)) && Number(capacity) >= 0)
      && floorCapacities.reduce((sum, capacity) => sum + Number(capacity), 0) === configuredUnits
    ));

  const setField = (key: keyof PropertyDraft, value: PropertyDraft[keyof PropertyDraft]) => setForm((current) => ({ ...current, [key]: value }));
  const selectCategory = (value: string) => {
    const nextCategory = value as PropertyCategory;
    setCategory(nextCategory);
    setField('property_category', nextCategory);
    setField('property_type', '');
    setField('units_count', null);
    setUnitOwnerAssignments([]);
    setFloorCount('');
    setFloorCapacities([]);
    setPendingUnits([]);
    setOfficeInBuilding(null);
    setOfficeFloor('');
    setCommercialSpaceType('');
    setMixedUseComponents([]);
    setMixedUseFloorPlan([]);
    setFacilities([]);
    setCustomFacilities([]);
    clearIndustrialFields();
  };
  const selectSubtype = (value: string) => {
    setField('property_type', value);
    setField('units_count', null);
    setFloorCount('');
    setFloorCapacities([]);
    setPendingUnits([]);
    setOfficeInBuilding(null);
    setOfficeFloor('');
    setCommercialSpaceType('');
    setMixedUseComponents([]);
    setMixedUseFloorPlan([]);
    setFacilities([]);
    setCustomFacilities([]);
    clearIndustrialFields();
  };
  const clearIndustrialFields = () => {
    setField('industrial_in_building', null);
    setField('industrial_floor', null);
    setField('warehouse_goods', []);
    setField('distribution_goods', []);
    setField('distribution_services', []);
    setField('manufactured_products', []);
    setField('production_inputs', []);
    setField('research_focus', []);
    setField('research_inputs', []);
  };
  const updateIndustrialTags = (key: IndustrialArrayField, value: string[]) => setField(key, value);
  const setOwner = (index: number, patch: Partial<OwnerDraft>) => setOwners((current) => current.map((owner, i) => i === index ? { ...owner, ...patch } : owner));
  const setRenterFields = (patch: Partial<PropertyRenterDraft>) => setRenter((current) => ({ ...current, ...patch }));
  const toggleMixedUseComponent = (component: string) => {
    const nextComponents = mixedUseComponents.includes(component)
      ? mixedUseComponents.filter((value) => value !== component)
      : [...mixedUseComponents, component];
    setMixedUseComponents(nextComponents);
    setMixedUseFloorPlan((current) => resizeMixedUseFloorPlan(current, Number(floorCount), nextComponents));
    setOwners((current) => current.map((owner) => ({
      ...owner,
      ownership_scope: mixedUseOwnershipScopeValues(owner.ownership_scope)
        .filter((value) => nextComponents.includes(value))
        .join(','),
    })));
  };
  const updateMixedUseFloorCount = (value: string) => {
    setFloorCount(value);
    if (value !== '') {
      setMixedUseFloorPlan((current) => resizeMixedUseFloorPlan(current, Number(value), mixedUseComponents));
    }
  };
  const updateMixedUseFloorPlanCount = (floorIndex: number, component: string, value: string) => {
    setMixedUseFloorPlan((current) => current.map((floor, index) => index === floorIndex
      ? { ...floor, [component]: value }
      : floor));
  };
  const toggleOwnerMixedUseScope = (ownerIndex: number, component: string) => {
    const selected = mixedUseOwnershipScopeValues(owners[ownerIndex]?.ownership_scope);
    const next = selected.includes(component)
      ? selected.filter((value) => value !== component)
      : [...selected, component];
    setOwner(ownerIndex, { ownership_scope: next.join(',') });
  };

  const validation = useMemo((): Errors => {
    const next: Errors = {};
    if (!form.name.trim()) next.name = 'Property name is required.';
    if (!subtype) next.subtype = 'Choose a property subtype.';
    if (!form.address_line1?.trim()) next.address_line1 = 'Address line 1 is required.';
    if (!form.city?.trim()) next.city = 'City is required.';
    if (singleFamily) {
      if (!roomCount.trim() || !Number.isInteger(Number(roomCount)) || Number(roomCount) <= 0) next.room_count = 'Enter a whole-number room count greater than 0.';
      if (!floorCount.trim() || !Number.isInteger(Number(floorCount)) || Number(floorCount) <= 0) next.floor_count = 'Enter a whole-number floor count greater than 0.';
    }
    if (unitMappedProperty && (!form.units_count || !Number.isInteger(Number(form.units_count)) || Number(form.units_count) < 2)) next.units_count = 'Enter a whole-number unit count of at least 2.';
    if (unitMappedProperty && Number.isInteger(Number(form.units_count)) && Number(form.units_count) >= 2) {
      const recordedUnits = property
        ? existingUnits.filter((unit) => unit.property_id === property.id).length
        : pendingUnits.length;
      if (recordedUnits > Number(form.units_count)) {
        next.inline_units = `The property is configured for ${form.units_count} units, but ${recordedUnits} have already been added.`;
      } else if (recordedUnits < Number(form.units_count) && !form.units_under_construction) {
        next.inline_units = `Add all ${form.units_count} units, or select “Other units are still under construction” to save with units missing.`;
      }
    }
    if (unitMappedProperty && owners.length > 1 && Number.isInteger(Number(form.units_count)) && Number(form.units_count) >= 2) {
      const ownerKeys = owners.map((owner, index) => ownerAssignmentKey(owner, index));
      for (let number = 1; number <= Number(form.units_count); number += 1) {
        const assignments = unitOwnerAssignments.filter((assignment) =>
          assignment.unit_number === String(number) && ownerKeys.includes(assignment.owner_key),
        );
        if (!assignments.length) {
          next.unit_ownership_map = `Assign an owner to every unit. Unit ${number} has no owner yet.`;
          break;
        }
        if (assignments.length > 1) {
          if (assignments.some((assignment) => !isValidOwnershipShare(assignment.ownership_percentage))) {
            next.unit_ownership_map = `Enter a valid ownership share for each owner of unit ${number}.`;
            break;
          }
          const total = assignments.reduce((sum, assignment) => sum + Number(assignment.ownership_percentage), 0);
          if (Math.abs(total - 100) > 0.001) {
            next.unit_ownership_map = `Ownership shares for unit ${number} must total 100% (currently ${Number(total.toFixed(2))}%).`;
            break;
          }
        }
      }
    }
    if (apartment) {
      if (!floorCount.trim() || !Number.isInteger(Number(floorCount)) || Number(floorCount) <= 0) next.floor_count = 'Enter a whole-number floor count greater than 0.';
      const expectedFloors = Number(floorCount);
      if (expectedFloors > 0 && floorCapacities.length !== expectedFloors) next.floor_capacities = 'Add capacity for every floor.';
      else if (floorCapacities.length && floorCapacities.some((capacity) => capacity.trim() === '' || !Number.isInteger(Number(capacity)) || Number(capacity) < 0)) next.floor_capacities = 'Use a whole-number capacity of 0 or more for each floor.';
      else if (floorCapacities.length && Number(form.units_count) > 0 && floorCapacities.reduce((sum, value) => sum + Number(value), 0) !== Number(form.units_count)) next.floor_capacities = `Floor capacities must add up to ${form.units_count}.`;
      if (floorCapacities.length === expectedFloors && pendingUnits.length) {
        const assignedByFloor = Array.from({ length: expectedFloors }, () => 0);
        pendingUnits.forEach(({ draft }) => {
          if (draft.floor !== null && draft.floor >= 0 && draft.floor < expectedFloors) assignedByFloor[draft.floor] += 1;
        });
        if (assignedByFloor.some((count, index) => count > Number(floorCapacities[index] || 0))) {
          next.inline_floor_capacity = 'The units already added exceed the capacity of at least one floor.';
        }
      }
    }
    if (officeBuilding) {
      if (officeInBuilding === null) next.office_in_building = 'Choose whether this office is inside a building.';
      if (officeInBuilding && (!officeFloor.trim() || !Number.isInteger(Number(officeFloor)) || Number(officeFloor) < 0)) {
        next.office_floor = 'Enter a whole-number floor. Use 0 for the ground floor.';
      }
    }
    if (industrialBuildingSubtype) {
      if (form.industrial_in_building === null) next.industrial_in_building = 'Choose whether this property is in a building or standalone.';
      if (form.industrial_in_building && (!Number.isInteger(form.industrial_floor) || Number(form.industrial_floor) < 0)) {
        next.industrial_floor = 'Enter a whole-number floor. Use 0 for the ground floor.';
      }
    }
    if (warehouse && !(form.warehouse_goods ?? []).length) next.warehouse_goods = 'Add at least one type of good stored here.';
    if (distributionCenter) {
      if (!(form.distribution_goods ?? []).length) next.distribution_goods = 'Add at least one type of good handled here.';
    }
    if (manufacturingPlant && !(form.manufactured_products ?? []).length) next.manufactured_products = 'Add at least one product manufactured here.';
    if (researchFacility && !(form.research_focus ?? []).length) next.research_focus = 'Add at least one research focus.';
    if ((retailCenter || hospitalitySpace) && !commercialSpaceType) {
      next.commercial_space_type = `Choose the ${retailCenter ? 'retail center' : 'hospitality space'} type.`;
    }
    if (mixedUse) {
      if (!mixedUseComponents.length) next.mixed_use_components = 'Choose at least one use included in this property.';
      if (!floorCount.trim() || !Number.isInteger(Number(floorCount)) || Number(floorCount) <= 0) {
        next.floor_count = 'Enter a whole-number floor count greater than 0.';
      }
      const floorTotal = Number(floorCount);
      if (Number.isInteger(floorTotal) && floorTotal > 0 && floorTotal <= 100 && mixedUseComponents.length) {
        if (mixedUseFloorPlan.length !== floorTotal) {
          next.mixed_use_floor_plan = 'Add a count for each selected use on every floor.';
        } else if (mixedUseFloorPlan.some((floor) => mixedUseComponents.some((component) =>
          floor[component] === undefined
          || floor[component].trim() === ''
          || !Number.isInteger(Number(floor[component]))
          || Number(floor[component]) < 0,
        ))) {
          next.mixed_use_floor_plan = 'Enter a whole-number count of 0 or more for every use on each floor.';
        } else if (mixedUseComponents.some((component) => mixedUseFloorPlan.reduce(
          (total, floor) => total + Number(floor[component] || 0),
          0,
        ) < 1)) {
          next.mixed_use_floor_plan = 'Each selected use needs at least one space across the building.';
        }
      } else if (Number.isInteger(floorTotal) && floorTotal > 100) {
        next.floor_count = 'A mixed-use property can have no more than 100 floors.';
      }
      const mixedUnits = property
        ? existingUnits
        : pendingUnits.map((item) => item.draft);
      if (!property && pendingUnits.some(({ draft }) => draft.unit_type && !mixedUseComponents.includes(draft.unit_type))) {
        next.inline_units = 'Remove pending spaces for uses you unchecked, or select those uses again.';
      }
      if (property && existingUnits.some((unit) => unit.unit_type && !mixedUseComponents.includes(unit.unit_type))) {
        next.inline_units = 'Remove or reclassify every space for a use before removing that use.';
      }
      if (Number.isInteger(floorTotal) && floorTotal > 0 && mixedUnits.some((unit) =>
        unit.floor === null || !Number.isInteger(unit.floor) || unit.floor < 0 || unit.floor >= floorTotal,
      )) {
        next.inline_floor = 'Every unit must be assigned to a floor within this property.';
      }
      if (isMixedUseFloorPlanComplete(mixedUseFloorPlan, floorTotal, mixedUseComponents)) {
        const assignedByFloorAndType = new Map<string, number>();
        mixedUnits.forEach((unit) => {
          if (unit.floor === null || !unit.unit_type || !mixedUseComponents.includes(unit.unit_type)) return;
          const key = `${unit.floor}:${unit.unit_type}`;
          assignedByFloorAndType.set(key, (assignedByFloorAndType.get(key) ?? 0) + 1);
        });
        const exceedsPlan = Array.from(assignedByFloorAndType.entries()).some(([key, count]) => {
          const [floor, component] = key.split(':');
          return count > Number(mixedUseFloorPlan[Number(floor)]?.[component] ?? 0);
        });
        if (exceedsPlan) next.inline_floor_capacity = 'The spaces already added exceed the planned count for a use on at least one floor.';
      }
      if (pendingUnits.length) {
        const currentOwnerRefs = owners.map((owner) => owner.source === 'new'
          ? String(owner.temp_contact_id ?? '')
          : owner.contact_id);
        const invalidOwnerAssignment = pendingUnits.some(({ draft: unitDraft, owners: unitOwners }) => {
          const eligibleOwnerRefs = owners
            .filter((owner) => owners.length === 1 || mixedUseOwnershipScopeValues(owner.ownership_scope).includes(unitDraft.unit_type ?? ''))
            .map((owner) => owner.source === 'new' ? String(owner.temp_contact_id ?? '') : owner.contact_id);
          return !unitOwners.length || unitOwners.some((owner) =>
            !currentOwnerRefs.includes(owner.contact_id) || !eligibleOwnerRefs.includes(owner.contact_id),
          );
        });
        if (invalidOwnerAssignment) next.inline_units = 'A mapped space has no current owner or its owner does not own that use. Remove and re-add the space after updating owner assignments.';
      }
    }
    const ownershipEnabled = singleFamily || unitMappedProperty || commercial || industrial || mixedUse;
    if (ownershipEnabled && owners.length === 0) next.owners = 'Add at least one owner.';
    if (ownershipEnabled) {
      owners.forEach((owner, index) => {
        if (owner.source === 'existing' && !owner.contact_id) next[`owner_${index}`] = 'Select an existing contact.';
        if (owner.source === 'new' && !owner.name.trim()) next[`owner_${index}`] = 'Owner name is required.';
        if (owner.source === 'new' && !owner.email.trim() && !owner.phone.trim()) next[`owner_${index}`] = 'Add an email or phone number.';
        if (owner.source === 'new' && owner.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email.trim())) next[`owner_${index}`] = 'Enter a valid email address.';
        if (!unitMappedProperty && !isValidOwnershipShare(owner.ownership_percentage)) {
          next[`owner_share_${index}`] = 'Enter a share greater than 0 and no more than 100, with up to 2 decimal places.';
        }
        if (apartment && owners.length > 1 && !unitMappedProperty && !/^\d+(?:\s*[-–—]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*$/.test(owner.ownership_scope.trim())) {
          next[`owner_scope_${index}`] = 'List the units or ranges this owner holds (for example, 1–4, 8).';
        }
        if (mixedUse && owners.length > 1 && !mixedUseOwnershipScopeValues(owner.ownership_scope).some((value) => mixedUseComponents.includes(value))) {
          next[`owner_scope_${index}`] = 'Choose at least one included use this owner owns.';
        }
      });
      if (!unitMappedProperty && ownerSharesAreValid) {
        const sum = Number(ownerShareTotal.toFixed(2));
        if (Math.abs(sum - 100) > 0.001) next.owner_total = `Ownership percentages must total 100% (currently ${sum}%).`;
      }
      if (mixedUse && owners.length > 1) {
        const unassignedUses = mixedUseComponents.filter((component) => !owners.some((owner) => mixedUseOwnershipScopeValues(owner.ownership_scope).includes(component)));
        if (unassignedUses.length) next.owner_total = 'Assign every included use to at least one owner.';
      }
    }
    if (propertyCanRent && rented === null) next.rented = `Choose whether this ${singleFamily ? 'home' : 'property'} is rented.`;
    if (propertyCanRent && rented) {
      if (renter.source === 'existing' && !renter.contact_id) next.renter_contact = 'Select an existing renter.';
      if (renter.source === 'new' && !renter.name.trim()) next.renter_contact = 'Renter name is required.';
      if (renter.source === 'new' && !renter.email.trim() && !renter.phone.trim()) next.renter_contact = 'Add an email or phone number.';
      if (renter.source === 'new' && renter.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(renter.email.trim())) next.renter_contact = 'Enter a valid email address.';
      const rent = Number(renter.monthly_rent);
      if (!renter.monthly_rent.trim() || !Number.isFinite(rent) || rent <= 0) next.monthly_rent = 'Enter a monthly rent greater than $0.';
      if (!renter.lease_start_date) next.lease_start_date = 'Choose a lease start date.';
      if (renter.lease_term_type === 'fixed') {
        if (!renter.lease_end_date) next.lease_end_date = 'Choose a lease end date.';
        if (renter.lease_start_date && renter.lease_end_date && renter.lease_end_date < renter.lease_start_date) next.lease_end_date = 'End date must be after the start date.';
      }
    }
    return next;
  }, [form, subtype, singleFamily, multifamily, apartment, unitMappedProperty, commercial, industrial, officeBuilding, officeInBuilding, officeFloor, retailCenter, hospitalitySpace, commercialSpaceType, mixedUse, mixedUseComponents, mixedUseFloorPlan, property, existingUnits, propertyCanRent, roomCount, floorCount, floorCapacities, owners, unitOwnerAssignments, rented, renter, pendingUnits, industrialBuildingSubtype, warehouse, distributionCenter, manufacturingPlant, researchFacility, propertyFacilities, customFacilities]);

  const continueStep = () => {
    if (hasPropertyStepErrors(validation, step)) {
      setSaveError('');
      return;
    }
    setSaveError('');
    setStep((current) => Math.min(current + 1, PROPERTY_SETUP_STEPS.length - 1));
  };
  const canSave = Object.keys(validation).length === 0 && !saving;
  const propertyCategoryLabel = PROPERTY_CATEGORIES.find((item) => item.value === category)?.label ?? 'Not selected';
  const propertySubtypeLabel = category
    ? PROPERTY_TYPES_BY_CATEGORY[category].find((item) => item.value === subtype)?.label ?? 'Not selected'
    : 'Not selected';
  const addressSummary = [
    form.address_line1,
    form.address_line2,
    [form.city, form.state, form.postal_code].map((value) => String(value ?? '').trim()).filter(Boolean).join(', '),
    form.country,
  ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ') || 'No address added';
  const layoutSummary = [
    singleFamily ? `${roomCount || '—'} rooms` : '',
    (singleFamily || apartment || mixedUse) && floorCount ? `${floorCount} floors` : '',
    unitMappedProperty ? `${form.units_count ?? '—'} units` : '',
    mixedUse
      ? MIXED_USE_COMPONENTS.filter((component) => mixedUseComponents.includes(component.value)).map((component) => component.label).join(', ')
      : '',
    officeBuilding && officeInBuilding !== null
      ? officeInBuilding ? `Inside a building${officeFloor ? ` · floor ${officeFloor}` : ''}` : 'Standalone'
      : '',
    (retailCenter || hospitalitySpace) ? commercialSpaceType : '',
    industrialBuildingSubtype && form.industrial_in_building !== null
      ? form.industrial_in_building
        ? `Inside a building${form.industrial_floor != null ? ` · floor ${form.industrial_floor}` : ''}`
        : 'Standalone'
      : '',
  ].filter(Boolean).join(' · ') || 'No additional layout details';
  const ownershipSummary = singleFamily || unitMappedProperty || commercial || industrial || mixedUse
    ? owners.map((owner, index) => {
      const selectedContact = contacts.find((contact) => String(contact.id) === owner.contact_id);
      const name = owner.source === 'existing' ? selectedContact?.name ?? owner.name : owner.name;
      const share = unitMappedProperty
        ? owners.length === 1 ? 'All units' : summarizeOwnerUnits(ownerAssignmentKey(owner, index)) || 'No units assigned'
        : `${owner.ownership_percentage || '—'}%`;
      const scope = mixedUse && owners.length > 1
        ? ` · ${MIXED_USE_COMPONENTS.filter((component) => mixedUseOwnershipScopeValues(owner.ownership_scope).includes(component.value)).map((component) => component.label).join(', ') || 'No uses assigned'}`
        : '';
      return `${name.trim() || `Owner ${index + 1}`} · ${share}${scope}`;
    }).join('\n')
    : 'Not required for this property type';
  const selectedFacilitySummary = [
    ...propertyFacilities.map((value) => sharedFacilityOptions.find((option) => option.value === value)?.label ?? value),
    ...customFacilities,
  ].join(', ') || 'No facilities selected';
  const industrialOperationsSummary = [
    ...(warehouse ? form.warehouse_goods ?? [] : []),
    ...(distributionCenter ? form.distribution_goods ?? [] : []),
    ...(manufacturingPlant ? form.manufactured_products ?? [] : []),
    ...(researchFacility ? form.research_focus ?? [] : []),
  ].join(', ') || 'No operational details';
  const renterName = renter.source === 'existing'
    ? contacts.find((contact) => String(contact.id) === renter.contact_id)?.name ?? renter.name
    : renter.name;
  const occupancySummary = !propertyCanRent
    ? 'Not applicable'
    : rented === false
      ? 'Not rented'
      : rented
        ? [
          renterName.trim() || 'Renter not set',
          renter.monthly_rent ? `$${renter.monthly_rent} / month` : 'Rent not set',
          renter.lease_term_type === 'fixed'
            ? [renter.lease_start_date, renter.lease_end_date].filter(Boolean).join(' – ') || 'Lease dates not set'
            : 'Until termination',
        ].join(' · ')
        : 'Not decided';
  const unitRecordsSummary = mixedUse
    ? `${inlineUnitRecords.length} of ${mixedUsePlannedSpaces} planned spaces added`
    : unitMappedProperty
      ? property
        ? `${existingUnits.filter((unit) => unit.property_id === property.id).length} unit records on file`
        : `${inlineUnitRecords.length} of ${configuredUnits || '—'} units added`
      : 'Not applicable';
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError('');
    const extras = {
      ...form,
      name: form.name.trim(),
      property_type: subtype,
      address_line1: form.address_line1?.trim() ?? '',
      address_line2: form.address_line2?.trim() || null,
      city: form.city?.trim() || null,
      state: form.state?.trim() || null,
      postal_code: form.postal_code?.trim() || null,
      country: form.country?.trim() || null,
      units_count: multifamily || apartment ? Number(form.units_count) : null,
      units_under_construction: unitMappedProperty
        && Boolean(form.units_under_construction)
        && (property ? existingUnits.filter((unit) => unit.property_id === property.id).length : pendingUnits.length) < Number(form.units_count),
      unit_ownership_map: unitOwnershipMap,
      property_category: category,
      facilities: propertyFacilities,
      custom_facilities: customFacilities,
      room_count: singleFamily ? Number(roomCount) : null,
      floor_count: singleFamily || apartment || mixedUse ? Number(floorCount) : null,
      floor_unit_counts: apartment ? floorCapacities.map(Number) : [],
      office_in_building: officeBuilding ? officeInBuilding : null,
      office_floor: officeBuilding && officeInBuilding ? Number(officeFloor) : null,
      commercial_space_type: retailCenter || hospitalitySpace ? commercialSpaceType : null,
      mixed_use_components: mixedUse ? mixedUseComponents : [],
      mixed_use_floor_plan: mixedUse ? normalizedMixedUseFloorPlan(mixedUseFloorPlan, mixedUseComponents) : [],
      industrial_in_building: industrialBuildingSubtype ? form.industrial_in_building : null,
      industrial_floor: industrialBuildingSubtype && form.industrial_in_building ? Number(form.industrial_floor) : null,
      warehouse_goods: warehouse ? form.warehouse_goods ?? [] : [],
      distribution_goods: distributionCenter ? form.distribution_goods ?? [] : [],
      distribution_services: distributionCenter ? form.distribution_services ?? [] : [],
      manufactured_products: manufacturingPlant ? form.manufactured_products ?? [] : [],
      production_inputs: manufacturingPlant ? form.production_inputs ?? [] : [],
      research_focus: researchFacility ? form.research_focus ?? [] : [],
      research_inputs: researchFacility ? form.research_inputs ?? [] : [],
      is_rented: propertyCanRent ? Boolean(rented) : false,
      monthly_rent: propertyCanRent && rented ? Number(renter.monthly_rent) : null,
      lease_term_type: propertyCanRent && rented ? renter.lease_term_type : null,
      lease_start_date: propertyCanRent && rented ? renter.lease_start_date : null,
      lease_end_date: propertyCanRent && rented && renter.lease_term_type === 'fixed' ? renter.lease_end_date : null,
    } as PropertyDraft;
    const ownerRows = singleFamily || unitMappedProperty || commercial || industrial || mixedUse ? owners.map((owner, index) => ({
      ...owner,
      name: owner.name.trim(),
      email: owner.email.trim(),
      phone: owner.phone.trim(),
      ownership_percentage: unitMappedProperty
        ? owners.length === 1 ? '100' : ''
        : owner.ownership_percentage.trim(),
      ownership_scope: unitMappedProperty
        ? owners.length === 1 ? 'Entire property' : summarizeOwnerUnits(ownerAssignmentKey(owner, index))
        : mixedUse && owners.length > 1
        ? mixedUseOwnershipScopeValues(owner.ownership_scope).filter((value) => mixedUseComponents.includes(value)).join(',')
        : apartment && owners.length > 1 ? owner.ownership_scope.trim() : '',
    })) : [];
    const renterRow = propertyCanRent && rented ? {
      ...renter,
      name: renter.name.trim(),
      email: renter.email.trim(),
      phone: renter.phone.trim(),
      monthly_rent: renter.monthly_rent.trim(),
    } : null;
    try {
      await onSave(extras, ownerRows, renterRow, pendingUnits);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'We could not save this property. Please try again.');
      setSaving(false);
    }
  };

  return (
      <div data-testid="property-setup-form" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.button type="button" aria-label="Close property setup" data-testid="button-property-setup-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={saving ? undefined : onClose} className="absolute inset-0 cursor-default bg-[#171511]/30 backdrop-blur-[2px]" />
      <motion.section role="dialog" aria-modal="true" aria-labelledby="property-setup-title" initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative flex max-h-[92dvh] w-full max-w-[780px] flex-col overflow-hidden rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] shadow-[0_24px_80px_rgba(25,22,18,.18)]">
        <header className="flex shrink-0 items-start justify-between border-b border-[#ebe8e3] px-5 py-4 sm:px-7">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#f3ebe5] text-[#a96d53]"><Building2 size={17} /></div>
            <div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#a16a52]">Property setup</p><h2 id="property-setup-title" data-testid="text-property-form-title" className="mt-1 text-[16px] font-semibold tracking-[-.02em] text-[#201e1a]">{property ? 'Edit property' : 'Add a property'}</h2><p className="mt-1 max-w-[580px] text-[11px] leading-5 text-[#89847c]">Build a clear operating record for your property and team.</p></div>
          </div>
          <button type="button" data-testid="button-close-property-setup" aria-label="Close form" onClick={onClose} disabled={saving} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e4e2de] text-[#817d76] hover:bg-[#f0eeea] disabled:opacity-50"><X size={14} /></button>
        </header>

        <div className="shrink-0 border-b border-[#ebe8e3] bg-[#f7f5f1] px-5 py-4 sm:px-7">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-[#46423b]">Step {step + 1} <span className="font-normal text-[#969188]">of {PROPERTY_SETUP_STEPS.length}</span></p>
            <p className="text-right text-[10px] text-[#89847c]">{PROPERTY_SETUP_STEPS[step]?.caption}</p>
          </div>
          <div className="grid grid-cols-6 gap-2" role="list" aria-label="Property setup progress">
            {PROPERTY_SETUP_STEPS.map((item, index) => (
              <div key={item.title} role="listitem" aria-current={step === index ? 'step' : undefined}>
                <div className={`h-[3px] rounded-full ${index <= step ? 'bg-[#a96d53]' : 'bg-[#dfdcd5]'}`} />
                <p className={`mt-2 text-[8px] font-semibold uppercase tracking-[.06em] sm:text-[9px] sm:tracking-[.08em] ${index === step ? 'text-[#8f563e]' : index < step ? 'text-[#68645c]' : 'text-[#a8a39b]'}`}>{item.title}</p>
              </div>
            ))}
          </div>
        </div>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .16 }}>
              {step === 0 && <>
                <PropertyStepIntro eyebrow="01 · Property identity" title="What property are you setting up?" description="Start with the name and classification used to organize this property." />
                <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="Property name" required><input autoFocus data-testid="input-property-name" className={inputClass} value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Harbor View Residences" /></Field><FormError message={validation.name} testId="error-property-name" /></div>
                  <div className="sm:col-span-2">
                    <Field label="Property type" required>
                      <FlowPointSelect
                        testId="select-property-category"
                        value={category}
                        onChange={selectCategory}
                        placeholder="Choose a property type"
                        options={PROPERTY_CATEGORIES.map((option) => ({ value: option.value, label: option.label }))}
                      />
                    </Field>
                  </div>
                  {category && <div className="sm:col-span-2">
                    <Field label={`${PROPERTY_CATEGORIES.find((option) => option.value === category)?.label ?? 'Property'} subtype`} required>
                      <FlowPointSelect testId="select-property-subtype" value={subtype} onChange={selectSubtype} placeholder="Choose a subtype" options={[...PROPERTY_TYPES_BY_CATEGORY[category]]} />
                    </Field>
                  </div>}
                  <div className="sm:col-span-2"><FormError message={validation.subtype} testId="error-property-subtype" /></div>
                </div>
              </>}
              {step === 1 && <>
                <PropertyStepIntro eyebrow="02 · Location" title="Where is this property?" description="Add the address your team will use to identify and find the property." />
                <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="Address line 1" required><input data-testid="input-property-address-line1" className={inputClass} value={form.address_line1 ?? ''} onChange={(event) => setField('address_line1', event.target.value)} placeholder="Street address" /></Field><FormError message={validation.address_line1} testId="error-property-address-line1" /></div>
                  <div className="sm:col-span-2"><Field label="Address line 2" hint="optional"><input data-testid="input-property-address-line2" className={inputClass} value={form.address_line2 ?? ''} onChange={(event) => setField('address_line2', event.target.value)} placeholder="Suite, floor, or building" /></Field></div>
                  <Field label="City" required><input data-testid="input-property-city" className={inputClass} value={form.city ?? ''} onChange={(event) => setField('city', event.target.value)} placeholder="City" /><FormError message={validation.city} testId="error-property-city" /></Field>
                  <Field label="State / region" hint="optional"><input data-testid="input-property-region" className={inputClass} value={form.state ?? ''} onChange={(event) => setField('state', event.target.value)} placeholder="State or region" /></Field>
                  <Field label="Postal code" hint="optional"><input data-testid="input-property-postal-code" className={inputClass} value={form.postal_code ?? ''} onChange={(event) => setField('postal_code', event.target.value)} placeholder="Postal code" /></Field>
                  <Field label="Country" hint="optional"><input data-testid="input-property-country" className={inputClass} value={form.country ?? ''} onChange={(event) => setField('country', event.target.value)} placeholder="Country" /></Field>
                </div>
              </>}
              {step === 2 && <PropertyStepIntro eyebrow="03 · Property mapping" title="Map the property" description="Define its physical layout before assigning ownership." />}
              {step === 3 && <PropertyStepIntro eyebrow="04 · Ownership" title="Who owns this property?" description="Add owners and map them to the property or its units." />}
              {step === 4 && <PropertyStepIntro eyebrow="05 · Property details" title="Complete the property setup" description="Add facilities, occupancy, and unit records where they apply." />}

              {step >= 2 && subtype && (
                <AnimatePresence initial={false}>
                  <motion.div key={`${subtype}-${step}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }} data-testid="section-property-details" className="border-t border-[#e9e6e0] pt-6">
                <div className="mb-6 flex items-center gap-2 rounded-[10px] border border-[#e3e8e1] bg-[#f3f6f1] px-3.5 py-2.5 text-[11px] text-[#65786c]">
                  <Check size={13} className="shrink-0" />
                  <span><strong className="font-semibold text-[#485d51]">{PROPERTY_TYPES_BY_CATEGORY[category as PropertyCategory]?.find((option) => option.value === subtype)?.label}</strong> setup · Add operational details that help your team manage this property.</span>
                </div>

                {(residential || commercial || industrial) && (
                  <>
                    {step === 2 && residential && <section className="mb-7" data-testid="section-property-layout">
                      <SectionHeading index="01" eyebrow="Property mapping" title="Map the property" description={unitMappedProperty ? 'Set floor count and total unit capacity before assigning ownership.' : 'Set rooms and floors before assigning ownership.'} />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {singleFamily && <><Field label="Rooms" required><input data-testid="input-property-room-count" className={inputClass} type="number" min="1" step="1" value={roomCount} onChange={(event) => setRoomCount(event.target.value)} placeholder="e.g. 5" /></Field><Field label="Floors" required><input data-testid="input-property-floor-count" className={inputClass} type="number" min="1" step="1" value={floorCount} onChange={(event) => { const value = event.target.value; setFloorCount(value); setFloorCapacities(Array.from({ length: Math.min(Number(value) || 0, 100) }, (_, index) => floorCapacities[index] ?? '')); }} placeholder="e.g. 2" /></Field></>}
                        {apartment && <><Field label="Floors" required><input data-testid="input-property-floor-count" className={inputClass} type="number" min="1" step="1" value={floorCount} onChange={(event) => { const value = event.target.value; setFloorCount(value); setFloorCapacities(Array.from({ length: Math.min(Number(value) || 0, 100) }, (_, index) => floorCapacities[index] ?? '')); }} placeholder="e.g. 4" /></Field><Field label="Total units" required><input data-testid="input-property-unit-count" className={inputClass} type="number" min="2" step="1" value={form.units_count ?? ''} onChange={(event) => setField('units_count', event.target.value ? Number(event.target.value) : null)} placeholder="e.g. 24" /><FormError message={validation.units_count} testId="error-property-unit-count" /></Field></>}
                        {multifamily && <div className="sm:col-span-2"><Field label="Number of units" required><input data-testid="input-property-unit-count" className={inputClass} type="number" min="2" step="1" value={form.units_count ?? ''} onChange={(event) => setField('units_count', event.target.value ? Number(event.target.value) : null)} placeholder="e.g. 8" /></Field><FormError message={validation.units_count} testId="error-property-unit-count" /><p className="mt-1.5 text-[10px] text-[#969188]">Add each planned unit in the unit section below. Mark unfinished units there if construction is still in progress.</p></div>}
                      </div>
                      {singleFamily && <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2"><FormError message={validation.room_count} testId="error-property-room-count" /><FormError message={validation.floor_count} testId="error-property-floor-count" /></div>}
                      {apartment && <>
                        <div className="mt-4 rounded-[11px] border border-[#e8e5de] bg-[#f8f7f4] p-3.5">
                          <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold text-[#48463f]">Units per floor</p><p className="mt-1 text-[10px] text-[#929087]">Capacities across all floors must equal the total units.</p></div><span data-testid="text-floor-capacity-total" className="shrink-0 font-mono text-[11px] text-[#6d7f72]">{floorCapacities.reduce((sum, value) => sum + (Number(value) || 0), 0)} / {form.units_count || 0}</span></div>
                          {floorCapacities.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{floorCapacities.map((capacity, index) => <Field key={index} label={index === 0 ? 'Ground floor' : `Floor ${index}`}><input data-testid={`input-property-floor-capacity-${index}`} className={inputClass} type="number" min="0" step="1" value={capacity} onChange={(event) => setFloorCapacities((current) => current.map((value, i) => i === index ? event.target.value : value))} placeholder="Units" /></Field>)}</div>}
                          <FormError message={validation.floor_count || validation.floor_capacities} testId="error-property-floor-capacities" />
                        </div>
                      </>}
                    </section>}

                    {step === 2 && commercial && <section className="mb-7" data-testid="section-commercial-details">
                      <SectionHeading index="01" eyebrow="Property mapping" title="Configure this property type" description="Set the type-specific layout before assigning ownership." />
                      {officeBuilding && <div className="space-y-3">
                        <Field label="Is this office inside a building?" required>
                          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Office building location">
                            {[{ value: true, label: 'Yes, in a building' }, { value: false, label: 'No, standalone' }].map((choice) => <button key={String(choice.value)} type="button" data-testid={`button-office-in-building-${choice.value ? 'yes' : 'no'}`} aria-pressed={officeInBuilding === choice.value} onClick={() => setOfficeInBuilding(choice.value)} className={`rounded-[9px] border p-3 text-left text-[11px] font-semibold ${officeInBuilding === choice.value ? 'border-[#97ad9b] bg-[#eff4ee] text-[#455c4b]' : 'border-[#e7e4de] bg-white text-[#6f6b63]'}`}>{choice.label}</button>)}
                          </div>
                          <FormError message={validation.office_in_building} />
                        </Field>
                        {officeInBuilding && <Field label="Floor" required hint="Use 0 for ground floor">
                          <input data-testid="input-office-floor" className={inputClass} type="number" min="0" step="1" value={officeFloor} onChange={(event) => setOfficeFloor(event.target.value)} placeholder="e.g. 4" />
                          <FormError message={validation.office_floor} />
                        </Field>}
                      </div>}
                      {retailCenter && <div className="max-w-[440px]">
                        <Field label="Retail center type" required>
                          <FlowPointSelect testId="select-commercial-space-type" value={commercialSpaceType} onChange={setCommercialSpaceType} placeholder="Choose a retail center type" options={[...RETAIL_CENTER_TYPES]} />
                        </Field>
                        <FormError message={validation.commercial_space_type} />
                      </div>}
                      {hospitalitySpace && <div className="max-w-[440px]">
                        <Field label="Hospitality space type" required>
                          <FlowPointSelect testId="select-commercial-space-type" value={commercialSpaceType} onChange={setCommercialSpaceType} placeholder="Choose a space type" options={[...HOSPITALITY_SPACE_TYPES]} />
                        </Field>
                        <FormError message={validation.commercial_space_type} />
                      </div>}
                      {mixedUse && <>
                        <div>
                          <Field label="What does this property include?" required>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {MIXED_USE_COMPONENTS.map((component) => {
                                const checked = mixedUseComponents.includes(component.value);
                                return <button key={component.value} type="button" data-testid={`button-mixed-use-component-${component.value}`} aria-pressed={checked} onClick={() => toggleMixedUseComponent(component.value)} className={`flex min-h-10 items-center gap-2 rounded-[9px] border px-3 text-left text-[11px] font-medium ${checked ? 'border-[#b9cabe] bg-[#edf4ee] text-[#4d6a59]' : 'border-[#e7e4de] bg-white text-[#69665f]'}`}><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${checked ? 'border-[#63816e] bg-[#63816e] text-white' : 'border-[#d5d2ca] bg-white'}`}>{checked && <Check size={11} />}</span>{component.label}</button>;
                              })}
                            </div>
                          </Field>
                          <FormError message={validation.mixed_use_components} />
                        </div>
                        <div className="mt-4 max-w-[260px]">
                          <Field label="Number of floors" required><input data-testid="input-property-floor-count" className={inputClass} type="number" min="1" max="100" step="1" value={floorCount} onChange={(event) => updateMixedUseFloorCount(event.target.value)} placeholder="e.g. 3" /></Field>
                          <FormError message={validation.floor_count} />
                        </div>
                        <div className="mt-4 rounded-[11px] border border-[#e8e5de] bg-[#f8f7f4] p-3.5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><p className="text-[11px] font-semibold text-[#48463f]">Spaces on each floor</p><p className="mt-1 text-[10px] leading-4 text-[#929087]">Enter how many of each selected use exist on every floor. Ground floor is floor 0.</p></div>
                            <span data-testid="text-mixed-use-planned-space-total" className="shrink-0 rounded-full bg-white px-2.5 py-1 font-mono text-[10px] text-[#6d7f72]">{mixedUsePlannedSpaces} planned spaces</span>
                          </div>
                          {mixedUseFloorPlan.length > 0 && mixedUseComponents.length > 0 && <div className="mt-3 space-y-2">
                            {mixedUseFloorPlan.map((floor, floorIndex) => (
                              <div key={floorIndex} data-testid={`card-mixed-use-floor-${floorIndex}`} className="rounded-[9px] border border-[#ebe8e2] bg-white p-3">
                                <p className="mb-2 text-[10px] font-semibold text-[#5b5851]">{floorIndex === 0 ? 'Ground floor · 0' : `Floor ${floorIndex}`}</p>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {mixedUseComponents.map((component) => {
                                    const componentLabel = MIXED_USE_COMPONENTS.find((option) => option.value === component)?.label ?? component;
                                    return <Field key={component} label={componentLabel}>
                                      <input
                                        data-testid={`input-mixed-use-floor-${floorIndex}-${component}`}
                                        className={inputClass}
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={floor[component] ?? ''}
                                        onChange={(event) => updateMixedUseFloorPlanCount(floorIndex, component, event.target.value)}
                                        placeholder="0"
                                      />
                                    </Field>;
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>}
                          <FormError message={validation.mixed_use_floor_plan} testId="error-mixed-use-floor-plan" />
                          <p className="mt-2 text-[10px] leading-4 text-[#817d75]">This plan records the building’s full space count. You can add detailed records for individual spaces below or later.</p>
                        </div>
                      </>}
                    </section>}

                    {step === 2 && industrial && <section className="mb-7" data-testid="section-industrial-details">
                      <SectionHeading index="01" eyebrow="Property mapping" title="Map this industrial property" description="Capture whether this space is standalone or located inside another building." />
                      {industrialBuildingSubtype && <div className="space-y-3">
                        <Field label="Is this property inside a building?" required>
                          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Industrial building location">
                            {[{ value: true, label: 'Yes, in a building' }, { value: false, label: 'No, standalone' }].map((choice) => <button key={String(choice.value)} type="button" data-testid={`button-industrial-in-building-${choice.value ? 'yes' : 'no'}`} aria-pressed={form.industrial_in_building === choice.value} onClick={() => { setField('industrial_in_building', choice.value); if (!choice.value) setField('industrial_floor', null); }} className={`rounded-[9px] border p-3 text-left text-[11px] font-semibold ${form.industrial_in_building === choice.value ? 'border-[#97ad9b] bg-[#eff4ee] text-[#455c4b]' : 'border-[#e7e4de] bg-white text-[#6f6b63]'}`}>{choice.label}</button>)}
                          </div>
                          <FormError message={validation.industrial_in_building} testId="error-industrial-building-location" />
                        </Field>
                        {form.industrial_in_building && <Field label="Floor" required hint="Use 0 for ground floor">
                          <input data-testid="input-industrial-floor" className={inputClass} type="number" min="0" step="1" value={form.industrial_floor ?? ''} onChange={(event) => setField('industrial_floor', event.target.value === '' ? null : Number(event.target.value))} placeholder="e.g. 2" />
                          <FormError message={validation.industrial_floor} testId="error-industrial-floor" />
                        </Field>}
                      </div>}
                       {manufacturingPlant && <p className="rounded-[10px] border border-[#e7e4de] bg-white px-3.5 py-3 text-[10px] leading-4 text-[#77736d]">No additional building mapping is required for this property type. Continue to assign ownership.</p>}
                    </section>}

                    {step === 3 && (singleFamily || unitMappedProperty || commercial || industrial || mixedUse) && (
                      <section className="mb-7" data-testid="section-property-owners">
                        <SectionHeading
                          index="02"
                          eyebrow="Ownership"
                          title="Who owns this property?"
                          description={unitMappedProperty
                            ? owners.length === 1
                              ? 'The sole owner will be assigned to every unit. Add more owners to map different units or shared ownership.'
                              : 'Assign each unit to its owner or owners. Percentages are only needed when a unit is shared.'
                            : mixedUse
                              ? 'Ownership shares must total 100%. For multiple owners, also assign the uses each owner owns.'
                              : 'Add one or more owners. Ownership shares must total 100%.'}
                        />
                        <div className="space-y-3">
                          {owners.map((owner, index) => {
                            const selectedContact = contacts.find((contact) => String(contact.id) === owner.contact_id);
                            const ownerName = owner.source === 'new' ? owner.name : selectedContact?.name ?? owner.name;
                            const ownerKey = ownerAssignmentKey(owner, index);
                            const otherOwnerContactIds = owners.flatMap((otherOwner, otherIndex) =>
                              otherIndex !== index && otherOwner.source === 'existing' && otherOwner.contact_id
                                ? [otherOwner.contact_id]
                                : [],
                            );
                            return (
                              <article key={owner.id ?? `owner-${index}`} data-testid={`card-property-owner-${index}`} className="rounded-[12px] border border-[#e7e4de] bg-white p-3.5 sm:p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0f2ec] text-[#7e8a77]"><UserRound size={13} /></span>
                                    <div><p className="text-[12px] font-semibold text-[#37362f]">{owners.length > 1 ? `Owner ${index + 1}` : 'Property owner'}</p><p className="mt-0.5 text-[10px] text-[#969188]">Select a contact or add one</p></div>
                                  </div>
                                  {owners.length > 1 && <button type="button" data-testid={`button-remove-owner-${index}`} onClick={() => {
                                    setOwners((current) => current.filter((_, ownerIndex) => ownerIndex !== index));
                                    setUnitOwnerAssignments((current) => current.filter((assignment) => assignment.owner_key !== ownerKey));
                                  }} aria-label={`Remove owner ${index + 1}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[#938e85] hover:bg-[#fbefed] hover:text-[#a33e34]"><Trash2 size={13} /></button>}
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <Field label="Entity type" required><FlowPointSelect testId={`select-owner-${index}-entity-type`} value={owner.entity_type} onChange={(value) => setOwner(index, { entity_type: value as OwnerDraft['entity_type'], contact_id: '', source: 'existing' })} placeholder="Choose entity type" options={[{ value: 'individual', label: 'Individual' }, { value: 'company', label: 'Company' }]} /></Field>
                                  {!unitMappedProperty && <Field label="Ownership share" required><div className="relative"><input data-testid={`input-owner-${index}-percentage`} className={`${inputClass} pr-8`} type="number" min="0.01" max="100" step="0.01" value={owner.ownership_percentage} onChange={(event) => setOwner(index, { ownership_percentage: event.target.value })} placeholder="e.g. 100" /><span className="pointer-events-none absolute right-3 top-[11px] text-[11px] text-[#929087]">%</span></div></Field>}
                                  {mixedUse && owners.length > 1 && <div className="sm:col-span-2"><Field label="Uses this owner owns" required hint="Select every included use they own"><div className="grid grid-cols-1 gap-1.5 rounded-[9px] border border-[#e4e2de] bg-white p-2 sm:grid-cols-2">{MIXED_USE_COMPONENTS.filter((component) => mixedUseComponents.includes(component.value)).map((component) => {
                                    const checked = mixedUseOwnershipScopeValues(owner.ownership_scope).includes(component.value);
                                    return <button key={component.value} type="button" data-testid={`button-owner-${index}-scope-${component.value}`} aria-pressed={checked} onClick={() => toggleOwnerMixedUseScope(index, component.value)} className={`flex min-h-8 items-center gap-2 rounded-[7px] px-2 text-left text-[10px] ${checked ? 'bg-[#edf4ee] text-[#4d6a59]' : 'text-[#69665f] hover:bg-[#f7f6f2]'}`}><span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border ${checked ? 'border-[#63816e] bg-[#63816e] text-white' : 'border-[#d5d2ca] bg-white'}`}>{checked && <Check size={10} />}</span>{component.label}</button>;
                                  })}</div></Field></div>}
                                </div>
                                <div className="mt-3"><ContactFields row={owner} index={index} kind="owner" contacts={contacts} entityType={owner.entity_type} excludedContactIds={otherOwnerContactIds} onChange={(patch) => setOwner(index, patch as Partial<OwnerDraft>)} /></div>
                                <FormError message={validation[`owner_${index}`] || validation[`owner_share_${index}`] || validation[`owner_scope_${index}`]} testId={`error-property-owner-${index}`} />
                                {unitMappedProperty && owners.length > 1 && ownerName && <p className="mt-2 text-[10px] text-[#817d75]">Units assigned: {summarizeOwnerUnits(ownerKey) || 'None yet'}</p>}
                              </article>
                            );
                          })}
                        </div>
                        {unitMappedProperty && owners.length === 1 && <div className="mt-3 rounded-[10px] border border-[#dbe5dc] bg-[#f4f7f2] px-3.5 py-3 text-[10px] leading-4 text-[#586b5c]">
                          <strong className="font-semibold">One owner, all units.</strong> This owner will be prefilled and locked on every unit.
                        </div>}
                        {unitMappedProperty && owners.length > 1 && Number.isInteger(configuredUnits) && configuredUnits > 0 && <div className="mt-3 rounded-[11px] border border-[#e8e5de] bg-[#f8f7f4] p-3.5" data-testid="section-unit-ownership-map">
                          <div className="mb-3"><p className="text-[11px] font-semibold text-[#48463f]">Map owners to units</p><p className="mt-1 text-[10px] leading-4 text-[#89867e]">Choose every owner for each unit. If a unit has multiple owners, enter shares totaling 100%. Unit owners will be locked when you add the unit.</p></div>
                          <div className="space-y-2">
                            {Array.from({ length: configuredUnits }, (_, unitIndex) => {
                              const unitNumber = String(unitIndex + 1);
                              const assignments = unitOwnerAssignments.filter((assignment) =>
                                assignment.unit_number === unitNumber
                                && owners.some((owner, index) => ownerAssignmentKey(owner, index) === assignment.owner_key),
                              );
                              return <div key={unitNumber} data-testid={`card-unit-ownership-map-${unitNumber}`} className="rounded-[9px] border border-[#ebe8e2] bg-white p-3">
                                <p className="mb-2 text-[10px] font-semibold text-[#5b5851]">Unit {unitNumber}</p>
                                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                  {owners.map((owner, ownerIndex) => {
                                    const ownerKey = ownerAssignmentKey(owner, ownerIndex);
                                    const selectedContact = contacts.find((contact) => String(contact.id) === owner.contact_id);
                                    const label = owner.source === 'new' ? owner.name || `Owner ${ownerIndex + 1}` : (selectedContact?.name ?? owner.name) || `Owner ${ownerIndex + 1}`;
                                    const selected = assignments.some((assignment) => assignment.owner_key === ownerKey);
                                    return <button key={ownerKey} type="button" role="checkbox" aria-checked={selected} data-testid={`checkbox-unit-${unitNumber}-owner-${ownerIndex}`} onClick={() => setUnitOwnerAssignments((current) => selected
                                      ? current.filter((assignment) => !(assignment.unit_number === unitNumber && assignment.owner_key === ownerKey))
                                      : [...current, { unit_number: unitNumber, owner_key: ownerKey, ownership_percentage: '' }])} className={`flex min-h-9 items-center gap-2 rounded-[8px] border px-2.5 text-left text-[10px] ${selected ? 'border-[#b9cabe] bg-[#edf4ee] text-[#4d6a59]' : 'border-[#e7e4de] bg-white text-[#69665f] hover:bg-[#f8faf7]'}`}><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${selected ? 'border-[#63816e] bg-[#63816e] text-white' : 'border-[#d5d2ca] bg-white'}`}>{selected && <Check size={10} />}</span><span className="truncate">{label}</span></button>;
                                  })}
                                </div>
                                {assignments.length > 1 && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {assignments.map((assignment) => {
                                    const ownerIndex = owners.findIndex((owner, index) => ownerAssignmentKey(owner, index) === assignment.owner_key);
                                    const owner = owners[ownerIndex];
                                    const contact = owner ? contacts.find((item) => String(item.id) === owner.contact_id) : undefined;
                                    const label = owner?.source === 'new' ? owner.name || `Owner ${ownerIndex + 1}` : contact?.name ?? owner?.name ?? `Owner ${ownerIndex + 1}`;
                                    return <Field key={assignment.owner_key} label={`${label} share (%)`} required><input data-testid={`input-unit-${unitNumber}-owner-${ownerIndex}-percentage`} className={inputClass} type="number" min="0.01" max="100" step="0.01" value={assignment.ownership_percentage} onChange={(event) => setUnitOwnerAssignments((current) => current.map((item) => item.unit_number === unitNumber && item.owner_key === assignment.owner_key ? { ...item, ownership_percentage: event.target.value } : item))} placeholder="e.g. 50" /></Field>;
                                  })}
                                </div>}
                              </div>;
                            })}
                          </div>
                          <FormError message={validation.unit_ownership_map} testId="error-unit-ownership-map" />
                        </div>}
                        {ownerSharesCanBeSummed && hasEnteredOwnerShare && !unitMappedProperty && (Math.abs(ownerShareTotal - 100) > 0.001 || hasUnenteredOwnerShare) && <div role="status" aria-live="polite" data-testid="notice-owner-share-total" className="mt-3 rounded-[9px] border border-[#ead9b4] bg-[#fff9eb] px-3 py-2 text-[10px] leading-[1.5] text-[#836422]">{ownerShareTotal < 100 ? `Ownership is currently ${formatOwnershipShare(ownerShareTotal)}%. Add another owner for the remaining ${formatOwnershipShare(100 - ownerShareTotal)}%, or adjust the shares so they total 100%.` : ownerShareTotal > 100 ? `Ownership currently totals ${formatOwnershipShare(ownerShareTotal)}%. Reduce the shares so they total 100%.` : 'All 100% is already allocated. Reduce the current shares before assigning another owner.'}</div>}
                        {owners.length < 20 && <button type="button" data-testid="button-add-property-owner" onClick={() => setOwners((current) => [...current, blankOwner()])} className="mt-3 flex h-9 items-center gap-2 rounded-[9px] border border-dashed border-[#d8d5ce] px-3 text-[11px] font-semibold text-[#6f6b63] transition-colors hover:border-[#aebcaf] hover:bg-[#f3f6f1] hover:text-[#4f6d58]"><Plus size={13} />Add another owner</button>}
                        <FormError message={validation.owners || validation.owner_total} testId="error-property-owner-total" />
                      </section>
                    )}

                    {step === 4 && (singleFamily || multifamily || apartment || commercial || mixedUse || industrial) && (
                      <section className="mb-7" data-testid="section-property-facilities">
                        <SectionHeading index="03" eyebrow="Property details" title="Facilities & features" description={mixedUse ? 'Optional. Select shared facilities for the uses included in this property, or add a facility that isn’t listed.' : commercial || industrial ? 'Optional. Select facilities available at this property, or add a facility that isn’t listed.' : apartment ? 'Optional. Select building amenities and home-style shared facilities.' : 'Optional. Select what’s available, or add a facility that isn’t listed.'} />
                        <FacilityPicker options={sharedFacilityOptions} value={propertyFacilities} onChange={setFacilities} testId="property-facility-picker" />
                        <FormError message={validation.facilities} testId="error-property-facilities" />
                        <div className="mt-3 flex gap-2"><input data-testid="input-property-custom-facility" className={inputClass} value={customFacility} onChange={(event) => setCustomFacility(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (customFacility.trim() && !customFacilities.includes(customFacility.trim())) setCustomFacilities((current) => [...current, customFacility.trim()]); setCustomFacility(''); } }} placeholder="Add another facility" /><button type="button" data-testid="button-add-custom-facility" onClick={() => { if (customFacility.trim() && !customFacilities.includes(customFacility.trim())) setCustomFacilities((current) => [...current, customFacility.trim()]); setCustomFacility(''); }} disabled={!customFacility.trim()} className="flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] border border-[#dcd9d2] px-3 text-[11px] font-semibold text-[#66635b] transition-colors hover:bg-[#f3f2ee] disabled:cursor-not-allowed disabled:opacity-45"><Plus size={13} />Add</button></div>
                        {customFacilities.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{customFacilities.map((facility) => <span key={facility} data-testid={`chip-custom-facility-${facility}`} className="inline-flex items-center gap-1 rounded-full bg-[#eaf0e9] px-2.5 py-1 text-[10px] text-[#526d5b]">{facility}<button type="button" data-testid={`button-remove-facility-${facility}`} aria-label={`Remove ${facility}`} onClick={() => setCustomFacilities((current) => current.filter((item) => item !== facility))}><X size={11} /></button></span>)}</div>}
                      </section>
                    )}

                    {step === 4 && industrial && <section className="mb-7" data-testid="section-industrial-operations">
                      <SectionHeading index="04" eyebrow="Operations" title="What happens at this property?" description="Add the goods, products, or research focus that help your team understand this site." />
                      {warehouse && <div>
                        <Field label="Goods stored" required><TagListInput id="input-property-warehouse-goods" value={form.warehouse_goods ?? []} onChange={(value) => updateIndustrialTags('warehouse_goods', value)} placeholder="Type a good and press Enter" suggestions={WAREHOUSE_GOODS} /></Field>
                        <FormError message={validation.warehouse_goods} testId="error-property-warehouse-goods" />
                      </div>}
                      {distributionCenter && <div className="space-y-4">
                        <div><Field label="Goods handled" required><TagListInput id="input-property-distribution-goods" value={form.distribution_goods ?? []} onChange={(value) => updateIndustrialTags('distribution_goods', value)} placeholder="Type a good and press Enter" suggestions={DISTRIBUTION_GOODS} /></Field><FormError message={validation.distribution_goods} testId="error-property-distribution-goods" /></div>
                        <Field label="Services provided" hint="optional"><TagListInput id="input-property-distribution-services" value={form.distribution_services ?? []} onChange={(value) => updateIndustrialTags('distribution_services', value)} placeholder="Type a service and press Enter" suggestions={DISTRIBUTION_SERVICES} /></Field>
                      </div>}
                      {manufacturingPlant && <div className="space-y-4">
                        <div><Field label="Products manufactured" required><TagListInput id="input-property-manufactured-products" value={form.manufactured_products ?? []} onChange={(value) => updateIndustrialTags('manufactured_products', value)} placeholder="Type a product and press Enter" suggestions={MANUFACTURED_PRODUCT_SUGGESTIONS} /></Field><FormError message={validation.manufactured_products} testId="error-property-manufactured-products" /></div>
                        <Field label="Production inputs" hint="optional"><TagListInput id="input-property-production-inputs" value={form.production_inputs ?? []} onChange={(value) => updateIndustrialTags('production_inputs', value)} placeholder="Type an input and press Enter" suggestions={PRODUCTION_INPUT_SUGGESTIONS} /></Field>
                      </div>}
                      {researchFacility && <div className="space-y-4">
                        <div><Field label="Research focus" required><TagListInput id="input-property-research-focus" value={form.research_focus ?? []} onChange={(value) => updateIndustrialTags('research_focus', value)} placeholder="Type a focus and press Enter" suggestions={RESEARCH_FOCUS_SUGGESTIONS} /></Field><FormError message={validation.research_focus} testId="error-property-research-focus" /></div>
                        <Field label="Research inputs" hint="optional"><TagListInput id="input-property-research-inputs" value={form.research_inputs ?? []} onChange={(value) => updateIndustrialTags('research_inputs', value)} placeholder="Type an input and press Enter" suggestions={RESEARCH_INPUT_SUGGESTIONS} /></Field>
                      </div>}
                    </section>}

                    {step === 4 && propertyCanRent && (
                      <section data-testid="section-property-rental">
                        <SectionHeading index="04" eyebrow="Occupancy" title={`Is this ${singleFamily ? 'home' : 'property'} rented?`} description={`Add the current renter and lease details, or leave the ${singleFamily ? 'home' : 'property'} unoccupied.`} />
                        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Rental status">
                          {[{ value: false, title: 'Not rented', copy: 'No active renter' }, { value: true, title: 'Rented', copy: 'Add renter & lease' }].map((choice) => <button key={String(choice.value)} type="button" data-testid={`button-property-rented-${choice.value ? 'yes' : 'no'}`} aria-pressed={rented === choice.value} onClick={() => setRented(choice.value)} className={`rounded-[10px] border p-3 text-left transition-colors ${rented === choice.value ? 'border-[#97ad9b] bg-[#eff4ee]' : 'border-[#e7e4de] bg-white hover:border-[#d1d7cd]'}`}><span className="block text-[12px] font-semibold text-[#45443d]">{choice.title}</span><span className="mt-1 block text-[10px] text-[#949087]">{choice.copy}</span></button>)}
                        </div>
                        <FormError message={validation.rented} testId="error-property-rented" />
                        {rented && <div data-testid="section-property-renter" className="mt-3 rounded-[12px] border border-[#e7e4de] bg-white p-3.5 sm:p-4">
                          <ContactFields row={renter} index={0} kind="renter" contacts={contacts} onChange={(patch) => setRenterFields(patch as Partial<PropertyRenterDraft>)} />
                          <FormError message={validation.renter_contact} testId="error-property-renter-contact" />
                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Monthly rent" required><div className="relative"><span className="pointer-events-none absolute left-3 top-[11px] text-[12px] text-[#88847c]">$</span><input data-testid="input-property-monthly-rent" className={`${inputClass} pl-7`} type="number" min="0.01" step="0.01" value={renter.monthly_rent} onChange={(event) => setRenterFields({ monthly_rent: event.target.value })} placeholder="2,450" /></div><FormError message={validation.monthly_rent} testId="error-property-monthly-rent" /></Field>
                            <Field label="Contract duration" required><FlowPointSelect testId="select-property-lease-duration" value={renter.lease_term_type} onChange={(value) => setRenterFields({ lease_term_type: value as PropertyRenterDraft['lease_term_type'] })} placeholder="Choose duration" options={[{ value: 'fixed', label: 'Fixed term' }, { value: 'until_termination', label: 'Until termination' }]} /></Field>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Lease start date" required><input data-testid="input-property-lease-start" className={inputClass} type="date" value={renter.lease_start_date} onChange={(event) => setRenterFields({ lease_start_date: event.target.value })} /><FormError message={validation.lease_start_date} testId="error-property-lease-start" /></Field>{renter.lease_term_type === 'fixed' && <Field label="Lease end date" required><input data-testid="input-property-lease-end" className={inputClass} type="date" min={renter.lease_start_date || undefined} value={renter.lease_end_date} onChange={(event) => setRenterFields({ lease_end_date: event.target.value })} /><FormError message={validation.lease_end_date} testId="error-property-lease-end" /></Field>}</div>
                          {renter.lease_term_type === 'until_termination' && <p data-testid="text-property-lease-open-ended" className="mt-3 rounded-[8px] bg-[#f5f4f0] px-3 py-2 text-[10px] leading-4 text-[#7e7a72]">This contract has no fixed end date.</p>}
                        </div>}
                      </section>
                    )}
                  </>
                )}
                {step === 4 && ((!property && (multifamily || apartment || mixedUse)) || (Boolean(property) && unitMappedProperty)) && (
                  <section className="mt-7 border-t border-[#e9e6e0] pt-6" data-testid="section-property-inline-units">
                    <SectionHeading
                      index="05"
                      eyebrow={mixedUse ? 'Space details' : 'Unit details'}
                      title={property ? 'Unit records' : mixedUse ? 'Add detailed space records' : 'Add units now'}
                      description={property
                        ? 'Manage individual units from the property page. Update the construction status here when units are not ready yet.'
                        : mixedUse
                          ? 'The floor plan above sets the building’s counts. Add individual spaces now, or create them later from the property card.'
                          : 'Set up homes here, or create the property first and add units from its card.'}
                    />
                    {property ? (
                      <p className="mb-3 rounded-[10px] border border-[#e7e4de] bg-white px-3 py-3 text-[10px] text-[#77736d]">
                        {existingUnits.filter((unit) => unit.property_id === property.id).length} of {configuredUnits} configured units are recorded. Add or edit unit records from the property page.
                      </p>
                    ) : (
                      <>
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-semibold text-[#37362f]">{mixedUse ? 'Planned spaces' : 'Configured units'}</p>
                            <p className="mt-1 text-[10px] leading-4 text-[#969188]">{mixedUse ? 'Track each floor-plan space as you add it.' : 'Add every configured unit, or mark the remaining units as under construction.'}</p>
                          </div>
                          <span data-testid="text-inline-unit-count" className="rounded-full bg-[#f0f2ec] px-2.5 py-1 text-[10px] font-semibold text-[#617565]">{mixedUse ? `${inlineUnitRecords.length} / ${mixedUsePlannedSpaces} planned spaces` : `${inlineUnitRecords.length} / ${configuredUnits || '—'} units`}</span>
                        </div>
                        {!inlineLayoutReady && <p className="mb-3 rounded-[9px] bg-[#f6f5f1] px-3 py-2 text-[10px] text-[#8d8981]">{mixedUse ? 'Select at least one use, set the floor count, and enter a count for each use on every floor above.' : apartment ? 'Set the total units and floor capacities above before adding apartment records.' : 'Set the total number of units above before adding homes.'}</p>}
                        {inlineUnitRecords.length > 0 ? <div className="mb-3 space-y-2">{inlineUnitRecords.map((unit, index) => <article key={`${unit.unit_number}-${index}`} data-testid={`card-inline-unit-${index}`} className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e7e4de] bg-white px-3 py-2.5"><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#45433c]">{unit.unit_number}</p><p className="mt-0.5 text-[10px] text-[#969188]">{mixedUse ? `${unitTypeLabel(unit.unit_type)} · ${unit.floor === 0 ? 'Ground floor' : `Floor ${unit.floor}`}` : apartment ? unit.floor === 0 ? 'Ground floor' : `Floor ${unit.floor}` : `${unit.floor_count} interior floor${unit.floor_count === 1 ? '' : 's'}`} {!mixedUse && `· ${unit.room_count} rooms`}</p></div><button type="button" data-testid={`button-remove-inline-unit-${index}`} onClick={() => setPendingUnits((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove unit ${unit.unit_number}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#938e85] hover:bg-[#fbefed] hover:text-[#a33e34]"><Trash2 size={13} /></button></article>)}</div> : <p className="mb-3 rounded-[10px] border border-dashed border-[#d8d5ce] px-3 py-4 text-center text-[10px] text-[#9a958d]">No units added yet.</p>}
                        <FormError message={validation.inline_units || validation.inline_floor_capacity || validation.inline_floor} />
                        <button type="button" data-testid="button-add-inline-unit" disabled={!inlineLayoutReady || inlineUnitLimitReached} onClick={() => setUnitEditorOpen(true)} className="flex h-9 items-center gap-2 rounded-[9px] border border-dashed border-[#d8d5ce] px-3 text-[11px] font-semibold text-[#6f6b63] transition-colors hover:border-[#aebcaf] hover:bg-[#f3f6f1] hover:text-[#4f6d58] disabled:cursor-not-allowed disabled:opacity-45"><Plus size={13} />{inlineUnitLimitReached ? mixedUse ? 'Space limit reached' : 'Unit limit reached' : mixedUse ? 'Add a space' : 'Add a unit'}</button>
                        {!inlineLayoutReady && <p className="mt-2 text-[10px] text-[#9a958d]">{mixedUse ? 'Complete the per-floor use counts above first.' : apartment ? 'Enter the total unit count and valid capacity for every floor first.' : 'Enter the total unit count first.'}</p>}
                      </>
                    )}
                    {unitMappedProperty && unitsAreMissing && <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-[#e5e2dc] bg-white px-3.5 py-3">
                      <input
                        data-testid="checkbox-units-under-construction"
                        type="checkbox"
                        checked={Boolean(form.units_under_construction)}
                        onChange={(event) => setField('units_under_construction', event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#55776b]"
                      />
                      <span><span className="block text-[11px] font-semibold text-[#45443d]">Other units are still under construction</span><span className="mt-1 block text-[10px] leading-4 text-[#8e8981]">Select this only when some of the configured units cannot be added yet. You can complete them later.</span></span>
                    </label>}
                  </section>
                )}
                {!residential && !commercial && !industrial && <div data-testid="text-property-basic-setup" className="rounded-[10px] border border-[#e7e4de] bg-white px-4 py-3 text-[11px] leading-5 text-[#817d75]">The location and property classification are ready. Additional setup for this property type will be available in a later step.</div>}
                {step === 5 && (
                  <section data-testid="section-property-review">
                    <PropertyStepIntro
                      eyebrow="06 · Final review"
                      title="Review the property setup"
                      description="Confirm the property details before saving. Use Edit to return to any step."
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <PropertyReviewCard title="Property identity" testId="property-review-identity" onEdit={() => { setSaveError(''); setStep(0); }}>
                        <PropertyReviewDetail label="Name" value={form.name.trim()} />
                        <PropertyReviewDetail label="Type" value={`${propertyCategoryLabel} · ${propertySubtypeLabel}`} />
                      </PropertyReviewCard>
                      <PropertyReviewCard title="Location" testId="property-review-location" onEdit={() => { setSaveError(''); setStep(1); }}>
                        <PropertyReviewDetail label="Address" value={addressSummary} />
                      </PropertyReviewCard>
                      <PropertyReviewCard title="Property mapping" testId="property-review-mapping" onEdit={() => { setSaveError(''); setStep(2); }}>
                        <PropertyReviewDetail label="Layout" value={layoutSummary} />
                      </PropertyReviewCard>
                      <PropertyReviewCard title="Ownership" testId="property-review-ownership" onEdit={() => { setSaveError(''); setStep(3); }}>
                        <PropertyReviewDetail label="Owners" value={ownershipSummary} />
                      </PropertyReviewCard>
                      <PropertyReviewCard title="Facilities & occupancy" testId="property-review-details" onEdit={() => { setSaveError(''); setStep(4); }}>
                        <PropertyReviewDetail label="Facilities" value={selectedFacilitySummary} />
                        {industrial && <PropertyReviewDetail label="Operations" value={industrialOperationsSummary} />}
                        <PropertyReviewDetail label="Occupancy" value={occupancySummary} />
                        <PropertyReviewDetail label="Unit records" value={unitRecordsSummary} />
                      </PropertyReviewCard>
                    </div>
                  </section>
                )}
              </motion.div>
                </AnimatePresence>
              )}
            </motion.div>
          </AnimatePresence>

          {saveError && <div data-testid="error-property-save" role="alert" className="mt-5 flex items-start gap-2 rounded-[9px] border border-[#efd2ce] bg-[#fff7f5] px-3.5 py-3 text-[11px] leading-4 text-[#a33e34]"><AlertCircle size={14} className="mt-0.5 shrink-0" />{saveError}</div>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#ebe8e3] bg-[#fbfaf8] px-5 py-4 sm:px-7">
          <button type="button" data-testid="button-property-step-back" onClick={() => { setSaveError(''); setStep((current) => Math.max(current - 1, 0)); }} disabled={step === 0 || saving} className="flex h-9 items-center gap-2 rounded-[9px] border border-[#e4e2de] px-3 text-[11px] font-semibold text-[#625e57] hover:bg-[#f0eeea] disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft size={13} />Back</button>
          <div className="flex items-center gap-2">
            <button type="button" data-testid="button-cancel-property-setup" onClick={onClose} disabled={saving} className="hidden h-9 rounded-[9px] px-3 text-[11px] font-medium text-[#77736d] hover:bg-[#f0eeea] disabled:opacity-50 sm:block">Cancel</button>
            {step < PROPERTY_SETUP_STEPS.length - 1
              ? <button type="button" data-testid="button-property-step-continue" onClick={continueStep} disabled={saving} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#a96d53] px-4 text-[11px] font-semibold text-white shadow-[0_2px_5px_rgba(92,54,37,.12)] hover:bg-[#925a43] disabled:opacity-50">Continue<ChevronRight size={13} /></button>
              : <button type="button" data-testid="button-save-property-setup" onClick={save} disabled={!canSave} title={!canSave && Object.keys(validation).length ? 'Complete the required fields to continue' : undefined} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#a96d53] px-4 text-[11px] font-semibold text-white shadow-[0_2px_5px_rgba(92,54,37,.12)] hover:bg-[#925a43] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}{saving ? 'Saving property' : property ? 'Save changes' : 'Create property'}</button>}
          </div>
        </footer>
      </motion.section>
      {unitEditorOpen && (multifamily || apartment || mixedUse) && <UnitSetupModal property={previewProperty} units={[...existingUnits.filter((unit) => unit.property_id === previewProperty.id), ...inlineUnitRecords]} contacts={inlineOwnerData.contacts} relationships={inlineOwnerData.relationships} onSave={async (payload) => { setPendingUnits((current) => [...current, { ...payload, draft: { ...payload.draft, property_id: previewProperty.id } }]); setUnitEditorOpen(false); }} onClose={() => setUnitEditorOpen(false)} />}
    </div>
  );
}
