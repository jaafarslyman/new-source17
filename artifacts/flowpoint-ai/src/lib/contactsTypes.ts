export type ContactType =
  | 'tenant'
  | 'property_owner'
  | 'company'
  | 'applicant'
  | 'prospect'
  | 'vendor'
  | 'contractor'
  | 'former_tenant'
  | 'former_owner'
  | 'other';

export type ContactStatus = 'active' | 'inactive' | 'archived';
export type PreferredChannel = 'email' | 'phone' | 'sms' | 'whatsapp' | 'other';
export type RelationshipType =
  | 'tenant'
  | 'owner'
  | 'applicant'
  | 'vendor'
  | 'contractor'
  | 'other';

export type StaffStatus = 'active' | 'inactive';
export type StaffChannel = 'email' | 'phone' | 'sms' | 'slack' | 'other';
export type StaffRoleFamily =
  | 'executive'
  | 'property_management'
  | 'maintenance'
  | 'customer_support'
  | 'finance'
  | 'leasing'
  | 'operations'
  | 'custom';
export type StaffRoleAttributes = Record<string, unknown>;

export const STAFF_ROLE_SUGGESTIONS = [
  'Chief Executive Officer',
  'CEO',
  'Director',
  'Property Manager',
  'Portfolio Manager',
  'Regional Property Manager',
  'Community Manager',
  'Facilities Manager',
  'Maintenance Worker',
  'Maintenance Technician',
  'Plumber',
  'HVAC / AC Technician',
  'Electrician',
  'Carpenter',
  'General Contractor',
  'Customer Support Representative',
  'Resident Support Specialist',
  'Financial Advisor',
  'Accountant',
  'Bookkeeper',
  'Leasing Agent',
  'Vendor Coordinator',
  'Operations Manager',
  'Security Officer',
  'Cleaning Staff',
  'Inspector',
  'Administrative Assistant',
];

export const MAINTENANCE_SPECIALTIES = [
  'Plumbing',
  'HVAC / air conditioning',
  'Electrical',
  'Appliance repair',
  'Carpentry',
  'Drywall and wall repair',
  'Painting',
  'Roofing',
  'General repairs',
  'Other',
] as const;

export interface Contact {
  id: number | string;
  company_id: string | null;
  created_at: string;
  updated_at: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  notes: string | null;
  customer_id: string | null;
  contact_type: ContactType | null;
  status: ContactStatus | null;
  preferred_channel: PreferredChannel | null;
  alternate_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  company_name: string | null;
  ai_summary: string | null;
  internal_notes: string | null;
  last_contacted_at: string | null;
}

export type ContactDraft = Omit<
  Contact,
  'id' | 'company_id' | 'created_at' | 'updated_at'
>;

export interface Staff {
  id: number | string;
  company_id: string | null;
  created_at: string;
  updated_at: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  role_description: string | null;
  department: string | null;
  status: StaffStatus | null;
  notes: string | null;
  preferred_internal_channel: StaffChannel | null;
  responsibilities: string | null;
  role_attributes: StaffRoleAttributes | null;
}

export type StaffDraft = Omit<
  Staff,
  'id' | 'company_id' | 'created_at' | 'updated_at'
>;

export interface ContactPropertyRelationship {
  id: string | number;
  company_id: string | null;
  contact_id: number | string;
  property_id: string;
  unit_id: string | null;
  relationship_type: RelationshipType;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  ownership_percentage: number | null;
  ownership_scope: string | null;
  property?: {
    id: string;
    name: string;
    address_line1: string | null;
    city: string | null;
  } | null;
  unit?: {
    id: string;
    unit_number: string;
    property_id: string;
  } | null;
}

export interface ContactPropertyRelationshipHistory {
  id: string;
  company_id: string | null;
  contact_id: number | string;
  property_id: string | null;
  unit_id: string | null;
  relationship_type: RelationshipType;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  ownership_percentage: number | null;
  ownership_scope: string | null;
  property_name: string | null;
  property_address_line1: string | null;
  property_city: string | null;
  property_state: string | null;
  property_postal_code: string | null;
  property_country: string | null;
  unit_number: string | null;
  archived_at: string;
  archive_reason: string | null;
}

export interface StaffPropertyRelationship {
  id: string | number;
  company_id: string | null;
  staff_id: number | string;
  property_id: string;
  notes: string | null;
  property?: {
    id: string;
    name: string;
    address_line1: string | null;
    city: string | null;
  } | null;
}

export const CONTACT_TYPES = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'property_owner', label: 'Property owner' },
  { value: 'company', label: 'Company' },
  { value: 'applicant', label: 'Applicant' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'former_tenant', label: 'Former tenant' },
  { value: 'former_owner', label: 'Former owner' },
  { value: 'other', label: 'Other' },
] as const;

export const CONTACT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
] as const;

export const PREFERRED_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Other' },
] as const;

export const RELATIONSHIP_TYPES = [
  { value: 'tenant', label: 'Tenant' },
  { value: 'owner', label: 'Owner' },
  { value: 'applicant', label: 'Applicant' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'other', label: 'Other' },
] as const;

export const STAFF_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export const STAFF_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'sms', label: 'SMS' },
  { value: 'slack', label: 'Slack' },
  { value: 'other', label: 'Other' },
] as const;

export function contactTypeLabel(value: string | null | undefined) {
  return CONTACT_TYPES.find((item) => item.value === value)?.label ?? 'Other';
}

export function contactStatusLabel(value: string | null | undefined) {
  return CONTACT_STATUSES.find((item) => item.value === value)?.label ?? 'Active';
}

export function channelLabel(value: string | null | undefined) {
  return PREFERRED_CHANNELS.find((item) => item.value === value)?.label ?? 'Not set';
}

export function relationshipTypeLabel(value: string | null | undefined) {
  return RELATIONSHIP_TYPES.find((item) => item.value === value)?.label ?? 'Other';
}

export function staffStatusLabel(value: string | null | undefined) {
  return STAFF_STATUSES.find((item) => item.value === value)?.label ?? 'Active';
}

export function staffChannelLabel(value: string | null | undefined) {
  return STAFF_CHANNELS.find((item) => item.value === value)?.label ?? 'Not set';
}

export function staffRoleFamily(role: string | null | undefined): StaffRoleFamily {
  const value = role?.trim().toLowerCase() ?? '';
  if (/\b(ceo|chief executive|president|founder|managing director)\b/.test(value) || value === 'director') return 'executive';
  if (/(property|portfolio|regional|community|facilities|building).*(manager|director|lead)|^(property|portfolio|community) manager$/.test(value)) return 'property_management';
  if (/(maintenance|repair|plumb|hvac|air condition|electric|carpent|handyman|technician|contractor|roof|painter)/.test(value)) return 'maintenance';
  if (/(customer support|customer service|resident support|tenant support|resident relations|tenant relations)/.test(value)) return 'customer_support';
  if (/(finance|financial|account|bookkeep|billing|rent collection)/.test(value)) return 'finance';
  if (/(leasing|lease|letting|placement|realtor|sales agent)/.test(value)) return 'leasing';
  if (/(operations|vendor|security|clean|inspection|compliance|administrator|admin|grounds|landscap|coordinator)/.test(value)) return 'operations';
  if (/\b(director|chief|president|executive)\b/.test(value)) return 'executive';
  return 'custom';
}

export function isStaffEligibleForService(role: string | null | undefined, serviceName: string, serviceCategory: string) {
  const category = `${serviceName} ${serviceCategory}`.toLowerCase();
  const maintenanceService = /(maint|repair|plumb|hvac|air condition|electric)/.test(category);
  return !maintenanceService || staffRoleFamily(role) === 'maintenance';
}