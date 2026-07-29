import { useState, useEffect, useCallback, useMemo, type MouseEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { isReservedFieldLabel, type RequestFormTemplate, type TemplateField } from '@/pages/admin/request-templates/page';
import { getReservedQuantities, availableStock } from '@/lib/stockReservations';
import { deductStockForItems } from '@/lib/stockDeduction';
import { uploadShipmentDocument } from '@/lib/uploadShipmentDocument';
import { exportToCsv } from '@/lib/exportCsv';
import { exportRequestAsForm } from '@/lib/exportRequestForm';
import { downloadPdf, type PdfNote } from '@/lib/exportPdf';
import { logAudit } from '@/lib/auditLog';
import { getClaimedReturnQuantities } from '@/lib/returnProgress';
import { notifyAdmins } from '@/lib/notifyAdmins';
import { asArray } from '@/pages/warehouses/warehouseShared';
import { expirySuffix, expiryTone, formatExpiry } from '@/lib/expiry';
import { groupBinStock, lowestQuantityBin, binExpiry, type BinStockRow } from '@/lib/binStock';

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
  /** Which bin the units are being dispatched from — picked when confirming receipt. */
  binLocation?: string;
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
  /** Set once the receiver signs off that the stock arrived — flips status to 'fulfilled'. */
  received_at: string | null;
  received_by: string | null;
  receipt_confirmed: boolean;
  /** Set once dispatch is confirmed with a document — this is what actually deducts stock, not Approve. */
  dispatched_at: string | null;
  dispatched_by: string | null;
  dispatch_document_url: string | null;
  dispatch_document_name: string | null;
  /** Flagged at creation time — this stock may need to come back later (trial/consignment/etc). */
  needs_return: boolean;
  /** Which company form (e.g. UNT, SVP) this request was filled out under, if any. */
  template_id: string | null;
  template_name: string | null;
  /** Self-contained snapshot of that template's extra field answers. */
  custom_fields: CustomFieldAnswer[];
  /** Supporting document (PO, photo, etc.) required when submitting a request. */
  referral_document_url: string | null;
  referral_document_name: string | null;
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
  bin_location?: string | null;
  expiry_date?: string | null;
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

function isImageFileName(name: string | null | undefined) {
  return !!name && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
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

// Dispatch doesn't get its own stored status value (still 'approved' underneath) —
// this only changes what's displayed once Confirm Dispatch has gone through,
// mirroring the "Complete" label the other modules show at their equivalent step.
function requestStatusDisplay(req: Pick<StockRequest, 'status' | 'dispatched_at'>): { label: string; color: string } {
  if (req.status === 'approved' && req.dispatched_at) {
    return { label: 'Complete', color: 'bg-emerald-50 text-emerald-600' };
  }
  return STATUS_META[req.status];
}

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
  const canApproveRequests = isAdmin;
  const requesterIdentity = profile?.full_name || profile?.email;

  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [binStockByProduct, setBinStockByProduct] = useState<Record<string, BinStockRow[]>>({});
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [templates, setTemplates] = useState<RequestFormTemplate[]>([]);
  const [reserved, setReserved] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingReq, setEditingReq] = useState<StockRequest | null>(null);
  const [viewingReq, setViewingReq] = useState<StockRequest | null>(null);
  const [form, setForm] = useState(emptyForm(warehouseScope?.[0] || ''));
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedBin, setSelectedBin] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedPackageWeight, setSelectedPackageWeight] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('pcs');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingApproval, setUploadingApproval] = useState(false);
  const [pendingDocFile, setPendingDocFile] = useState<File | null>(null);
  const [pendingDocPreview, setPendingDocPreview] = useState<string | null>(null);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [exportingForm, setExportingForm] = useState(false);

  /** Per-product quantity already claimed by a return linked to the currently-viewed request. */
  const [returnProgress, setReturnProgress] = useState<Record<string, number>>({});
  const [receiptName, setReceiptName] = useState('');
  const [receiptChecked, setReceiptChecked] = useState(false);
  const [dispatchBinByProduct, setDispatchBinByProduct] = useState<Record<string, string>>({});
  const [dispatchBinOptions, setDispatchBinOptions] = useState<string[]>([]);
  const [dispatchBinQtyByProduct, setDispatchBinQtyByProduct] = useState<Record<string, BinStockRow[]>>({});

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('stock_requests').select('*').order('created_at', { ascending: false });
    if (warehouseScope) query = query.in('warehouse', warehouseScope);
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
          receipt_confirmed: Boolean(r.receipt_confirmed),
        }))
      );
    }
    setLoading(false);
  }, [warehouseScope]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    async function loadOptions() {
      let productsQuery = supabase.from('products').select('id, name, sku, image_url, stock, low_stock_threshold, warehouse, bin_location, expiry_date');
      let warehousesQuery = supabase.from('warehouses').select('name').order('name', { ascending: true });
      if (warehouseScope) {
        productsQuery = productsQuery.in('warehouse', warehouseScope);
        warehousesQuery = warehousesQuery.in('name', warehouseScope);
      }
      const [{ data: p }, { data: w }, { data: bins }] = await Promise.all([productsQuery, warehousesQuery, supabase.from('product_bin_stock').select('product_id, bin_location, quantity, expiry_date')]);
      if (p) setProducts(p as ProductOption[]);
      if (w) setWarehouses(w.map((row) => row.name as string));
      setBinStockByProduct(groupBinStock((bins || []) as { product_id: string; bin_location: string; quantity: number; expiry_date?: string | null }[]));
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
    setPendingDocFile(null);
    setReceiptName('');
    setReceiptChecked(false);
    setDispatchBinByProduct(
      viewingReq ? Object.fromEntries(viewingReq.items.filter((i) => i.binLocation).map((i) => [i.productId, i.binLocation as string])) : {}
    );
    setDispatchBinOptions([]);
  }, [viewingReq?.id]);

  // Bin options come from the warehouse's registry PLUS any bin these products
  // already use — the registry alone can be empty even when real bins are
  // already in use. Picked when confirming receipt, since that's the one
  // action that actually deducts stock.
  useEffect(() => {
    if (!viewingReq || viewingReq.dispatched_at) return;
    (async () => {
      const [{ data: wh }, { data: bins }] = await Promise.all([
        supabase.from('warehouses').select('bin_locations').eq('name', viewingReq.warehouse).maybeSingle(),
        supabase.from('product_bin_stock').select('product_id, bin_location, quantity').in('product_id', viewingReq.items.map((i) => i.productId)),
      ]);
      const registryBins = wh ? asArray<string>(wh.bin_locations) : [];
      const productBinRows = (bins || []) as { product_id: string; bin_location: string; quantity: number }[];
      setDispatchBinOptions([...new Set([...registryBins, ...productBinRows.map((row) => row.bin_location)])]);
      const qtyByProduct = groupBinStock(productBinRows);
      setDispatchBinQtyByProduct(qtyByProduct);
      // Default whichever items don't already have a bin assigned to the one with
      // the least stock on hand — still freely changeable in the dropdown below.
      setDispatchBinByProduct((prev) => {
        const next = { ...prev };
        viewingReq.items.forEach((item) => {
          if (!next[item.productId]) {
            const preferred = lowestQuantityBin(qtyByProduct[item.productId]);
            if (preferred) next[item.productId] = preferred;
          }
        });
        return next;
      });
    })();
  }, [viewingReq?.id, viewingReq?.warehouse, viewingReq?.dispatched_at]);

  // Swap the staged-document preview URL whenever a new file is picked, and always
  // revoke the previous one — object URLs otherwise leak for the life of the tab.
  useEffect(() => {
    if (!pendingDocFile) {
      setPendingDocPreview(null);
      return;
    }
    if (!pendingDocFile.type.startsWith('image/')) {
      setPendingDocPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingDocFile);
    setPendingDocPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingDocFile]);

  useEffect(() => {
    if (viewingReq?.needs_return) {
      getClaimedReturnQuantities(viewingReq.id).then(setReturnProgress);
    } else {
      setReturnProgress({});
    }
  }, [viewingReq?.id, viewingReq?.needs_return]);

  const availableProducts = useMemo(
    () => products.filter((p) => p.warehouse === form.warehouse && !form.items.find((i) => i.productId === p.id)),
    [products, form.warehouse, form.items]
  );

  const activeTemplates = templates.filter((t) => t.is_active);

  const openNew = () => {
    setEditingReq(null);
    setForm(emptyForm(warehouseScope?.[0] || warehouses[0] || ''));
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedPackageWeight('');
    setSelectedUnit('pcs');
    setSelectedBin('');
    setFormError(null);
    getReservedQuantities().then(setReserved);
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
    setSelectedBin('');
    setFormError(null);
    getReservedQuantities({ excludeRequestId: req.id }).then(setReserved);
    setShowForm(true);
  };

  const selectedBinOptions = binStockByProduct[selectedProduct] || [];

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProduct);
    if (!product || selectedQty < 1) return;
    const available = availableStock(product.stock, reserved, product.id);
    if (selectedQty > available) {
      setFormError(`Only ${available} unit${available === 1 ? '' : 's'} of "${product.name}" available — the rest is tied up in other pending requests/orders/transfers.`);
      return;
    }
    setFormError(null);
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
          binLocation: selectedBinOptions.length > 1 ? selectedBin || undefined : selectedBinOptions[0]?.bin_location,
        },
      ],
    }));
    setSelectedProduct('');
    setSelectedQty(1);
    setSelectedPackageWeight('');
    setSelectedUnit('pcs');
    setSelectedBin('');
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
    const newId = `REQ-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`;
    const { error } = editingReq
      ? await supabase.from('stock_requests').update({ ...payload, updated_at: now }).eq('id', editingReq.id)
      : await supabase.from('stock_requests').insert({
          ...payload,
          id: newId,
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
      logAudit({ action: 'update', module: 'requests', description: `Updated request ${editingReq.id}`, referenceId: editingReq.id });
    } else {
      logAudit({ action: 'create', module: 'requests', description: `Created request ${newId} (${payload.total_items} items)`, referenceId: newId });
      notifyAdmins(
        'new_request',
        'New Stock Request',
        `${payload.requested_by} requested ${payload.total_items} item${payload.total_items !== 1 ? 's' : ''} from ${payload.warehouse}.`,
        { request_id: newId }
      );
      const newRequest: StockRequest = {
        ...payload,
        id: newId,
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
        received_at: null,
        received_by: null,
        receipt_confirmed: false,
        dispatched_at: null,
        dispatched_by: null,
        dispatch_document_url: null,
        dispatch_document_name: null,
        referral_document_url: null,
        referral_document_name: null,
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
      logAudit({ action: 'delete', module: 'requests', description: `Deleted request ${req.id}`, referenceId: req.id });
    }
  };

  const handleStatusChange = async (req: StockRequest, status: StockRequest['status']) => {
    if (status === 'rejected' && !canApproveRequests) return;

    let returnReason: string | null = null;
    let reviewNote: string | null = req.review_note;
    if (status === 'returned') {
      const note = window.prompt('Why is this stock being returned?');
      if (note === null) return; // user cancelled the prompt
      returnReason = note.trim() || null;
    }
    if (status === 'rejected') {
      const note = window.prompt('Why is this request being rejected? (optional)');
      if (note === null) return; // user cancelled the prompt
      reviewNote = note.trim() || null;
    }

    const now = new Date().toISOString();
    const update = { status, return_reason: returnReason, review_note: reviewNote, updated_at: now };
    const { error } = await supabase.from('stock_requests').update(update).eq('id', req.id);
    if (error) {
      showToast('Failed to update status: ' + error.message, 'error');
      return;
    }
    showToast(`Status updated to ${STATUS_META[status].label}.`);
    setViewingReq((prev) => (prev && prev.id === req.id ? { ...prev, ...update } : prev));
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, ...update } : r)));
    logAudit({ action: 'update', module: 'requests', description: `Request ${req.id} ${status}`, referenceId: req.id });
  };

  // Approve is a pure decision — no document, no stock movement. Stock only
  // leaves the warehouse once Confirm Dispatch is done (see below), backed by
  // a required document.
  const handleApprove = async (req: StockRequest) => {
    if (!canApproveRequests) return;

    const now = new Date().toISOString();
    const update = {
      status: 'approved' as const,
      approved_by: requesterIdentity || 'Admin',
      approved_at: now,
      updated_at: now,
    };
    const { error } = await supabase.from('stock_requests').update(update).eq('id', req.id);
    if (error) {
      showToast('Failed to approve: ' + error.message, 'error');
      return;
    }
    showToast('Request approved.');
    setViewingReq((prev) => (prev && prev.id === req.id ? { ...prev, ...update } : prev));
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, ...update } : r)));
    logAudit({ action: 'update', module: 'requests', description: `Approved request ${req.id}`, referenceId: req.id });
  };

  // Confirming receipt is the one place stock actually leaves the warehouse —
  // requires a handover document, mirroring Purchases/Transfers/Returns/Orders.
  // (A request already dispatched under the old two-step flow skips re-upload
  // and re-deduction — `file` is null for that legacy path.)
  const handleConfirmReceipt = async (req: StockRequest, file: File | null) => {
    if (!receiptName.trim() || !receiptChecked) return;
    const alreadyDispatched = !!req.dispatched_at;
    if (!alreadyDispatched && (!canApproveRequests || !file)) return;

    setUploadingApproval(true);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: 'fulfilled' as const,
      received_at: now,
      received_by: receiptName.trim(),
      receipt_confirmed: true,
      updated_at: now,
    };

    if (!alreadyDispatched) {
      const { url, error: uploadError } = await uploadShipmentDocument(file as File);
      if (uploadError || !url) {
        setUploadingApproval(false);
        showToast('Failed to upload document: ' + (uploadError || 'unknown error'), 'error');
        return;
      }

      const itemsWithBin = req.items.map((i) => ({ ...i, binLocation: dispatchBinByProduct[i.productId] || i.binLocation }));
      const { error: deductError } = await deductStockForItems(itemsWithBin, {
        reference: req.id,
        note: `Dispatched request ${req.id}`,
        userName: requesterIdentity || 'Admin',
        historyType: 'request',
      });
      if (deductError) {
        setUploadingApproval(false);
        showToast('Cannot confirm receipt: ' + deductError, 'error');
        return;
      }

      // Persist whichever bin was actually picked — otherwise it's used for the
      // deduction above but forgotten, and the request would show no bin at all
      // once dispatched.
      update.items = itemsWithBin;
      update.dispatched_at = now;
      update.dispatched_by = requesterIdentity || 'Admin';
      update.dispatch_document_url = url;
      update.dispatch_document_name = (file as File).name;
    }

    const { error } = await supabase.from('stock_requests').update(update).eq('id', req.id);
    setUploadingApproval(false);
    if (error) {
      showToast('Failed to confirm receipt: ' + error.message, 'error');
      return;
    }
    showToast(alreadyDispatched ? 'Receipt confirmed — request fulfilled.' : 'Receipt confirmed — stock deducted.');
    setViewingReq((prev) => (prev && prev.id === req.id ? { ...prev, ...update } : prev));
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, ...update } : r)));
    setReceiptName('');
    setReceiptChecked(false);
    setPendingDocFile(null);
    logAudit({ action: 'update', module: 'requests', description: `Receipt confirmed for request ${req.id}`, referenceId: req.id });
  };

  const handleDocFilePick = (file: File | undefined) => {
    if (!file) return;
    setPendingDocFile(file);
  };

  const exportRequestDetails = async (req: StockRequest) => {
    const template = req.template_id ? templates.find((t) => t.id === req.template_id) : null;
    if (template) {
      setExportingForm(true);
      try {
        await exportRequestAsForm(
          {
            id: req.id,
            reference: req.reference,
            date_of_receive: req.date_of_receive,
            requested_by: req.requested_by,
            items: req.items,
            needs_return: req.needs_return,
            reason: req.reason,
            reason_tags: req.reason_tags,
            reviewed_by: req.reviewed_by,
            reviewed_at: req.reviewed_at,
            reviewed_by_2: req.reviewed_by_2,
            reviewed_at_2: req.reviewed_at_2,
            approved_by: req.approved_by,
            approved_at: req.approved_at,
          },
          { name: template.name, logo_url: template.logo_url }
        );
      } catch (err) {
        console.error(err);
        showToast('Failed to export form.', 'error');
      } finally {
        setExportingForm(false);
      }
      return;
    }

    exportToCsv(`request-${req.id}`, req.items, [
      { header: 'Request ID', value: () => req.id },
      { header: 'Warehouse', value: () => req.warehouse },
      { header: 'Requested By', value: () => req.requested_by },
      { header: 'Submitted By', value: () => req.submitted_by },
      { header: 'Priority', value: () => req.priority },
      { header: 'Status', value: () => req.status },
      { header: 'Reference', value: () => req.reference || '' },
      { header: 'Date of Receive', value: () => req.date_of_receive || '' },
      { header: 'Reason', value: () => req.reason || '' },
      { header: 'Reason Tags', value: () => req.reason_tags.join('; ') },
      { header: 'Product', value: (i) => i.productName },
      { header: 'SKU', value: (i) => i.sku },
      { header: 'Quantity', value: (i) => i.quantity },
      { header: 'Unit', value: (i) => i.unit || '' },
      { header: 'Package Weight (kg)', value: (i) => i.packageWeight ?? '' },
      { header: 'Total Kg', value: (i) => i.totalKg ?? '' },
      { header: 'Template', value: () => req.template_name || '' },
      { header: 'Custom Fields', value: () => req.custom_fields.map((f) => `${f.label}: ${f.type === 'checkbox' ? (f.value ? 'Yes' : 'No') : f.value}`).join('; ') },
      { header: 'Referral Document', value: () => req.referral_document_url || '' },
      { header: 'Dispatched By', value: () => req.dispatched_by || '' },
      { header: 'Dispatched At', value: () => req.dispatched_at || '' },
      { header: 'Dispatch Document', value: () => req.dispatch_document_url || '' },
      { header: 'Reviewed By', value: () => req.reviewed_by || '' },
      { header: 'Reviewed By (2)', value: () => req.reviewed_by_2 || '' },
      { header: 'Approved By', value: () => req.approved_by || '' },
      { header: 'Rejection/Review Note', value: () => req.review_note || '' },
      { header: 'Return Reason', value: () => req.return_reason || '' },
      { header: 'Created At', value: () => req.created_at },
      { header: 'Updated At', value: () => req.updated_at },
    ]);
  };

  const handleDownloadRequestPdf = (req: StockRequest) => {
    const notes: PdfNote[] = [];
    if (req.reason || req.reason_tags.length > 0) {
      const tagLabels = req.reason_tags.map((tag) => REASON_TAGS.find((t) => t.value === tag)?.label || tag);
      notes.push({ label: 'Reason', text: [tagLabels.join(', '), req.reason].filter(Boolean).join(' — '), tone: 'amber' });
    }
    if (req.status === 'rejected' && req.review_note) {
      notes.push({ label: 'Rejection Reason', text: req.review_note, tone: 'red' });
    }
    if (req.status === 'returned' && req.return_reason) {
      notes.push({ label: 'Return Reason', text: req.return_reason, tone: 'violet' });
    }

    downloadPdf(
      {
        docType: req.template_name ? `${req.template_name} Request` : 'Stock Request',
        docId: req.id,
        status: req.status,
        subtitle: req.warehouse,
        infoBoxes: [
          {
            title: 'Request Info',
            rows: [
              { label: 'Total Units', value: `${req.total_items} units` },
              ...(req.reference ? [{ label: 'Reference', value: req.reference }] : []),
              ...(req.date_of_receive ? [{ label: 'Date of Receive', value: new Date(req.date_of_receive).toLocaleDateString() }] : []),
              ...(req.total_kg > 0 ? [{ label: 'Total Weight', value: `${req.total_kg} Kg` }] : []),
            ],
          },
          {
            title: 'People',
            rows: [
              { label: 'Requested By', value: req.requested_by },
              { label: 'Logged By', value: req.submitted_by },
              ...(req.reviewed_by ? [{ label: 'Reviewed By', value: req.reviewed_by }] : []),
              ...(req.approved_by ? [{ label: 'Approved By', value: req.approved_by }] : []),
            ],
          },
        ],
        notes,
        tables: [
          {
            title: 'Products',
            head: ['Product', 'SKU', 'Bin', 'Package', 'Qty'],
            rows: req.items.map((item) => [
              item.productName,
              item.sku,
              item.binLocation || products.find((p) => p.id === item.productId)?.bin_location || '—',
              item.packageWeight ? `${item.packageWeight}${item.unit || 'kg'}` : (item.unit || '—'),
              item.quantity,
            ]),
            colStyles: { 4: { halign: 'center' } },
            footRow: [{ content: 'Total Units', colSpan: 4, styles: { halign: 'right' } }, req.total_items],
          },
        ],
        footerLeft: `Requested by ${req.requested_by}`,
      },
      `${req.id}.pdf`
    );
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
    <DashboardLayout
      title="Stock Requests"
      subtitle={warehouseScope ? `Requests logged for ${warehouseScope.join(', ')}` : 'Requests logged across all warehouses'}
    >
      <>
        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Total Requests', value: stats.total, icon: 'ri-file-list-3-line', color: 'text-gray-800', bg: 'bg-gray-100' },
            { label: 'Pending', value: stats.pending, icon: 'ri-time-line', color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'Cancelled', value: stats.cancelled, icon: 'ri-forbid-line', color: 'text-gray-500', bg: 'bg-gray-100' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-xl px-5 py-4 flex items-center gap-4">
              <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${kpi.bg}`}>
                <i className={`${kpi.icon} ${kpi.color} text-lg`}></i>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 tracking-tight">{loading ? '—' : kpi.value}</p>
                <p className="text-xs text-gray-400">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div className="bg-white rounded-2xl">
          {/* Toolbar */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToCsv('requests', filtered, [
                  { header: 'ID', value: (r) => r.id },
                  { header: 'Warehouse', value: (r) => r.warehouse },
                  { header: 'Requested By', value: (r) => r.requested_by },
                  { header: 'Submitted By', value: (r) => r.submitted_by },
                  { header: 'Priority', value: (r) => r.priority },
                  { header: 'Status', value: (r) => r.status },
                  { header: 'Total Items', value: (r) => r.total_items },
                  { header: 'Total Kg', value: (r) => r.total_kg },
                  { header: 'Reason', value: (r) => r.reason || '' },
                  { header: 'Reference', value: (r) => r.reference || '' },
                  { header: 'Approved By', value: (r) => r.approved_by || '' },
                  { header: 'Created At', value: (r) => r.created_at },
                  { header: 'Updated At', value: (r) => r.updated_at },
                ])}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-2-line mr-1"></i>
                Export
              </button>
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
                  {warehouseScope && warehouseScope.length === 1 ? (
                    <input
                      value={warehouseScope[0]}
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
                      {(warehouseScope || warehouses).map((w) => (
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
                    onChange={(e) => { setSelectedProduct(e.target.value); setSelectedBin(lowestQuantityBin(binStockByProduct[e.target.value])); }}
                    disabled={!form.warehouse}
                    className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-800 cursor-pointer disabled:opacity-50"
                  >
                    <option value="">{form.warehouse ? `Select product from ${form.warehouse}…` : 'Select a warehouse first'}</option>
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku}){p.bin_location ? ` — Bin: ${p.bin_location}` : ''} — {availableStock(p.stock, reserved, p.id)} available</option>
                    ))}
                  </select>
                  {selectedBinOptions.length > 1 && (
                    <select
                      value={selectedBin}
                      onChange={(e) => setSelectedBin(e.target.value)}
                      className="w-44 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                    >
                      <option value="">From bin…</option>
                      {selectedBinOptions.map((b) => (
                        <option key={b.bin_location} value={b.bin_location}>
                          {b.bin_location} ({b.quantity} on hand){b.expiry_date ? ` — Exp ${formatExpiry(b.expiry_date)}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
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
                    value={selectedQty === 0 ? '' : selectedQty}
                    onChange={(e) => {
                      // Don't force a fallback to 1 while typing — that snaps the value
                      // back on every keystroke (e.g. while backspacing to clear it)
                      // and fights the user's typing.
                      const val = e.target.value;
                      setSelectedQty(val === '' ? 0 : Math.max(0, Number(val) || 0));
                    }}
                    placeholder="1"
                    title="Quantity"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <button
                    onClick={addItem}
                    disabled={!selectedProduct || (selectedBinOptions.length > 1 && !selectedBin)}
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
                                <div>
                                  <span className="font-medium text-gray-800">{item.productName}</span>
                                  {(() => {
                                    const matchedProduct = products.find((p) => p.id === item.productId);
                                    const bin = item.binLocation || matchedProduct?.bin_location;
                                    const itemExpiry = binExpiry(binStockByProduct[item.productId], bin) ?? matchedProduct?.expiry_date;
                                    return (
                                      <>
                                        {bin && <p className="text-[11px] text-gray-400 font-mono">Bin: {bin}</p>}
                                        {itemExpiry && (
                                          <p className={`text-[11px] ${expiryTone(itemExpiry)}`}>Exp {formatExpiry(itemExpiry)}</p>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
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
                                <option key={p.id} value={`${p.name} (${p.sku})`}>{p.name} ({p.sku}) — {p.stock} in stock{expirySuffix(p.expiry_date)}</option>
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
        <div className="overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <i className="ri-loader-4-line animate-spin text-3xl mb-3"></i>
              <p className="text-sm">Loading requests…</p>
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
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Reference</th>
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
                    const statusMeta = requestStatusDisplay(req);
                    const timeAgo = formatTimeAgo(req.created_at);
                    const firstItem = req.items[0];
                    const extraCount = req.items.length - 1;

                    return (
                      <tr key={req.id} className={`hover:bg-gray-50/50 transition-colors border-l-4 ${priorityMeta.accent}`}>
                        <td className="px-4 py-3.5 text-xs text-gray-500 font-mono whitespace-nowrap">{req.reference || '—'}</td>
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
      </>

      {/* View Details modal */}
      {viewingReq && (() => {
        const priorityMeta = PRIORITIES.find((p) => p.value === viewingReq.priority) || PRIORITIES[2];
        const isOwnRequest = viewingReq.submitted_by === requesterIdentity;
        const isPending = viewingReq.status === 'pending';
        // Pending requests need an explicit Approve/Reject decision from an admin (or a role
        // an admin has granted "approve" to) — the submitter can no longer self-approve.
        // Once decided, admins/owners can still move it through fulfilled/cancelled/returned below.
        const canChangeStatus = !isPending && (isAdmin || isOwnRequest);

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setViewingReq(null)}>
            <div
              className={`bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border-t-4 ${priorityMeta.topAccent}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-6 pt-5 pb-4 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center flex-shrink-0">
                    <i className="ri-archive-2-line text-gray-400 text-xl"></i>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      {viewingReq.items.length} product{viewingReq.items.length !== 1 ? 's' : ''} requested
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{viewingReq.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => exportRequestDetails(viewingReq)}
                    disabled={exportingForm}
                    title="Export"
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <i className={exportingForm ? 'ri-loader-4-line animate-spin' : 'ri-download-2-line'}></i>
                  </button>
                  <button
                    onClick={() => handleDownloadRequestPdf(viewingReq)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-pdf-2-line"></i>Download PDF
                  </button>
                  <button onClick={() => setViewingReq(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer flex-shrink-0">
                    <i className="ri-close-line text-lg"></i>
                  </button>
                </div>
              </div>

              {/* Status + tags */}
              <div className="px-6 flex items-center gap-2 flex-wrap">
                {canChangeStatus ? (
                  <select
                    value={viewingReq.status}
                    onChange={(e) => handleStatusChange(viewingReq, e.target.value as StockRequest['status'])}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border-transparent focus:outline-none cursor-pointer ${requestStatusDisplay(viewingReq).color}`}
                  >
                    {Object.entries(STATUS_META).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {value === 'approved' && viewingReq.dispatched_at ? 'Complete' : meta.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${requestStatusDisplay(viewingReq).color}`}>
                    {requestStatusDisplay(viewingReq).label}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${priorityMeta.color}`}>
                  <i className="ri-flag-2-fill mr-1 text-[10px]"></i>{priorityMeta.label} priority
                </span>
                {viewingReq.needs_return && viewingReq.status !== 'returned' && (() => {
                  const totalRequested = viewingReq.items.reduce((s, i) => s + i.quantity, 0);
                  const totalReturned = viewingReq.items.reduce((s, i) => s + (returnProgress[i.productId] || 0), 0);
                  return (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">
                      <i className="ri-arrow-go-back-line mr-1 text-[10px]"></i>
                      Needs Return{totalReturned > 0 ? ` — ${totalReturned}/${totalRequested} returned` : ''}
                    </span>
                  );
                })()}
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

              {/* Pending decision */}
              {isPending && (canApproveRequests || isOwnRequest) && (
                <div className="mx-6 mt-3 px-4 py-3 rounded-xl bg-amber-50/60 border border-amber-100 flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                    <i className="ri-time-line"></i>
                    Awaiting decision
                  </span>
                  <div className="flex items-center gap-2">
                    {isOwnRequest && (
                      <button
                        onClick={() => handleStatusChange(viewingReq, 'cancelled')}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        Cancel Request
                      </button>
                    )}
                    {canApproveRequests && (
                      <>
                        <button
                          onClick={() => handleStatusChange(viewingReq, 'rejected')}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <i className="ri-close-circle-line"></i>Reject
                        </button>
                        <button
                          onClick={() => handleApprove(viewingReq)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                        >
                          <i className="ri-checkbox-circle-line"></i>Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Key stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 mt-4">
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
                  <div className="rounded-xl bg-gray-50 px-4 py-3 col-span-2 sm:col-span-4">
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
                            {item.binLocation ? ` · Bin: ${item.binLocation}` : ''}
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

              {/* Receipt Confirmation — the one place stock actually leaves the warehouse, gated
                  on a handover document. A request already dispatched under the old two-step
                  flow (dispatched_at set, receipt not yet confirmed) just needs the sign-off —
                  its stock was already deducted, so no document/re-deduction is asked for. */}
              {(viewingReq.status === 'approved' || viewingReq.status === 'fulfilled') && (
                <div className="px-6 mt-3">
                  <div className="rounded-xl border border-gray-100 px-4 py-3 space-y-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Receipt Confirmation</p>

                    {viewingReq.receipt_confirmed ? (
                      <div className="flex items-start gap-2.5 text-sm text-gray-700">
                        <i className="ri-file-shield-2-line text-emerald-500 mt-0.5"></i>
                        <div>
                          <p>Received by <span className="font-medium">{viewingReq.received_by}</span> on {new Date(viewingReq.received_at as string).toLocaleString()}</p>
                          {viewingReq.dispatch_document_url && (
                            <a
                              href={viewingReq.dispatch_document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-gray-100 p-2 hover:bg-gray-50 transition-colors w-full sm:w-72"
                            >
                              {isImageFileName(viewingReq.dispatch_document_name) ? (
                                <img
                                  src={viewingReq.dispatch_document_url}
                                  alt={viewingReq.dispatch_document_name || 'Receipt document'}
                                  className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                                  <i className="ri-file-text-line text-sky-500"></i>
                                </div>
                              )}
                              <span className="text-xs font-medium text-sky-600 truncate">{viewingReq.dispatch_document_name || 'View document'}</span>
                              <i className="ri-external-link-line text-gray-300 ml-auto shrink-0"></i>
                            </a>
                          )}
                        </div>
                      </div>
                    ) : viewingReq.dispatched_at ? (
                      (isAdmin || isOwnRequest) ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={receiptName}
                            onChange={(e) => setReceiptName(e.target.value)}
                            placeholder="Receiver's full name"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                          />
                          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={receiptChecked} onChange={(e) => setReceiptChecked(e.target.checked)} className="rounded" />
                            I confirm this stock was received in good condition.
                          </label>
                          <button
                            onClick={() => handleConfirmReceipt(viewingReq, null)}
                            disabled={!receiptName.trim() || !receiptChecked}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          >
                            <i className="ri-quill-pen-line"></i>Confirm Receipt
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Awaiting receipt confirmation.</p>
                      )
                    ) : canApproveRequests ? (
                      <div className="space-y-2">
                        {dispatchBinOptions.length > 0 && viewingReq && (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-semibold text-gray-600">Dispatch from bin — {viewingReq.warehouse}</p>
                            {viewingReq.items.map((item) => (
                              <div key={item.productId} className="flex items-center justify-between gap-3">
                                <span className="text-xs text-gray-600 truncate">{item.productName} <span className="text-gray-400">×{item.quantity}</span></span>
                                <select
                                  value={dispatchBinByProduct[item.productId] ?? ''}
                                  onChange={(e) => setDispatchBinByProduct((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer shrink-0"
                                >
                                  <option value="">Unassigned</option>
                                  {dispatchBinOptions
                                    .map((b) => ({ bin: b, qty: dispatchBinQtyByProduct[item.productId]?.find((row) => row.bin_location === b)?.quantity }))
                                    .sort((a, b) => (a.qty ?? Infinity) - (b.qty ?? Infinity))
                                    .map(({ bin, qty }) => (
                                      <option key={bin} value={bin}>{bin}{qty !== undefined ? ` (${qty} on hand)` : ''}</option>
                                    ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingDoc(true); }}
                          onDragLeave={() => setIsDraggingDoc(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingDoc(false);
                            handleDocFilePick(e.dataTransfer.files?.[0]);
                          }}
                          className={`rounded-xl border-2 border-dashed transition-colors ${isDraggingDoc ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200'}`}
                        >
                          {pendingDocFile ? (
                            <div className="flex items-center gap-2.5 p-2">
                              {pendingDocPreview ? (
                                <img src={pendingDocPreview} alt="Document preview" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                                  <i className="ri-file-text-line text-sky-500"></i>
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-gray-700 truncate">{pendingDocFile.name}</p>
                                <p className="text-[10px] text-emerald-600 mt-0.5">Ready — Confirm Receipt below</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPendingDocFile(null)}
                                title="Remove"
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer shrink-0"
                              >
                                <i className="ri-close-line text-sm"></i>
                              </button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center gap-1 py-3 cursor-pointer">
                              <i className="ri-upload-cloud-2-line text-lg text-gray-300"></i>
                              <span className="text-xs font-medium text-gray-600 text-center px-2">Drop file here, or click to browse</span>
                              <span className="text-[10px] text-gray-400">Required to confirm receipt</span>
                              <input
                                type="file"
                                accept="image/*,.pdf,.doc,.docx"
                                className="hidden"
                                onChange={(e) => { handleDocFilePick(e.target.files?.[0]); e.target.value = ''; }}
                              />
                            </label>
                          )}
                        </div>
                        <input
                          type="text"
                          value={receiptName}
                          onChange={(e) => setReceiptName(e.target.value)}
                          placeholder="Receiver's full name"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={receiptChecked} onChange={(e) => setReceiptChecked(e.target.checked)} className="rounded" />
                          I confirm this stock was received in good condition.
                        </label>
                        <button
                          onClick={() => pendingDocFile && handleConfirmReceipt(viewingReq, pendingDocFile)}
                          disabled={!pendingDocFile || !receiptName.trim() || !receiptChecked || uploadingApproval}
                          title={pendingDocFile ? undefined : 'Attach a handover document above to enable'}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <i className={uploadingApproval ? 'ri-loader-4-line animate-spin' : 'ri-quill-pen-line'}></i>
                          {uploadingApproval ? 'Uploading…' : 'Confirm Receipt'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Awaiting receipt confirmation.</p>
                    )}
                  </div>
                </div>
              )}

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

              {/* Rejection reason */}
              {viewingReq.status === 'rejected' && viewingReq.review_note && (
                <div className="px-6 mt-3">
                  <div className="rounded-xl bg-red-50/60 border border-red-100 px-4 py-3 flex gap-2.5">
                    <i className="ri-close-circle-line text-red-400 text-base"></i>
                    <div>
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Rejection Reason</p>
                      <p className="text-sm text-gray-700 mt-0.5">{viewingReq.review_note}</p>
                    </div>
                  </div>
                </div>
              )}

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

              {/* Referral document — legacy field from before Approve was split from Confirm
                  Dispatch; view-only now, shown only when an older request already has one. */}
              {viewingReq.referral_document_url && (
                <div className="px-6 mt-3 flex justify-end">
                  <div className="w-full sm:w-72">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 text-right">Referral Document</p>
                    <a
                      href={viewingReq.referral_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-2 hover:bg-gray-50 transition-colors"
                    >
                      {isImageFileName(viewingReq.referral_document_name) ? (
                        <img
                          src={viewingReq.referral_document_url}
                          alt={viewingReq.referral_document_name || 'Referral document'}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                          <i className="ri-file-text-line text-sky-500"></i>
                        </div>
                      )}
                      <span className="text-xs font-medium text-sky-600 truncate">{viewingReq.referral_document_name || 'View document'}</span>
                      <i className="ri-external-link-line text-gray-300 ml-auto shrink-0"></i>
                    </a>
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
