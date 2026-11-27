import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useGet } from "../lib/hooks";
import { addMoney, dateTime, isZero, money, weight } from "../lib/format";
import { PAYMENT_METHODS } from "../lib/useLookups";
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner } from "../components/ui";
import { invTone } from "./Invoices";

export async function printPage() {
  if (window.goldshop?.print) await window.goldshop.print();
  else window.print();
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const { data: inv, refetch } = useGet<any>(`/sales/${id}/`);
  const shop = useGet<any>("/settings/").data;
  const [ret, setRet] = useState(false);
  useEffect(() => {
    if (inv && shop && sp.get("print")) { setSp({}, { replace: true }); setTimeout(() => void printPage(), 300); }
  }, [inv, shop, sp, setSp]);
  if (!inv || !shop) return <Spinner />;
  const ar = i18n.language === "ar";
  const mct = (x: string) => t(`inv.${x === "per_gram" ? "perGram" : x === "fixed" ? "perPiece" : "percent"}`);
  const canReturn = can("sales.return") && inv.status !== "returned";
  const row = (k: string, v: string | null | undefined, strong = false) => (
    <div className={`flex justify-between py-1 ${strong ? "border-t border-slate-200 pt-2 text-base font-bold" : ""}`}><span>{t(k)}</span><span className="num">{money(v)}</span></div>);

  return (
    <div className="space-y-4">
      <PageHeader title={inv.number} subtitle={<Badge tone={invTone[inv.status]}>{t(`sales.status.${inv.status}`)}</Badge>}
        actions={<>
          {canReturn && <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setRet(true)}>{t("sales.returnItems")}</Button>}
          <Button variant="gold" icon={<Printer className="size-4" />} onClick={() => void printPage()}>{t("common.print")}</Button>
        </>} />
      <div className="print-area card mx-auto max-w-3xl p-6 text-sm">
        <header className="flex items-start justify-between gap-4 border-b-2 border-gold-400 pb-4">
          <div>
            <div className="text-xl font-bold text-navy-900">{ar ? shop.name_ar : shop.name_en}</div>
            <div className="text-xs text-slate-500">{shop.address}{shop.phone && ` · ${shop.phone}`}</div>
            {shop.tax_registration_no && <div className="text-xs text-slate-500">{t("settings.taxNo")}: {shop.tax_registration_no}</div>}
            {shop.commercial_registration_no && <div className="text-xs text-slate-500">{t("settings.crNo")}: {shop.commercial_registration_no}</div>}
          </div>
          <div className="text-end">
            <div className="text-lg font-bold text-gold-600">{t("sales.invoice")}</div>
            <div className="font-mono font-semibold">{inv.number}</div>
            <div className="text-xs text-slate-500">{dateTime(inv.issued_at)}</div>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-2 py-3 text-xs">
          <div><span className="text-slate-500">{t("pos.customer")}: </span><b>{inv.customer_name || t("pos.walkIn")}</b> {inv.customer_phone}</div>
          <div className="text-end"><span className="text-slate-500">{t("sales.cashier")}: </span>{inv.created_by_name}</div>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead><tr className="bg-navy-900 text-white">
            {["inv.item", "inv.karat", "common.quantity", "inv.net", "pos.pricePerGram", "pos.goldValue", "pos.making", "pos.discount", "pos.vat", "common.total"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-semibold">{t(h)}</th>)}
          </tr></thead>
          <tbody>
            {inv.lines.map((l: any) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="px-2 py-1.5"><div className="font-semibold">{l.description}</div><div className="font-mono text-[10px] text-slate-500">{l.product_code}{l.returned_quantity > 0 && ` · ${t("dash.returns")}: ${l.returned_quantity}`}</div></td>
                <td className="px-2">{l.karat_code}K</td><td className="num px-2">{l.quantity}</td><td className="num px-2">{weight(l.total_net_weight)}</td>
                <td className="num px-2">{money(l.price_per_gram, { currency: false })}</td><td className="num px-2">{money(l.gold_value, { currency: false })}</td>
                <td className="num px-2">{money(l.making_charge, { currency: false })}<div className="text-[10px] text-slate-400">{money(l.making_charge_value, { currency: false })} {mct(l.making_charge_type)}</div></td>
                <td className="num px-2">{money(l.discount, { currency: false })}</td><td className="num px-2">{money(l.vat_amount, { currency: false })}</td>
                <td className="num px-2 font-semibold">{money(l.total, { currency: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {inv.old_gold.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-bold text-navy-900">{t("pos.oldGold")}</div>
            {inv.old_gold.map((o: any) => (
              <div key={o.id} className="flex justify-between text-xs"><span>{o.karat_code}K · {weight(o.weight)} → {weight(o.accepted_weight)} × {money(o.effective_price_per_gram, { currency: false })}</span><span className="num">{money(o.value)}</span></div>
            ))}
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="text-xs">
            <div className="mb-1 font-bold text-navy-900">{t("pos.payments")}</div>
            {inv.payments.map((p: any) => <div key={p.id} className="flex justify-between"><span>{t(`methods.${p.method}`)} {p.reference_no && `(${p.reference_no})`}</span><span className="num">{money(p.amount)}</span></div>)}
            {Number(inv.credit_amount) !== 0 && <div className="flex justify-between font-semibold text-amber-700"><span>{t("pos.remaining")}</span><span className="num">{money(inv.credit_amount)}</span></div>}
            <div className="mt-2 text-[10px] text-slate-400">{t("sales.goldPriceRef", { id: inv.lines.map((l: any) => l.gold_price).join(", ") })} · VAT {inv.vat_rate}%</div>
          </div>
          <div className="text-sm">
            {row("pos.goldValue", inv.gold_value)}{row("pos.making", inv.making_charge)}
            {Number(inv.stones_value) > 0 && row("pos.stones", inv.stones_value)}
            {!isZero(addMoney(inv.line_discount, inv.invoice_discount)) && row("pos.discount", addMoney(inv.line_discount, inv.invoice_discount))}
            {row("pos.vat", inv.vat_amount)}{row("pos.grandTotal", inv.grand_total, true)}
            {Number(inv.old_gold_value) > 0 && row("pos.oldGoldCredit", `-${inv.old_gold_value}`)}
            {row("pos.netPayable", inv.net_payable, true)}
          </div>
        </div>
        {inv.notes && <p className="mt-3 text-xs text-slate-600">{t("common.notes")}: {inv.notes}</p>}
        <footer className="mt-6 border-t border-slate-200 pt-3 text-center text-xs text-slate-500">{(ar ? shop.invoice_footer_ar : shop.invoice_footer_en) || t("sales.footerThanks")}</footer>
      </div>
      {inv.returns.length > 0 && (
        <div className="no-print card mx-auto max-w-3xl p-4 text-sm">
          <div className="mb-2 font-bold">{t("sales.returnsList")}</div>
          {inv.returns.map((r: any) => <div key={r.id} className="flex justify-between"><span>{r.number} · {dateTime(r.created_at)} · {t(`sales.${r.settlement}`)}</span><span className="num">{money(r.amount)}</span></div>)}
        </div>
      )}
      {canReturn && <ReturnModal open={ret} onClose={() => setRet(false)} inv={inv} onDone={() => refetch()} />}
    </div>
  );
}

function ReturnModal({ open, onClose, inv, onDone }: { open: boolean; onClose(): void; inv: any; onDone(): void }) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [settlement, setSettlement] = useState("refund");
  const [method, setMethod] = useState("cash");
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([line, quantity]) => ({ line: Number(line), quantity }));
  const save = useAction(() => api.post(`/sales/${inv.id}/return/`, { items, reason, settlement, refund_method: method }),
    { success: t("sales.returned"), invalidate: [["/products/"], ["/reports/dashboard/"]], onSuccess: () => { onDone(); onClose(); setQty({}); setReason(""); } });
  return (
    <Modal open={open} onClose={onClose} title={t("sales.returnItems")} wide
      footer={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button variant="danger" loading={save.isPending} disabled={!items.length || reason.trim().length < 3} onClick={() => save.mutate(undefined)}>{t("common.confirm")}</Button></>}>
      <div className="space-y-3">
        <table className="table">
          <thead><tr><th>{t("inv.item")}</th><th>{t("common.quantity")}</th><th>{t("common.total")}</th><th>{t("sales.returnQty")}</th></tr></thead>
          <tbody>{inv.lines.map((l: any) => {
            const max = l.quantity - l.returned_quantity;
            return (
              <tr key={l.id}><td>{l.product_code} {l.description}</td><td className="num">{l.quantity}</td><td className="num">{money(l.total)}</td>
                <td><Input type="number" min={0} max={max} disabled={max === 0} value={qty[l.id] ?? 0} className="num w-20" onChange={(e) => setQty({ ...qty, [l.id]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} /></td></tr>
            );
          })}</tbody>
        </table>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("sales.settlement")}><Select value={settlement} onChange={(e) => setSettlement(e.target.value)}><option value="refund">{t("sales.refund")}</option>{inv.customer && <option value="credit">{t("sales.credit")}</option>}</Select></Field>
          {settlement === "refund" && <Field label={t("common.method")}><Select value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</Select></Field>}
          <Field label={t("common.reason")} className="col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        </div>
      </div>
    </Modal>
  );
}
