import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, X } from 'lucide-react';
import FlowPointSelect from '@/components/FlowPointSelect';
import type { Contact, ContactType } from '@/lib/contactsTypes';
import { CONTACT_TYPES } from '@/lib/contactsTypes';
import type { Service, ServiceContract, ServiceContractDraft, ServiceContractStatus, ServiceBillingPeriod } from '@/lib/servicesTypes';
import { SERVICE_BILLING_PERIODS, SERVICE_CONTRACT_STATUSES } from '@/lib/servicesTypes';

type ServiceContractFormDraft = Omit<ServiceContractDraft, 'contact_id'> & {
  contact_source: 'existing' | 'new';
  contact_id: string;
  new_contact_name: string;
  new_contact_email: string;
  new_contact_phone: string;
  new_contact_type: ContactType;
};

const inputClass =
  'w-full h-[39px] rounded-[9px] border border-[#e4e2de] bg-white px-[11px] text-[13px] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412] focus:ring-2 focus:ring-[#151412]/8 transition-all';
const textAreaClass =
  'w-full rounded-[9px] border border-[#e4e2de] bg-white px-[11px] py-[9px] text-[13px] leading-[1.5] text-[#151412] outline-none placeholder:text-[#b3b0aa] focus:border-[#151412] focus:ring-2 focus:ring-[#151412]/8 transition-all resize-none';

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export interface ServiceContractContactInput {
  source: 'existing' | 'new';
  contact_id: string;
  name: string;
  email: string;
  phone: string;
  contact_type: ContactType;
}

export interface ServiceContractFormValues {
  contract: Omit<ServiceContractDraft, 'contact_id'>;
  contact: ServiceContractContactInput;
}

export default function ServiceContractDialog({
  contract,
  contacts,
  services,
  initialServiceId,
  initialContactId,
  onSave,
  onClose,
}: {
  contract: ServiceContract | null;
  contacts: Contact[];
  services: Service[];
  initialServiceId?: string;
  initialContactId?: string;
  onSave: (values: ServiceContractFormValues) => Promise<void>;
  onClose: () => void;
}) {
  const [contactSource, setContactSource] = useState<'existing' | 'new'>(contract || initialContactId || contacts.some((item) => item.status !== 'archived') ? 'existing' : 'new');
  const [contactId, setContactId] = useState(contract ? String(contract.contact_id) : initialContactId ?? '');
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', contact_type: 'other' as ContactType });
  const [serviceId, setServiceId] = useState(contract?.service_id ?? initialServiceId ?? '');
  const [price, setPrice] = useState(contract ? String(contract.price_amount) : '');
  const [currency, setCurrency] = useState(contract?.currency_code ?? 'USD');
  const [billingPeriod, setBillingPeriod] = useState<ServiceBillingPeriod>(contract?.billing_period ?? 'monthly');
  const [startDate, setStartDate] = useState(contract?.start_date ?? today());
  const [endDate, setEndDate] = useState(contract?.end_date ?? '');
  const [status, setStatus] = useState<ServiceContractStatus>(contract?.status ?? 'active');
  const [notes, setNotes] = useState(contract?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeServices = services.filter((item) => item.status === 'active' || item.id === contract?.service_id);
  const availableContacts = contacts.filter((item) => item.status !== 'archived' || String(item.id) === contactId);
  const close = () => { if (!saving) onClose(); };

  const submit = async () => {
    const amount = Number(price);
    if (contactSource === 'existing' && !contactId) return setError('Choose a contact, or add a new one.');
    if (contactSource === 'new' && !newContact.name.trim()) return setError('Enter the new contact’s name.');
    if (contactSource === 'new' && newContact.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newContact.email.trim())) return setError('Enter a valid email address.');
    if (!serviceId) return setError('Choose a service from the catalog.');
    if (price.trim() === '' || !Number.isFinite(amount) || amount < 0) return setError('Enter a valid price of zero or more.');
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return setError('Enter a 3-letter currency code, such as USD.');
    if (!startDate) return setError('Choose a contract start date.');
    if (endDate && endDate < startDate) return setError('The end date must be on or after the start date.');

    setSaving(true);
    setError('');
    try {
      await onSave({
        contact: {
          source: contactSource,
          contact_id: contactId,
          name: newContact.name.trim(),
          email: newContact.email.trim(),
          phone: newContact.phone.trim(),
          contact_type: newContact.contact_type,
        },
        contract: {
          service_id: serviceId,
          price_amount: amount,
          currency_code: currency.trim().toUpperCase(),
          billing_period: billingPeriod,
          start_date: startDate,
          end_date: endDate || null,
          status,
          notes: notes.trim() || null,
        },
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this service contract.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="absolute inset-0 bg-[#171511]/30 backdrop-blur-[2px]" />
      <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} onClick={(event) => event.stopPropagation()} className="relative max-h-[92vh] w-full max-w-[720px] overflow-hidden rounded-[16px] border border-[#e4e2de] bg-[#fbfaf8] shadow-[0_24px_80px_rgba(25,22,18,.18)]">
        <div className="flex items-start justify-between border-b border-[#ebe8e3] px-5 py-4">
          <div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#a16a52]">Customer service</p><h2 className="mt-1 text-[16px] font-semibold text-[#201e1a]">{contract ? 'Edit service contract' : 'Add a service contract'}</h2><p className="mt-1 text-[11px] text-[#89847c]">Record the customer, service, agreed price, and contract term.</p></div>
          <button type="button" aria-label="Close service contract form" onClick={close} disabled={saving} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e4e2de] text-[#817d76] hover:bg-[#f0eeea] disabled:opacity-50"><X size={14} /></button>
        </div>
        <div className="max-h-[calc(92vh-132px)] overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-semibold text-[#34312c]">Customer</p><div className="flex rounded-[8px] border border-[#e4e2de] bg-white p-0.5"><button type="button" data-testid="button-use-existing-contact" onClick={() => setContactSource('existing')} className={`rounded-[6px] px-2.5 py-1.5 text-[10px] font-semibold ${contactSource === 'existing' ? 'bg-[#151412] text-white' : 'text-[#77736d]'}`}>Existing contact</button><button type="button" data-testid="button-add-new-contact" onClick={() => setContactSource('new')} className={`rounded-[6px] px-2.5 py-1.5 text-[10px] font-semibold ${contactSource === 'new' ? 'bg-[#151412] text-white' : 'text-[#77736d]'}`}>Add new contact</button></div></div>
              {contactSource === 'existing' ? <FlowPointSelect testId="select-service-contract-contact" value={contactId} onChange={setContactId} placeholder="Choose a contact" options={availableContacts.map((item) => ({ value: String(item.id), label: item.name, secondary: item.customer_id ?? item.contact_type ?? undefined }))} emptyLabel="No contacts available" /> : <div className="grid grid-cols-1 gap-3 rounded-[11px] border border-[#e9e6e1] bg-white p-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Name</span><input data-testid="input-new-customer-name" autoFocus className={inputClass} value={newContact.name} onChange={(event) => setNewContact((current) => ({ ...current, name: event.target.value }))} placeholder="Customer or company name" /></label>
                <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Contact type</span><FlowPointSelect testId="select-new-customer-type" value={newContact.contact_type} onChange={(value) => setNewContact((current) => ({ ...current, contact_type: value as ContactType }))} placeholder="Select type" options={CONTACT_TYPES.map((item) => ({ ...item }))} /></label>
                <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Email <span className="normal-case font-normal tracking-normal text-[#aaa59d]">optional</span></span><input data-testid="input-new-customer-email" type="email" className={inputClass} value={newContact.email} onChange={(event) => setNewContact((current) => ({ ...current, email: event.target.value }))} placeholder="person@example.com" /></label>
                <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Phone <span className="normal-case font-normal tracking-normal text-[#aaa59d]">optional</span></span><input data-testid="input-new-customer-phone" type="tel" className={inputClass} value={newContact.phone} onChange={(event) => setNewContact((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" /></label>
              </div>}
            </div>
            <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Service</span><FlowPointSelect testId="select-contract-service" value={serviceId} onChange={setServiceId} placeholder="Choose a catalog service" options={activeServices.map((item) => ({ value: item.id, label: item.name, secondary: item.category }))} emptyLabel="Add a service to the catalog first" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Agreed price</span><input data-testid="input-contract-price" type="number" min="0" step="0.01" className={inputClass} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Currency code</span><input data-testid="input-contract-currency" maxLength={3} className={inputClass} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="USD" /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Billing frequency</span><FlowPointSelect testId="select-contract-billing-period" value={billingPeriod} onChange={(value) => setBillingPeriod(value as ServiceBillingPeriod)} placeholder="Select frequency" options={SERVICE_BILLING_PERIODS.map((item) => ({ ...item }))} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Contract status</span><FlowPointSelect testId="select-contract-status" value={status} onChange={(value) => setStatus(value as ServiceContractStatus)} placeholder="Select status" options={SERVICE_CONTRACT_STATUSES.map((item) => ({ ...item }))} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Start date</span><input data-testid="input-contract-start-date" type="date" className={inputClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">End date <span className="normal-case font-normal tracking-normal text-[#aaa59d]">leave empty for ongoing</span></span><input data-testid="input-contract-end-date" type="date" min={startDate} className={inputClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.08em] text-[#77736d]">Notes <span className="normal-case font-normal tracking-normal text-[#aaa59d]">optional</span></span><textarea data-testid="input-contract-notes" className={textAreaClass} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Scope, agreement details, or internal notes" /></label>
          </div>
          {error && <div className="mt-4 flex items-start gap-2 rounded-[9px] border border-[#f0c8c3] bg-[#fff7f6] px-3 py-2.5 text-[11px] text-[#a33a30]"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" />{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#ebe8e3] bg-[#fbfaf8] px-5 py-4">
          <button type="button" onClick={close} disabled={saving} className="h-9 rounded-[9px] border border-[#e4e2de] px-3 text-[11px] font-medium text-[#625e57] hover:bg-[#f0eeea] disabled:opacity-50">Cancel</button>
          <button type="button" data-testid="button-save-service-contract" onClick={submit} disabled={saving} className="flex h-9 items-center gap-2 rounded-[9px] bg-[#151412] px-4 text-[11px] font-semibold text-white hover:bg-[#312f2c] disabled:opacity-50">{saving && <Loader2 size={13} className="animate-spin" />}{saving ? 'Saving contract' : contract ? 'Save changes' : 'Add contract'}</button>
        </div>
      </motion.div>
    </div>
  );
}
