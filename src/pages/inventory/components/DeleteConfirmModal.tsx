import { ProductStockRow } from '@/mocks/inventory';

interface DeleteConfirmModalProps {
  product: ProductStockRow;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({ product, onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm mx-4 shadow-xl p-6">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <i className="ri-delete-bin-line text-red-500 text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Delete Product?</h2>
            <p className="text-sm text-gray-500 mt-1">
              You are about to remove <span className="font-semibold text-gray-800">{product.name}</span> from <span className="font-semibold text-gray-800">{product.warehouse}</span>. If it's stocked in other warehouses, it'll stay there. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}