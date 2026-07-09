import { useState, useEffect, useCallback, useMemo, type MouseEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { isReservedFieldLabel, type RequestFormTemplate, type TemplateField } from '@/pages/admin/request-templates/page';

interface CustomFieldAnswer {
  key: string;
  label: string;
  type: TemplateField['type'];
  value: string | number | boolean;
}

type CustomFieldValueMap = Record<string, string | number | boolean>;

function customFieldDefsFor(template: RequestFormTemplate | null): TemplateField[] {
  return (template?.fields || []).filter((f) => !isReservedFieldLabel(f.label));
}

interface RequestItem {
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  /** Kg per package/unit, e.g. 0.04 — mirrors the "Package Type" column on the paper form. */
  packageWeight?: number | null;
  /** Unit label for the package, e.g. "pcs", "box" — mirrors the paper form's "Unit" column. */
  unit?: string | null;
  /** packageWeight * quantity, mirrors the paper form's "Total-Kg" column. */
  totalKg?: number | null;
}

interface StockRequest {
  id: string;
  /** Matches the paper form's "Reference" field. */
  reference: string | null;
  /** Matches the paper form's "Date of Receive" field. */
  date_of_receive: string | null;
  warehouse: string;
  /** Free-text name of the person actually asking for the stock (a colleague, another department, etc.) */
  requested_by: string;
  /** The logged-in user who entered this request into the system — used for edit/cancel ownership. */
  submitted_by: string;
  items: RequestItem[];
  total_items: number;
  /** Sum of items[].totalKg — matches the paper form's "Total: _ Kg" row. */
  total_kg: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  reason: string | null;
  /** Checkbox-style reasons from the paper form (damaged / expired / other). */
  reason_tags: string[];
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled' | 'returned';
  fulfillment_type: 'transfer' | 'purchase' | null;
  fulfillment_ref_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewed_by_2: string | null;
  reviewed_at_2: string | null;
  approved_by: string | null;
  approved_at: string | null;
  review_note: string | null;
  /** Why the requester is handing this stock back, set when status becomes 'returned'. */
  return_reason: string | null;
  /** Flagged at creation time — this stock may need to come back later (trial/consignment/etc). */
  needs_return: boolean;
  /** Which company form (e.g. UNT, SVP) this request was filled out under, if any. */
  template_id: string | null;
  template_name: string | null;
  /** Self-contained snapshot of that template's extra field answers. */
  custom_fields: CustomFieldAnswer[];
  created_at: string;
  updated_at: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  image_url?: string | null;
  stock: number;
  low_stock_threshold: number;
  warehouse: string;
}

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-50 text-red-600', accent: 'border-l-red-400', topAccent: 'border-t-red-400' },
  { value: 'high', label: 'High', color: 'bg-amber-50 text-amber-600', accent: 'border-l-amber-400', topAccent: 'border-t-amber-400' },
  { value: 'normal', label: 'Normal', color: 'bg-sky-50 text-sky-600', accent: 'border-l-sky-300', topAccent: 'border-t-sky-300' },
  { value: 'low', label: 'Low', color: 'bg-gray-50 text-gray-500', accent: 'border-l-gray-200', topAccent: 'border-t-gray-200' },
] as const;

const REASON_TAGS = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'other', label: 'Other' },
] as const;

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-600',
  'bg-sky-100 text-sky-600',
  'bg-violet-100 text-violet-600',
  'bg-amber-100 text-amber-600',
] as const;

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function formatTimeAgo(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_META: Record<StockRequest['status'], { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-600' },
  approved: { label: 'Approved', color: 'bg-sky-50 text-sky-600' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-600' },
  fulfilled: { label: 'Fulfilled', color: 'bg-emerald-50 text-emerald-600' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
  returned: { label: 'Returned', color: 'bg-violet-50 text-violet-600' },
};

type FilterTab = 'all' | StockRequest['status'];

const emptyForm = (warehouse: string) => ({
  warehouse,
  reference: '',
  dateOfReceive: '',
  requestedByName: '',
  priority: 'normal' as StockRequest['priority'],
  reason: '',
  reasonTags: [] as string[],
  needsReturn: false,
  items: [] as RequestItem[],
  templateId: null as string | null,
  customFieldValues: {} as CustomFieldValueMap,
});

function defaultValueForField(field: TemplateField): string | number | boolean {
  return field.type === 'checkbox' ? false : '';
}

export default function RequestsPage() {
  const { profile, isAdmin, warehouseScope, canEdit, canDelete } = useAuth();
  const canSubmit = canEdit('requests');
  const canHardDelete = canDelete('requests');
  const requesterIdentity = profile?.full_name || profile?.email;

  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [templates, setTemplates] = useState<RequestFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingReq, setEditingReq] = useState<StockRequest | null>(null);
  const [viewingReq, setViewingReq] = useState<StockRequest | null>(null);
  const [form, setForm] = useState(emptyForm(warehouseScope || ''));
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedPackageWeight, setSelectedPackageWeight] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('pcs');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [reviewedByInput, setReviewedByInput] = useState('');
  const [reviewedBy2Input, setReviewedBy2Input] = useState('');
  const [approvedByInput, setApprovedByInput] = useState('');
  const [savingSignatures, setSavingSignatures] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('stock_requests').select('*').order('created_at', { ascending: false });
    if (warehouseScope) query = query.eq('warehouse', warehouseScope);
    const { data, error } = await query;
    if (!error && data) {
      setRequests(
        (data as StockRequest[]).map((r) => ({
          ...r,
          reason_tags: Array.isArray(r.reason_tags) ? r.reason_tags : [],
          total_kg: typeof r.total_kg === 'number' ? r.total_kg : 0,
          custom_fields: Array.isArray(r.custom_fields) ? r.custom_fields : [],
          template_id: r.template_id ?? null,
          template_name: r.template_name ?? null,
          needs_return: Boolean(r.needs_return),
        }))
      );
    }
    setLoading(false);
  }, [warehouseScope]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    async function loadOptions() {
      let productsQuery = supabase.from('products').select('id, name, sku, image_url, stock, low_stock_threshold, warehouse');
      let warehousesQuery = supabase.from('warehouses').select('name').order('name', { ascending: true });
      if (warehouseScope) {
        productsQuery = productsQuery.eq('warehouse', warehouseScope);
        warehousesQuery = warehousesQuery.eq('name', warehouseScope);
      }
      const [{ data: p }, { data: w }] = await Promise.all([productsQuery, warehousesQuery]);
      if (p) setProducts(p as ProductOption[]);
      if (w) setWarehouses(w.map((row) => row.name as string));
    }
    loadOptions();
  }, [warehouseScope]);

  useEffect(() => {
    async function loadTemplates() {
      const { data, error } = await supabase.from('request_form_templates').select('*').order('sort_order', { ascending: true });
      if (!error && data) setTemplates((data as RequestFormTemplate[]).map((t) => ({ ...t, fields: t.fields || [] })));
    }
    loadTemplates();
  }, []);

  useEffect(() => {
    setReviewedByInput(viewingReq?.reviewed_by || '');
    setReviewedBy2Input(viewingReq?.reviewed_by_2 || '');
    setApprovedByInput(viewingReq?.approved_by || '');
  }, [viewingReq?.id]);

  const availableProducts = useMemo(
    () => products.filter((p) => p.warehouse === form.warehouse && !form.items.find((i) => i.productId === p.id)),
    [products, form.warehouse, form.items]
  );

  const activeTemplates = templates.filter((t) => t.is_active);

  const openNew = () => {
    setEditingReq(null);
    setForm(emptyForm(warehouseScope || warehouses[0] || ''));
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedPackageWeight('');
    setSelectedUnit('pcs');
    setFormError(null);
    if (activeTemplates.length > 0) {
      setShowTemplatePicker(true);
      return;
    }
    setShowForm(true);
  };

  const pickTemplate = (templateId: string | null) => {
    const template = templates.find((t) => t.id === templateId) || null;
    const customFieldValues: CustomFieldValueMap = {};
    customFieldDefsFor(template).forEach((f) => { customFieldValues[f.key] = defaultValueForField(f); });

    setForm((f) => ({ ...f, templateId, customFieldValues }));
    setShowTemplatePicker(false);
    setShowForm(true);
  };

  const openEdit = (req: StockRequest) => {
    setEditingReq(req);
    const template = templates.find((t) => t.id === req.template_id) || null;
    const customFieldValues: CustomFieldValueMap = {};
    customFieldDefsFor(template).forEach((f) => {
      const saved = req.custom_fields.find((c) => c.key === f.key);
      customFieldValues[f.key] = saved ? saved.value : defaultValueForField(f);
    });
    setForm({
      warehouse: req.warehouse,
      reference: req.reference || '',
      dateOfReceive: req.date_of_receive || '',
      requestedByName: req.requested_by,
      priority: req.priority,
      reason: req.reason || '',
      reasonTags: Array.isArray(req.reason_tags) ? req.reason_tags : [],
      needsReturn: req.needs_return || false,
      items: req.items,
      templateId: req.template_id,
      customFieldValues,
    });
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedPackageWeight('');
    setSelectedUnit('pcs');
    setFormError(null);
    setShowForm(true);
  };

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProduct);
    if (!product || selectedQty < 1) return;
    const packageWeight = selectedPackageWeight ? Number(selectedPackageWeight) : null;
    const totalKg = packageWeight ? Math.round(packageWeight * selectedQty * 100) / 100 : null;
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          imageUrl: product.image_url || null,
          quantity: selectedQty,
          packageWeight,
          unit: selectedUnit.trim() || null,
          totalKg,
        },
      ],
    }));
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedPackageWeight('');
    setSelectedUnit('pcs');
  };

  const toggleReasonTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      reasonTags: f.reasonTags.includes(tag) ? f.reasonTags.filter((t) => t !== tag) : [...f.reasonTags, tag],
    }));
  };

  const removeItem = (productId: string) => {
    setForm((f) => ({ ...f, items: f.items.filter((i) => i.productId !== productId) }));
  };

  const activeTemplate = templates.find((t) => t.id === form.templateId) || null;
  const customFieldDefs = customFieldDefsFor(activeTemplate);

  const handleSave = async () => {
    if (!form.warehouse) return setFormError('Warehouse is required.');
    if (form.items.length === 0) return setFormError('Add at least one product.');
    if (!form.requestedByName.trim()) return setFormError('Enter who is requesting this stock.');
    const missingField = customFieldDefs.find((f) => f.required && f.type !== 'checkbox' && !String(form.customFieldValues[f.key] ?? '').trim());
    if (missingField) return setFormError(`"${missingField.label}" is required.`);

    setSaving(true);
    setFormError(null);

    const customFields: CustomFieldAnswer[] = customFieldDefs.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      value: form.customFieldValues[f.key] ?? defaultValueForField(f),
    }));

    const payload = {
      warehouse: form.warehouse,
      reference: form.reference.trim() || null,
      date_of_receive: form.dateOfReceive || null,
      items: form.items,
      total_items: form.items.reduce((sum, i) => sum + i.quantity, 0),
      total_kg: Math.round(form.items.reduce((sum, i) => sum + (i.totalKg || 0), 0) * 100) / 100,
      priority: form.priority,
      reason: form.reason.trim() || null,
      reason_tags: form.reasonTags,
      needs_return: form.needsReturn,
      requested_by: form.requestedByName.trim(),
      template_id: activeTemplate?.id || null,
      template_name: activeTemplate?.name || null,
      custom_fields: customFields,
    };

    const now = new Date().toISOString();
    const { error } = editingReq
      ? await supabase.from('stock_requests').update({ ...payload, updated_at: now }).eq('id', editingReq.id)
      : await supabase.from('stock_requests').insert({
          ...payload,
          id: `REQ-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`,
          submitted_by: requesterIdentity || 'Unknown',
          status: 'pending',
        });

    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setShowForm(false);
    setEditingReq(null);
    showToast(editingReq ? 'Request updated.' : 'Request submitted.');

    if (editingReq) {
      setRequests((prev) => prev.map((r) => (r.id === editingReq.id ? { ...r, ...payload, updated_at: now } : r)));
    } else {
      const newRequest: StockRequest = {
        ...payload,
        id: `REQ-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`,
        submitted_by: requesterIdentity || 'Unknown',
        status: 'pending',
        fulfillment_type: null,
        fulfillment_ref_id: null,
        reviewed_by: null,
        reviewed_at: null,
        reviewed_by_2: null,
        reviewed_at_2: null,
        approved_by: null,
        approved_at: null,
        review_note: null,
        return_reason: null,
        created_at: now,
        updated_at: now,
      };
      setRequests((prev) => [newRequest, ...prev]);
    }
  };

  const handleDelete = async (req: StockRequest) => {
    if (!window.confirm(`Permanently delete request ${req.id}? This cannot be undone.`)) return;
    const { error } = await supabase.from('stock_requests').delete().eq('id', req.id);
    if (error) showToast('Failed to delete: ' + error.message, 'error');
    else {
      showToast('Request deleted.');
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    }
  };

  const handleStatusChange = async (req: StockRequest, status: StockRequest['status']) => {
    let returnReason: string | null = null;
    if (status === 'returned') {
      const note = window.prompt('Why is this stock being returned?');
      if (note === null) return; // user cancelled the prompt
      returnReason = note.trim() || null;
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('stock_requests')
      .update({ status, return_reason: returnReason, updated_at: now })
      .eq('id', req.id);
    if (error) {
      showToast('Failed to update status: ' + error.message, 'error');
      return;
    }
    showToast(`Status updated to ${STATUS_META[status].label}.`);
    setViewingReq((prev) => (prev && prev.id === req.id ? { ...prev, status, return_reason: returnReason, updated_at: now } : prev));
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status, return_reason: returnReason, updated_at: now } : r)));
  };

  const handleSaveSignatures = async (req: StockRequest) => {
    setSavingSignatures(true);
    const now = new Date().toISOString();
    const update: Partial<StockRequest> = { updated_at: now };
    if (reviewedByInput.trim() !== (req.reviewed_by || '')) {
      update.reviewed_by = reviewedByInput.trim() || null;
      update.reviewed_at = reviewedByInput.trim() ? now : null;
    }
    if (reviewedBy2Input.trim() !== (req.reviewed_by_2 || '')) {
      update.reviewed_by_2 = reviewedBy2Input.trim() || null;
      update.reviewed_at_2 = reviewedBy2Input.trim() ? now : null;
    }
    if (approvedByInput.trim() !== (req.approved_by || '')) {
      update.approved_by = approvedByInput.trim() || null;
      update.approved_at = approvedByInput.trim() ? now : null;
    }

    const { error } = await supabase.from('stock_requests').update(update).eq('id', req.id);
    setSavingSignatures(false);
    if (error) {
      showToast('Failed to save signatures: ' + error.message, 'error');
      return;
    }
    showToast('Signatures updated.');
    setViewingReq((prev) => (prev && prev.id === req.id ? { ...prev, ...update } as StockRequest : prev));
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, ...update } as StockRequest : r)));
  };

  const handleToggleMenu = (reqId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 240;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const top = Math.max(8, Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 8));

    if (openMenuId === reqId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }
    setOpenMenuId(reqId);
    setMenuPosition({ left, top });
  };

  const closeMenu = () => { setOpenMenuId(null); setMenuPosition(null); };

  const filtered = requests.filter((r) => activeTab === 'all' || r.status === activeTab);

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    cancelled: requests.filter((r) => r.status === 'cancelled').length,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <DashboardLayout title="Stock Requests" subtitle="Log stock requests coming in for your warehouse">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Stock Requests</h1>
            <p className="text-sm text-gray-400 mt-1">
              {warehouseScope ? `Requests logged for ${warehouseScope}` : 'Requests logged across all warehouses'}
            </p>
          </div>
          {canSubmit && (
            <button
              onClick={openNew}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-add-line mr-1"></i>
              New Request
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Requests', value: stats.total, icon: 'ri-file-list-3-line', iconBg: 'from-gray-50 to-gray-100/60', iconColor: 'text-gray-500' },
            { label: 'Pending', value: stats.pending, icon: 'ri-time-line', iconBg: 'from-amber-50 to-amber-100/60', iconColor: 'text-amber-500' },
            { label: 'Cancelled', value: stats.cancelled, icon: 'ri-forbid-line', iconBg: 'from-gray-50 to-gray-100/60', iconColor: 'text-gray-400' },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-200 transition-all duration-200"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.iconBg} flex items-center justify-center`}>
                <i className={`${s.icon} ${s.iconColor} text-lg`}></i>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 tracking-tight">{s.value}</p>
                <p className="text-xs font-semibold text-gray-500 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => {
              const count = t.key === 'all' ? requests.length : requests.filter((r) => r.status === t.key).length;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    active ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template picker — choose which company's form to fill out */}
        {showTemplatePicker && (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setShowTemplatePicker(false)}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-xl w-full max-w-md px-6 py-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900">Which company is this request for?</h3>
                <button onClick={() => setShowTemplatePicker(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => pickTemplate(null)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <i className="ri-file-list-3-line text-gray-500"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Generic Request</p>
                    <p className="text-xs text-gray-400">No company-specific fields</p>
                  </div>
                </button>
                {activeTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => pickTemplate(t.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {t.logo_url ? (
                        <img src={t.logo_url} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-file-list-2-line text-emerald-600"></i>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                      {t.description && <p className="text-xs text-gray-400">{t.description}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Create form — modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setShowForm(false); setEditingReq(null); }}>
            <div
              className="bg-white rounded-2xl border border-gray-100 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto px-6 py-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{editingReq ? `Edit Request ${editingReq.id}` : 'New Stock Request'}</h3>
                  {activeTemplate && (
                    <button
                      onClick={() => setShowTemplatePicker(true)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      {activeTemplate.logo_url ? (
                        <img src={activeTemplate.logo_url} alt={activeTemplate.name} className="w-3.5 h-3.5 rounded-full object-cover" />
                      ) : (
                        <i className="ri-file-list-2-line"></i>
                      )}{activeTemplate.name} form
                      <i className="ri-arrow-down-s-line"></i>
                    </button>
                  )}
                </div>
                <button onClick={() => { setShowForm(false); setEditingReq(null); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>
              {formError && (
                <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Warehouse</label>
                  {warehouseScope ? (
                    <input
                      value={warehouseScope}
                      disabled
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                    />
                  ) : (
                    <select
                      value={form.warehouse}
                      onChange={(e) => setForm((f) => ({ ...f, warehouse: e.target.value, items: [] }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
                    >
                      <option value="">Select warehouse…</option>
                      {warehouses.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Requested By *</label>
                  <input
                    type="text"
                    value={form.requestedByName}
                    onChange={(e) => setForm((f) => ({ ...f, requestedByName: e.target.value }))}
                    placeholder="e.g. John from Sales"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 placeholder-gray-400"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 -mt-3 mb-4">"Requested By" is who is actually asking for this stock — not necessarily you.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="e.g. REF-2026-014"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 placeholder-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date of Receive</label>
                  <input
                    type="date"
                    value={form.dateOfReceive}
                    onChange={(e) => setForm((f) => ({ ...f, dateOfReceive: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Products */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">Products *</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    disabled={!form.warehouse}
                    className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer disabled:opacity-50"
                  >
                    <option value="">{form.warehouse ? `Select product from ${form.warehouse}…` : 'Select a warehouse first'}</option>
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {p.stock} in stock</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={selectedPackageWeight}
                    onChange={(e) => setSelectedPackageWeight(e.target.value)}
                    placeholder="Kg/pkg"
                    title="Package weight (kg)"
                    className="w-24 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
                  />
                  <input
                    type="text"
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    placeholder="Unit"
                    title="Unit (e.g. pcs, box)"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder-gray-400"
                  />
                  <input
                    type="number"
                    min={1}
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(Math.max(1, Number(e.target.value) || 1))}
                    title="Quantity"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <button
                    onClick={addItem}
                    disabled={!selectedProduct}
                    className="px-4 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-add-line mr-1"></i>Add
                  </button>
                </div>

                {form.items.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                          <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pkg (kg)</th>
                          <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                          <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                          <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total-Kg</th>
                          <th className="px-3 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {form.items.map((item) => (
                          <tr key={item.productId}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                                  ) : (
                                    <i className="ri-box-3-line text-emerald-500 text-xs"></i>
                                  )}
                                </div>
                                <span className="font-medium text-gray-800">{item.productName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{item.sku}</td>
                            <td className="px-4 py-2.5 text-center text-gray-600">{item.packageWeight ?? '—'}</td>
                            <td className="px-4 py-2.5 text-center text-gray-600">{item.unit || '—'}</td>
                            <td className="px-4 py-2.5 text-center text-gray-700">{item.quantity}</td>
                            <td className="px-4 py-2.5 text-center text-gray-700">{item.totalKg ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right">
                              <button onClick={() => removeItem(item.productId)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors cursor-pointer ml-auto">
                                <i className="ri-delete-bin-line text-sm"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {form.items.some((i) => i.totalKg) && (
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={5} className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</td>
                            <td className="px-4 py-2 text-center text-sm font-bold text-gray-800">
                              {Math.round(form.items.reduce((sum, i) => sum + (i.totalKg || 0), 0) * 100) / 100} Kg
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-sm text-gray-400">
                    No products added yet
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                  <div className="flex flex-wrap gap-2">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setForm((f) => ({ ...f, priority: p.value }))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          form.priority === p.value ? `${p.color} border-current` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="mb-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.needsReturn}
                  onChange={(e) => setForm((f) => ({ ...f, needsReturn: e.target.checked }))}
                  className="mt-0.5 rounded"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-700">This stock may need to be returned later</span>
                  <span className="block text-xs text-gray-400 mt-0.5">e.g. trial stock, event samples, consignment — lets Returns link back to this request.</span>
                </span>
              </label>
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">Reason</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {REASON_TAGS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => toggleReasonTag(t.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        form.reasonTags.includes(t.value)
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={2}
                  maxLength={300}
                  placeholder="e.g. Running low ahead of the weekend rush"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 resize-none"
                />
              </div>

              {activeTemplate && customFieldDefs.length > 0 && (
                <div className="mb-4 border border-emerald-100 bg-emerald-50/30 rounded-lg p-4">
                  <p className="text-xs font-semibold text-emerald-700 mb-3 flex items-center gap-1.5">
                    <i className="ri-file-list-2-line"></i>{activeTemplate.name} Form Fields
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customFieldDefs.map((field) => {
                      const value = form.customFieldValues[field.key] ?? defaultValueForField(field);
                      const setValue = (v: string | number | boolean) =>
                        setForm((f) => ({ ...f, customFieldValues: { ...f.customFieldValues, [field.key]: v } }));

                      return (
                        <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                          </label>
                          {field.type === 'textarea' ? (
                            <textarea
                              value={String(value)}
                              onChange={(e) => setValue(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 resize-none bg-white"
                            />
                          ) : field.type === 'select' ? (
                            <select
                              value={String(value)}
                              onChange={(e) => setValue(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white cursor-pointer"
                            >
                              <option value="">Select…</option>
                              {(field.options || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === 'checkbox' ? (
                            <label className="flex items-center gap-2 cursor-pointer mt-2">
                              <input type="checkbox" checked={Boolean(value)} onChange={(e) => setValue(e.target.checked)} className="rounded" />
                              <span className="text-sm text-gray-600">Yes</span>
                            </label>
                          ) : field.type === 'product' ? (
                            <select
                              value={String(value)}
                              onChange={(e) => setValue(e.target.value)}
                              disabled={!form.warehouse}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white cursor-pointer disabled:opacity-50"
                            >
                              <option value="">{form.warehouse ? 'Select product…' : 'Select a warehouse first'}</option>
                              {products.filter((p) => p.warehouse === form.warehouse).map((p) => (
                                <option key={p.id} value={`${p.name} (${p.sku})`}>{p.name} ({p.sku}) — {p.stock} in stock</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                              value={String(value)}
                              onChange={(e) => setValue(field.type === 'number' ? Number(e.target.value) : e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 bg-white"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editingReq ? 'Save Changes' : 'Submit Request'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setEditingReq(null); }}
                  className="px-5 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-12 text-center">
              <i className="ri-loader-4-line animate-spin text-gray-400 text-xl"></i>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-inbox-line text-emerald-400 text-2xl"></i>
              </div>
              <p className="text-sm font-medium text-gray-600">
                {activeTab === 'all' ? 'No requests yet' : `No ${STATUS_META[activeTab as StockRequest['status']]?.label.toLowerCase() ?? ''} requests`}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {activeTab === 'all' && canSubmit ? 'Click "New Request" to ask for a restock.' : 'Try a different filter tab.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Products</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Warehouse</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Qty</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Priority</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Requested By</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((req) => {
                    const priorityMeta = PRIORITIES.find((p) => p.value === req.priority) || PRIORITIES[2];
                    const statusMeta = STATUS_META[req.status];
                    const timeAgo = formatTimeAgo(req.created_at);
                    const firstItem = req.items[0];
                    const extraCount = req.items.length - 1;

                    return (
                      <tr key={req.id} className={`hover:bg-gray-50/50 transition-colors border-l-4 ${priorityMeta.accent}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden">
                              {firstItem?.imageUrl ? (
                                <img src={firstItem.imageUrl} alt={firstItem.productName} className="w-full h-full object-cover" />
                              ) : (
                                <i className="ri-box-3-line text-emerald-500 text-sm"></i>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800">
                                {firstItem?.productName ?? '—'}
                                {extraCount > 0 && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full align-middle">
                                    +{extraCount} more
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{firstItem?.sku ?? ''} · {timeAgo}</p>
                              {req.reason && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{req.reason}</p>}
                              {req.status === 'returned' && req.return_reason && (
                                <p className="text-xs text-violet-500 mt-0.5 line-clamp-1">Returned: {req.return_reason}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{req.warehouse}</td>
                        <td className="px-4 py-3.5 text-sm font-semibold text-gray-800">{req.total_items}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityMeta.color}`}>{priorityMeta.label}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${avatarColor(req.requested_by)}`}>
                              <span className="text-xs font-semibold">{req.requested_by.charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="text-xs text-gray-600">{req.requested_by}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusMeta.color}`}>{statusMeta.label}</span>
                            {req.needs_return && req.status !== 'returned' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600" title="This stock may need to be returned later">
                                <i className="ri-arrow-go-back-line mr-0.5"></i>Needs Return
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={(e) => handleToggleMenu(req.id, e)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer ml-auto"
                          >
                            <i className="ri-more-2-line text-sm"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Row actions dropdown — single floating menu, positioned per the open row */}
          {openMenuId && menuPosition && (() => {
            const req = filtered.find((r) => r.id === openMenuId);
            if (!req) return null;
            const isOwn = req.submitted_by === requesterIdentity;
            const canEditRow = req.status === 'pending' && (isAdmin || isOwn);

            return (
              <div
                className="fixed w-44 bg-white border border-gray-100 rounded-2xl shadow-md z-[60] py-1"
                style={{ left: menuPosition.left, top: menuPosition.top }}
                onMouseLeave={closeMenu}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { setViewingReq(req); closeMenu(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <i className="ri-eye-line text-gray-400"></i> View Details
                </button>
                {canEditRow && (
                  <button
                    onClick={() => { openEdit(req); closeMenu(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <i className="ri-edit-line text-gray-400"></i> Edit
                  </button>
                )}
                {canHardDelete && (
                  <>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      onClick={() => { handleDelete(req); closeMenu(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <i className="ri-delete-bin-line text-red-400"></i> Delete
                    </button>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* View Details modal */}
      {viewingReq && (() => {
        const priorityMeta = PRIORITIES.find((p) => p.value === viewingReq.priority) || PRIORITIES[2];
        const canChangeStatus = isAdmin || viewingReq.submitted_by === requesterIdentity;

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setViewingReq(null)}>
            <div
              className={`bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border-t-4 ${priorityMeta.topAccent}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center flex-shrink-0">
                    <i className="ri-archive-2-line text-gray-400 text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      {viewingReq.items.length} product{viewingReq.items.length !== 1 ? 's' : ''} requested
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{viewingReq.id}</p>
                  </div>
                </div>
                <button onClick={() => setViewingReq(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer flex-shrink-0">
                  <i className="ri-close-line text-lg"></i>
                </button>
              </div>

              {/* Status + Priority */}
              <div className="px-6 flex items-center gap-2 flex-wrap">
                {canChangeStatus ? (
                  <select
                    value={viewingReq.status}
                    onChange={(e) => handleStatusChange(viewingReq, e.target.value as StockRequest['status'])}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border-transparent focus:outline-none cursor-pointer ${STATUS_META[viewingReq.status].color}`}
                  >
                    {Object.entries(STATUS_META).map(([value, meta]) => (
                      <option key={value} value={value}>{meta.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_META[viewingReq.status].color}`}>
                    {STATUS_META[viewingReq.status].label}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${priorityMeta.color}`}>
                  <i className="ri-flag-2-fill mr-1 text-[10px]"></i>{priorityMeta.label} priority
                </span>
                {viewingReq.needs_return && viewingReq.status !== 'returned' && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">
                    <i className="ri-arrow-go-back-line mr-1 text-[10px]"></i>Needs Return
                  </span>
                )}
                {viewingReq.template_name && (() => {
                  const tplLogo = templates.find((t) => t.id === viewingReq.template_id)?.logo_url;
                  return (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                      {tplLogo ? (
                        <img src={tplLogo} alt={viewingReq.template_name} className="w-3.5 h-3.5 rounded-full object-cover" />
                      ) : (
                        <i className="ri-file-list-2-line text-[10px]"></i>
                      )}{viewingReq.template_name} form
                    </span>
                  );
                })()}
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-2 gap-3 px-6 mt-4">
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Warehouse</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5 flex items-center gap-1.5">
                    <i className="ri-building-2-line text-gray-400"></i>{viewingReq.warehouse}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Units</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5 flex items-center gap-1.5">
                    <i className="ri-stack-line text-gray-400"></i>{viewingReq.total_items} units
                  </p>
                </div>
                {viewingReq.reference && (
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Reference</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5 flex items-center gap-1.5">
                      <i className="ri-hashtag text-gray-400"></i>{viewingReq.reference}
                    </p>
                  </div>
                )}
                {viewingReq.date_of_receive && (
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Date of Receive</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5 flex items-center gap-1.5">
                      <i className="ri-calendar-check-line text-gray-400"></i>{new Date(viewingReq.date_of_receive).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {viewingReq.total_kg > 0 && (
                  <div className="rounded-xl bg-gray-50 px-4 py-3 col-span-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Weight</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5 flex items-center gap-1.5">
                      <i className="ri-scales-3-line text-gray-400"></i>{viewingReq.total_kg} Kg
                    </p>
                  </div>
                )}
              </div>

              {/* Itemized product list */}
              <div className="px-6 mt-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Products</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                  {viewingReq.items.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 overflow-hidden">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                          ) : (
                            <i className="ri-box-3-line text-emerald-500 text-sm"></i>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                          <p className="text-xs text-gray-400 font-mono">
                            {item.sku}
                            {item.packageWeight ? ` · ${item.packageWeight}kg/${item.unit || 'unit'}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <span className="text-sm font-bold text-gray-700">×{item.quantity}</span>
                        {item.totalKg ? <p className="text-xs text-gray-400">{item.totalKg} Kg</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* People */}
              <div className="grid grid-cols-2 gap-3 px-6 mt-3">
                <div className="rounded-xl border border-gray-100 px-4 py-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Requested By</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${avatarColor(viewingReq.requested_by)}`}>
                      <span className="text-xs font-semibold">{viewingReq.requested_by.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700 truncate">{viewingReq.requested_by}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 px-4 py-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Logged By</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${avatarColor(viewingReq.submitted_by)}`}>
                      <span className="text-xs font-semibold">{viewingReq.submitted_by.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700 truncate">{viewingReq.submitted_by}</span>
                  </div>
                </div>
              </div>

              {/* Reason */}
              {(viewingReq.reason_tags.length > 0 || viewingReq.reason) && (
                <div className="px-6 mt-3">
                  <div className="rounded-xl bg-amber-50/60 border border-amber-100 px-4 py-3">
                    {viewingReq.reason_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {viewingReq.reason_tags.map((tag) => {
                          const meta = REASON_TAGS.find((t) => t.value === tag);
                          return (
                            <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              {meta?.label || tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {viewingReq.reason && (
                      <div className="flex gap-2.5">
                        <i className="ri-double-quotes-l text-amber-300 text-lg leading-none"></i>
                        <p className="text-sm text-gray-700 italic">{viewingReq.reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Custom company form fields */}
              {viewingReq.custom_fields.length > 0 && (
                <div className="px-6 mt-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{viewingReq.template_name || 'Company'} Form Fields</p>
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {viewingReq.custom_fields.map((field) => (
                      <div key={field.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="text-xs font-medium text-gray-500">{field.label}</span>
                        <span className="text-sm text-gray-800 text-right">
                          {field.type === 'checkbox' ? (field.value ? 'Yes' : 'No') : String(field.value) || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approval chain */}
              <div className="px-6 mt-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Approval</p>
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {[
                    { label: 'Reviewed By', value: reviewedByInput, setValue: setReviewedByInput, at: viewingReq.reviewed_at },
                    { label: 'Reviewed By (2)', value: reviewedBy2Input, setValue: setReviewedBy2Input, at: viewingReq.reviewed_at_2 },
                    { label: 'Approved By', value: approvedByInput, setValue: setApprovedByInput, at: viewingReq.approved_at },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-xs font-medium text-gray-500 w-28 flex-shrink-0">{row.label}</span>
                      {isAdmin ? (
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => row.setValue(e.target.value)}
                          placeholder="Name"
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400 placeholder-gray-400"
                        />
                      ) : (
                        <span className="text-sm text-gray-700 truncate">{row.value || '—'}</span>
                      )}
                      {row.at && <span className="text-[11px] text-gray-400 flex-shrink-0">{new Date(row.at).toLocaleDateString()}</span>}
                    </div>
                  ))}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleSaveSignatures(viewingReq)}
                    disabled={savingSignatures}
                    className="mt-2 px-4 py-1.5 bg-gray-800 text-white text-xs font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {savingSignatures ? 'Saving...' : 'Save Signatures'}
                  </button>
                )}
              </div>

              {/* Return reason */}
              {viewingReq.status === 'returned' && viewingReq.return_reason && (
                <div className="px-6 mt-3">
                  <div className="rounded-xl bg-violet-50/60 border border-violet-100 px-4 py-3 flex gap-2.5">
                    <i className="ri-arrow-go-back-line text-violet-400 text-base"></i>
                    <div>
                      <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Return Reason</p>
                      <p className="text-sm text-gray-700 mt-0.5">{viewingReq.return_reason}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline footer */}
              <div className="flex items-center justify-between px-6 py-4 mt-4 border-t border-gray-100 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <i className="ri-calendar-line"></i> Created {new Date(viewingReq.created_at).toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="ri-refresh-line"></i> Updated {new Date(viewingReq.updated_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <i className={`${toast.type === 'success' ? 'ri-check-line' : 'ri-error-warning-line'} text-base`}></i>
            {toast.msg}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
