import FlowPointSelect from '@/components/FlowPointSelect';
import {
  MAINTENANCE_SPECIALTIES,
  staffRoleFamily,
  type StaffRoleAttributes,
} from '@/lib/contactsTypes';

const inputClass = 'w-full h-[39px] rounded-[9px] border border-[#e4e2de] bg-white px-[11px] text-[13px] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412]';
const textAreaClass = 'w-full rounded-[9px] border border-[#e4e2de] bg-white px-[11px] py-[9px] text-[13px] leading-[1.5] text-[#151412] outline-none placeholder:text-[#b3b0aa] resize-none';

const FOCUS_OPTIONS: Record<'support' | 'finance' | 'leasing' | 'operations', { value: string; label: string }[]> = {
  support: [
    { value: 'resident_support', label: 'Tenant / resident support' },
    { value: 'owner_support', label: 'Property-owner support' },
    { value: 'leasing_enquiries', label: 'Leasing enquiries' },
    { value: 'maintenance_dispatch', label: 'Maintenance dispatch' },
    { value: 'billing_questions', label: 'Billing questions' },
    { value: 'emergency_triage', label: 'Emergency triage' },
  ],
  finance: [
    { value: 'rent_collection', label: 'Rent collection' },
    { value: 'reconciliation', label: 'Reconciliation' },
    { value: 'owner_reporting', label: 'Owner reporting' },
    { value: 'budgeting', label: 'Budgeting' },
    { value: 'payables', label: 'Vendor payables' },
    { value: 'tax_documents', label: 'Tax documents' },
  ],
  leasing: [
    { value: 'showings', label: 'Property showings' },
    { value: 'applications', label: 'Application coordination' },
    { value: 'screening', label: 'Applicant screening' },
    { value: 'lease_preparation', label: 'Lease preparation' },
    { value: 'move_in', label: 'Move-in coordination' },
    { value: 'renewals', label: 'Lease renewals' },
  ],
  operations: [
    { value: 'vendor_coordination', label: 'Vendor coordination' },
    { value: 'security', label: 'Security and access' },
    { value: 'cleaning', label: 'Cleaning' },
    { value: 'inspections', label: 'Inspections' },
    { value: 'compliance', label: 'Compliance' },
    { value: 'grounds', label: 'Landscaping and grounds' },
    { value: 'administration', label: 'Administration' },
  ],
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-[5px] block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">{label}{hint && <span className="ml-1 normal-case font-normal tracking-normal text-[#aaa59d]">{hint}</span>}</span>{children}</label>;
}

export default function StaffRoleSpecificFields({
  role,
  attributes,
  responsibilities,
  onAttributesChange,
  onResponsibilitiesChange,
}: {
  role: string;
  attributes: StaffRoleAttributes;
  responsibilities: string | null;
  onAttributesChange: (attributes: StaffRoleAttributes) => void;
  onResponsibilitiesChange: (value: string) => void;
}) {
  const family = staffRoleFamily(role);
  const selected = (key: string) => Array.isArray(attributes[key])
    ? (attributes[key] as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  const toggle = (key: string, value: string) => {
    const current = selected(key);
    onAttributesChange({ ...attributes, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  };
  const focus = family === 'customer_support' ? 'support' : family === 'finance' ? 'finance' : family === 'leasing' ? 'leasing' : family === 'operations' ? 'operations' : null;
  const focusKey = focus ? `${focus}_focus` : '';

  return <section className="sm:col-span-2 rounded-[11px] border border-[#e9e2d8] bg-[#faf8f4] p-4">
    <div className="mb-3"><p className="text-[12px] font-semibold text-[#35322e]">Role-specific setup</p><p className="mt-1 text-[10px] leading-4 text-[#89847c]">Inputs change with the role so work can be routed to the right person.</p></div>
    {family === 'executive' && <p className="rounded-[9px] border border-[#e9e6e1] bg-white px-3 py-3 text-[11px] leading-5 text-[#6e695f]">Leadership role. No property assignment or task-specialty details are required.</p>}
    {family === 'property_management' && <Field label="Management responsibilities" hint="optional"><textarea className={textAreaClass} rows={3} value={responsibilities ?? ''} onChange={(event) => onResponsibilitiesChange(event.target.value)} placeholder="Portfolio oversight, owner reporting, lease operations..." /></Field>}
    {family === 'maintenance' && <div className="space-y-3">
      <Field label="Maintenance work type"><FlowPointSelect value={String(attributes.maintenance_work_type ?? 'generalist')} onChange={(value) => onAttributesChange({ ...attributes, maintenance_work_type: value })} placeholder="Select work type" options={[
        { value: 'generalist', label: 'All-around maintenance' },
        { value: 'specialist', label: 'Specialist trade' },
        { value: 'project_contractor', label: 'Project / repair contractor' },
      ]} /></Field>
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Work specialties</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{MAINTENANCE_SPECIALTIES.map((item) => {
        const checked = selected('maintenance_specialties').includes(item);
        return <label key={item} className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-[#e9e6e1] bg-white px-3 py-2 text-[11px] text-[#625e57]"><input type="checkbox" checked={checked} onChange={() => toggle('maintenance_specialties', item)} className="accent-[#151412]" />{item}</label>;
      })}</div></div>
      {selected('maintenance_specialties').includes('Other') && <Field label="Other specialty"><input className={inputClass} value={String(attributes.other_maintenance_specialty ?? '')} onChange={(event) => onAttributesChange({ ...attributes, other_maintenance_specialty: event.target.value })} placeholder="Describe the specialty" /></Field>}
    </div>}
    {focus && <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">{focus === 'support' ? 'Support areas' : focus === 'finance' ? 'Financial responsibilities' : focus === 'leasing' ? 'Leasing responsibilities' : 'Operations responsibilities'}</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{FOCUS_OPTIONS[focus].map((item) => {
      const checked = selected(focusKey).includes(item.value);
      return <label key={item.value} className="flex cursor-pointer items-center gap-2 rounded-[8px] border border-[#e9e6e1] bg-white px-3 py-2 text-[11px] text-[#625e57]"><input type="checkbox" checked={checked} onChange={() => toggle(focusKey, item.value)} className="accent-[#151412]" />{item.label}</label>;
    })}</div></div>}
    {family === 'custom' && <Field label="Primary work / responsibilities" hint="optional"><textarea className={textAreaClass} rows={3} value={responsibilities ?? ''} onChange={(event) => onResponsibilitiesChange(event.target.value)} placeholder="Describe the main work this person handles" /></Field>}
    {family !== 'executive' && family !== 'property_management' && family !== 'maintenance' && family !== 'custom' && <Field label="Additional responsibilities" hint="optional"><textarea className={textAreaClass} rows={2} value={responsibilities ?? ''} onChange={(event) => onResponsibilitiesChange(event.target.value)} placeholder="Other role-specific responsibilities" /></Field>}
  </section>;
}
