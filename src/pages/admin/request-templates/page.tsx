import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type TemplateFieldType = 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'product';

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  options?: string[];
  required: boolean;
}

export interface RequestFormTemplate {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  fields: TemplateField[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const FIELD_TYPES: { value: TemplateFieldType; label: string; icon: string; hint: string }[] = [
  { value: 'text', label: 'Text', icon: 'ri-text', hint: 'A single line of free text.' },
  { value: 'number', label: 'Number', icon: 'ri-hashtag', hint: 'Numbers only.' },
  { value: 'date', label: 'Date', icon: 'ri-calendar-line', hint: 'A date picker.' },
  { value: 'textarea', label: 'Long text', icon: 'ri-file-text-line', hint: 'A multi-line note.' },
  { value: 'select', label: 'Dropdown', icon: 'ri-list-check', hint: 'Pick from options you type in below.' },
  { value: 'checkbox', label: 'Checkbox', icon: 'ri-checkbox-line', hint: 'A yes/no toggle.' },
  { value: 'product', label: 'Product', icon: 'ri-box-3-line', hint: 'A live dropdown of products in the request\'s warehouse — no need to type options.' },
];

// Fields already built into every stock request (products, qty, package
// weight/unit, total-kg, date of receive, reference, etc.) — a template field
// with one of these labels would just duplicate a control that's already on
// the form, so the request form silently skips rendering it.
export const BUILT_IN_FIELD_LABELS = [
  'Products', 'Qty', 'Package Type', 'Unit', 'Total-Kg',
  'Date of Receive', 'Reference', 'Priority', 'Reason', 'Warehouse', 'Requested By',
] as const;

const RESERVED_FIELD_LABELS = new Set([
  'no', 'row', 'rowno',
  'product', 'products', 'productname',
  'sku',
  'qty', 'quantity',
  'packagetype', 'packageweight', 'pkg', 'pkgkg',
  'unit',
  'totalkg', 'total',
  'date', 'dateofreceive',
  'reference', 'ref', 'refno', 'refnumber',
  'priority',
  'reason',
  'warehouse',
  'requestedby',
]);

export function isReservedFieldLabel(label: string): boolean {
  return RESERVED_FIELD_LABELS.has(label.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
}

function uniqueSlug(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

const emptyField = (): TemplateField => ({ key: '', label: '', type: 'text', required: false });

// Ready-made fields — click to add, already named and typed correctly.
// Covers the extras companies commonly need beyond the standard form.
const PRESET_FIELDS: { label: string; type: TemplateFieldType; options?: string[]; icon: string }[] = [
  { label: 'Invoice Number', type: 'text', icon: 'ri-file-list-3-line' },
  { label: 'Contact Person', type: 'text', icon: 'ri-user-line' },
  { label: 'Approval Date', type: 'date', icon: 'ri-calendar-line' },
  { label: 'Extra Product', type: 'product', icon: 'ri-box-3-line' },
  { label: 'Cost Center', type: 'text', icon: 'ri-price-tag-3-line' },
  { label: 'Region', type: 'select', options: ['North', 'South', 'East', 'West'], icon: 'ri-map-pin-line' },
  { label: 'Remarks', type: 'textarea', icon: 'ri-file-text-line' },
  { label: 'Urgent Flag', type: 'checkbox', icon: 'ri-flag-2-line' },
];

export default function RequestTemplatesPage() {
  const { canEdit, canDelete } = useAuth();
  const showEdit = canEdit('request_templates');
  const showDelete = canDelete('request_templates');

  const [templates, setTemplates] = useState<RequestFormTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showTplModal, setShowTplModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<RequestFormTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ name: '', description: '', is_active: true, logoUrl: '' });

  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [fieldForm, setFieldForm] = useState<TemplateField>(emptyField());
  const [fieldOptionsText, setFieldOptionsText] = useState('');
  const [showCustomFieldForm, setShowCustomFieldForm] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = async () => {
    const { data, error } = await supabase.from('request_form_templates').select('*').order('sort_order', { ascending: true });
    if (error) showToast(error.message, 'error');
    else setTemplates((data || []) as RequestFormTemplate[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (templates.length && !selectedId) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  const selected = templates.find((t) => t.id === selectedId) || null;

  // ── Template CRUD ────────────────────────────────────────────
  const openNewTpl = () => {
    setEditingTpl(null);
    setTplForm({ name: '', description: '', is_active: true, logoUrl: '' });
    setShowTplModal(true);
  };

  const openEditTpl = (tpl: RequestFormTemplate) => {
    setEditingTpl(tpl);
    setTplForm({ name: tpl.name, description: tpl.description ?? '', is_active: tpl.is_active, logoUrl: tpl.logo_url ?? '' });
    setShowTplModal(true);
  };

  const handleLogoFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploadingLogo(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { cacheControl: '3600', upsert: true });
    setUploadingLogo(false);

    if (error) { showToast(`Failed to upload logo: ${error.message}`, 'error'); return; }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    setTplForm((prev) => ({ ...prev, logoUrl: data.publicUrl }));
  };

  const saveTpl = async () => {
    if (!tplForm.name.trim()) return;
    if (editingTpl) {
      const { error } = await supabase.from('request_form_templates')
        .update({ name: tplForm.name.trim(), description: tplForm.description.trim() || null, is_active: tplForm.is_active, logo_url: tplForm.logoUrl.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', editingTpl.id);
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Template updated.');
    } else {
      const id = uniqueSlug(slugify(tplForm.name), templates.map((t) => t.id));
      const { error } = await supabase.from('request_form_templates')
        .insert({ id, name: tplForm.name.trim(), description: tplForm.description.trim() || null, is_active: tplForm.is_active, logo_url: tplForm.logoUrl.trim() || null, fields: [], sort_order: templates.length + 1 });
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Template created.');
      setSelectedId(id);
    }
    setShowTplModal(false);
    fetchAll();
  };

  const deleteTpl = async (tpl: RequestFormTemplate) => {
    if (!confirm(`Delete "${tpl.name}"? Requests already submitted under it keep their saved answers.`)) return;
    const { error } = await supabase.from('request_form_templates').delete().eq('id', tpl.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Template deleted.');
    if (selectedId === tpl.id) setSelectedId(null);
    fetchAll();
  };

  // ── Field CRUD (within the selected template) ───────────────
  const openNewField = () => {
    setEditingFieldIndex(null);
    setFieldForm(emptyField());
    setFieldOptionsText('');
    setShowCustomFieldForm(false);
    setShowFieldModal(true);
  };

  const openEditField = (index: number) => {
    const field = selected!.fields[index];
    setEditingFieldIndex(index);
    setFieldForm(field);
    setFieldOptionsText((field.options || []).join(', '));
    setShowCustomFieldForm(true);
    setShowFieldModal(true);
  };

  const commitFields = async (nextFields: TemplateField[], successMsg: string) => {
    if (!selected) return;
    const { error } = await supabase.from('request_form_templates')
      .update({ fields: nextFields, updated_at: new Date().toISOString() })
      .eq('id', selected.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(successMsg);
    setShowFieldModal(false);
    fetchAll();
  };

  const addPresetField = (preset: (typeof PRESET_FIELDS)[number]) => {
    if (!selected) return;
    const key = uniqueSlug(slugify(preset.label), selected.fields.map((f) => f.key));
    const nextField: TemplateField = { key, label: preset.label, type: preset.type, required: false, ...(preset.options ? { options: preset.options } : {}) };
    commitFields([...selected.fields, nextField], 'Field added.');
  };

  const saveField = async () => {
    if (!selected || !fieldForm.label.trim() || isReservedFieldLabel(fieldForm.label)) return;
    const options = fieldForm.type === 'select'
      ? fieldOptionsText.split(',').map((o) => o.trim()).filter(Boolean)
      : undefined;

    const otherKeys = selected.fields.filter((_, i) => i !== editingFieldIndex).map((f) => f.key);
    const key = editingFieldIndex !== null ? fieldForm.key : uniqueSlug(slugify(fieldForm.label), otherKeys);

    const nextField: TemplateField = { key, label: fieldForm.label.trim(), type: fieldForm.type, required: fieldForm.required, ...(options ? { options } : {}) };

    const nextFields = editingFieldIndex !== null
      ? selected.fields.map((f, i) => (i === editingFieldIndex ? nextField : f))
      : [...selected.fields, nextField];

    commitFields(nextFields, editingFieldIndex !== null ? 'Field updated.' : 'Field added.');
  };

  const deleteField = async (index: number) => {
    if (!selected) return;
    if (!confirm(`Remove the "${selected.fields[index].label}" field?`)) return;
    const nextFields = selected.fields.filter((_, i) => i !== index);
    const { error } = await supabase.from('request_form_templates')
      .update({ fields: nextFields, updated_at: new Date().toISOString() })
      .eq('id', selected.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Field removed.');
    fetchAll();
  };

  const moveField = async (index: number, direction: -1 | 1) => {
    if (!selected) return;
    const target = index + direction;
    if (target < 0 || target >= selected.fields.length) return;
    const nextFields = [...selected.fields];
    [nextFields[index], nextFields[target]] = [nextFields[target], nextFields[index]];
    const { error } = await supabase.from('request_form_templates').update({ fields: nextFields }).eq('id', selected.id);
    if (error) { showToast(error.message, 'error'); return; }
    fetchAll();
  };

  return (
    <DashboardLayout title="Request Templates" subtitle="Define per-company extra fields shown when staff pick that company on a new stock request.">
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'} text-white`}>
          <i className={`${toast.type === 'error' ? 'ri-error-warning-line' : 'ri-check-line'} text-base`}></i>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <i className="ri-loader-4-line text-3xl animate-spin mr-2"></i>
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className="flex gap-5">
          {/* ── Left: Templates list ── */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">Companies <span className="ml-1 text-gray-400 font-normal">({templates.length})</span></h2>
                {showEdit && (
                  <button onClick={openNewTpl} className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer" title="Add company form">
                    <i className="ri-add-line text-sm"></i>
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedId(tpl.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group ${selectedId === tpl.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${tpl.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      {tpl.logo_url ? (
                        <img src={tpl.logo_url} alt={tpl.name} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-file-list-2-line text-sm"></i>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${selectedId === tpl.id ? 'text-emerald-700' : 'text-gray-800'}`}>{tpl.name}</p>
                      <p className="text-xs text-gray-400">{tpl.fields.length} field{tpl.fields.length !== 1 ? 's' : ''}{!tpl.is_active ? ' · inactive' : ''}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {showEdit && (
                        <button onClick={(e) => { e.stopPropagation(); openEditTpl(tpl); }} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-colors cursor-pointer">
                          <i className="ri-edit-line text-xs"></i>
                        </button>
                      )}
                      {showDelete && (
                        <button onClick={(e) => { e.stopPropagation(); deleteTpl(tpl); }} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer">
                          <i className="ri-delete-bin-line text-xs"></i>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="py-10 text-center text-gray-400 text-sm px-4">No company forms yet. Click + to add one (e.g. "UNT", "SVP").</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Fields for selected template ── */}
          <div className="flex-1">
            {selected ? (
              <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {selected.logo_url ? (
                        <img src={selected.logo_url} alt={selected.name} className="w-full h-full object-cover" />
                      ) : (
                        <i className="ri-file-list-2-line text-emerald-600"></i>
                      )}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                      {selected.description && <p className="text-xs text-gray-400 mt-0.5">{selected.description}</p>}
                    </div>
                  </div>
                  {showEdit && (
                    <button onClick={openNewField} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors cursor-pointer">
                      <i className="ri-add-line"></i> Add Field
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-2">
                  {selected.fields.map((field, index) => {
                    const typeMeta = FIELD_TYPES.find((t) => t.value === field.type);
                    return (
                      <div key={field.key} className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-all group">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                          <i className={`${typeMeta?.icon} text-gray-500 text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {field.label}
                            {field.required && <span className="text-red-400 ml-1">*</span>}
                          </p>
                          <p className="text-xs text-gray-400">
                            {typeMeta?.label}{field.options?.length ? ` · ${field.options.join(', ')}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => moveField(index, -1)} disabled={index === 0} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors cursor-pointer">
                            <i className="ri-arrow-up-line text-sm"></i>
                          </button>
                          <button onClick={() => moveField(index, 1)} disabled={index === selected.fields.length - 1} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors cursor-pointer">
                            <i className="ri-arrow-down-line text-sm"></i>
                          </button>
                          {showEdit && (
                            <button onClick={() => openEditField(index)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-colors cursor-pointer">
                              <i className="ri-edit-line text-sm"></i>
                            </button>
                          )}
                          {showDelete && (
                            <button onClick={() => deleteField(index)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer">
                              <i className="ri-delete-bin-line text-sm"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {selected.fields.length === 0 && (
                    <div className="py-16 text-center text-gray-400">
                      <i className="ri-file-list-2-line text-4xl mb-2 block"></i>
                      <p className="text-sm">No fields yet. Click "Add Field" to define what {selected.name}'s request form needs.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <i className="ri-arrow-left-line text-3xl mb-2 block"></i>
                  <p className="text-sm">Select a company to manage its fields</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Template Modal ── */}
      {showTplModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{editingTpl ? 'Edit Company Form' : 'New Company Form'}</h3>
              <button onClick={() => setShowTplModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Company Name *</label>
                <input
                  value={tplForm.name}
                  onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. UNT"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <input
                  value={tplForm.description}
                  onChange={(e) => setTplForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short note (optional)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {uploadingLogo ? (
                      <i className="ri-loader-4-line animate-spin text-gray-400 text-xl"></i>
                    ) : tplForm.logoUrl ? (
                      <img src={tplForm.logoUrl} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <i className="ri-image-line text-gray-300 text-2xl"></i>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg transition-colors w-fit ${uploadingLogo ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-emerald-100'}`}>
                      <i className="ri-upload-line"></i>
                      {uploadingLogo ? 'Uploading…' : tplForm.logoUrl ? 'Change Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoFilePick} disabled={uploadingLogo} />
                    </label>
                    {tplForm.logoUrl && !uploadingLogo && (
                      <button
                        type="button"
                        onClick={() => setTplForm((f) => ({ ...f, logoUrl: '' }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 cursor-pointer w-fit"
                      >
                        <i className="ri-delete-bin-line"></i> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={tplForm.is_active} onChange={(e) => setTplForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <span className="text-sm text-gray-700">Active (shown as an option when staff create a new request)</span>
              </label>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowTplModal(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
              <button onClick={saveTpl} disabled={!tplForm.name.trim() || uploadingLogo} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                {editingTpl ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Field Modal ── */}
      {showFieldModal && selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editingFieldIndex !== null ? 'Edit Field' : showCustomFieldForm ? 'Custom Field' : 'Add Field'}
              </h3>
              <button onClick={() => setShowFieldModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors cursor-pointer">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            {editingFieldIndex === null && !showCustomFieldForm ? (
              <>
                <div className="px-6 py-5">
                  <p className="text-xs text-gray-400 mb-3">Click one to add it — already named and set up. Nothing to type or configure.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_FIELDS.filter((p) => !selected.fields.some((f) => f.label.toLowerCase() === p.label.toLowerCase())).map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => addPresetField(preset)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors cursor-pointer text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                          <i className={`${preset.icon} text-gray-500 text-sm`}></i>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{preset.label}</p>
                          <p className="text-[11px] text-gray-400">{FIELD_TYPES.find((t) => t.value === preset.type)?.label}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
                  <button onClick={() => setShowFieldModal(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
                  <button onClick={() => setShowCustomFieldForm(true)} className="flex-1 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">
                    <i className="ri-add-line mr-1"></i>Something else…
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Field Label *</label>
                    <input
                      value={fieldForm.label}
                      onChange={(e) => setFieldForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Invoice Number"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    {isReservedFieldLabel(fieldForm.label) ? (
                      <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                        <i className="ri-error-warning-line"></i>
                        "{fieldForm.label.trim()}" is already part of every request — pick a different name to avoid a duplicate.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1.5">
                        Already built in, no need to add: {BUILT_IN_FIELD_LABELS.join(', ')}.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Field Type</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {FIELD_TYPES.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setFieldForm((f) => ({ ...f, type: t.value }))}
                          className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${fieldForm.type === t.value ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        >
                          <i className={`${t.icon} text-base`}></i>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{FIELD_TYPES.find((t) => t.value === fieldForm.type)?.hint}</p>
                  </div>
                  {fieldForm.type === 'select' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Options (comma-separated)</label>
                      <input
                        value={fieldOptionsText}
                        onChange={(e) => setFieldOptionsText(e.target.value)}
                        placeholder="e.g. North, South, East"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={fieldForm.required} onChange={(e) => setFieldForm((f) => ({ ...f, required: e.target.checked }))} className="rounded" />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>
                <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
                  {editingFieldIndex === null ? (
                    <button onClick={() => setShowCustomFieldForm(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <i className="ri-arrow-left-line mr-1"></i>Back
                    </button>
                  ) : (
                    <button onClick={() => setShowFieldModal(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">Cancel</button>
                  )}
                  <button onClick={saveField} disabled={!fieldForm.label.trim() || isReservedFieldLabel(fieldForm.label)} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                    {editingFieldIndex !== null ? 'Save Changes' : 'Add Field'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
