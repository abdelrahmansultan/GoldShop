import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ScanBarcode, Search } from "lucide-react";
import { api, type Page } from "../lib/api";
import { money, weight } from "../lib/format";
import type { Product } from "../lib/types";
import { useLocalName, useLookups } from "../lib/useLookups";
import { Badge, Button, Empty, Select, Spinner } from "./ui";

/**
 * Point-of-sale catalog: shows available stock as cards with live search
 * (name, code, barcode), category and karat filters. Enter on an exact
 * barcode/code adds the item directly (scanner workflow).
 */
export function ProductPicker({ onPick, onScan, inCart }: {
  onPick(p: Product): void;
  onScan(code: string): Promise<boolean>;
  inCart: Record<number, number>;
}) {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { karats, categories } = useLookups();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [karat, setKarat] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const h = setTimeout(() => { setSearch(text.trim()); setPage(1); }, 250); return () => clearTimeout(h); }, [text]);

  const params = { in_stock: true, page, page_size: 24, ordering: "code",
    ...(search ? { search } : {}), ...(category ? { category } : {}), ...(karat ? { karat } : {}) };
  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["pos-catalog", params], placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Page<Product>>("/products/", { params })).data,
  });
  const pages = data ? Math.max(1, Math.ceil(data.count / 24)) : 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = text.trim();
    if (!code) return;
    // exact barcode/code → add immediately; otherwise keep the text as a search
    if (await onScan(code)) setText("");
    else if (data?.results.length === 1) { onPick(data.results[0]); setText(""); }
  };

  return (
    <section className="card">
      <div className="space-y-3 border-b border-slate-100 p-3">
        <form onSubmit={submit} className="relative">
          <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-gold-500" />
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("pos.scan")}
            className="input py-3 ps-11 pe-10 text-base" aria-label={t("pos.scan")} />
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setCategory(""); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${!category ? "bg-navy-900 text-gold-300 ring-navy-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
            {t("common.all")}
          </button>
          {categories.filter((c) => c.is_active).map((c) => (
            <button type="button" key={c.id} onClick={() => { setCategory(String(c.id)); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${category === String(c.id) ? "bg-navy-900 text-gold-300 ring-navy-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
              {ln(c)}
            </button>
          ))}
          <Select value={karat} onChange={(e) => { setKarat(e.target.value); setPage(1); }} className="ms-auto w-32 py-1 text-xs">
            <option value="">{t("inv.karat")}: {t("common.all")}</option>
            {karats.filter((k) => k.is_active).map((k) => <option key={k.id} value={k.id}>{k.code}K</option>)}
          </Select>
        </div>
      </div>
      <div className={`p-3 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
        {isLoading ? <Spinner /> : !data?.results.length ? <Empty /> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
            {data.results.map((p) => {
              const qty = inCart[p.id] ?? 0;
              const full = qty >= p.quantity_on_hand;
              return (
                <button type="button" key={p.id} disabled={full} onClick={() => onPick(p)}
                  className={`relative rounded-lg border p-2.5 text-start transition ${qty ? "border-gold-400 bg-gold-50" : "border-slate-200 bg-white hover:border-gold-300 hover:shadow-sm"} disabled:cursor-not-allowed disabled:opacity-60`}>
                  {qty > 0 && <span className="absolute top-1.5 end-1.5 grid size-5 place-items-center rounded-full bg-gold-500 text-[10px] font-bold text-white">{p.tracking === "piece" ? <Check className="size-3" /> : qty}</span>}
                  <div className="truncate pe-5 text-sm font-semibold text-navy-900">{p.name}</div>
                  <div className="truncate font-mono text-[11px] text-slate-500">{p.code}</div>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <Badge tone="gold">{p.karat_code}K</Badge>
                    <span className="num text-xs font-semibold text-slate-700">{weight(p.net_weight)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="truncate">{ln({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</span>
                    {p.pricing_mode === "fixed" ? <span className="num">{money(p.selling_price, { currency: false })}</span>
                      : p.tracking === "quantity" ? <span>×{p.quantity_on_hand}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {data && data.count > 24 && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{t("common.records", { count: data.count })}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</Button>
              <span>{t("common.page", { page, pages })}</span>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("common.next")}</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
