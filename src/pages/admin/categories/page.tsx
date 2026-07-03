import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

interface SubCategory {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

const ICON_OPTIONS = [
  'ri-cpu-line', 'ri-sofa-line', 'ri-handbag-line', 'ri-home-wifi-line',
  'ri-lightbulb-line', 'ri-t-shirt-line', 'ri-medicine-bottle-line',
  'ri-car-line', 'ri-tools-line', 'ri-book-open-line', 'ri-shopping-bag-line',
  'ri-restaurant-line', 'ri-leaf-line', 'ri-music-line', 'ri-gamepad-line',
  'ri-folder-line',
];

const COLOR_OPTIONS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#f97316',
  '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#6366f1',
];

function genId(prefix: string, existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

export default function AdminCategoriesPage() {
  const { canEdit, canDelete } = useAuth();
  const showEdit = canEdit('categories');
  const showDelete = canDelete('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  // Category modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', icon: 'ri-folder-line', color: '#10b981', description: '' });

  // Sub-category modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [editingSub, setEditingSub] = useState<SubCategory | null>(null);
  const [subForm, setSubForm] = useState({ name: '', description: '' });

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = async () => {
    const [catRes, subRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order', { ascending: true }),
      supabase.from('sub_categories').select('*').order('sort_order', { ascending: true }),
    ]);
    if (catRes.data) setCategories(catRes.data as Category[]);
    if (subRes.data) setSubCategories(subRes.data as SubCategory[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Auto-select first category
  useEffect(() => {
    if (categories.length && !selectedCat) setSelectedCat(categories[0]);
  }, [categories]);

  const subsForSelected = subCategories.filter(s => s.category_id === selectedCat?.id);

  // ── Category CRUD ────────────────────────────────────────────
  const openNewCat = () => {
    setEditingCat(null);
    setCatForm({ name: '', icon: 'ri-folder-line', color: '#10b981', description: '' });
    setShowCatModal(true);
  };

  const openEditCat = (cat: Category) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name, icon: cat.icon, color: cat.color, description: cat.description ?? '' });
    setShowCatModal(true);
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) return;
    if (editingCat) {
      const { error } = await supabase.from('categories')
        .update({ name: catForm.name.trim(), icon: catForm.icon, color: catForm.color, description: catForm.description || null })
        .eq('id', editingCat.id);
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Category updated');
    } else {
      const id = genId('CAT', categories.map(c => c.id));
      const { error } = await supabase.from('categories')
        .insert({ id, name: catForm.name.trim(), icon: catForm.icon, color: catForm.color, description: catForm.description || null, sort_order: categories.length + 1 });
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Category created');
    }
    setShowCatModal(false);
    fetchAll();
  };

  const deleteCat = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}" and all its sub-categories?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', cat.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Category deleted');
    if (selectedCat?.id === cat.id) setSelectedCat(null);
    fetchAll();
  };

  // ── Sub-category CRUD ────────────────────────────────────────
  const openNewSub = () => {
    if (!selectedCat) return;
    setEditingSub(null);
    setSubForm({ name: '', description: '' });
    setShowSubModal(true);
  };

  const openEditSub = (sub: SubCategory) => {
    setEditingSub(sub);
    setSubForm({ name: sub.name, description: sub.description ?? '' });
    setShowSubModal(true);
  };

  const saveSub = async () => {
    if (!subForm.name.trim() || !selectedCat) return;
    if (editingSub) {
      const { error } = await supabase.from('sub_categories')
        .update({ name: subForm.name.trim(), description: subForm.description || null })
        .eq('id', editingSub.id);
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Sub-category updated');
    } else {
      const id = genId('SUB', subCategories.map(s => s.id));
      const { error } = await supabase.from('sub_categories')
        .insert({ id, category_id: selectedCat.id, name: subForm.name.trim(), description: subForm.description || null, sort_order: subsForSelected.length + 1 });
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Sub-category created');
    }
    setShowSubModal(false);
    fetchAll();
  };

  const deleteSub = async (sub: SubCategory) => {
    if (!confirm(`Delete sub-category "${sub.name}"?`)) return;
    const { error } = await supabase.from('sub_categories').delete().eq('id', sub.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Sub-category deleted');
    fetchAll();
  };

  return (
    <DashboardLayout title="Categories" subtitle="Manage product categories and sub-categories.">
      {/* Toast */}
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
          {/* ── Left: Categories list ── */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-white rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">Categories <span className="ml-1 text-gray-400 font-normal">({categories.length})</span></h2>
                <button
                  onClick={openNewCat}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                  title="Add category"
                >
                  <i className="ri-add-line text-sm"></i>
                </button>
              </div>

              <div className="divide-y divide-gray-50">
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCat(cat)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group ${selectedCat?.id === cat.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                      <i className={`${cat.icon} text-sm`} style={{ color: cat.color }}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${selectedCat?.id === cat.id ? 'text-emerald-700' : 'text-gray-800'}`}>{cat.name}</p>
                      <p className="text-xs text-gray-400">{subCategories.filter(s => s.category_id === cat.id).length} sub-categories</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {showEdit && (
                        <button
                          onClick={e => { e.stopPropagation(); openEditCat(cat); }}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-colors"
                        >
                          <i className="ri-edit-line text-xs"></i>
                        </button>
                      )}
                      {showDelete && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteCat(cat); }}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <i className="ri-delete-bin-line text-xs"></i>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="py-10 text-center text-gray-400 text-sm">No categories yet</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Sub-categories ── */}
          <div className="flex-1">
            {selectedCat ? (
              <div className="bg-white rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: selectedCat.color + '20' }}>
                      <i className={`${selectedCat.icon} text-lg`} style={{ color: selectedCat.color }}></i>
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{selectedCat.name}</h2>
                      {selectedCat.description && <p className="text-xs text-gray-400">{selectedCat.description}</p>}
                    </div>
                  </div>
                  <button
                    onClick={openNewSub}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
                  >
                    <i className="ri-add-line"></i> Add Sub-category
                  </button>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {subsForSelected.map(sub => (
                    <div key={sub.id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-all group">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{sub.name}</p>
                          {sub.description && <p className="text-xs text-gray-400 mt-0.5">{sub.description}</p>}
                          <p className="text-xs text-gray-300 mt-1 font-mono">{sub.id}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
                          {showEdit && (
                            <button
                              onClick={() => openEditSub(sub)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-sky-500 hover:bg-sky-50 transition-colors"
                            >
                              <i className="ri-edit-line text-sm"></i>
                            </button>
                          )}
                          {showDelete && (
                            <button
                              onClick={() => deleteSub(sub)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <i className="ri-delete-bin-line text-sm"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {subsForSelected.length === 0 && (
                    <div className="col-span-3 py-16 text-center text-gray-400">
                      <i className="ri-folder-open-line text-4xl mb-2 block"></i>
                      <p className="text-sm">No sub-categories yet. Click "Add Sub-category" to create one.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <i className="ri-arrow-left-line text-3xl mb-2 block"></i>
                  <p className="text-sm">Select a category to manage sub-categories</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Category Modal ── */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{editingCat ? 'Edit Category' : 'New Category'}</h3>
              <button onClick={() => setShowCatModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name *</label>
                <input
                  value={catForm.name}
                  onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Electronics"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <input
                  value={catForm.description}
                  onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short description (optional)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Icon</label>
                <div className="grid grid-cols-8 gap-1.5">
                  {ICON_OPTIONS.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setCatForm(f => ({ ...f, icon }))}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${catForm.icon === icon ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                    >
                      <i className={`${icon} text-base`}></i>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      onClick={() => setCatForm(f => ({ ...f, color }))}
                      className={`w-7 h-7 rounded-full transition-transform ${catForm.color === color ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: catForm.color + '20' }}>
                    <i className={`${catForm.icon} text-sm`} style={{ color: catForm.color }}></i>
                  </div>
                  <span className="text-xs text-gray-400">Preview</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowCatModal(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={saveCat} disabled={!catForm.name.trim()} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {editingCat ? 'Save Changes' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-category Modal ── */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{editingSub ? 'Edit Sub-category' : 'New Sub-category'}</h3>
              <button onClick={() => setShowSubModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {selectedCat && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-sm text-gray-600">
                  <i className={`${selectedCat.icon} text-sm`} style={{ color: selectedCat.color }}></i>
                  <span>Under <strong>{selectedCat.name}</strong></span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name *</label>
                <input
                  value={subForm.name}
                  onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Audio"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <input
                  value={subForm.description}
                  onChange={e => setSubForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short description (optional)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowSubModal(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={saveSub} disabled={!subForm.name.trim()} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {editingSub ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
