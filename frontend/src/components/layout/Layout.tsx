import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, BarChart3, Boxes, ClipboardCheck, Coins, FileText, Gem, Landmark, LayoutDashboard, Languages, LogOut, Menu,
  Receipt, RotateCcw, Scale, Search, Settings, ShieldCheck, ShoppingCart, Truck, UserCircle, Users, Wallet, X, Recycle,
} from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ProfileModal } from "./ProfileModal";
import { ErrorBoundary } from "./ErrorBoundary";

type NavItem = { to: string; key: string; icon: React.ElementType; cap: string };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "", items: [{ to: "/", key: "dashboard", icon: LayoutDashboard, cap: "inventory.view" }] },
  { group: "sales", items: [
    { to: "/pos", key: "pos", icon: ShoppingCart, cap: "sales.create" },
    { to: "/sales", key: "invoices", icon: Receipt, cap: "sales.view" },
    { to: "/sales-returns", key: "returns", icon: RotateCcw, cap: "sales.view" },
    { to: "/customers", key: "customers", icon: Users, cap: "parties.manage" },
  ] },
  { group: "stock", items: [
    { to: "/prices", key: "prices", icon: Coins, cap: "inventory.view" },
    { to: "/inventory", key: "inventory", icon: Gem, cap: "inventory.view" },
    { to: "/adjustments", key: "adjustments", icon: Scale, cap: "inventory.view" },
    { to: "/stock-counts", key: "counts", icon: ClipboardCheck, cap: "inventory.view" },
    { to: "/scrap", key: "scrap", icon: Recycle, cap: "inventory.view" },
    { to: "/purchases", key: "purchases", icon: Truck, cap: "purchases.manage" },
    { to: "/suppliers", key: "suppliers", icon: Boxes, cap: "purchases.manage" },
  ] },
  { group: "finance", items: [
    { to: "/treasury", key: "treasury", icon: Landmark, cap: "treasury.view" },
    { to: "/expenses", key: "expenses", icon: Wallet, cap: "treasury.view" },
    { to: "/reports", key: "reports", icon: BarChart3, cap: "reports.view" },
  ] },
  { group: "admin", items: [
    { to: "/users", key: "users", icon: UserCircle, cap: "users.manage" },
    { to: "/audit", key: "audit", icon: ShieldCheck, cap: "audit.view" },
    { to: "/settings", key: "settings", icon: Settings, cap: "settings.manage" },
  ] },
];

export default function Layout() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-500 text-navy-950 shadow-lg"><Gem className="size-5" /></div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">{t("app.name")}</div>
          <div className="truncate text-xs text-gold-300/80">{t("app.tagline")}</div>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.cap));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              {g.group && <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t(`nav.${g.group}`)}</div>}
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/"}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? "bg-gold-400/15 text-gold-300" : "hover:bg-white/5 hover:text-white"}`}>
                  <i.icon className="size-4 shrink-0" />{t(`nav.${i.key}`)}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-64 shrink-0 bg-navy-900 lg:block"><div className="sticky top-0 h-screen">{sidebar}</div></aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 bg-navy-950/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 py-5 sm:px-6"><ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary></main>
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu(): void }) {
  const { t, i18n } = useTranslation();
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-6">
      <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="menu"><Menu className="size-5" /></button>
      <GlobalSearch />
      <div className="ms-auto flex items-center gap-1">
        {can("sales.create") && (
          <button type="button" onClick={() => nav("/pos")} className="hidden items-center gap-2 rounded-lg bg-gold-400 px-3 py-2 text-sm font-semibold text-navy-950 hover:bg-gold-300 sm:inline-flex">
            <ShoppingCart className="size-4" />{t("nav.pos")}
          </button>
        )}
        <button type="button" title={t("auth.language")} onClick={() => i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")}
          className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
          <Languages className="size-4" />{i18n.language === "ar" ? "EN" : "ع"}
        </button>
        <Notifications />
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
            <div className="grid size-8 place-items-center rounded-full bg-navy-900 text-xs font-bold text-gold-300">{user?.display_name?.slice(0, 1).toUpperCase()}</div>
            <div className="hidden text-start sm:block">
              <div className="text-xs font-semibold text-navy-900">{user?.display_name}</div>
              <div className="text-[11px] text-slate-500">{t(`users.roles.${user?.role}`)}</div>
            </div>
          </button>
          {menu && (
            <div className="absolute end-0 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { setProfile(true); setMenu(false); }}>
                <UserCircle className="size-4" />{t("auth.profile")}</button>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={logout}>
                <LogOut className="size-4" />{t("auth.logout")}</button>
            </div>
          )}
        </div>
      </div>
      <ProfileModal open={profile} onClose={() => setProfile(false)} />
    </header>
  );
}

type SearchHit = { type: string; id: number; title: string; subtitle: string; status?: string };
const HIT_ROUTES: Record<string, (id: number) => string> = {
  product: (id) => `/inventory/${id}`, sales_invoice: (id) => `/sales/${id}`, customer: (id) => `/customers?open=${id}`,
  supplier: (id) => `/suppliers?open=${id}`, purchase_invoice: (id) => `/purchases/${id}`,
};
const HIT_ICONS: Record<string, React.ElementType> = { product: Gem, sales_invoice: Receipt, customer: Users, supplier: Truck, purchase_invoice: FileText };

function GlobalSearch() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(h); }, [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced], enabled: debounced.length >= 2,
    queryFn: async () => (await api.get<{ results: SearchHit[] }>("/search/", { params: { q: debounced } })).data.results,
  });
  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder={`${t("common.search")}…`} className="input ps-9" />
      {open && debounced.length >= 2 && (
        <div className="absolute inset-x-0 mt-1 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {isFetching && <div className="px-3 py-2 text-xs text-slate-400">{t("common.loading")}</div>}
          {!isFetching && !data?.length && <div className="px-3 py-2 text-xs text-slate-400">{t("common.noData")}</div>}
          {data?.map((h) => {
            const Icon = HIT_ICONS[h.type] ?? FileText;
            return (
              <button type="button" key={`${h.type}-${h.id}`} onClick={() => { nav(HIT_ROUTES[h.type](h.id)); setOpen(false); setQ(""); }}
                className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-gold-50">
                <Icon className="size-4 shrink-0 text-gold-500" />
                <div className="min-w-0"><div className="truncate text-sm font-medium">{h.title}</div><div className="truncate text-xs text-slate-500">{h.subtitle}{h.status && ` · ${t(`inv.status.${h.status}`)}`}</div></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Notif = { level: "error" | "warning" | "info"; code: string; params: Record<string, string | number> };
const NOTIF_ROUTES: Record<string, string> = { price_missing: "/prices", price_stale: "/prices", adjustments_pending: "/adjustments", low_stock: "/inventory?low=1", stock_count_open: "/stock-counts" };

function Notifications() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["/notifications/"], refetchInterval: 60_000,
    queryFn: async () => (await api.get<{ items: Notif[] }>("/notifications/")).data.items,
  });
  const n = data?.length ?? 0;
  const dot = { error: "bg-red-500", warning: "bg-amber-500", info: "bg-sky-500" };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={t("notif.title")}>
        <Bell className="size-5" />
        {n > 0 && <span className="absolute -top-0.5 -end-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{n}</span>}
      </button>
      {open && (
        <div className="absolute end-0 mt-1 w-80 rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-bold text-navy-900">{t("notif.title")}</span>
            <button type="button" onClick={() => setOpen(false)}><X className="size-4 text-slate-400" /></button>
          </div>
          {!n && <div className="p-4 text-center text-sm text-slate-400">{t("notif.empty")}</div>}
          {data?.map((x, i) => (
            <button type="button" key={i} onClick={() => { nav(NOTIF_ROUTES[x.code] ?? "/"); setOpen(false); }}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-start text-sm hover:bg-slate-50">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[x.level]}`} />{t(`notif.${x.code}`, x.params)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
