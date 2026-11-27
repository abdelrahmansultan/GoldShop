import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { useGet } from "../lib/hooks";
import { addMoney, money, num, todayISO, weight } from "../lib/format";
import { Button, Card, Field, Input, PageHeader, Spinner, Stat, Table } from "../components/ui";
import { printPage } from "./InvoiceDetail";

export default function Reports() {
  const { t } = useTranslation();
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [applied, setApplied] = useState(range);
  const { data: r, isFetching } = useGet<any>("/reports/sales/", applied);
  return (
    <div className="space-y-5">
      <PageHeader title={t("rep.sales")} actions={<Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => void printPage()}>{t("common.print")}</Button>} />
      <Card>
        <div className="no-print flex flex-wrap items-end gap-3">
          <Field label={t("common.from")}><Input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label={t("common.to")}><Input type="date" value={range.to} min={range.from} max={today} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          <Button loading={isFetching} onClick={() => setApplied(range)}>{t("common.apply")}</Button>
        </div>
      </Card>
      {!r ? <Spinner /> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("pos.grandTotal")} value={money(r.summary.gross_sales)} sub={t("dash.invoicesCount", { count: r.summary.invoices })} />
          <Stat label={t("rep.revenue")} value={money(r.summary.revenue_ex_vat)} sub={`${t("pos.vat")}: ${money(r.summary.vat)}`} />
          <Stat label={t("dash.grossProfit")} value={money(r.summary.gross_profit)} sub={`${t("rep.cogs")}: ${money(r.summary.cost_of_goods)}`} />
          <Stat label={t("rep.weightSold")} value={weight(r.summary.weight_sold)} sub={`${t("dash.returns")}: ${money(r.summary.returns)}`} />
          <Stat label={t("nav.expenses")} value={money(r.expenses)} />
          <Stat label={t("nav.purchases")} value={money(r.purchases)} />
          <Stat label={t("dash.netProfit")} value={money(addMoney(r.summary.gross_profit, `-${r.expenses}`))} />
          <Stat label={t("pos.oldGoldCredit")} value={money(r.summary.old_gold_received)} />
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card title={t("rep.byKarat")} bodyClass="p-0">
            <Table head={[t("inv.karat"), t("common.quantity"), t("inv.net"), t("pos.goldValue"), t("pos.making"), t("common.total")]} empty={!r.by_karat.length}>
              {r.by_karat.map((k: any) => <tr key={k.karat_code}><td className="font-bold">{k.karat_code}K</td><td className="num">{num(k.quantity)}</td><td className="num">{weight(k.weight)}</td><td className="num">{money(k.gold)}</td><td className="num">{money(k.making)}</td><td className="num font-semibold">{money(k.total)}</td></tr>)}
            </Table>
          </Card>
          <Card title={t("rep.byMethod")} bodyClass="p-0">
            <Table head={[t("common.method"), "#", t("common.amount")]} empty={!r.by_method.length}>
              {r.by_method.map((m: any) => <tr key={m.method}><td>{t(`methods.${m.method}`)}</td><td className="num">{m.count}</td><td className="num font-semibold">{money(m.total)}</td></tr>)}
            </Table>
          </Card>
          <Card title={t("rep.byUser")} bodyClass="p-0">
            <Table head={[t("common.user"), t("nav.invoices"), t("common.total")]} empty={!r.by_user.length}>
              {r.by_user.map((u: any) => <tr key={u.created_by__username}><td>{u.created_by__full_name || u.created_by__username}</td><td className="num">{u.invoices}</td><td className="num font-semibold">{money(u.total)}</td></tr>)}
            </Table>
          </Card>
          <Card title={t("rep.byDay")} bodyClass="p-0">
            <Table head={[t("common.date"), t("nav.invoices"), t("inv.net"), t("pos.vat"), t("common.total")]} empty={!r.by_day.length}>
              {r.by_day.map((d: any) => <tr key={d.d}><td>{d.d}</td><td className="num">{d.invoices}</td><td className="num">{weight(d.weight)}</td><td className="num">{money(d.vat)}</td><td className="num font-semibold">{money(d.total)}</td></tr>)}
            </Table>
          </Card>
        </div>
      </>)}
    </div>
  );
}
