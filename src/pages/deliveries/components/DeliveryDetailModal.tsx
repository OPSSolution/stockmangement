import { useState } from 'react';
import { type DeliveryRecord, type DeliveryStep } from '@/mocks/deliveries';
import DeliveryStepTracker from './DeliveryStepTracker';
import { useAuth } from '@/contexts/AuthContext';

interface DeliveryDetailModalProps {
  delivery: DeliveryRecord;
  onClose: () => void;
  onAdvance: (id: string, nextStep: DeliveryStep, note: string, photoUrl?: string) => void;
}

const steps: DeliveryStep[] = ['prepare', 'ready', 'in_transit', 'delivered'];
const stepIndex: Record<DeliveryStep, number> = { prepare: 0, ready: 1, in_transit: 2, delivered: 3 };

const nextStepLabel: Record<DeliveryStep, string | null> = {
  prepare: 'Mark as Ready',
  ready: 'Mark as In Transit',
  in_transit: 'Confirm Delivery',
  delivered: null,
};

const timelineIcons: Record<DeliveryStep, string> = {
  prepare: 'ri-inbox-archive-line',
  ready: 'ri-checkbox-circle-line',
  in_transit: 'ri-truck-line',
  delivered: 'ri-map-pin-2-line',
};

export default function DeliveryDetailModal({ delivery, onClose, onAdvance }: DeliveryDetailModalProps) {
  const { profile, isAdmin } = useAuth();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState('');
  const [confirming, setConfirming] = useState(false);

  const currentIdx = stepIndex[delivery.status];
  const nextStep = steps[currentIdx + 1];
  const nextLabel = nextStepLabel[delivery.status];
  const totalItems = delivery.items.reduce((sum, item) => sum + item.quantity, 0);

  // Confirming delivery is the receiving warehouse's call; earlier steps (pack,
  // dispatch) belong to the sending warehouse. Admins can always do either.
  const requiredWarehouse = nextStep === 'delivered' ? delivery.toWarehouse : delivery.fromWarehouse;
  const isReceivingStep = nextStep === 'delivered';
  const canAdvance = isAdmin || !!profile?.warehouses.includes(requiredWarehouse);

  const handlePhotoPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleAdvance = () => {
    if (!nextStep) return;
    onAdvance(delivery.id, nextStep, note || `Moved to ${nextStep}`, photo || undefined);
    setNote('');
    setPhoto('');
    setConfirming(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-xl mx-4 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">{delivery.id}</h2>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                delivery.status === 'delivered' ? 'bg-emerald-50 text-emerald-700' :
                delivery.status === 'in_transit' ? 'bg-sky-50 text-sky-700' :
                delivery.status === 'ready' ? 'bg-violet-50 text-violet-700' :
                'bg-amber-50 text-amber-700'
              }`}>
                {delivery.status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              {delivery.fromWarehouse}
              <i className="ri-arrow-right-line text-gray-300"></i>
              {delivery.toWarehouse}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="px-8 py-5 border-b border-gray-100 shrink-0">
          <DeliveryStepTracker currentStatus={delivery.status} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: 'ri-truck-line', label: 'Transfer ID', value: delivery.transferId || delivery.id },
              { icon: 'ri-user-line', label: 'Driver', value: delivery.driver_name || 'Unassigned' },
              { icon: 'ri-car-line', label: 'Vehicle', value: delivery.vehicle_plate || '—' },
              { icon: 'ri-calendar-check-line', label: 'Est. Delivery', value: delivery.estimatedDelivery },
            ].map((info) => (
              <div key={info.label} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className={`${info.icon} text-gray-400 text-sm`}></i>
                  </div>
                  <p className="text-xs text-gray-400">{info.label}</p>
                </div>
                <p className="text-sm font-semibold text-gray-800 truncate">{info.value}</p>
              </div>
            ))}
          </div>

          {delivery.notes && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{delivery.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Shipment Contents ({totalItems} items)</p>
            <div className="space-y-2">
              {delivery.items.map((item, i) => (
                <div key={`${item.sku}-${i}`} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200 overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                    ) : (
                      <i className="ri-box-3-line text-gray-400 text-sm"></i>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{item.productName}</p>
                    <p className="text-xs text-gray-400">{item.sku}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-600">x{item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Activity Timeline</p>
            <div className="relative pl-6 space-y-4">
              {delivery.timeline.map((event, i) => (
                <div key={`${event.step}-${event.timestamp}-${i}`} className="relative">
                  <div className="absolute -left-6 top-1 w-4 h-4 flex items-center justify-center">
                    <div className={`w-3 h-3 rounded-full ${i === delivery.timeline.length - 1 ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                  </div>
                  {i < delivery.timeline.length - 1 && (
                    <div className="absolute -left-[18px] top-4 w-0.5 h-full bg-gray-200"></div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className={`${timelineIcons[event.step]} text-emerald-500 text-sm`}></i>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 capitalize">{event.step.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{event.note}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{event.timestamp} {event.completedBy ? `- by ${event.completedBy}` : ''}</p>
                    {event.photoUrl && (
                      <img src={event.photoUrl} alt="Proof" className="mt-1.5 w-14 h-14 rounded-md object-cover border border-gray-200" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {delivery.status !== 'delivered' && (
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700 mb-2">
                {isReceivingStep ? 'Receiver Action' : 'Sender Action'}
              </p>
              {!canAdvance ? (
                <div className="flex items-start gap-2 text-xs text-gray-500 bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                  <i className="ri-lock-line text-gray-400 mt-0.5"></i>
                  <span>Only staff assigned to <strong>{requiredWarehouse}</strong> (or an admin) can {nextLabel?.toLowerCase()}.</span>
                </div>
              ) : !confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full py-2.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {nextLabel}
                </button>
              ) : (
                <div className="space-y-3">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={`Note for "${nextLabel}" (optional)`}
                    className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
                  />
                  <div>
                    <label className="text-xs text-emerald-700 mb-1.5 flex items-center gap-1.5 cursor-pointer">
                      <i className="ri-camera-line"></i>
                      Attach proof photo (optional)
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
                    </label>
                    {photo && (
                      <div className="mt-1.5 flex items-center gap-2 bg-white border border-emerald-200 rounded-lg p-2">
                        <img src={photo} alt="Proof preview" className="w-10 h-10 rounded-md object-cover border border-gray-200" />
                        <span className="text-xs text-gray-500 flex-1">Photo attached</span>
                        <button type="button" onClick={() => setPhoto('')} className="text-gray-400 hover:text-red-500 cursor-pointer">
                          <i className="ri-close-line"></i>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setConfirming(false)} className="flex-1 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
                      Back
                    </button>
                    <button onClick={handleAdvance} className="flex-1 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 cursor-pointer whitespace-nowrap">
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer whitespace-nowrap">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
