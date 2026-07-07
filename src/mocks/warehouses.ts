export interface WarehouseZone {
  id: string;
  name: string;
  type: 'storage' | 'receiving' | 'shipping' | 'returns' | 'staging';
  capacity: number;
  used: number;
  skuCount: number;
}

export interface WarehouseStaff {
  name: string;
  role: string;
  shift: 'morning' | 'evening' | 'night' | 'Full Day'; 
}

export interface MonthlyActivity {
  month: string;
  inbound: number;
  outbound: number;
  returns: number;
}

export interface Warehouse {
  id: string;
  name: string;
  type: 'owned' | 'vendor';
  address: string;
  city: string;
  country: string;
  manager: string;
  managerEmail: string;
  managerPhone: string;
  operatingHours: string;
  totalCapacity: number;
  usedCapacity: number;
  totalSkus: number;
  totalUnits: number;
  inboundToday: number;
  outboundToday: number;
  pendingPickups: number;
  zones: WarehouseZone[];
  staff: WarehouseStaff[];
  monthlyActivity: MonthlyActivity[];
  lastAudit: string;
  notes?: string;
}

export const warehouses: Warehouse[] = [
  {
    id: 'WH001',
    name: 'BM Warehouse',
    type: 'owned',
    address: '12, Jalan Industri 4, Bukit Mertajam Industrial Park',
    city: 'Bukit Mertajam, Penang',
    country: 'Malaysia',
    manager: 'Hafiz Roslan',
    managerEmail: 'hafiz@stockmanagement.io',
    managerPhone: '+60 12-600 7788',
    operatingHours: 'Mon–Sat, 8:00 AM – 8:00 PM',
    totalCapacity: 5000,
    usedCapacity: 3410,
    totalSkus: 7,
    totalUnits: 1178,
    inboundToday: 42,
    outboundToday: 78,
    pendingPickups: 5,
    lastAudit: '2026-05-01',
    notes: 'Primary fulfillment hub. Handles all BM-local orders and direct dispatch.',
    zones: [
      { id: 'Z001', name: 'Zone A — Electronics', type: 'storage', capacity: 1500, used: 1120, skuCount: 4 },
      { id: 'Z002', name: 'Zone B — Furniture', type: 'storage', capacity: 1200, used: 950, skuCount: 2 },
      { id: 'Z003', name: 'Zone C — Accessories', type: 'storage', capacity: 800, used: 620, skuCount: 1 },
      { id: 'Z004', name: 'Receiving Dock', type: 'receiving', capacity: 500, used: 300, skuCount: 0 },
      { id: 'Z005', name: 'Dispatch Bay', type: 'shipping', capacity: 600, used: 280, skuCount: 0 },
      { id: 'Z006', name: 'Returns Area', type: 'returns', capacity: 400, used: 140, skuCount: 0 },
    ],
    staff: [
      { name: 'Hafiz Roslan', role: 'Warehouse Manager', shift: 'morning' },
      { name: 'Siti Aminah', role: 'Inventory Clerk', shift: 'morning' },
      { name: 'Rajan Kumar', role: 'Forklift Operator', shift: 'morning' },
      { name: 'Chen Wei', role: 'Packing Staff', shift: 'evening' },
      { name: 'Farah Aziz', role: 'Receiving Officer', shift: 'morning' },
    ],
    monthlyActivity: [
      { month: 'Jan', inbound: 380, outbound: 420, returns: 18 },
      { month: 'Feb', inbound: 310, outbound: 390, returns: 12 },
      { month: 'Mar', inbound: 450, outbound: 510, returns: 22 },
      { month: 'Apr', inbound: 500, outbound: 580, returns: 25 },
      { month: 'May', inbound: 420, outbound: 490, returns: 20 },
    ],
  },
  {
    id: 'WH002',
    name: 'Vendor Warehouse',
    type: 'vendor',
    address: 'Unit 5, Jalan Teknologi 7, Taman Industri Selama',
    city: 'Subang Jaya, Selangor',
    country: 'Malaysia',
    manager: 'Michelle Tan',
    managerEmail: 'michelle@soundwave.co',
    managerPhone: '+60 16-555 4433',
    operatingHours: 'Mon–Fri, 9:00 AM – 6:00 PM',
    totalCapacity: 3000,
    usedCapacity: 1548,
    totalSkus: 5,
    totalUnits: 1131,
    inboundToday: 30,
    outboundToday: 55,
    pendingPickups: 3,
    lastAudit: '2026-04-20',
    notes: 'Multi-vendor operated space. Houses goods from 5 active vendors.',
    zones: [
      { id: 'Z007', name: 'Section 1 — SoundWave Co.', type: 'storage', capacity: 800, used: 620, skuCount: 1 },
      { id: 'Z008', name: 'Section 2 — ErgoWorks Ltd.', type: 'storage', capacity: 700, used: 210, skuCount: 2 },
      { id: 'Z009', name: 'Section 3 — CoolTech Inc.', type: 'storage', capacity: 400, used: 88, skuCount: 1 },
      { id: 'Z010', name: 'Section 4 — SmartLife Corp.', type: 'storage', capacity: 500, used: 340, skuCount: 1 },
      { id: 'Z011', name: 'Staging Area', type: 'staging', capacity: 300, used: 150, skuCount: 0 },
      { id: 'Z012', name: 'Inbound Dock', type: 'receiving', capacity: 300, used: 140, skuCount: 0 },
    ],
    staff: [
      { name: 'Michelle Tan', role: 'Site Coordinator', shift: 'morning' },
      { name: 'Raj Patel', role: 'Vendor Liaison', shift: 'morning' },
      { name: 'Amy Lee', role: 'Inventory Tracker', shift: 'morning' },
      { name: 'Brian Koh', role: 'Packing Specialist', shift: 'evening' },
    ],
    monthlyActivity: [
      { month: 'Jan', inbound: 210, outbound: 280, returns: 10 },
      { month: 'Feb', inbound: 180, outbound: 240, returns: 8 },
      { month: 'Mar', inbound: 250, outbound: 310, returns: 14 },
      { month: 'Apr', inbound: 300, outbound: 350, returns: 16 },
      { month: 'May', inbound: 270, outbound: 320, returns: 11 },
    ],
  },
];