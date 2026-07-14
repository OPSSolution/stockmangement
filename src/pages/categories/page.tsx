import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/feature/DashboardLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import CategoriesFormModal from '../inventory/components/CategoriesFormModal';
import { exportToCsv } from '@/lib/exportCsv';
import { logAudit } from '@/lib/auditLog';

interface CategoryItem {
  id: string;
  name: string;
}

export default function CategoriesPage() {
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAuth();
  const showEdit = canEdit('categories');
  const showDelete = canDelete('categories');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  const fetchCategories = async () => {
    const { data, error } = await supabase.from('categories').select('id, name').order('name', { ascending: true });
    if (error) {
      console.error('Failed to load categories:', error);
      return;
    }
    setCategories((data || []) as CategoryItem[]);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSave = async (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    if (editingCategory) {
      const { error } = await supabase.from('categories').update({ name: cleanName }).eq('id', editingCategory.id);
      if (error) {
        console.error('Failed to update category:', error);
        return;
      }
      logAudit({ action: 'update', module: 'categories', description: `Renamed category "${editingCategory.name}" to "${cleanName}"`, referenceId: editingCategory.id });
    } else {
      const id = globalThis.crypto?.randomUUID?.() ?? `cat-${Date.now()}`;
      const { error } = await supabase.from('categories').insert({ id, name: cleanName });
      if (error) {
        console.error('Failed to create category:', error);
        return;
      }
      logAudit({ action: 'create', module: 'categories', description: `Created category "${cleanName}"`, referenceId: id });
    }

    await fetchCategories();
    setEditingCategory(null);
    setIsModalOpen(false);
  };

  const handleDelete = async (item: CategoryItem) => {
    const { error } = await supabase.from('categories').delete().eq('id', item.id);
    if (error) {
      console.error('Failed to delete category:', error);
      return;
    }
    await fetchCategories();
    logAudit({ action: 'delete', module: 'categories', description: `Deleted category "${item.name}"`, referenceId: item.id });
  };

  const categoryCount = useMemo(() => categories.length, [categories]);

  return (
    <DashboardLayout title="Categories" subtitle="Manage inventory categories and keep the dropdown in sync.">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold">Inventory setup</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">Manage categories</h2>
            <p className="text-sm text-gray-500 mt-1">Add, edit, or remove categories used in the inventory form and filter dropdown.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/inventory')}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Back to Inventory
            </button>
            <button
              onClick={() => exportToCsv('categories', categories, [
                { header: 'ID', value: (c) => c.id },
                { header: 'Name', value: (c) => c.name },
              ])}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <i className="ri-download-2-line mr-1"></i>Export
            </button>
            <button
              onClick={() => { setEditingCategory(null); setIsModalOpen(true); }}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer"
            >
              + Add Category
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-gray-100 shadow-sm bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Total Categories</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{categoryCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 shadow-sm bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Used In Inventory</p>
            <p className="text-sm text-gray-600 mt-2">The category filter on inventory now reads from this list.</p>
          </div>
          <div className="rounded-2xl border border-gray-100 shadow-sm bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Tip</p>
            <p className="text-sm text-gray-600 mt-2">You can add custom categories here and they will appear in the inventory dropdown.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((item) => (
            <article key={item.id} className="rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400 mt-1">Used by inventory products and filters</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">Active</span>
              </div>
              <div className="flex items-center gap-2 mt-4">
                {showEdit && (
                  <button
                    onClick={() => { setEditingCategory(item); setIsModalOpen(true); }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-white cursor-pointer"
                  >
                    Edit
                  </button>
                )}
                {showDelete && (
                  <button
                    onClick={() => handleDelete(item)}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-100 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <CategoriesFormModal
          category={editingCategory?.name ?? null}
          onClose={() => { setEditingCategory(null); setIsModalOpen(false); }}
          onSave={handleSave}
        />
      )}
    </DashboardLayout>
  );
}
