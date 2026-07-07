export type DeliveryStep = 'prepare' | 'ready' | 'in_transit' | 'delivered';

export interface DeliveryItem {
  productName: string;
  sku: string;
  quantity: number;
}

export interface DeliveryTimelineEvent {
  step: DeliveryStep;
  timestamp: string;
  note: string;
  completedBy?: string;
  photoUrl?: string;
}

export interface DeliveryRecord {
  id: string;
  transferId: string;
  fromWarehouse: string;
  toWarehouse: string;
  items: DeliveryItem[];
  items_detail: string;
  status: DeliveryStep;
  estimatedDelivery: string;
  timeline: DeliveryTimelineEvent[];
  last_update: string;
  created_at: string;
  driver_name?: string;
  vehicle_plate?: string;
  departure_time?: string;
  arrival_time?: string;
  imageUrl?: string;
  notes?: string;
}

export const deliveryRecords: DeliveryRecord[] = [
  {
    id: 'DEL-001',
    transferId: 'TRF-00081',
    fromWarehouse: 'BM Warehouse',
    toWarehouse: 'Vendor Warehouse',
    items_detail: '2x Wireless Bluetooth Headphones, 1x Webcam 4K Ultra HD',
    items: [
      { productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', quantity: 2 },
      { productName: 'Webcam 4K Ultra HD', sku: 'WCM-008', quantity: 1 },
    ],
    status: 'in_transit',
    estimatedDelivery: '2026-05-20',
    created_at: '2026-05-19 09:00',
    last_update: '2026-05-19 11:00',
    driver_name: 'Rajan Kumar',
    vehicle_plate: 'BMA 4521',
    timeline: [
      { step: 'prepare', timestamp: '2026-05-19 09:00', note: 'Shipment picked and packed at BM Warehouse.', completedBy: 'Admin' },
      { step: 'ready', timestamp: '2026-05-19 10:30', note: 'Ready for dispatch to Vendor Warehouse.', completedBy: 'Admin' },
      { step: 'in_transit', timestamp: '2026-05-19 11:00', note: 'Left BM Warehouse en route to Vendor Warehouse.', completedBy: 'Rajan Kumar' },
    ],
  },
  {
    id: 'DEL-002',
    transferId: 'TRF-00079',
    fromWarehouse: 'BM Warehouse',
    toWarehouse: 'Vendor Warehouse',
    items_detail: '1x LED Monitor 27 inch',
    items: [
      { productName: 'LED Monitor 27 inch', sku: 'LMN-006', quantity: 1 },
    ],
    status: 'ready',
    estimatedDelivery: '2026-05-21',
    created_at: '2026-05-19 08:00',
    last_update: '2026-05-19 09:30',
    timeline: [
      { step: 'prepare', timestamp: '2026-05-19 08:00', note: 'Shipment packed and verified.', completedBy: 'Admin' },
      { step: 'ready', timestamp: '2026-05-19 09:30', note: 'Ready for dispatch.', completedBy: 'Admin' },
    ],
  },
  {
    id: 'DEL-003',
    transferId: 'TRF-00075',
    fromWarehouse: 'Vendor Warehouse',
    toWarehouse: 'BM Warehouse',
    items_detail: '3x Noise Cancelling Earbuds, 2x Portable Power Bank 20000mAh, 1x Laptop Cooling Pad',
    items: [
      { productName: 'Noise Cancelling Earbuds', sku: 'NCE-010', quantity: 3 },
      { productName: 'Portable Power Bank 20000mAh', sku: 'PPB-011', quantity: 2 },
      { productName: 'Laptop Cooling Pad', sku: 'LCP-007', quantity: 1 },
    ],
    status: 'delivered',
    estimatedDelivery: '2026-05-19',
    created_at: '2026-05-18 14:00',
    last_update: '2026-05-19 16:00',
    driver_name: 'Brian Koh',
    vehicle_plate: 'SJA 1187',
    timeline: [
      { step: 'prepare', timestamp: '2026-05-18 14:00', note: 'Items picked from Vendor Warehouse.', completedBy: 'Admin' },
      { step: 'ready', timestamp: '2026-05-18 16:00', note: 'Consolidated and ready.', completedBy: 'Admin' },
      { step: 'in_transit', timestamp: '2026-05-18 17:30', note: 'Left Vendor Warehouse en route to BM Warehouse.', completedBy: 'Brian Koh' },
      { step: 'delivered', timestamp: '2026-05-19 08:45', note: 'Arrived and received at BM Warehouse.', completedBy: 'Admin' },
    ],
  },
  {
    id: 'DEL-004',
    transferId: 'TRF-00084',
    fromWarehouse: 'Vendor Warehouse',
    toWarehouse: 'BM Warehouse',
    items_detail: '2x Smart Home Hub Device',
    items: [
      { productName: 'Smart Home Hub Device', sku: 'SHH-012', quantity: 2 },
    ],
    status: 'prepare',
    estimatedDelivery: '2026-05-22',
    created_at: '2026-05-19 11:20',
    last_update: '2026-05-19 11:20',
    timeline: [
      { step: 'prepare', timestamp: '2026-05-19 11:20', note: 'Shipment received, preparing at Vendor Warehouse.', completedBy: 'SmartLife Corp.' },
    ],
  },
  {
    id: 'DEL-005',
    transferId: 'TRF-00082',
    fromWarehouse: 'BM Warehouse',
    toWarehouse: 'Vendor Warehouse',
    items_detail: '2x Mechanical Keyboard RGB, 2x Wireless Bluetooth Headphones',
    items: [
      { productName: 'Mechanical Keyboard RGB', sku: 'MKR-004', quantity: 2 },
      { productName: 'Wireless Bluetooth Headphones', sku: 'WBH-001', quantity: 2 },
    ],
    status: 'in_transit',
    estimatedDelivery: '2026-05-20',
    created_at: '2026-05-19 09:30',
    last_update: '2026-05-19 10:40',
    driver_name: 'Chen Wei',
    timeline: [
      { step: 'prepare', timestamp: '2026-05-19 09:30', note: 'Shipment packed and verified.', completedBy: 'Admin' },
      { step: 'ready', timestamp: '2026-05-19 10:00', note: 'Ready for dispatch.', completedBy: 'Admin' },
      { step: 'in_transit', timestamp: '2026-05-19 10:40', note: 'Out for delivery to Vendor Warehouse.', completedBy: 'Chen Wei' },
    ],
  },
  {
    id: 'DEL-006',
    transferId: 'TRF-00070',
    fromWarehouse: 'BM Warehouse',
    toWarehouse: 'Vendor Warehouse',
    items_detail: '1x Ergonomic Office Chair, 2x Desk Lamp LED Dimmable',
    items: [
      { productName: 'Ergonomic Office Chair', sku: 'EOC-003', quantity: 1 },
      { productName: 'Desk Lamp LED Dimmable', sku: 'DLD-005', quantity: 2 },
    ],
    status: 'delivered',
    estimatedDelivery: '2026-05-18',
    created_at: '2026-05-17 10:00',
    last_update: '2026-05-18 11:00',
    driver_name: 'Farah Aziz',
    timeline: [
      { step: 'prepare', timestamp: '2026-05-17 10:00', note: 'Packed at BM Warehouse.', completedBy: 'Admin' },
      { step: 'ready', timestamp: '2026-05-17 12:00', note: 'Ready for dispatch.', completedBy: 'Admin' },
      { step: 'in_transit', timestamp: '2026-05-17 14:30', note: 'Left BM Warehouse.', completedBy: 'Farah Aziz' },
      { step: 'delivered', timestamp: '2026-05-18 11:00', note: 'Arrived and received at Vendor Warehouse.', completedBy: 'Admin' },
    ],
  },
];
