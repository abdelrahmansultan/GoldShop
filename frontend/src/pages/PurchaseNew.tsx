import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAction, useAll } from "../lib/hooks";
import { todayISO } from "../lib/format";
import type { Party, Product } from "../lib/types";
import { PAYMENT_METHODS, useLocalName, useLookups } from "../lib/useLookups";
import { Button, Card, Field, Input, PageHeader, Select } from "../components/ui";

type L = {
  key: number; mode: "new" | "existing"; product: string; quantity: string; unit_cost: string; gold_price_per_gram: string;
  making_cost_per_gram: string; other_cost: string; np: Record<string, string>;
};
const blankNp = (karat: string) => ({ name: "", category: "", karat, tracking: "piece", gross_weight: "", stone_weight: "0", making_charge_type: "per_gram", making_charge_value: "0", stones_value: "0", barcode: "" });

export default function PurchaseNew() {
  const { t } = useTranslation();
  const ln = useLocalName();
  const nav = useNavigate();
  const { karats, categories } = useLookups();
  const suppliers = useAll<Party>("/suppliers/", { is_active: true }).data ?? [];
  const qtyProducts = useAll<Product>("/products/", { tracking: "quantity" }).data ?? [];
  const k21 = String(karats.find((k) => k.code === "21")?.id ?? "");
  const [h, setH] = useState({ supplier: "", supplier_invoice_no: "", date: todayISO(), vat_amount: "", notes: "" });
  const [lines, setLines] = useState<L[]>([]);
  const [pays, setPays] = useState<{ key: number; method: string; amount: string }[]>([]);
  const add = () => setLines([...lines, { key: Date.now(), mode: "new", product: "", quantity: "1", unit_cost: "", gold_price_per_gram: "", making_cost_per_gram: "", other_cost: "", np: blankNp(k21) }]);
  const upd = (k: number, patch: Partial<L>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const updNp = (k: number, f: string, v: string) => setLines(lines.map((l) => (l.key === k ? { ...l, np: { ...l.np, [f]: v } } : l)));
  const dec = (v: string) => v.replace(/[^\d.]/g, "");

  const save = useAction(() => api.post("/purchases/", {
    supplier: Number(h.supplier), supplier_invoice_no: h.supplier_invoice_no, date: h.date, vat_amount: h.vat_amount || "0", notes: h.notes,
    lines: lines.map((l) => ({
      quantity: Number(l.quantity || 1), unit_cost: l.unit_cost || null, gold_price_per_gram: l.gold_price_per_gram || "0",
      making_cost_per_gram: l.making_cost_per_gram || "0", other_cost: l.other_cost || "0",
      ...(l.mode === "existing" ? { product: Number(l.product) } : { new_product: { ...l.np, category: Number(l.np.category), karat: Number(l.np.karat), barcode: l.np.barcode || "" } }),
    })),
    payments: pays.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: p.amount })),
  }), { success: t("pur.posted"), invalidate: [["/products/"], ["/purchases/"]], onSuccess: (r: any) => nav(`/purchases/${r.data.id}`) });

  return (
    <div className="space-y-4">
      <PageHeader title={t("pur.new")} />
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label={t("inv.supplier")}><Select value={h.supplier} onChange={(e) => setH({ ...h, supplier: e.target.value })}><option value="" />{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label={t("pur.supplierInvoice")}><Input value={h.supplier_invoice_no} onChange={(e) => setH({ ...h, supplier_invoice_no: e.target.value })} /></Field>
          <Field label={t("common.date")}><Input type="date" value={h.date} max={todayISO()} onChange={(e) => setH({ ...h, date: e.target.value })} /></Field>
          <Field label={t("pur.vat")}><Input className="num" value={h.vat_amount} onChange={(e) => setH({ ...h, vat_amount: dec(e.target.value) })} /></Field>
        </div>
      </Card>
      <Card title={t("pos.items")} actions={<Button size="sm" variant="secondary" icon={<Plus className="size-3" />} onClick={add}>{t("pur.addLine")}</Button>}>
        <div className="space-y-4">
          {lines.map((l) => (
            <div key={l.key} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between">
                <Select className="w-48" value={l.mode} onChange={(e) => upd(l.key, { mode: e.target.value as L["mode"] })}><option value="new">{t("pur.newProduct")}</option><option value="existing">{t("pur.existing")}</option></Select>
                <Button variant="ghost" size="sm" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} icon={<Trash2 className="size-4 text-red-500" />}>{t("common.remove")}</Button>
              </div>
              {l.mode === "existing" ? (
                <Field label={t("inv.item")}><Select value={l.product} onChange={(e) => upd(l.key, { product: e.target.value })}><option value="" />{qtyProducts.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name} ({p.karat_code}K, {p.net_weight} g)</option>)}</Select></Field>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <Field label={t("common.name")} className="col-span-2"><Input value={l.np.name} onChange={(e) => updNp(l.key, "name", e.target.value)} /></Field>
                  <Field label={t("inv.category")}><Select value={l.np.category} onChange={(e) => updNp(l.key, "category", e.target.value)}><option value="" />{categories.map((c) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select></Field>
                  <Field label={t("inv.karat")}><Select value={l.np.karat} onChange={(e) => updNp(l.key, "karat", e.target.value)}>{karats.map((k) => <option key={k.id} value={k.id}>{k.code}K</option>)}</Select></Field>
                  <Field label={t("inv.tracking")}><Select value={l.np.tracking} onChange={(e) => updNp(l.key, "tracking", e.target.value)}><option value="piece">{t("inv.piece")}</option><option value="quantity">{t("inv.quantityBased")}</option></Select></Field>
                  <Field label={t("inv.barcode")}><Input value={l.np.barcode} onChange={(e) => updNp(l.key, "barcode", e.target.value)} placeholder={t("common.optional")} /></Field>
                  <Field label={t("inv.gross")}><Input className="num" value={l.np.gross_weight} onChange={(e) => updNp(l.key, "gross_weight", dec(e.target.value))} /></Field>
                  <Field label={t("inv.stone")}><Input className="num" value={l.np.stone_weight} onChange={(e) => updNp(l.key, "stone_weight", dec(e.target.value))} /></Field>
                  <Field label={t("inv.makingType")}><Select value={l.np.making_charge_type} onChange={(e) => updNp(l.key, "making_charge_type", e.target.value)}><option value="per_gram">{t("inv.perGram")}</option><option value="fixed">{t("inv.perPiece")}</option><option value="percent">{t("inv.percent")}</option></Select></Field>
                  <Field label={`${t("inv.makingValue")} (${t("nav.sales")})`}><Input className="num" value={l.np.making_charge_value} onChange={(e) => updNp(l.key, "making_charge_value", dec(e.target.value))} /></Field>
                  <Field label={t("inv.stonesValue")}><Input className="num" value={l.np.stones_value} onChange={(e) => updNp(l.key, "stones_value", dec(e.target.value))} /></Field>
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-5">
                <Field label={t("common.quantity")}><Input className="num" value={l.quantity} onChange={(e) => upd(l.key, { quantity: e.target.value.replace(/\D/g, "") })} /></Field>
                <Field label={t("pur.goldPrice")}><Input className="num" value={l.gold_price_per_gram} onChange={(e) => upd(l.key, { gold_price_per_gram: dec(e.target.value) })} /></Field>
                <Field label={t("pur.makingCost")}><Input className="num" value={l.making_cost_per_gram} onChange={(e) => upd(l.key, { making_cost_per_gram: dec(e.target.value) })} /></Field>
                <Field label={t("pur.otherCost")}><Input className="num" value={l.other_cost} onChange={(e) => upd(l.key, { other_cost: dec(e.target.value) })} /></Field>
                <Field label={`${t("pur.unitCost")} (${t("common.optional")})`}><Input className="num" value={l.unit_cost} onChange={(e) => upd(l.key, { unit_cost: dec(e.target.value) })} /></Field>
              </div>
            </div>
          ))}
          {!lines.length && <p className="text-sm text-slate-400">—</p>}
        </div>
      </Card>
      <Card title={t("pos.payments")} actions={<Button size="sm" variant="secondary" icon={<Plus className="size-3" />} onClick={() => setPays([...pays, { key: Date.now(), method: "cash", amount: "" }])}>{t("pos.addPayment")}</Button>}>
        <div className="space-y-2">
          {pays.map((p) => (
            <div key={p.key} className="grid max-w-lg grid-cols-[1fr_1fr_auto] gap-2">
              <Select value={p.method} onChange={(e) => setPays(pays.map((x) => x.key === p.key ? { ...x, method: e.target.value } : x))}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</Select>
              <Input className="num" value={p.amount} onChange={(e) => setPays(pays.map((x) => x.key === p.key ? { ...x, amount: dec(e.target.value) } : x))} />
              <button type="button" className="p-2 text-red-500" onClick={() => setPays(pays.filter((x) => x.key !== p.key))} aria-label={t("common.remove")}><Trash2 className="size-4" /></button>
            </div>
          ))}
          <p className="text-xs text-slate-500">{t("pos.remaining")} → {t("inv.supplier")}</p>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => nav("/purchases")}>{t("common.cancel")}</Button>
        <Button variant="gold" loading={save.isPending} disabled={!h.supplier || !lines.length} onClick={() => save.mutate(undefined)}>{t("pos.post")}</Button>
      </div>
    </div>
  );
}
