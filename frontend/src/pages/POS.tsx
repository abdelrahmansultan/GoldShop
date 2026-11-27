import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2, UserPlus } from "lucide-react";
import { ProductPicker } from "../components/ProductPicker";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useAll } from "../lib/hooks";
import { addMoney, isNegative, isZero, money, weight } from "../lib/format";
import type { Karat, Party, Product } from "../lib/types";
import { PAYMENT_METHODS, useAccounts, useLocalName } from "../lib/useLookups";
import { useToast } from "../components/ui/Toast";
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Select } from "../components/ui";

type Line = { product: Product; quantity: number; discount: string; making_charge_value?: string; price_per_gram?: string };
type Old = { key: number; karat: string; weight: string; deduction_percent: string; deduction_per_gram: string; description: string };
type Pay = { key: number; method: string; account: string; amount: string; reference_no: string };

const decimalInput = (v: string, allowNeg = false) => v.replace(allowNeg ? /[^\d.-]/g : /[^\d.]/g, "");

export default function POS() {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { can } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const accounts = useAccounts();
  const karats = (useAll<Karat>("/karats/").data ?? []).filter((k) => k.is_active);

  const [lines, setLines] = useState<Line[]>([]);
  const [old, setOld] = useState<Old[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [customer, setCustomer] = useState<Party | null>(null);
  const [walkIn, setWalkIn] = useState({ name: "", phone: "" });
  const [invDiscount, setInvDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);

  const body = useMemo(() => ({
    customer: customer?.id ?? null, customer_name: walkIn.name, customer_phone: walkIn.phone,
    lines: lines.map((l) => ({ product: l.product.id, quantity: l.quantity, discount: l.discount || "0",
      ...(l.making_charge_value ? { making_charge_value: l.making_charge_value } : {}),
      ...(l.price_per_gram ? { price_per_gram: l.price_per_gram } : {}) })),
    old_gold: old.filter((o) => o.karat && Number(o.weight) > 0).map((o) => ({ karat: Number(o.karat), weight: o.weight,
      deduction_percent: o.deduction_percent || "0", deduction_per_gram: o.deduction_per_gram || "0", description: o.description })),
    invoice_discount: invDiscount || "0",
    payments: pays.filter((p) => p.amount && !isZero(p.amount)).map((p) => ({ method: p.method, account: p.account ? Number(p.account) : null, amount: p.amount, reference_no: p.reference_no })),
    notes,
  }), [lines, old, pays, customer, walkIn, invDiscount, notes]);

  // Live server-side pricing: the preview uses the exact same code path as posting.
  const [debounced, setDebounced] = useState(body);
  useEffect(() => { const h = setTimeout(() => setDebounced(body), 300); return () => clearTimeout(h); }, [body]);
  const preview = useQuery({
    queryKey: ["pos-preview", debounced], enabled: debounced.lines.length > 0, retry: false,
    queryFn: async () => (await api.post("/sales/preview/", debounced)).data,
  });
  const pv = lines.length ? preview.data : null;
  const pvError = preview.error ? errorMessage(preview.error) : null;

  /** Add one unit of a product to the invoice (respects stock and serialized pieces). */
  const addToInvoice = (p: Product) => {
    if (p.status !== "available" || p.quantity_on_hand < 1) { toast.error(`${p.code}: ${t("pos.notAvailable")}`); return; }
    setLines((ls) => {
      const ex = ls.find((l) => l.product.id === p.id);
      if (ex) {
        if (p.tracking === "piece" || ex.quantity >= p.quantity_on_hand) { toast.error(`${p.code}: ${t("pos.notAvailable")}`); return ls; }
        return ls.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...ls, { product: p, quantity: 1, discount: "" }];
    });
  };

  /** Scanner: exact barcode/code lookup. Returns false when no exact match (caller keeps it as search text). */
  const scanCode = async (code: string) => {
    try {
      addToInvoice((await api.get<Product>(`/products/barcode/${encodeURIComponent(code)}/`)).data);
      return true;
    } catch (e) {
      const status = (e as { response?: { status: number } }).response?.status;
      if (status !== 404) toast.error(errorMessage(e));
      return false;
    }
  };
  const inCart = Object.fromEntries(lines.map((l) => [l.product.id, l.quantity]));

  const post = useAction(() => api.post("/sales/", body), {
    invalidate: [["/products/"], ["/reports/dashboard/"], ["/sales/"]], success: t("pos.posted"),
    onSuccess: (r: any) => nav(`/sales/${r.data.id}?print=1`),
  });

  const remaining = pv?.credit as string | undefined;
  const fillRemaining = () => {
    if (!pv) return;
    const owed = pv.net_payable as string;
    if (isZero(remaining)) return;
    if (pays.length) {
      const last = pays[pays.length - 1];
      const sum = addMoney(last.amount, remaining);
      setPays(pays.map((p) => (p.key === last.key ? { ...p, amount: sum } : p)));
    } else setPays([{ key: Date.now(), method: "cash", account: "", amount: owed, reference_no: "" }]);
  };

  const pvLine = (id: number) => pv?.lines.find((x: any) => x.product === id);

  const creditBlocked = remaining && !isZero(remaining) && !customer;

  return (
    <div className="space-y-4">
      <PageHeader title={t("pos.title")} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <ProductPicker onPick={addToInvoice} onScan={scanCode} inCart={inCart} />

          <Card title={t("pos.items")} bodyClass="p-0">
            {!lines.length ? <div className="p-10 text-center text-sm text-slate-400">{t("pos.empty")}</div> : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr>
                    <th>{t("inv.item")}</th><th>{t("inv.net")}</th><th>{t("common.quantity")}</th><th>{t("pos.pricePerGram")}</th>
                    <th>{t("pos.goldValue")}</th><th>{t("pos.making")}</th><th>{t("pos.discount")}</th><th>{t("pos.vat")}</th><th>{t("common.total")}</th><th />
                  </tr></thead>
                  <tbody>
                    {lines.map((l) => {
                      const r = pvLine(l.product.id);
                      return (
                        <tr key={l.product.id}>
                          <td><div className="font-semibold">{l.product.name}</div><div className="font-mono text-xs text-slate-500">{l.product.code} · <Badge tone="gold">{l.product.karat_code}K</Badge></div></td>
                          <td className="num">{weight(l.product.net_weight)}</td>
                          <td>{l.product.tracking === "quantity" ? (
                            <Input type="number" min={1} max={l.product.quantity_on_hand} value={l.quantity} className="num w-16"
                              onChange={(e) => setLines(lines.map((x) => x.product.id === l.product.id ? { ...x, quantity: Math.max(1, Math.min(l.product.quantity_on_hand, Number(e.target.value) || 1)) } : x))} />
                          ) : <span className="num">1</span>}</td>
                          <td className="num">{can("sales.discount_override") ? (
                            <Input className="num w-24" placeholder={r?.price_per_gram} value={l.price_per_gram ?? ""} onChange={(e) => setLines(lines.map((x) => x.product.id === l.product.id ? { ...x, price_per_gram: decimalInput(e.target.value) } : x))} />
                          ) : money(r?.price_per_gram, { currency: false })}</td>
                          <td className="num">{money(r?.gold_value, { currency: false })}</td>
                          <td className="num">{can("sales.discount_override") ? (
                            <Input className="num w-20" placeholder={r?.making_charge_value} value={l.making_charge_value ?? ""} onChange={(e) => setLines(lines.map((x) => x.product.id === l.product.id ? { ...x, making_charge_value: decimalInput(e.target.value) } : x))} />
                          ) : null}<div className="text-xs text-slate-500">{money(r?.making_charge, { currency: false })}</div></td>
                          <td><Input className="num w-20" value={l.discount} placeholder="0" onChange={(e) => setLines(lines.map((x) => x.product.id === l.product.id ? { ...x, discount: decimalInput(e.target.value) } : x))} /></td>
                          <td className="num text-xs">{money(r?.vat_amount, { currency: false })}</td>
                          <td className="num font-bold">{money(r?.total, { currency: false })}</td>
                          <td><button type="button" className="rounded p-1 text-red-500 hover:bg-red-50" onClick={() => setLines(lines.filter((x) => x.product.id !== l.product.id))} aria-label={t("common.remove")}><Trash2 className="size-4" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={t("pos.oldGold")} actions={<Button size="sm" variant="secondary" icon={<Plus className="size-3" />}
            onClick={() => setOld([...old, { key: Date.now(), karat: String(karats.find((k) => k.code === "21")?.id ?? ""), weight: "", deduction_percent: "", deduction_per_gram: "", description: "" }])}>{t("pos.addOldGold")}</Button>}>
            {!old.length ? <p className="text-sm text-slate-400">—</p> : (
              <div className="space-y-2">
                {old.map((o, i) => {
                  const r = pv?.old_gold?.[i];
                  return (
                    <div key={o.key} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-6">
                      <Field label={t("inv.karat")}><Select value={o.karat} onChange={(e) => setOld(old.map((x) => x.key === o.key ? { ...x, karat: e.target.value } : x))}>{karats.map((k) => <option key={k.id} value={k.id}>{ln(k)}</option>)}</Select></Field>
                      <Field label={t("pos.weight")}><Input className="num" inputMode="decimal" value={o.weight} onChange={(e) => setOld(old.map((x) => x.key === o.key ? { ...x, weight: decimalInput(e.target.value) } : x))} /></Field>
                      <Field label={t("pos.deductionPct")}><Input className="num" inputMode="decimal" value={o.deduction_percent} onChange={(e) => setOld(old.map((x) => x.key === o.key ? { ...x, deduction_percent: decimalInput(e.target.value) } : x))} /></Field>
                      <Field label={t("pos.deductionPerGram")}><Input className="num" inputMode="decimal" value={o.deduction_per_gram} onChange={(e) => setOld(old.map((x) => x.key === o.key ? { ...x, deduction_per_gram: decimalInput(e.target.value) } : x))} /></Field>
                      <div className="text-sm"><div className="text-xs text-slate-500">{r ? `${weight(r.accepted_weight)} × ${money(r.effective_price_per_gram, { currency: false })}` : ""}</div><div className="num font-bold">{money(r?.value)}</div></div>
                      <Button variant="ghost" onClick={() => setOld(old.filter((x) => x.key !== o.key))} icon={<Trash2 className="size-4 text-red-500" />}>{t("common.remove")}</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <CustomerPicker customer={customer} setCustomer={setCustomer} walkIn={walkIn} setWalkIn={setWalkIn} />

          <Card title={t("common.total")}>
            {pvError && <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{pvError}</div>}
            <dl className="space-y-1.5 text-sm">
              {[["pos.goldValue", pv?.gold_value], ["pos.making", pv?.making_charge], ["pos.stones", pv?.stones_value], ["pos.discount", pv?.discount], ["pos.vat", pv?.vat_amount]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-slate-500">{t(k as string)}</dt><dd className="num">{money(v)}</dd></div>
              ))}
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><dt>{t("pos.grandTotal")}</dt><dd className="num">{money(pv?.grand_total)}</dd></div>
              {pv && !isZero(pv.old_gold_value) && <div className="flex justify-between text-emerald-700"><dt>{t("pos.oldGoldCredit")}</dt><dd className="num">- {money(pv.old_gold_value)}</dd></div>}
              <div className="flex justify-between rounded-lg bg-navy-900 px-3 py-2 text-lg font-bold text-gold-300">
                <dt>{pv && isNegative(pv.net_payable) ? t("pos.shopPays") : t("pos.netPayable")}</dt>
                <dd className="num">{money(pv?.net_payable)}</dd>
              </div>
            </dl>
            <Field label={t("pos.invoiceDiscount")} className="mt-3"><Input className="num" inputMode="decimal" value={invDiscount} onChange={(e) => setInvDiscount(decimalInput(e.target.value))} placeholder="0.00" /></Field>
          </Card>

          <Card title={t("pos.payments")} actions={<Button size="sm" variant="secondary" icon={<Plus className="size-3" />} onClick={() => setPays([...pays, { key: Date.now(), method: "cash", account: "", amount: "", reference_no: "" }])}>{t("pos.addPayment")}</Button>}>
            <div className="space-y-2">
              {pays.map((p) => (
                <div key={p.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Select value={p.method} onChange={(e) => setPays(pays.map((x) => x.key === p.key ? { ...x, method: e.target.value, account: "" } : x))}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}
                  </Select>
                  <Input className="num" inputMode="decimal" value={p.amount} onChange={(e) => setPays(pays.map((x) => x.key === p.key ? { ...x, amount: decimalInput(e.target.value, true) } : x))} placeholder="0.00" />
                  <button type="button" className="rounded p-2 text-red-500 hover:bg-red-50" onClick={() => setPays(pays.filter((x) => x.key !== p.key))} aria-label={t("common.remove")}><Trash2 className="size-4" /></button>
                  {p.method !== "cash" && (<>
                    <Select value={p.account} onChange={(e) => setPays(pays.map((x) => x.key === p.key ? { ...x, account: e.target.value } : x))}>
                      <option value="">{t("tr.isDefault")}</option>{accounts.filter((a) => a.kind === "bank" && a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                    <Input placeholder={t("pos.refNo")} value={p.reference_no} onChange={(e) => setPays(pays.map((x) => x.key === p.key ? { ...x, reference_no: e.target.value } : x))} />
                  </>)}
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={fillRemaining} disabled={!pv || isZero(remaining)}>{t("pos.fillRemaining")}</Button>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm"><span className="text-slate-500">{t("pos.paid")}</span><span className="num font-semibold">{money(pv?.paid)}</span></div>
              <div className={`flex justify-between text-sm ${!isZero(remaining) ? "font-bold text-amber-700" : "text-slate-500"}`}><span>{t("pos.remaining")}</span><span className="num">{money(remaining)}</span></div>
            </div>
          </Card>
          <Field label={t("common.notes")}><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
          <Button variant="gold" size="lg" className="w-full" disabled={!pv || !!pvError || preview.isFetching || !!creditBlocked}
            onClick={() => setConfirm(true)}>{t("pos.post")}</Button>
          {creditBlocked && <p className="text-xs text-amber-700">{t("pos.remaining")}: {t("pos.customer")} — {t("common.required")}</p>}
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} loading={post.isPending} title={t("pos.post")}
        message={<>{t("pos.confirmPost")} <b className="num">{money(pv?.net_payable)}</b></>}
        onConfirm={() => { setConfirm(false); post.mutate(undefined); }} />
    </div>
  );
}

function CustomerPicker({ customer, setCustomer, walkIn, setWalkIn }:
  { customer: Party | null; setCustomer(c: Party | null): void; walkIn: { name: string; phone: string }; setWalkIn(v: { name: string; phone: string }): void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ name: "", phone: "", national_id: "" });
  const { data } = useQuery({
    queryKey: ["cust-search", q], enabled: q.trim().length >= 2,
    queryFn: async () => (await api.get("/customers/", { params: { search: q, page_size: 8 } })).data.results as Party[],
  });
  const create = useAction(() => api.post<Party>("/customers/", nc), { onSuccess: (r) => { setCustomer(r.data); setAdding(false); setNc({ name: "", phone: "", national_id: "" }); } });
  return (
    <Card title={t("pos.customer")} actions={<Button size="sm" variant="ghost" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>{t("party.newCustomer")}</Button>}>
      {customer ? (
        <div className="flex items-start justify-between rounded-lg bg-gold-50 p-3">
          <div><div className="font-semibold">{customer.name}</div><div className="text-xs text-slate-500">{customer.phone} · {t("common.balance")}: <span className="num">{money(customer.balance)}</span></div></div>
          <button type="button" className="text-xs text-red-600" onClick={() => setCustomer(null)}>{t("common.remove")}</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t("common.search")} (${t("common.name")} / ${t("common.phone")})`} />
            {!!data?.length && q.length >= 2 && (
              <div className="absolute inset-x-0 z-10 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg">
                {data.map((c) => <button type="button" key={c.id} className="block w-full px-3 py-2 text-start text-sm hover:bg-gold-50" onClick={() => { setCustomer(c); setQ(""); }}>{c.name} <span className="text-xs text-slate-500">{c.phone}</span></button>)}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder={`${t("pos.walkIn")}: ${t("common.name")}`} value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} />
            <Input placeholder={t("common.phone")} value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} />
          </div>
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title={t("party.newCustomer")}
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>{t("common.cancel")}</Button><Button loading={create.isPending} disabled={!nc.name.trim()} onClick={() => create.mutate(undefined)}>{t("common.save")}</Button></>}>
        <div className="space-y-3">
          <Field label={t("common.name")}><Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></Field>
          <Field label={t("common.phone")}><Input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></Field>
          <Field label={t("party.nationalId")}><Input value={nc.national_id} onChange={(e) => setNc({ ...nc, national_id: e.target.value })} /></Field>
        </div>
      </Modal>
    </Card>
  );
}
