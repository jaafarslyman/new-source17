import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, MapPin, Pencil, Trash2, UserRound, Users, X, Zap,
} from 'lucide-react';
import {
  APARTMENT_BUILDING_FACILITIES,
  COMMERCIAL_FACILITIES,
  DISTRIBUTION_CENTER_FACILITIES,
  HOSPITALITY_FACILITIES,
  HOSPITALITY_SPACE_TYPES,
  HOME_FACILITIES,
  INDUSTRIAL_SHARED_FACILITIES,
  MANUFACTURING_PLANT_FACILITIES,
  MIXED_USE_COMPONENTS,
  mixedUseOwnershipScopeLabel,
  mixedUseFloorPlanSummary,
  OFFICE_FACILITIES,
  propertyAddress,
  propertyCategoryLabel,
  propertyTypeLabel,
  RESEARCH_FACILITY_FACILITIES,
  RETAIL_CENTER_FACILITIES,
  RETAIL_CENTER_TYPES,
  RETAIL_UNIT_FACILITIES,
  supportsPropertyRental,
  type Property,
  WAREHOUSE_FACILITIES,
} from '@/lib/propertiesTypes';
import type { Contact, ContactPropertyRelationship } from '@/lib/contactsTypes';
import type { Unit } from '@/lib/unitsTypes';

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="border-b border-[#f0eeeb] py-3 last:border-0">
      <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#9b968d]">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.5] text-[#37342f]">{value}</p>
    </div>
  );
}

function PropertyOwners({ property, contacts, ownerships }: { property: Property; contacts: Contact[]; ownerships: ContactPropertyRelationship[] }) {
  const linked = ownerships.filter((relationship) => relationship.property_id === property.id && !relationship.unit_id && relationship.relationship_type === 'owner');
  return <section className="mt-4 rounded-[14px] border border-[#e9e6e1] bg-white p-5">
    <div className="mb-3 flex items-center justify-between"><div><h3 className="text-[13px] font-semibold text-[#302d28]">Owners</h3><p className="mt-1 text-[11px] text-[#9a958d]">Contacts who own this property.</p></div><Users size={16} className="text-[#aaa59d]" /></div>
    {linked.length === 0 ? <p className="rounded-[10px] border border-dashed border-[#d9d5ce] px-4 py-6 text-center text-[11px] text-[#97928a]">No owners linked to this property.</p> : <div className="space-y-2">{linked.map((relationship) => {
      const contact = contacts.find((item) => String(item.id) === String(relationship.contact_id));
      const ownershipScope = relationship.ownership_scope
        ? property.property_type === 'mixed_use_development'
          ? mixedUseOwnershipScopeLabel(relationship.ownership_scope)
          : relationship.ownership_scope
        : null;
      const ownership = relationship.ownership_percentage !== null && relationship.ownership_percentage !== undefined
        ? `${relationship.ownership_percentage}% ownership${ownershipScope ? ` · ${ownershipScope}` : ''}`
        : ownershipScope || 'Ownership details unavailable';
      return <div key={relationship.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-[#f0eeeb] px-3 py-2.5"><div className="flex min-w-0 items-center gap-2.5"><div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f1eee9] text-[#706b62]"><UserRound size={14} /></div><div className="min-w-0"><p className="truncate text-[12px] font-semibold text-[#35322e]">{contact?.name ?? 'Contact unavailable'}</p><p className="mt-0.5 truncate text-[10px] text-[#9b968d]">{contact?.email ?? contact?.phone ?? 'No contact details'}</p></div></div><span className="max-w-[45%] text-right text-[10px] font-semibold text-[#625e57]">{ownership}</span></div>;
    })}</div>}
  </section>;
}

interface PropertyProfileModalProps {
  property: Property;
  contacts: Contact[];
  ownerships: ContactPropertyRelationship[];
  units: Unit[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function PropertyProfileModal({ property, contacts, ownerships, units, onClose, onEdit, onDelete }: PropertyProfileModalProps) {
  const propertyUnits = units.filter((unit) => unit.property_id === property.id);
  const isSingleHome = property.property_type === 'single_family_home';
  const isMixedUse = property.property_type === 'mixed_use_development';
  const hasUnitRecords = property.property_type === 'multifamily_units'
    || property.property_type === 'apartment_building'
    || isMixedUse;
  const propertyLevelRental = isSingleHome || ['office_building', 'retail_center', 'restaurant_hospitality'].includes(property.property_type ?? '');
  const totalUnits = isMixedUse
    ? (property.mixed_use_floor_plan ?? []).reduce((total, floor) => total + Object.values(floor).reduce((sum, value) => sum + Number(value || 0), 0), 0)
    : property.units_count;
  const occupiedUnits = propertyLevelRental ? Number(Boolean(property.is_rented)) : propertyUnits.filter((unit) => unit.status === 'occupied').length;
  const vacantUnits = propertyLevelRental ? Number(!property.is_rented) : propertyUnits.filter((unit) => unit.status === 'vacant').length;
  const propertyRenter = ownerships.find((relationship) => relationship.property_id === property.id && !relationship.unit_id && relationship.relationship_type === 'tenant');
  const renterName = contacts.find((contact) => String(contact.id) === String(propertyRenter?.contact_id))?.name;
  const commercialSpaceType = [...RETAIL_CENTER_TYPES, ...HOSPITALITY_SPACE_TYPES].find((item) => item.value === property.commercial_space_type)?.label;
  const mixedUseSummary = property.mixed_use_components?.map((value) => MIXED_USE_COMPONENTS.find((item) => item.value === value)?.label ?? value).join(', ');
  const facilityOptions = [
    ...HOME_FACILITIES,
    ...APARTMENT_BUILDING_FACILITIES,
    ...COMMERCIAL_FACILITIES,
    ...OFFICE_FACILITIES,
    ...RETAIL_CENTER_FACILITIES,
    ...RETAIL_UNIT_FACILITIES,
    ...HOSPITALITY_FACILITIES,
    ...WAREHOUSE_FACILITIES,
    ...DISTRIBUTION_CENTER_FACILITIES,
    ...MANUFACTURING_PLANT_FACILITIES,
    ...RESEARCH_FACILITY_FACILITIES,
    ...INDUSTRIAL_SHARED_FACILITIES,
  ];
  const facilityLabel = (value: string) => facilityOptions.find((option) => option.value === value)?.label
    ?? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const selectedFacilities = [...new Set([...(property.facilities ?? []), ...(property.custom_facilities ?? [])])];
  const operationalDetails = [
    { label: 'Goods stored', value: property.warehouse_goods?.join(', ') },
    { label: 'Goods handled', value: property.distribution_goods?.join(', ') },
    { label: 'Distribution operations', value: property.distribution_services?.join(', ') },
    { label: 'Products manufactured', value: property.manufactured_products?.join(', ') },
    { label: 'Production inputs', value: property.production_inputs?.join(', ') },
    { label: 'Research focus', value: property.research_focus?.join(', ') },
    { label: 'Research inputs', value: property.research_inputs?.join(', ') },
  ].filter((item) => Boolean(item.value));
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" />
        <motion.div
          initial={{ opacity: 0, y: 12, scale: .98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: .98 }}
          className="relative flex max-h-[94vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] shadow-[0_24px_80px_rgba(25,22,18,.18)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="property-profile-title"
        >
          <header className="flex flex-shrink-0 items-center justify-between border-b border-[#ebe8e3] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-[#eeebe5] text-[#706b62]"><Building2 size={19} strokeWidth={1.6} /></div>
              <div className="min-w-0">
                <h2 id="property-profile-title" className="truncate text-[17px] font-semibold tracking-[-.02em] text-[#151412]">{property.name}</h2>
                <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-[#858078]"><MapPin size={11} />{propertyAddress(property) || 'Address unavailable'}</p>
              </div>
            </div>
            <div className="ml-3 flex flex-shrink-0 items-center gap-2">
              <button data-testid="button-edit-property-profile" onClick={onEdit} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e0ddd7] bg-white px-3 text-[11px] font-semibold text-[#4d4942] hover:bg-[#f2f0ec]"><Pencil size={12} />Edit</button>
              <button data-testid="button-delete-property-profile" onClick={onDelete} className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#efd0cc] bg-white px-3 text-[11px] font-semibold text-[#b33d32] hover:bg-[#fff2f0]"><Trash2 size={12} />Delete</button>
              <button data-testid="button-close-property-profile" onClick={onClose} aria-label="Close property profile" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e4e2de] text-[#817d76] hover:bg-[#f0eeea] hover:text-[#151412]"><X size={14} /></button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <section className="rounded-[14px] border border-[#e9e6e1] bg-white p-5">
                <div className="mb-3 flex items-center justify-between"><div><h3 className="text-[13px] font-semibold text-[#302d28]">Overview</h3><p className="mt-1 text-[11px] text-[#9a958d]">The essentials your team needs at a glance.</p></div><Building2 size={16} className="text-[#aaa59d]" /></div>
                <div className="grid gap-x-7 sm:grid-cols-2">
                  <InfoRow label="Category" value={propertyCategoryLabel(property.property_category)} />
                  <InfoRow label="Property type" value={propertyTypeLabel(property.property_type)} />
                  {property.property_type === 'office_building' && <>
                    <InfoRow label="Inside a building" value={property.office_in_building === null ? null : property.office_in_building ? 'Yes' : 'No'} />
                    <InfoRow label="Office floor" value={property.office_in_building ? property.office_floor === 0 ? 'Ground floor' : property.office_floor : null} />
                  </>}
                  {property.property_type === 'warehouse' || property.property_type === 'distribution_center' || property.property_type === 'research_development_facility' ? <>
                    <InfoRow label="Inside a building" value={property.industrial_in_building === null ? null : property.industrial_in_building ? 'Yes' : 'No'} />
                    <InfoRow label="Industrial floor" value={property.industrial_in_building ? property.industrial_floor === 0 ? 'Ground floor' : property.industrial_floor : null} />
                  </> : null}
                  {(property.property_type === 'retail_center' || property.property_type === 'restaurant_hospitality') && <InfoRow label={property.property_type === 'retail_center' ? 'Retail center type' : 'Hospitality space type'} value={commercialSpaceType} />}
                  {isMixedUse && <>
                    <InfoRow label="Included uses" value={mixedUseSummary} />
                    <InfoRow label="Mixed-use floor plan" value={mixedUseFloorPlanSummary(property.mixed_use_floor_plan, property.mixed_use_components)} />
                  </>}
                  {hasUnitRecords && <InfoRow label={isMixedUse ? 'Planned spaces' : 'Planned units'} value={totalUnits} />}
                  {property.units_under_construction && <InfoRow label="Construction status" value="Other units are still under construction" />}
                  <InfoRow label="Building floors" value={property.floor_count} />
                  <InfoRow label="Per-floor unit capacity" value={property.floor_unit_counts?.map((count, index) => `${index === 0 ? 'Ground floor' : `Floor ${index}`}: ${count}`).join(' · ')} />
                  <InfoRow label="Rooms" value={property.room_count} />
                  <InfoRow label="Address line 1" value={property.address_line1} />
                  <InfoRow label="Address line 2" value={property.address_line2} />
                  <InfoRow label="City" value={property.city} />
                  <InfoRow label="State / region" value={property.state} />
                  <InfoRow label="Postal code" value={property.postal_code} />
                  <InfoRow label="Country" value={property.country} />
                </div>
              </section>
              {hasUnitRecords && <section className="rounded-[14px] border border-[#e9e6e1] bg-white p-5">
                 <div className="mb-3 flex items-center justify-between"><div><h3 className="text-[13px] font-semibold text-[#302d28]">Units</h3><p className="mt-1 text-[11px] text-[#9a958d]">Manage units from the property card.</p></div><Zap size={16} className="text-[#aaa59d]" /></div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="flex items-center justify-between rounded-[9px] bg-[#faf9f7] px-3 py-2.5"><span className="text-[11px] text-[#77736d]">{isMixedUse ? 'Planned spaces' : 'Total units'}</span><span className="text-[11px] font-medium text-[#37342f]">{totalUnits ?? '—'}</span></div>
                  <div className="flex items-center justify-between rounded-[9px] bg-[#faf9f7] px-3 py-2.5"><span className="text-[11px] text-[#77736d]">Rented</span><span className="text-[11px] font-medium text-[#37342f]">{occupiedUnits}</span></div>
                  <div className="flex items-center justify-between rounded-[9px] bg-[#faf9f7] px-3 py-2.5"><span className="text-[11px] text-[#77736d]">Not rented</span><span className="text-[11px] font-medium text-[#37342f]">{vacantUnits}</span></div>
                  <div className="flex items-center justify-between rounded-[9px] bg-[#faf9f7] px-3 py-2.5"><span className="text-[11px] text-[#77736d]">Units recorded</span><span className="text-[11px] font-medium text-[#37342f]">{propertyUnits.length}</span></div>
                </div>
              </section>}
            </div>
            <section className="mt-4 rounded-[14px] border border-[#e9e6e1] bg-white p-5">
              <div className="mb-4"><h3 className="text-[13px] font-semibold text-[#302d28]">Facilities & features</h3><p className="mt-1 text-[11px] text-[#9a958d]">Selected for this property.</p></div>
              {selectedFacilities.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedFacilities.map((facility) => {
                    const custom = (property.custom_facilities ?? []).includes(facility);
                    return <span key={facility} data-testid={`property-facility-${facility}`} className="inline-flex items-center gap-2 rounded-full border border-[#dce6dc] bg-[#f3f7f1] py-1.5 pl-2 pr-3 text-[10px] font-medium text-[#4d6a59]">
                      <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[.06em] text-[#7e8b7c]">{custom ? 'Custom' : 'Facility'}</span>
                      {facilityLabel(facility)}
                    </span>;
                  })}
                </div>
              ) : <p className="rounded-[10px] border border-dashed border-[#dedad3] bg-[#faf9f7] px-3.5 py-3 text-[10px] text-[#969188]">No facilities selected.</p>}
            </section>
            {supportsPropertyRental(property.property_type) && <section className="mt-4 rounded-[14px] border border-[#e9e6e1] bg-white p-5">
              <div className="mb-3"><h3 className="text-[13px] font-semibold text-[#302d28]">Occupancy & lease</h3><p className="mt-1 text-[11px] text-[#9a958d]">Rental information entered for this property.</p></div>
              <div className="grid gap-x-7 sm:grid-cols-2">
                <InfoRow label="Rental status" value={property.is_rented ? 'Rented' : 'Not rented'} />
                <InfoRow label="Renter" value={property.is_rented ? renterName : null} />
                <InfoRow label="Monthly rent" value={property.is_rented ? property.monthly_rent : null} />
                <InfoRow label="Lease duration" value={property.is_rented ? property.lease_term_type === 'until_termination' ? 'Until termination' : property.lease_term_type === 'fixed' ? 'Fixed term' : null : null} />
                <InfoRow label="Lease start" value={property.is_rented ? property.lease_start_date : null} />
                <InfoRow label="Lease end" value={property.is_rented ? property.lease_end_date : null} />
              </div>
            </section>}
            {operationalDetails.length > 0 && <section className="mt-4 rounded-[14px] border border-[#e9e6e1] bg-white p-5">
              <div className="mb-3"><h3 className="text-[13px] font-semibold text-[#302d28]">Operational details</h3><p className="mt-1 text-[11px] text-[#9a958d]">Details entered for this property type.</p></div>
              <div className="grid gap-x-7 sm:grid-cols-2">{operationalDetails.map((item) => <InfoRow key={item.label} label={item.label} value={item.value} />)}</div>
            </section>}
            <PropertyOwners property={property} contacts={contacts} ownerships={ownerships} />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}