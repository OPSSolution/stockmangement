import type { RouteObject } from "react-router-dom";
import ProtectedRoute from "@/components/feature/ProtectedRoute";
import NotFound from "../pages/NotFound";
import UnauthorizedPage from "../pages/unauthorized/page";
import LoginPage from "../pages/login/page";
import SignupPage from "../pages/signup/page";
import Home from "../pages/home/page";
import InventoryPage from "../pages/inventory/page";
import OrdersPage from "../pages/orders/page";
import PublicOrderFormPage from "../pages/order-form/page";
import DeliveriesPage from "../pages/deliveries/page";
import TransfersPage from "../pages/transfers/page";
import PurchasesPage from "../pages/purchases/page";
import VendorsPage from "../pages/vendors/page";
import ReturnsPage from "../pages/returns/page";
import WarehousesPage from "../pages/warehouses/page";
import PromotionsPage from "../pages/promotions/page";
import TeamsPage from "../pages/teams/page";
import NotificationAnalyticsPage from "../pages/notifications/analytics/page";
import NotificationSettingsPage from "../pages/notifications/settings/page";
import NotificationHistoryPage from "../pages/notifications/history/page";
import ReportsPage from "../pages/reports/page";
import RequirementsPage from "../pages/requirements/page";
import RolesPage from "../pages/roles/page";
import CategoriesPage from "../pages/categories/page";
import AdminCategoriesPage from "../pages/admin/categories/page";

const routes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/signup",
    element: <SignupPage />,
  },
  {
    path: "/unauthorized",
    element: <UnauthorizedPage />,
  },
  {
    path: "/",
    element: <ProtectedRoute permKey="dashboard"><Home /></ProtectedRoute>,
  },
  {
    path: "/inventory",
    element: <ProtectedRoute permKey="inventory"><InventoryPage /></ProtectedRoute>,
  },
  {
    path: "/orders",
    element: <ProtectedRoute permKey="orders"><OrdersPage /></ProtectedRoute>,
  },
  {
    path: "/deliveries",
    element: <ProtectedRoute permKey="deliveries"><DeliveriesPage /></ProtectedRoute>,
  },
  {
    path: "/transfers",
    element: <ProtectedRoute permKey="transfers"><TransfersPage /></ProtectedRoute>,
  },
  {
    path: "/purchases",
    element: <ProtectedRoute permKey="purchases"><PurchasesPage /></ProtectedRoute>,
  },
  {
    path: "/vendors",
    element: <ProtectedRoute permKey="vendors"><VendorsPage /></ProtectedRoute>,
  },
  {
    path: "/returns",
    element: <ProtectedRoute permKey="returns"><ReturnsPage /></ProtectedRoute>,
  },
  {
    path: "/warehouses",
    element: <ProtectedRoute permKey="warehouses"><WarehousesPage /></ProtectedRoute>,
  },
  {
    path: "/promotions",
    element: <ProtectedRoute permKey="promotions"><PromotionsPage /></ProtectedRoute>,
  },
  {
    path: "/notifications/settings",
    element: <ProtectedRoute permKey="notifications_settings"><NotificationSettingsPage /></ProtectedRoute>,
  },
  {
    path: "/notifications/history",
    element: <ProtectedRoute permKey="notifications_history"><NotificationHistoryPage /></ProtectedRoute>,
  },
  {
    path: "/notifications/analytics",
    element: <ProtectedRoute permKey="notifications_analytics"><NotificationAnalyticsPage /></ProtectedRoute>,
  },
  {
    path: "/reports",
    element: <ProtectedRoute permKey="reports"><ReportsPage /></ProtectedRoute>,
  },
  {
    path: "/teams",
    element: <ProtectedRoute permKey="teams"><TeamsPage /></ProtectedRoute>,
  },
  {
    path: "/requirements",
    element: <ProtectedRoute permKey="requirements"><RequirementsPage /></ProtectedRoute>,
  },
  {
    path: "/admin/roles",
    element: <ProtectedRoute permKey="roles"><RolesPage /></ProtectedRoute>,
  },
  {
    path: "/categories",
    element: <ProtectedRoute permKey="categories"><CategoriesPage /></ProtectedRoute>,
  },
  {
    path: "/admin/categories",
    element: <ProtectedRoute permKey="categories"><AdminCategoriesPage /></ProtectedRoute>,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
