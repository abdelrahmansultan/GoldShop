import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Layout from "./components/layout/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Prices = lazy(() => import("./pages/Prices"));
const Inventory = lazy(() => import("./pages/Inventory"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const POS = lazy(() => import("./pages/POS"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const SalesReturns = lazy(() => import("./pages/SalesReturns"));
const Adjustments = lazy(() => import("./pages/Adjustments"));
const StockCounts = lazy(() => import("./pages/StockCounts"));
const StockCountDetail = lazy(() => import("./pages/StockCountDetail"));
const Scrap = lazy(() => import("./pages/Scrap"));
const Purchases = lazy(() => import("./pages/Purchases"));
const PurchaseNew = lazy(() => import("./pages/PurchaseNew"));
const PurchaseDetail = lazy(() => import("./pages/PurchaseDetail"));
const Parties = lazy(() => import("./pages/Parties"));
const Treasury = lazy(() => import("./pages/Treasury"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Reports = lazy(() => import("./pages/Reports"));
const Users = lazy(() => import("./pages/Users"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Audit = lazy(() => import("./pages/Audit"));

function Guard({ cap, children }: { cap: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(cap) ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="h-screen" />;
  if (!user) return <Login />;
  const r = (path: string, cap: string, el: ReactNode) => <Route path={path} element={<Guard cap={cap}>{el}</Guard>} />;
  return (
    <Suspense fallback={<Spinner className="h-screen" />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {r("prices", "inventory.view", <Prices />)}
          {r("inventory", "inventory.view", <Inventory />)}
          {r("inventory/:id", "inventory.view", <ProductDetail />)}
          {r("pos", "sales.create", <POS />)}
          {r("sales", "sales.view", <Invoices />)}
          {r("sales/:id", "sales.view", <InvoiceDetail />)}
          {r("sales-returns", "sales.view", <SalesReturns />)}
          {r("adjustments", "inventory.view", <Adjustments />)}
          {r("stock-counts", "inventory.view", <StockCounts />)}
          {r("stock-counts/:id", "inventory.view", <StockCountDetail />)}
          {r("scrap", "inventory.view", <Scrap />)}
          {r("purchases", "purchases.manage", <Purchases />)}
          {r("purchases/new", "purchases.manage", <PurchaseNew />)}
          {r("purchases/:id", "purchases.manage", <PurchaseDetail />)}
          {r("customers", "parties.manage", <Parties kind="customers" />)}
          {r("suppliers", "purchases.manage", <Parties kind="suppliers" />)}
          {r("treasury", "treasury.view", <Treasury />)}
          {r("expenses", "treasury.view", <Expenses />)}
          {r("reports", "reports.view", <Reports />)}
          {r("users", "users.manage", <Users />)}
          {r("settings", "settings.manage", <SettingsPage />)}
          {r("audit", "audit.view", <Audit />)}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
