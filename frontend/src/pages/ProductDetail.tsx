import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, Printer, Scale } from "lucide-react";
import { api, MEDIA_ROOT } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useGet, useList } from "../lib/hooks";
import { date, dateTime, money, num, weight } from "../lib/format";
import type { Product } from "../lib/types";
import { useLocalName } from "../lib/useLookups";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, Spinner, Table } from "../components/ui";
import ProductForm from "./ProductForm";
import { statusTone } from "./Inventory";

export default function ProductDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const ln = useLocalName();
  const { can } = useAuth();
  const [edit, setEdit] = useState(false);
  const [adj, setAdj] = useState(false);
  const [page, setPage] = useState(1);
  const { data: p, refetch } = useGet<Product>(`/products/${id}/`);
  const mv = useList<any>(`/products/${id}/movements/`, { page });
  if (!p) return <Spinner />;
  const img = p.image ? (p.image.startsWith("http") ? p.image : `${MEDIA_ROOT}${p.image}`) : null;
  const row = (label: string, value: React.ReactNode) => <div className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span className="text-slate-500">{label}</span><span className="text-end font-medium">{value}</span></div>;

  return (
    <div className="space-y-5">
      <PageHeader title={<span className="flex items-center gap-3">{p.name} <Badge tone={statusTone[p.status]}>{t(`inv.status.${p.status}`)}</Badge></span>}
        subtitle={<span className="font-mono">{p.code} · {p.barcode}</span>}
        actions={<>
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => printLabel(p)}>{t("inv.barcode")}</Button>
          {can("inventory.adjust.request") && <Button variant="secondary" icon={<Scale className="size-4" />} onClick={() => setAdj(true)}>{t("inv.requestAdjustment")}</Button>}
          {can("inventory.manage") && <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>{t("common.edit")}</Button>}
        </>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title={t("common.details")}>
          {img && <img src={img} alt={p.name} className="mb-3 aspect-square w-full rounded-lg object-cover" />}
          {row(t("inv.category"), ln({ name_ar: p.category_name_ar, name_en: p.category_name_en }))}
          {row(t("inv.jewelryType"), ln({ name_ar: p.jewelry_type_name_ar, name_en: p.jewelry_type_name_en }))}
          {row(t("inv.karat"), `${p.karat_code}K`)}
          {row(t("inv.tracking"), p.tracking === "piece" ? t("inv.piece") : t("inv.quantityBased"))}
          {row(t("inv.qtyOnHand"), <span className="num">{num(p.quantity_on_hand)}</span>)}
          {p.tracking === "quantity" && row(t("inv.reorder"), num(p.reorder_level))}
          {row(t("inv.supplier"), p.supplier_name ?? "—")}
          {row(t("inv.purchaseDate"), date(p.purchase_date))}
          {p.description && <p className="pt-3 text-sm text-slate-600">{p.description}</p>}
        </Card>
        <Card title={`${t("inv.net")} & ${t("pos.pricePerGram")}`}>
          {row(t("inv.gross"), <span className="num">{weight(p.gross_weight)}</span>)}
          {row(t("inv.stone"), <span className="num">{weight(p.stone_weight)}</span>)}
          {row(t("inv.net"), <span className="num text-base font-bold text-gold-600">{weight(p.net_weight)}</span>)}
          {row(t("inv.pricingMode"), p.pricing_mode === "fixed" ? t("inv.fixed") : t("inv.byWeight"))}
          {p.pricing_mode === "fixed" ? row(t("inv.sellingPrice"), money(p.selling_price))
            : row(t("inv.makingValue"), `${money(p.making_charge_value, { currency: false })} (${t(`inv.${p.making_charge_type === "per_gram" ? "perGram" : p.making_charge_type === "fixed" ? "perPiece" : "percent"}`)})`)}
          {row(t("inv.stonesValue"), money(p.stones_value))}
          {p.purchase_cost !== undefined && row(t("inv.purchaseCost"), money(p.purchase_cost))}
          <p className="mt-3 text-xs text-slate-500">{t("inv.weightLocked")}</p>
        </Card>
        <Card title={t("inv.movements")} className="lg:col-span-3" bodyClass="p-0">
          <Table head={[t("common.date"), t("common.type"), t("common.quantity"), t("inv.net"), t("inv.qtyAfter"), t("common.reference"), t("common.user")]} empty={mv.data?.results.length === 0}>
            {mv.data?.results.map((m) => (
              <tr key={m.id}>
                <td className="text-xs">{dateTime(m.created_at)}</td><td>{t(`inv.mv.${m.type}`)}</td>
                <td className={`num font-semibold ${m.quantity < 0 ? "text-red-600" : "text-emerald-700"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                <td className="num">{weight(m.net_weight)}</td><td className="num">{m.quantity_after}</td>
                <td className="text-xs">{m.note}</td><td className="text-xs">{m.created_by_name}</td>
              </tr>
            ))}
          </Table>
          {mv.data && <Pagination page={page} count={mv.data.count} onPage={setPage} />}
        </Card>
      </div>
      <ProductForm open={edit} onClose={() => setEdit(false)} product={p} onSaved={() => refetch()} />
      <AdjustmentModal open={adj} onClose={() => setAdj(false)} product={p} />
    </div>
  );
}

function AdjustmentModal({ open, onClose, product }: { open: boolean; onClose(): void; product: Product }) {
  const { t } = useTranslation();
  const [v, setV] = useState({ quantity_delta: "0", new_gross_weight: "", new_stone_weight: "", reason: "" });
  const save = useAction(() => api.post("/adjustments/", {
    product: product.id, quantity_delta: Number(v.quantity_delta || 0), reason: v.reason,
    new_gross_weight: v.new_gross_weight || null, new_stone_weight: v.new_stone_weight || null,
  }), { invalidate: [["/adjustments/"]], success: t("adj.requested"), onSuccess: () => { onClose(); setV({ quantity_delta: "0", new_gross_weight: "", new_stone_weight: "", reason: "" }); } });
  return (
    <Modal open={open} onClose={onClose} title={`${t("inv.requestAdjustment")} — ${product.code}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button loading={save.isPending} disabled={v.reason.trim().length < 5} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("inv.qtyDelta")} className="col-span-2"><Input inputMode="numeric" className="num" value={v.quantity_delta} onChange={(e) => setV({ ...v, quantity_delta: e.target.value.replace(/[^\d-]/g, "") })} /></Field>
        <Field label={t("inv.newGross")} hint={`${t("inv.gross")}: ${product.gross_weight}`}><Input inputMode="decimal" className="num" value={v.new_gross_weight} onChange={(e) => setV({ ...v, new_gross_weight: e.target.value })} /></Field>
        <Field label={t("inv.newStone")} hint={`${t("inv.stone")}: ${product.stone_weight}`}><Input inputMode="decimal" className="num" value={v.new_stone_weight} onChange={(e) => setV({ ...v, new_stone_weight: e.target.value })} /></Field>
        <Field label={t("common.reason")} className="col-span-2" hint="≥ 5"><Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} maxLength={500} /></Field>
      </div>
    </Modal>
  );
}

/** Prints a small tag label with a Code 39 barcode (scanner-friendly, no dependency). */
function printLabel(p: Product) {
  const C39: Record<string, string> = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn",
    "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
    F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn",
    N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw",
    V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
  };
  const text = `*${p.barcode.toUpperCase().replace(/[^0-9A-Z.\- ]/g, "")}*`;
  let x = 0; let bars = "";
  for (const ch of text) {
    const pat = C39[ch]; if (!pat) continue;
    [...pat].forEach((w, i) => { const width = w === "w" ? 3 : 1; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${width}" height="40"/>`; x += width; });
    x += 1;
  }
  const win = window.open("", "_blank", "width=420,height=300");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${p.code}</title><style>body{font-family:sans-serif;margin:6mm;text-align:center}div{font-size:11px}@page{size:60mm 30mm;margin:2mm}</style></head><body>
    <svg width="${x}" height="40" viewBox="0 0 ${x} 40">${bars}</svg>
    <div><b>${p.barcode}</b> · ${p.karat_code}K · ${p.net_weight} g</div><div>${p.name.replace(/</g, "&lt;")}</div></body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); win.close(); }, 250);
}
