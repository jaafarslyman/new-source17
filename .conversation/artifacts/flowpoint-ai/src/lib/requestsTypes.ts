export type RequestStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'waiting_on_staff'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export type RequestActivityType =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'reassigned'
  | 'note_added'
  | 'resolved'
  | 'closed'
  | 'updated';

export interface RequestType {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RequestRecord {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  request_type_id: string | null;
  status: RequestStatus;
  priority: RequestPriority;
  contact_id: number | string | null;
  property_id: string | null;
  unit_id: string | null;
  service_id: string | null;
  assigned_staff_id: number | string | null;
  due_date: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueActivity {
  id: string;
  issue_id: string;
  company_id: string;
  activity_type: RequestActivityType;
  description: string;
  actor_type: string;
  actor_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const REQUEST_STATUSES: { value: RequestStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_on_customer', label: 'Waiting on customer' },
  { value: 'waiting_on_staff', label: 'Waiting on staff' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const REQUEST_PRIORITIES: { value: RequestPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const DEFAULT_REQUEST_TYPES = [
  'Maintenance',
  'Rent / Payment',
  'Lease',
  'Move-In',
  'Move-Out',
  'Property Damage',
  'Complaint',
  'Service Request',
  'Access',
  'Utilities',
  'Inspection',
  'General Inquiry',
  'Other',
] as const;

export function requestStatusLabel(value: string | null | undefined) {
  return REQUEST_STATUSES.find((item) => item.value === value)?.label ?? 'Open';
}

export function requestPriorityLabel(value: string | null | undefined) {
  return REQUEST_PRIORITIES.find((item) => item.value === value)?.label ?? 'Normal';
}

export function ageLabel(createdAt: string, closedAt?: string | null) {
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const days = Math.max(0, Math.floor((end - new Date(createdAt).getTime()) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}