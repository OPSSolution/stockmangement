import DashboardLayout from '@/components/feature/DashboardLayout';
import KpiCards from './components/KpiCards';
import StockTable from './components/StockTable';
import AlertsPanel from './components/AlertsPanel';
import QuickActions from './components/QuickActions';
import DeliveryStatus from './components/DeliveryStatus';
import RecentActivity from './components/RecentActivity';
import WarehouseSnapshot from './components/WarehouseSnapshot';

export default function Home() {
  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Welcome back — here's your real-time warehouse and inventory overview."
    >
      {/* KPI Cards */}
      <section className="mb-6">
        <KpiCards />
      </section>

      {/* Middle row: Quick Actions + Warehouse Snapshot + Alerts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
        <div className="lg:col-span-1">
          <QuickActions />
        </div>
        <div className="lg:col-span-1">
          <WarehouseSnapshot />
        </div>
        <div className="lg:col-span-1">
          <AlertsPanel />
        </div>
      </section>

      {/* Inventory Table */}
      <section className="mb-6">
        <StockTable />
      </section>

      {/* Bottom row: Deliveries + Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DeliveryStatus />
        <RecentActivity />
      </section>
    </DashboardLayout>
  );
}