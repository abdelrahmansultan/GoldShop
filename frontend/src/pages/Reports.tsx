import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Printer } from "lucide-react";
import { downloadCsv } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useGet } from "../lib/hooks";
import { addMoney, isNegative, isZero, money, num, todayISO, weight } from "../lib/format";
import { useLocalName, useLookups } from "../lib/useLookups";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, Stat, Table } from "../components/ui";
import { printPage } from "./InvoiceDetail";
import SalesReport from "./SalesReport";

type Tab = "sales" | "close" | "inventory" | "balances";

export default function Reports() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const tabs: Tab[] = ["sales", ...(can("treasury.view") ? ["close" as Tab] : []), "inventory", "balances"];
  const [tab, setTab] = useState<Tab>("sales");
  return (
    <div className="space-y-5">
      <PageHeader title={t("rep.title")} />
      <div className="no-print flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200" role="tablist">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === k ? "bg-navy-900 text-gold-300" : "text-slate-600 hover:bg-slate-100"}`}>
            {t(`rep2.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === "sales" && <SalesReport />}
      {tab === "close" && <DailyClose />}
      {tab === "inventory" && <InventoryReport />}
      {tab === "balances" && <Balances />}
    </div>
  );
}

function DailyClose() {
  const { t } = useTranslation();
  const [day, setDay] = useState(todayISO());
  const [counted, setCounted] = useState("");
  const { data: d } = useGet<any>("/reports/daily-close/", { date: day });
  const variance = d && counted ? addMoney(counted, `-${d.expected_cash}`) : null;
  return (
    <div className="space-y-4">
      <Card>
        <div className="no-print flex flex-wrap items-end gap-3">
          <Field label={t("common.date")}><Input type="date" max={todayISO()} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => void printPage()}>{t("common.print")}</Button>
        </div>
      </Card>
      {!d ? <Spinner /> : (
        <div className="print-area space-y-4">
          <h2 className="hidden text-lg font-bold print:block">{t("rep2.dailyClose")} — {day}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("pos.grandTotal")} value={money(d.sales.gross_sales)} sub={t("dash.invoicesCount", { count: d.sales.invoices })} />
            <Stat label={t("dash.returns")} value={money(d.sales.returns)} />
            <Stat label={t("rep2.creditSales")} value={money(d.credit_sales)} />
            <Stat label={t("dash.grossProfit")} value={money(d.sales.gross_profit)} />
            <Stat label={t("nav.expenses")} value={money(d.expenses)} />
            <Stat label={t("nav.purchases")} value={money(d.purchases)} />
            <Stat label={t("rep.weightSold")} value={weight(d.sales.weight_sold)} />
            <Stat label={t("rep2.firstLast")} value={<span className="text-sm">{d.first_invoice ?? "—"} → {d.last_invoice ?? "—"}</span>} />
          </div>
          <Card title={t("tr.accounts")} bodyClass="p-0">
            <Table head={[t("common.account"), t("rep2.opening"), t("rep2.inflow"), t("rep2.outflow"), t("rep2.closing"), t("common.details")]} empty={!d.accounts.length}>
              {d.accounts.map((a: any) => (
                <tr key={a.id}>
                  <td className="font-semibold">{a.name} <Badge tone={a.kind === "cash" ? "gold" : "blue"}>{a.kind === "cash" ? t("tr.cashBox") : t("tr.bankAccount")}</Badge></td>
                  <td className="num">{money(a.opening)}</td><td className="num text-emerald-700">{money(a.inflow)}</td>
                  <td className="num text-red-600">{money(a.outflow)}</td><td className="num font-bold">{money(a.closing)}</td>
                  <td className="text-xs">{a.by_type.map((x: any) => <div key={x.type}>{t(`tx.${x.type}`)}: <span className="num">{money(x.total)}</span> ({x.count})</div>)}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title={t("rep2.expectedCash")}>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
              <div><div className="label">{t("rep2.expectedCash")}</div><div className="num text-start text-2xl font-bold text-navy-900">{money(d.expected_cash)}</div></div>
              <Field label={t("rep2.countedCash")}><Input className="num" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              <div><div className="label">{t("rep2.variance")}</div>
                <div className={`num text-start text-2xl font-bold ${!variance || isZero(variance) ? "text-emerald-700" : isNegative(variance) ? "text-red-600" : "text-amber-600"}`}>{variance ? money(variance) : "—"}</div></div>
            </div>
          </Card>
          {d.old_gold_received.length > 0 && (
            <Card title={t("pos.oldGold")} bodyClass="p-0">
              <Table head={[t("inv.karat"), t("pos.weight"), t("common.amount")]}>
                {d.old_gold_received.map((o: any) => <tr key={o.karat__code}><td>{o.karat__code}K</td><td className="num">{weight(o.weight)}</td><td className="num">{money(o.value)}</td></tr>)}
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function InventoryReport() {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { can } = useAuth();
  const { karats, categories } = useLookups();
  const [f, setF] = useState({ karat: "", category: "" });
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const { data } = useGet<any>("/reports/inventory/", params);
  const cost = can("inventory.view_cost");
  return (
    <div className="space-y-4">
      <Card>
        <div className="no-print flex flex-wrap items-end gap-3">
          <Field label={t("inv.karat")}><Select value={f.karat} onChange={(e) => setF({ ...f, karat: e.target.value })}><option value="">{t("common.all")}</option>{karats.map((k) => <option key={k.id} value={k.id}>{k.code}K</option>)}</Select></Field>
          <Field label={t("inv.category")}><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">{t("common.all")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select></Field>
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => void downloadCsv("/reports/inventory/", params, `inventory-${todayISO()}.csv`)}>{t("rep2.exportCsv")}</Button>
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => void printPage()}>{t("common.print")}</Button>
        </div>
      </Card>
      {!data ? <Spinner /> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("common.quantity")} value={num(data.totals.items)} />
          <Stat label={t("rep2.totalWeight")} value={weight(data.totals.total_net_weight)} />
          <Stat label={t("rep2.valueAtBuy")} value={money(data.totals.value_at_buy)} />
          {cost && <Stat label={t("rep2.totalCost")} value={money(data.totals.total_cost)} />}
        </div>
        <Card bodyClass="p-0" className="print-area">
          <Table head={[t("common.code"), t("inv.item"), t("inv.category"), t("inv.karat"), t("common.quantity"), t("inv.net"), t("rep2.totalWeight"), ...(cost ? [t("rep2.totalCost")] : []), t("rep2.valueAtBuy")]} empty={!data.rows.length}>
            {data.rows.map((r: any) => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.code}</td><td>{r.name}</td><td>{ln({ name_ar: r.category_ar, name_en: r.category_en })}</td><td>{r.karat}K</td>
                <td className="num">{r.quantity}</td><td className="num">{weight(r.net_weight)}</td><td className="num font-semibold">{weight(r.total_net_weight)}</td>
                {cost && <td className="num">{money(r.total_cost)}</td>}<td className="num">{r.value_at_buy == null ? <Badge tone="amber">{t("prices.missing")}</Badge> : money(r.value_at_buy)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </>)}
    </div>
  );
}

function Balances() {
  const { t } = useTranslation();
  const { can } = useAuth();
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {can("sales.view") && <BalanceTable kind="customers" />}
      {can("purchases.manage") && <BalanceTable kind="suppliers" />}
      {!can("sales.view") && !can("purchases.manage") && <p className="text-sm text-slate-500">{t("common.noData")}</p>}
    </div>
  );
}

function BalanceTable({ kind }: { kind: "customers" | "suppliers" }) {
  const { t } = useTranslation();
  const { data } = useGet<any[]>(`/reports/balances/${kind}/`);
  const total = data ? addMoney(...data.map((r) => r.balance)) : "0.00";
  return (
    <Card title={`${kind === "customers" ? t("dash.receivables") : t("dash.payables")} — ${money(total)}`} bodyClass="p-0"
      actions={<Button size="sm" variant="secondary" icon={<Download className="size-3" />} onClick={() => void downloadCsv(`/reports/balances/${kind}/`, {}, `${kind}-balances-${todayISO()}.csv`)}>{t("rep2.exportCsv")}</Button>}>
      <Table head={[t("common.name"), t("common.phone"), t("common.balance")]} empty={data?.length === 0}>
        {data?.map((r) => <tr key={r.id}><td className="font-semibold">{r.name}</td><td>{r.phone}</td><td className={`num font-semibold ${isNegative(r.balance) ? "text-emerald-700" : "text-amber-700"}`}>{money(r.balance)}</td></tr>)}
      </Table>
    </Card>
  );
}
