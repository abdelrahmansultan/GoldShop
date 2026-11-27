import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, Building2, Coins, Gem, HandCoins, Receipt, Scale, ShoppingBag, TrendingUp, Truck, Wallet } from "lucide-react";
import { useGet } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { dateTime, money, num, weight } from "../lib/format";
import { Badge, Card, Empty, PageHeader, Spinner, Stat, Table } from "../components/ui";
import { PriceBoard } from "./Prices";

type Dash = any;
const GOLD = "#b98b25";

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const { data: d, isLoading } = useGet<Dash>("/reports/dashboard/");
  if (isLoading || !d) return <Spinner />;
  const fin = can("dashboard.financial") && d.balances;
  const inv = d.inventory;
  const ln = (o: any, base: string) => (i18n.language === "ar" ? o[`${base}name_ar`] : o[`${base}name_en`]) || "—";
  const fmtAxis = (v: number) => new Intl.NumberFormat(i18n.language === "ar" ? "ar-EG" : "en-EG", { notation: "compact" }).format(v);

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.dashboard")} subtitle={new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-EG" : "en-EG", { dateStyle: "full" }).format(new Date())} />

      {fin && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat tone="gold" icon={<ShoppingBag className="size-5" />} label={t("dash.todaySales")} value={money(d.today.gross_sales)}
            sub={<>{t("dash.invoicesCount", { count: d.today.invoices })}{Number(d.today.returns) > 0 && <> · {t("dash.returns")} {money(d.today.returns)}</>}</>} />
          <Stat icon={<TrendingUp className="size-5" />} label={t("dash.grossProfit")} value={money(d.today.gross_profit)} sub={`${t("dash.netProfit")}: ${money(d.today.net_profit)}`} />
          <Stat tone="gold" icon={<Truck className="size-5" />} label={t("dash.todayPurchases")} value={money(d.today.purchases)} />
          <Stat tone="red" icon={<Receipt className="size-5" />} label={t("dash.todayExpenses")} value={money(d.today.expenses)} />
          <Stat icon={<Banknote className="size-5" />} label={t("dash.cash")} value={money(d.balances.cash)} />
          <Stat icon={<Building2 className="size-5" />} label={t("dash.bank")} value={money(d.balances.bank)} />
          <Stat tone="green" icon={<HandCoins className="size-5" />} label={t("dash.receivables")} value={money(d.balances.receivables)} />
          <Stat tone="red" icon={<Wallet className="size-5" />} label={t("dash.payables")} value={money(d.balances.payables)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="gold" icon={<Scale className="size-5" />} label={t("dash.goldWeight")} value={weight(inv.total_net_weight)}
          sub={`${t("dash.pure")}: ${weight(inv.total_pure_weight)} · ${t("dash.scrap")}: ${weight(inv.total_scrap_weight)}`} />
        <Stat icon={<Coins className="size-5" />} label={t("dash.goldValue")} value={money(inv.total_value_at_buy)}
          sub={inv.value_incomplete ? <span className="text-amber-700">{t("dash.valueIncomplete")}</span> : undefined} />
        <Stat tone="gold" icon={<Gem className="size-5" />} label={t("dash.products")} value={num(inv.available_products)} sub={`${num(inv.available_pieces)} ${t("common.quantity")}`} />
        <Link to="/adjustments" className="block"><Stat tone={inv.pending_discrepancies ? "red" : "green"} icon={<AlertTriangle className="size-5" />}
          label={t("dash.discrepancies")} value={num(inv.pending_discrepancies)} sub={`${t("dash.lowStock")}: ${inv.low_stock.length}`} /></Link>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2"><PriceBoard compact /></div>
        <Card title={t("dash.byKarat")} bodyClass="p-0">
          <Table head={[t("inv.karat"), t("common.quantity"), t("inv.net"), t("dash.goldValue")]}>
            {inv.by_karat.map((r: any) => (
              <tr key={r.karat_id}>
                <td className="font-bold">{r.karat}K</td>
                <td className="num">{num(r.items)}</td>
                <td className="num">{weight(r.net_weight)}</td>
                <td className="num">{r.value_at_buy == null ? <Badge tone="amber">{t("prices.missing")}</Badge> : money(r.value_at_buy)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {fin && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card title={t("dash.dailySales")}>
            <div className="h-64" dir="ltr">
              <ResponsiveContainer>
                <BarChart data={d.daily_sales.map((x: any) => ({ ...x, total: Number(x.total) }))} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(8)} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} reversed={i18n.language === "ar"} />
                  <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={48} orientation={i18n.language === "ar" ? "right" : "left"} />
                  <Tooltip cursor={{ fill: "#fbf6e9" }} formatter={(v) => [money(v as number), t("dash.todaySales")]} labelFormatter={(l) => String(l)} />
                  <Bar dataKey="total" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title={t("dash.monthly")}>
            {d.monthly_revenue.length ? (
              <div className="h-64" dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={d.monthly_revenue.map((x: any) => ({ ...x, total: Number(x.total) }))}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} reversed={i18n.language === "ar"} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={48} orientation={i18n.language === "ar" ? "right" : "left"} />
                    <Tooltip cursor={{ fill: "#fbf6e9" }} formatter={(v) => [money(v as number), t("dash.revenue")]} />
                    <Bar dataKey="total" fill="#16264a" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty />}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title={t("dash.recentInvoices")} bodyClass="p-0" actions={<Link className="text-xs font-semibold text-gold-600" to="/sales">{t("common.view")}</Link>}>
          <Table head={[t("sales.number"), t("pos.customer"), t("common.total")]} empty={!d.recent_invoices.length}>
            {d.recent_invoices.map((i: any) => (
              <tr key={i.id}>
                <td><Link className="font-semibold text-navy-700 hover:underline" to={`/sales/${i.id}`}>{i.number}</Link><div className="text-xs text-slate-400">{dateTime(i.issued_at)}</div></td>
                <td>{i.customer_name || t("pos.walkIn")}</td>
                <td className="num font-semibold">{money(i.grand_total)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        {fin && (
          <Card title={t("dash.byMethod")} bodyClass="p-4">
            {d.sales_by_method.length ? <MethodBars rows={d.sales_by_method} /> : <Empty />}
          </Card>
        )}
        {fin && (
          <Card title={t("dash.topItems")} bodyClass="p-0">
            <Table head={[t("inv.item"), t("common.quantity"), t("common.total")]} empty={!d.top_categories.length}>
              {d.top_categories.map((c: any, i: number) => (
                <tr key={i}><td>{ln(c, "product__category__")}</td><td className="num">{num(c.quantity)}</td><td className="num">{money(c.total)}</td></tr>
              ))}
            </Table>
          </Card>
        )}
      </div>

      {fin && (
        <Card title={t("dash.recentTx")} bodyClass="p-0">
          <Table head={[t("common.date"), t("common.type"), t("common.account"), t("common.description"), t("common.amount")]} empty={!d.recent_transactions.length}>
            {d.recent_transactions.map((x: any) => (
              <tr key={x.id}>
                <td className="text-xs text-slate-500">{dateTime(x.created_at)}</td><td>{t(`tx.${x.type}`)}</td><td>{x.account}</td>
                <td className="max-w-xs truncate">{x.description}</td>
                <td className={`num font-semibold ${String(x.amount).startsWith("-") ? "text-red-600" : "text-emerald-700"}`}>{money(x.amount)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

/** Horizontal single-hue bars: one measure (amount) per payment method, labeled directly. */
function MethodBars({ rows }: { rows: { method: string; total: string; count: number }[] }) {
  const { t } = useTranslation();
  const max = Math.max(...rows.map((r) => Number(r.total)), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.method} title={`${t(`methods.${r.method}`)}: ${money(r.total)} (${r.count})`}>
          <div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-slate-700">{t(`methods.${r.method}`)}</span><span className="num text-slate-600">{money(r.total)}</span></div>
          <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-gold-500" style={{ width: `${(Number(r.total) / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
