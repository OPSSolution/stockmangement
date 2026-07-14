import { useState } from 'react';
import type { Vendor, VendorContact } from '@/mocks/vendors';

interface Props {
  vendor?: Vendor | null;
  onClose: () => void;
  onSave: (data: Omit<Vendor, 'id' | 'metrics' | 'products'> & { id?: string }) => void;
}

const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300';

const emptyContact = (): VendorContact => ({ name: '', role: '', email: '', phone: '' });

export default function VendorFormModal({ vendor, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    name: vendor?.name ?? '',
    type: vendor?.type ?? 'supplier' as Vendor['type'],
    status: vendor?.status ?? 'active' as Vendor['status'],
    address: vendor?.address ?? '',
    city: vendor?.city ?? '',
    country: vendor?.country ?? '',
    website: vendor?.website ?? '',
    paymentTerms: vendor?.paymentTerms ?? 'Net 30',
    notes: vendor?.notes ?? '',
    tagsText: (vendor?.tags ?? []).join(', '),
    contacts: vendor?.contacts.length ? vendor.contacts : [emptyContact()],
  });
  const [error, setError] = useState('');

  const updateContact = (index: number, updates: Partial<VendorContact>) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, ...updates } : c)),
    }));
  };

  const removeContact = (index: number) => {
    setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== index) }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setError('Vendor name is required.'); return; }
    if (!form.city.trim() || !form.country.trim()) { setError('City and country are required.'); return; }

    const contacts = form.contacts
      .map((c) => ({ name: c.name.trim(), role: c.role.trim(), email: c.email.trim(), phone: c.phone.trim() }))
      .filter((c) => c.name || c.email);

    onSave({
      id: vendor?.id,
      name: form.name.trim(),
      type: form.type,
      status: form.status,
      address: form.address.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      website: form.website.trim() || undefined,
      paymentTerms: form.paymentTerms.trim(),
      notes: form.notes.trim() || undefined,
      tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      contacts,
      registeredAt: vendor?.registeredAt ?? new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{vendor ? 'Edit Vendor' : 'New Vendor'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{vendor ? vendor.id : 'Add a new supplier, manufacturer, or distributor'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <section className="space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Company Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Vendor Name *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. TechSupply Co." className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Vendor['type'] }))} className={inputClass}>
                  <option value="supplier">Supplier</option>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="distributor">Distributor</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                {vendor ? (
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Vendor['status'] }))} className={inputClass}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    {form.status === 'suspended' && <option value="suspended">Suspended (legacy)</option>}
                  </select>
                ) : (
                  <input value="Active" disabled className={`${inputClass} bg-gray-50 text-gray-500`} />
                )}
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Address</label>
                <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Street address" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">City *</label>
                <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="City" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Country *</label>
                <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="Country" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Website</label>
                <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="example.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Payment Terms</label>
                <input value={form.paymentTerms} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} placeholder="e.g. Net 30" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Tags (comma-separated)</label>
                <input value={form.tagsText} onChange={(e) => setForm((f) => ({ ...f, tagsText: e.target.value }))} placeholder="e.g. Electronics, Fast Shipping" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes about this vendor" className={`${inputClass} resize-none`} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contacts</p>
              <button type="button" onClick={() => setForm((f) => ({ ...f, contacts: [...f.contacts, emptyContact()] }))} className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer">
                + Add contact
              </button>
            </div>
            <div className="space-y-3">
              {form.contacts.map((contact, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr_1fr_36px] gap-2 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Name</label>
                    <input value={contact.name} onChange={(e) => updateContact(index, { name: e.target.value })} placeholder="Contact name" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Role</label>
                    <input value={contact.role} onChange={(e) => updateContact(index, { role: e.target.value })} placeholder="e.g. Sales Manager" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                    <input type="email" value={contact.email} onChange={(e) => updateContact(index, { email: e.target.value })} placeholder="email@vendor.com" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone</label>
                    <input value={contact.phone} onChange={(e) => updateContact(index, { phone: e.target.value })} placeholder="+1 234..." className={inputClass} />
                  </div>
                  <button type="button" onClick={() => removeContact(index)} disabled={form.contacts.length === 1} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 cursor-pointer">
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-3">{error}</div>}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">{vendor ? 'Save changes to this vendor' : 'Create a new vendor profile'}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Cancel</button>
            <button type="submit" onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer">{vendor ? 'Save Changes' : 'Create Vendor'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
