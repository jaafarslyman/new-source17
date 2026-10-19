export type ServiceStatus = 'active' | 'inactive';
export type ServiceContractStatus = 'active' | 'pending' | 'completed' | 'cancelled';
export type ServiceBillingPeriod = 'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface ServiceCategoryDetails {
  management_fee_basis?: 'fixed_monthly' | 'per_unit' | 'percentage_of_rent' | 'custom';
  owner_report_frequency?: 'monthly' | 'quarterly' | 'annually';
  placement_fee_basis?: 'flat_fee' | 'first_month_rent' | 'annual_rent_percentage' | 'custom';
  tenant_screening_included?: boolean;
  emergency_support_available?: boolean;
  response_target?: 'within_4_hours' | 'same_day' | 'within_24_hours' | 'within_48_hours';
  service_frequency?: 'on_demand' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  inspection_frequency?: 'monthly' | 'quarterly' | 'semi_annually' | 'annually' | 'as_needed';
  written_report_included?: boolean;
  financial_report_frequency?: 'monthly' | 'quarterly' | 'annually';
  reconciliation_included?: boolean;
  renewal_reminders_included?: boolean;
  turnover_inspection_included?: boolean;
  key_handover_included?: boolean;
  vendor_coordination_scope?: 'source' | 'coordinate' | 'source_and_coordinate';
  capital_project_scope?: 'planning' | 'oversight' | 'planning_and_oversight';
}

export interface Service {
  id: string;
  company_id: string | null;
  created_at: string;
  updated_at: string;
  name: string;
  category: string;
  short_description: string | null;
  description: string | null;
  customer_facing_description: string | null;
  requirements: string | null;
  included_details: string | null;
  excluded_details: string | null;
  pricing_information: string | null;
  availability_information: string | null;
  typical_response_time: string | null;
  internal_instructions: string | null;
  escalation_instructions: string | null;
  category_details: ServiceCategoryDetails;
  status: ServiceStatus;
}

export type ServiceDraft = Omit<Service, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

export interface ServiceContract {
  id: string;
  company_id: string | null;
  created_at: string;
  updated_at: string;
  contact_id: number | string;
  service_id: string;
  price_amount: number | string;
  currency_code: string;
  billing_period: ServiceBillingPeriod;
  start_date: string;
  end_date: string | null;
  status: ServiceContractStatus;
  notes: string | null;
  contact?: {
    id: number | string;
    name: string;
    customer_id: string | null;
    contact_type: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  service?: {
    id: string;
    name: string;
    category: string;
    status: ServiceStatus;
  } | null;
}

export interface ServiceContractDraft {
  contact_id: number | string;
  service_id: string;
  price_amount: number;
  currency_code: string;
  billing_period: ServiceBillingPeriod;
  start_date: string;
  end_date: string | null;
  status: ServiceContractStatus;
  notes: string | null;
}

export const SERVICE_CATEGORIES = [
  'Property and asset management',
  'Leasing and tenant placement',
  'Tenant and resident relations',
  'Rent collection and financial management',
  'Lease administration',
  'Property marketing',
  'Maintenance and repairs',
  'Preventive maintenance',
  'Cleaning and janitorial',
  'Landscaping and groundskeeping',
  'Security and access control',
  'Utilities and energy management',
  'Inspections and compliance',
  'Accounting and owner reporting',
  'Vendor and contractor coordination',
  'HOA and community association management',
  'Move-in and move-out coordination',
  'Emergency and after-hours response',
  'Renovation and capital projects',
  'Other',
] as const;

export const SERVICE_CONTRACT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const SERVICE_BILLING_PERIODS = [
  { value: 'one_time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
] as const;

export function serviceContractStatusLabel(value: string | null | undefined) {
  return SERVICE_CONTRACT_STATUSES.find((item) => item.value === value)?.label ?? 'Active';
}

export function serviceBillingPeriodLabel(value: string | null | undefined) {
  return SERVICE_BILLING_PERIODS.find((item) => item.value === value)?.label ?? 'Monthly';
}

export interface ServiceContactRelationship {
  id: string | number;
  company_id: string | null;
  service_id: string;
  contact_id: number | string;
  relationship_status: string | null;
  notes: string | null;
  contact?: {
    id: number | string;
    name: string;
    customer_id: string | null;
    contact_type: string | null;
    status: string | null;
  } | null;
  service?: {
    id: string;
    name: string;
    category: string;
    status: string;
  } | null;
}

export interface ServiceStaffRelationship {
  id: string | number;
  company_id: string | null;
  service_id: string;
  staff_id: number | string | null;
  assignment_type: 'staff' | 'company';
  assignment_role: string | null;
  notes: string | null;
  staff?: {
    id: number | string;
    name: string;
    role: string | null;
    department: string | null;
    status: string | null;
  } | null;
}

export interface ServicePropertyRelationship {
  id: string | number;
  company_id: string | null;
  service_id: string;
  property_id: string;
  notes: string | null;
  property?: {
    id: string;
    name: string;
    city: string | null;
    address_line1: string | null;
  } | null;
}

export interface ServiceUnitRelationship {
  id: string | number;
  company_id: string | null;
  service_id: string;
  unit_id: string;
  notes: string | null;
  unit?: {
    id: string;
    unit_number: string;
    property_id: string;
    property?: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export const SERVICE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export function serviceStatusLabel(value: string | null | undefined) {
  return SERVICE_STATUSES.find((item) => item.value === value)?.label ?? 'Inactive';
}