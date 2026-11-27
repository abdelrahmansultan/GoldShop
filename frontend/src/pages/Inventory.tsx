import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, ScanBarcode } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useGet, useList } from "../lib/hooks";
import { money, num, weight } from "../lib/format";
import type { Product } from "../lib/types";
import { useLocalName, useLookups } from "../lib/useLookups";
import { useToast } from "../components/ui/Toast";
import { Badge, Button, Card, Field, Input, PageHeader, Pagination, Select, Table } from "../components/ui";
import ProductForm from "./ProductForm";

export const statusTone: Record<string, "green" | "amber" | "gray" | "blue" | "red"> = {
  available: "green", reserved: "amber", sold: "gray", returned_to_supplier: "blue", inactive: "red",
};

export default function Inventory() {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { can } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const { karats, categories } = useLookups();
  const [f, setF] = useState({ search: "", karat: "", category: "", status: sp.get("low") ? "" : "available", min_weight: "", max_weight: "", tracking: sp.get("low") ? "quantity" : "" });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [scan, setScan] = useState("");
  const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== ""));
  const { data } = useList<Product>("/products/", params);
  const valuation = useGet<any[]>("/inventory/valuation/").data;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scan.trim()) return;
    try { const { data } = await api.get<Product>(`/products/barcode/${encodeURIComponent(scan.trim())}/`); nav(`/inventory/${data.id}`); }
    catch { toast.error(`${scan}: ${t("common.noData")}`); }
    setScan("");
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("inv.title")} actions={can("inventory.manage") && <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{t("inv.newItem")}</Button>} />
      {valuation && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {valuation.map((v) => (
            <div key={v.karat_id} className="card p-3">
              <div className="flex items-center justify-between"><span className="font-bold text-navy-900">{v.karat}K</span><span className="text-xs text-slate-500">{num(v.items)} {t("common.quantity")}</span></div>
              <div className="num mt-1 text-start text-lg font-bold text-gold-600">{weight(v.net_weight)}</div>
              <div className="text-xs text-slate-500">{v.value_at_buy == null ? t("prices.missing") : money(v.value_at_buy)}</div>
            </div>
          ))}
        </div>
      )}
      <Card bodyClass="p-0">
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 md:grid-cols-4 xl:grid-cols-8">
          <form onSubmit={lookup} className="col-span-2 relative">
            <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-gold-500" />
            <Input value={scan} onChange={(e) => setScan(e.target.value)} placeholder={t("inv.scan")} className="ps-9" />
          </form>
          <Input className="col-span-2" placeholder={`${t("common.search")}…`} value={f.search} onChange={set("search")} />
          <Select value={f.karat} onChange={set("karat")}><option value="">{t("inv.karat")}: {t("common.all")}</option>{karats.map((k) => <option key={k.id} value={k.id}>{k.code}K</option>)}</Select>
          <Select value={f.category} onChange={set("category")}><option value="">{t("inv.category")}: {t("common.all")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select>
          <Select value={f.status} onChange={set("status")}><option value="">{t("common.status")}: {t("common.all")}</option>{Object.keys(statusTone).map((s) => <option key={s} value={s}>{t(`inv.status.${s}`)}</option>)}</Select>
          <Select value={f.tracking} onChange={set("tracking")}><option value="">{t("inv.tracking")}: {t("common.all")}</option><option value="piece">{t("inv.piece")}</option><option value="quantity">{t("inv.quantityBased")}</option></Select>
          <Field><Input inputMode="decimal" placeholder={t("inv.minWeight")} value={f.min_weight} onChange={set("min_weight")} /></Field>
          <Field><Input inputMode="decimal" placeholder={t("inv.maxWeight")} value={f.max_weight} onChange={set("max_weight")} /></Field>
        </div>
        <Table head={[t("common.code"), t("inv.item"), t("inv.category"), t("inv.karat"), t("inv.gross"), t("inv.net"), t("inv.makingValue"), t("inv.qtyOnHand"), t("common.status")]}
          empty={data?.results.length === 0}>
          {data?.results.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={() => nav(`/inventory/${p.id}`)}>
              <td><Link to={`/inventory/${p.id}`} className="font-mono text-xs font-semibold text-navy-700">{p.code}</Link></td>
              <td className="font-medium">{p.name}</td>
              <td>{ln({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</td>
              <td><Badge tone="gold">{p.karat_code}K</Badge></td>
              <td className="num">{weight(p.gross_weight)}</td>
              <td className="num font-semibold">{weight(p.net_weight)}</td>
              <td className="num text-xs">{p.pricing_mode === "fixed" ? `${t("inv.fixed")}: ${money(p.selling_price)}` : `${money(p.making_charge_value, { currency: false })} · ${t(`inv.${p.making_charge_type === "per_gram" ? "perGram" : p.making_charge_type === "fixed" ? "perPiece" : "percent"}`)}`}</td>
              <td className={`num ${p.tracking === "quantity" && p.reorder_level > 0 && p.quantity_on_hand <= p.reorder_level ? "font-bold text-red-600" : ""}`}>{num(p.quantity_on_hand)}</td>
              <td><Badge tone={statusTone[p.status]}>{t(`inv.status.${p.status}`)}</Badge></td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
      <ProductForm open={creating} onClose={() => setCreating(false)} onSaved={(p) => nav(`/inventory/${p.id}`)} />
    </div>
  );
}
