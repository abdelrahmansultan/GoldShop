import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { api } from "../lib/api";
import { useAction, useGet } from "../lib/hooks";
import { date, money, weight } from "../lib/format";
import { Button, Card, Field, Input, Modal, PageHeader, Spinner, Table } from "../components/ui";
import { printPage } from "./InvoiceDetail";

export default function PurchaseDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: p, refetch } = useGet<any>(`/purchases/${id}/`);
  const [ret, setRet] = useState<any>(null);
  const [v, setV] = useState({ quantity: "1", reason: "" });
  const save = useAction(() => api.post(`/purchases/${id}/return/`, { line: ret.id, quantity: Number(v.quantity), reason: v.reason }),
    { success: t("common.saved"), invalidate: [["/products/"]], onSuccess: () => { setRet(null); refetch(); } });
  if (!p) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader title={p.number} subtitle={`${p.supplier_name} · ${date(p.date)}${p.supplier_invoice_no ? ` · ${p.supplier_invoice_no}` : ""}`}
        actions={<Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => void printPage()}>{t("common.print")}</Button>} />
      <Card bodyClass="p-0" className="print-area">
        <Table head={[t("inv.item"), t("inv.karat"), t("common.quantity"), t("inv.net"), t("pur.goldPrice"), t("pur.makingCost"), t("pur.unitCost"), t("pur.lineTotal"), ""]}>
          {p.lines.map((l: any) => (
            <tr key={l.id}>
              <td><Link className="font-semibold text-navy-700" to={`/inventory/${l.product}`}>{l.product_code}</Link> {l.product_name}</td>
              <td>{l.karat_code}K</td><td className="num">{l.quantity}{l.returned_quantity > 0 && <span className="text-xs text-red-600"> (-{l.returned_quantity})</span>}</td>
              <td className="num">{weight(l.net_weight)}</td><td className="num">{money(l.gold_price_per_gram)}</td><td className="num">{money(l.making_cost_per_gram)}</td>
              <td className="num">{money(l.unit_cost)}</td><td className="num font-semibold">{money(l.line_total)}</td>
              <td className="no-print">{l.quantity > l.returned_quantity && <Button size="sm" variant="secondary" onClick={() => { setRet(l); setV({ quantity: "1", reason: "" }); }}>{t("pur.returnToSupplier")}</Button>}</td>
            </tr>
          ))}
        </Table>
        <div className="ms-auto max-w-xs space-y-1 p-4 text-sm">
          {[["pos.subtotal", p.subtotal], ["pur.vat", p.vat_amount], ["common.total", p.total], ["pos.paid", p.paid_amount], ["pos.remaining", p.credit_amount]].map(([k, val]) => (
            <div key={k} className="flex justify-between"><span>{t(k)}</span><span className="num font-semibold">{money(val)}</span></div>
          ))}
        </div>
      </Card>
      <Modal open={!!ret} onClose={() => setRet(null)} title={t("pur.returnToSupplier")}
        footer={<><Button variant="secondary" onClick={() => setRet(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={save.isPending} disabled={v.reason.trim().length < 3} onClick={() => save.mutate(undefined)}>{t("common.confirm")}</Button></>}>
        <div className="space-y-3">
          <Field label={t("common.quantity")}><Input type="number" min={1} max={ret ? ret.quantity - ret.returned_quantity : 1} value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} /></Field>
          <Field label={t("common.reason")}><Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
