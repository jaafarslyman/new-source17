export interface PropertyUnitOwnerAllocation {
  unit_number: string;
  contact_id: string;
  ownership_percentage: number | null;
}

export function validateUnitOwnershipMap(
  allocations: PropertyUnitOwnerAllocation[] | null | undefined,
  unitCount: number,
  validOwnerIds: Iterable<string>,
) {
  if (!Number.isInteger(unitCount) || unitCount < 2) {
    return 'Multifamily and apartment properties must have at least two units.';
  }

  const owners = new Set(Array.from(validOwnerIds, String));
  if (owners.size === 0) return 'Add at least one property owner before mapping units.';

  const mappedAllocations = allocations ?? [];
  for (const allocation of mappedAllocations) {
    const number = Number(allocation.unit_number);
    if (!Number.isInteger(number) || number < 1 || number > unitCount) {
      return `Ownership assignments must use unit numbers from 1 to ${unitCount}.`;
    }
    if (!owners.has(String(allocation.contact_id))) {
      return 'Every unit assignment must reference a current property owner.';
    }
  }

  for (let number = 1; number <= unitCount; number += 1) {
    const unitAllocations = mappedAllocations.filter(
      (allocation) => Number(allocation.unit_number) === number,
    );
    if (unitAllocations.length === 0) {
      return `Assign at least one owner to unit ${number}.`;
    }

    const distinctOwners = new Set(unitAllocations.map((allocation) => String(allocation.contact_id)));
    if (distinctOwners.size !== unitAllocations.length) {
      return `Each owner can only be assigned once to unit ${number}.`;
    }

    if (unitAllocations.length === 1) {
      const share = unitAllocations[0].ownership_percentage;
      if (share !== null && (!Number.isFinite(share) || Math.abs(share - 100) > 0.001)) {
        return `A sole owner must own all of unit ${number}.`;
      }
      continue;
    }

    const shares = unitAllocations.map((allocation) => allocation.ownership_percentage);
    if (shares.some((share) => share === null || !Number.isFinite(share) || share <= 0 || share > 100)) {
      return `Enter a valid share for every owner of unit ${number}.`;
    }
    const total = shares.reduce<number>((sum, share) => sum + Number(share), 0);
    if (Math.abs(total - 100) > 0.001) {
      return `Ownership shares for unit ${number} must total 100%.`;
    }
  }

  return null;
}

export interface Property {
  id: string;
  company_id: string | null;
  created_at: string;
  updated_at: string;
  name: string;
  property_category: string | null;
  property_type: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  description: string | null;
  units_count: number | null;
  units_under_construction: boolean;
  unit_ownership_map: PropertyUnitOwnerAllocation[] | null;
  floor_count: number | null;
  floor_unit_counts: number[] | null;
  room_count: number | null;
  facilities: string[] | null;
  custom_facilities: string[] | null;
  is_rented: boolean | null;
  monthly_rent: number | null;
  lease_term_type: 'fixed' | 'until_termination' | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  amenities: string | null;
  office_in_building: boolean | null;
  office_floor: number | null;
  commercial_space_type: string | null;
  mixed_use_components: string[] | null;
  mixed_use_floor_plan: Record<string, number>[] | null;
  industrial_in_building: boolean | null;
  industrial_floor: number | null;
  warehouse_goods: string[] | null;
  distribution_goods: string[] | null;
  distribution_services: string[] | null;
  manufactured_products: string[] | null;
  production_inputs: string[] | null;
  research_focus: string[] | null;
  research_inputs: string[] | null;
  property_rules: string | null;
  parking_information: string | null;
  access_information: string | null;
  utilities_information: string | null;
  emergency_information: string | null;
  notes: string | null;
  status: string | null;
}

export type PropertyDraft = Omit<Property, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

export const PROPERTY_CATEGORIES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
] as const;

export const PROPERTY_TYPES_BY_CATEGORY = {
  residential: [
    { value: 'single_family_home', label: 'Single-family home' },
    { value: 'multifamily_units', label: 'Multifamily units' },
    { value: 'apartment_building', label: 'Apartment building' },
  ],
  commercial: [
    { value: 'office_building', label: 'Office buildings' },
    { value: 'retail_center', label: 'Retail centers' },
    { value: 'restaurant_hospitality', label: 'Restaurants & hospitality spaces' },
    { value: 'mixed_use_development', label: 'Mixed-use development' },
  ],
  industrial: [
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'distribution_center', label: 'Distribution center' },
    { value: 'manufacturing_plant', label: 'Manufacturing plants' },
    { value: 'research_development_facility', label: 'Research & development facilities' },
  ],
} as const;

export const PROPERTY_TYPES = [
  ...PROPERTY_TYPES_BY_CATEGORY.residential,
  ...PROPERTY_TYPES_BY_CATEGORY.commercial,
  ...PROPERTY_TYPES_BY_CATEGORY.industrial,
] as const;

export const PROPERTY_LEVEL_RENTAL_TYPES = [
  'single_family_home',
  'office_building',
  'retail_center',
  'restaurant_hospitality',
  'warehouse',
  'distribution_center',
  'manufacturing_plant',
  'research_development_facility',
] as const;

export function supportsPropertyRental(type: string | null | undefined) {
  return PROPERTY_LEVEL_RENTAL_TYPES.some((supportedType) => supportedType === type);
}

export const HOME_FACILITIES = [
  { value: 'garden', label: 'Garden' },
  { value: 'backyard', label: 'Backyard' },
  { value: 'garage', label: 'Garage' },
  { value: 'solar_panels', label: 'Solar panels' },
  { value: 'fence', label: 'Fence' },
  { value: 'driveway', label: 'Driveway' },
  { value: 'patio', label: 'Patio' },
  { value: 'deck', label: 'Deck' },
  { value: 'balcony', label: 'Balcony' },
  { value: 'swimming_pool', label: 'Swimming pool' },
  { value: 'outdoor_kitchen', label: 'Outdoor kitchen' },
  { value: 'fireplace', label: 'Fireplace' },
  { value: 'central_air', label: 'Central air conditioning' },
  { value: 'in_unit_laundry', label: 'In-unit laundry' },
  { value: 'basement', label: 'Basement' },
  { value: 'attic', label: 'Attic' },
  { value: 'storage_shed', label: 'Storage shed' },
  { value: 'security_cameras', label: 'Security cameras' },
  { value: 'sprinkler_system', label: 'Sprinkler system' },
] as const;

export const APARTMENT_BUILDING_FACILITIES = [
  { value: 'elevator', label: 'Elevator' },
  { value: 'parking_lot', label: 'Parking lot' },
  { value: 'gym', label: 'Gym' },
  { value: 'sauna', label: 'Sauna' },
  { value: 'rooftop', label: 'Rooftop' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'concierge', label: 'Concierge / doorman' },
  { value: 'package_room', label: 'Package room' },
  { value: 'mailroom', label: 'Mailroom' },
  { value: 'shared_laundry', label: 'Shared laundry room' },
  { value: 'bike_storage', label: 'Bicycle storage' },
  { value: 'community_room', label: 'Community room' },
  { value: 'courtyard', label: 'Courtyard' },
  { value: 'ev_charging', label: 'EV charging' },
  { value: 'backup_generator', label: 'Backup generator' },
  { value: 'trash_chute', label: 'Trash chute' },
] as const;

export const COMMERCIAL_FACILITIES = [
  { value: 'parking_lot', label: 'Parking lot' },
  { value: 'elevator', label: 'Elevator' },
  { value: 'security_system', label: 'Security system' },
  { value: 'reception', label: 'Reception' },
  { value: 'conference_room', label: 'Conference room' },
  { value: 'shared_restrooms', label: 'Shared restrooms' },
  { value: 'loading_dock', label: 'Loading dock' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'access_control', label: 'Access control' },
  { value: 'surveillance', label: 'Video surveillance' },
  { value: 'high_speed_internet', label: 'High-speed internet' },
  { value: 'backup_generator', label: 'Backup generator' },
  { value: 'accessible_entry', label: 'Accessible entrance' },
  { value: 'fire_sprinklers', label: 'Fire sprinklers' },
  { value: 'waste_management', label: 'Waste management' },
  { value: 'ev_charging', label: 'EV charging' },
] as const;

export const OFFICE_FACILITIES = [
  { value: 'private_offices', label: 'Private offices' },
  { value: 'coworking_area', label: 'Coworking area' },
  { value: 'boardroom', label: 'Boardroom' },
  { value: 'phone_booths', label: 'Phone booths' },
  { value: 'breakroom', label: 'Breakroom' },
  { value: 'kitchenette', label: 'Kitchenette' },
  { value: 'server_room', label: 'Server / IT room' },
  { value: 'reception_area', label: 'Reception area' },
  { value: 'tenant_lounge', label: 'Tenant lounge' },
  { value: 'secure_entry', label: 'Secure entry' },
  { value: 'mailroom', label: 'Mailroom' },
] as const;

export const RETAIL_CENTER_FACILITIES = [
  { value: 'food_court', label: 'Food court' },
  { value: 'escalators', label: 'Escalators' },
  { value: 'public_plaza', label: 'Public plaza' },
  { value: 'wayfinding_signage', label: 'Wayfinding signage' },
  { value: 'directory_kiosk', label: 'Directory kiosk' },
  { value: 'customer_parking', label: 'Customer parking' },
  { value: 'customer_restrooms', label: 'Customer restrooms' },
  { value: 'cart_storage', label: 'Shopping-cart storage' },
  { value: 'tenant_storage', label: 'Tenant storage' },
  { value: 'waste_compactor', label: 'Waste compactor' },
] as const;

export const RETAIL_UNIT_FACILITIES = [
  { value: 'storefront', label: 'Storefront' },
  { value: 'display_windows', label: 'Display windows' },
  { value: 'stockroom', label: 'Stockroom' },
  { value: 'fitting_rooms', label: 'Fitting rooms' },
  { value: 'point_of_sale', label: 'Point-of-sale system' },
  { value: 'customer_pickup', label: 'Customer pickup area' },
  { value: 'delivery_access', label: 'Delivery access' },
  { value: 'refrigeration', label: 'Commercial refrigeration' },
  { value: 'roll_down_shutters', label: 'Roll-down security shutters' },
] as const;

export const HOSPITALITY_FACILITIES = [
  { value: 'commercial_kitchen', label: 'Commercial kitchen' },
  { value: 'hood_ventilation', label: 'Kitchen hood / ventilation' },
  { value: 'grease_interceptor', label: 'Grease interceptor' },
  { value: 'walk_in_cooler', label: 'Walk-in cooler' },
  { value: 'bar_area', label: 'Bar area' },
  { value: 'dining_area', label: 'Dining area' },
  { value: 'outdoor_seating', label: 'Outdoor seating' },
  { value: 'delivery_pickup', label: 'Delivery pickup area' },
  { value: 'event_space', label: 'Event space' },
  { value: 'catering_prep', label: 'Catering preparation area' },
] as const;

export const WAREHOUSE_FACILITIES = [
  { value: 'dock_doors', label: 'Dock doors' },
  { value: 'grade_level_loading', label: 'Grade-level loading' },
  { value: 'truck_court', label: 'Truck court' },
  { value: 'forklift_charging', label: 'Forklift charging' },
  { value: 'pallet_racking', label: 'Pallet racking' },
  { value: 'clear_height', label: 'High-clearance storage' },
  { value: 'heavy_power', label: 'Heavy electrical capacity' },
  { value: 'climate_controlled_storage', label: 'Climate-controlled storage' },
  { value: 'hazmat_storage', label: 'Hazardous-material storage' },
  { value: 'vehicle_access', label: 'Large-vehicle access' },
] as const;

export const DISTRIBUTION_CENTER_FACILITIES = [
  { value: 'cross_dock', label: 'Cross-dock area' },
  { value: 'truck_scale', label: 'Truck scale' },
  { value: 'conveyor_system', label: 'Conveyor system' },
  { value: 'sorting_area', label: 'Sorting area' },
  { value: 'fleet_parking', label: 'Fleet parking' },
  { value: 'loading_bays', label: 'Loading bays' },
] as const;

export const MANUFACTURING_PLANT_FACILITIES = [
  { value: 'three_phase_power', label: 'Three-phase power' },
  { value: 'production_floor', label: 'Production floor' },
  { value: 'overhead_crane', label: 'Overhead crane' },
  { value: 'compressed_air', label: 'Compressed air' },
  { value: 'process_ventilation', label: 'Process ventilation' },
  { value: 'machine_shop', label: 'Machine shop' },
  { value: 'utility_capacity', label: 'Industrial utility capacity' },
] as const;

export const RESEARCH_FACILITY_FACILITIES = [
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'clean_room', label: 'Clean room' },
  { value: 'specialized_ventilation', label: 'Specialized ventilation' },
  { value: 'testing_chambers', label: 'Testing chambers' },
  { value: 'secure_research_area', label: 'Secure research area' },
  { value: 'data_center', label: 'Data center' },
  { value: 'fume_hoods', label: 'Fume hoods' },
  { value: 'sample_storage', label: 'Controlled sample storage' },
  { value: 'instrumentation_room', label: 'Instrumentation room' },
] as const;

export const INDUSTRIAL_SHARED_FACILITIES = [
  { value: 'loading_dock', label: 'Loading dock' },
  { value: 'truck_court', label: 'Truck court' },
  { value: 'industrial_hvac', label: 'Industrial HVAC' },
  { value: 'access_control', label: 'Access control' },
  { value: 'surveillance', label: 'Video surveillance' },
  { value: 'fire_suppression', label: 'Industrial fire suppression' },
  { value: 'backup_generator', label: 'Backup generator' },
  { value: 'waste_management', label: 'Industrial waste management' },
] as const;

export const WAREHOUSE_GOODS = [
  'Consumer goods',
  'Food and beverages',
  'Refrigerated or frozen goods',
  'Raw materials',
  'Building materials',
  'Automotive parts',
  'Furniture',
  'Textiles',
  'Agricultural products',
  'Hazardous materials',
] as const;

export const DISTRIBUTION_GOODS = [
  'Parcel shipments',
  'Palletized freight',
  'Food and beverages',
  'Refrigerated or frozen goods',
  'Consumer goods',
  'Medical supplies',
  'Automotive parts',
  'Oversized freight',
  'Hazardous materials',
] as const;

export const DISTRIBUTION_SERVICES = [
  'Order fulfillment',
  'Cross-docking',
  'Parcel sorting',
  'Last-mile dispatch',
  'Cold-chain handling',
  'Returns processing',
  'Pallet storage and dispatch',
  'Freight consolidation',
] as const;

export const MANUFACTURED_PRODUCT_SUGGESTIONS = [
  'Food products',
  'Metal products',
  'Machinery',
  'Electronics',
  'Plastics',
  'Chemicals',
  'Textiles',
  'Building materials',
  'Medical devices',
] as const;

export const PRODUCTION_INPUT_SUGGESTIONS = [
  'Metals',
  'Chemicals',
  'Lumber',
  'Plastics and resins',
  'Electronic components',
  'Agricultural inputs',
  'Packaging materials',
  'Water and process utilities',
] as const;

export const RESEARCH_FOCUS_SUGGESTIONS = [
  'Life sciences',
  'Materials science',
  'Chemistry',
  'Engineering',
  'Electronics',
  'Food science',
  'Environmental research',
  'Clinical research',
  'Product testing',
] as const;

export const RESEARCH_INPUT_SUGGESTIONS = [
  'Biological samples',
  'Chemical reagents',
  'Test materials',
  'Prototype components',
  'Reference samples',
  'Sensitive instruments',
  'Controlled-temperature samples',
] as const;

export const RETAIL_CENTER_TYPES = [
  { value: 'shopping_mall', label: 'Shopping mall' },
  { value: 'strip_mall', label: 'Strip mall' },
  { value: 'shopping_center', label: 'Shopping center' },
  { value: 'outlet_center', label: 'Outlet center' },
  { value: 'market_hall', label: 'Market hall' },
  { value: 'neighborhood_center', label: 'Neighborhood shopping center' },
  { value: 'community_center', label: 'Community shopping center' },
  { value: 'power_center', label: 'Power center / big-box retail' },
  { value: 'lifestyle_center', label: 'Lifestyle center' },
  { value: 'open_air_center', label: 'Open-air retail center' },
  { value: 'specialty_center', label: 'Specialty retail center' },
  { value: 'retail_park', label: 'Retail park' },
  { value: 'other', label: 'Other' },
] as const;

export const RETAIL_UNIT_TYPES = [
  { value: 'boutique', label: 'Boutique' },
  { value: 'convenience_store', label: 'Convenience store' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'department_store', label: 'Department store' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'showroom', label: 'Showroom' },
  { value: 'bookstore', label: 'Bookstore' },
  { value: 'clothing_store', label: 'Clothing store' },
  { value: 'electronics_store', label: 'Electronics store' },
  { value: 'furniture_store', label: 'Furniture / home goods store' },
  { value: 'specialty_food_store', label: 'Specialty food store' },
  { value: 'jewelry_store', label: 'Jewelry store' },
  { value: 'beauty_store', label: 'Beauty / cosmetics store' },
  { value: 'sporting_goods_store', label: 'Sporting goods store' },
  { value: 'pet_supply_store', label: 'Pet supply store' },
  { value: 'salon_or_service', label: 'Salon or retail service' },
  { value: 'other', label: 'Other' },
] as const;

export const HOSPITALITY_SPACE_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'bar', label: 'Bar' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'event_venue', label: 'Event venue' },
  { value: 'food_hall', label: 'Food hall' },
  { value: 'other', label: 'Other' },
] as const;

export const MIXED_USE_COMPONENTS = [
  { value: 'apartment', label: 'Residential apartments' },
  { value: 'office', label: 'Office spaces' },
  { value: 'retail_store', label: 'Retail stores' },
  { value: 'restaurant_hospitality', label: 'Restaurants & hospitality' },
  { value: 'warehouse', label: 'Warehouses' },
] as const;

export const MIXED_USE_SPACE_MAPPING_SCOPE = 'Mapped by space';

export function mixedUseFloorPlanSummary(
  plan: Record<string, number>[] | null | undefined,
  components: string[] | null | undefined,
) {
  if (!plan?.length || !components?.length) return null;
  const labels: Record<string, { singular: string; plural: string }> = {
    apartment: { singular: 'apartment', plural: 'apartments' },
    office: { singular: 'office space', plural: 'office spaces' },
    retail_store: { singular: 'retail store', plural: 'retail stores' },
    restaurant_hospitality: { singular: 'hospitality space', plural: 'hospitality spaces' },
    warehouse: { singular: 'warehouse', plural: 'warehouses' },
  };
  return plan.map((floor, index) => {
    const spaces = components.flatMap((component) => {
      const count = Number(floor[component] ?? 0);
      if (count <= 0) return [];
      const label = labels[component] ?? { singular: component, plural: `${component}s` };
      return [`${count} ${count === 1 ? label.singular : label.plural}`];
    });
    return `${index === 0 ? 'Ground floor' : `Floor ${index}`}: ${spaces.length ? spaces.join(', ') : 'No spaces'}`;
  }).join(' · ');
}

export function mixedUseOwnershipScopeValues(scope: string | null | undefined) {
  const validValues = new Set(MIXED_USE_COMPONENTS.map((component) => component.value));
  return (scope ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => validValues.has(value as (typeof MIXED_USE_COMPONENTS)[number]['value']));
}

export function mixedUseOwnershipScopeLabel(scope: string | null | undefined) {
  const labels = mixedUseOwnershipScopeValues(scope)
    .map((value) => MIXED_USE_COMPONENTS.find((component) => component.value === value)?.label)
    .filter((label) => label !== undefined);
  return labels.length ? labels.join(', ') : scope ?? '';
}

export const PROPERTY_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export function propertyTypeLabel(value: string | null | undefined) {
  const legacyLabels: Record<string, string> = {
    single_family: 'Single-family home',
    mixed_use: 'Mixed-use development',
    condo: 'Condo',
    townhouse: 'Townhouse',
    other: 'Other',
  };
  return PROPERTY_TYPES.find((type) => type.value === value)?.label ?? legacyLabels[value ?? ''] ?? value ?? 'Type unavailable';
}

export function propertyCategoryLabel(value: string | null | undefined) {
  return PROPERTY_CATEGORIES.find((category) => category.value === value)?.label ?? value ?? 'Category unavailable';
}

export function propertyStatusLabel(value: string | null | undefined) {
  return PROPERTY_STATUSES.find((status) => status.value === value)?.label ?? value ?? 'Unavailable';
}

export const blankProperty: PropertyDraft = {
  name: '',
  property_category: '',
  property_type: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
  description: '',
  units_count: null,
  units_under_construction: false,
  unit_ownership_map: [],
  floor_count: null,
  floor_unit_counts: [],
  room_count: null,
  facilities: [],
  custom_facilities: [],
  is_rented: false,
  monthly_rent: null,
  lease_term_type: null,
  lease_start_date: null,
  lease_end_date: null,
  amenities: '',
  office_in_building: null,
  office_floor: null,
  commercial_space_type: null,
  mixed_use_components: [],
  mixed_use_floor_plan: [],
  industrial_in_building: null,
  industrial_floor: null,
  warehouse_goods: [],
  distribution_goods: [],
  distribution_services: [],
  manufactured_products: [],
  production_inputs: [],
  research_focus: [],
  research_inputs: [],
  property_rules: '',
  parking_information: '',
  access_information: '',
  utilities_information: '',
  emergency_information: '',
  notes: '',
  status: 'active',
};

export function propertyAddress(property: Property) {
  return [property.address_line1, property.city, property.state, property.postal_code]
    .filter(Boolean)
    .join(', ');
}