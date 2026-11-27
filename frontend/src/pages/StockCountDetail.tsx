import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useGet } from "../lib/hooks";
import { weight } from "../lib/format";
import { Badge, Button, Card, ConfirmDialog, Input, PageHeader, Select, Spinner, Table } from "../components/ui";
import { countTone } from "./StockCounts";

export default function StockCountDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState<"" | "finalize" | "cancel">("");
  const ref = useRef<HTMLInputElement>(null);
  const { data: c } = useGet<any>(`/stock-counts/${id}/`);
  const { data: lines } = useGet<any[]>(`/stock-counts/${id}/lines/`, { filter: filter || undefined });
  const refresh = () => { qc.invalidateQueries({ queryKey: [`/stock-counts/${id}/`] }); qc.invalidateQueries({ queryKey: [`/stock-counts/${id}/lines/`] }); };
  const scan = useAction((barcode: string) => api.post(`/stock-counts/${id}/scan/`, { barcode, counted_quantity: 1, increment: true }), { onSuccess: refresh });
  const setCount = useAction((d: { product: number; counted_quantity: number; counted_gross_weight?: string | null }) =>
    api.post(`/stock-counts/${id}/scan/`, { ...d, increment: false }), { onSuccess: refresh });
  const finish = useAction((kind: string) => api.post(`/stock-counts/${id}/${kind}/`, {}), {
    success: t("common.saved"), invalidate: [["/adjustments/"], ["/stock-counts/"]], onSuccess: () => { setConfirm(""); refresh(); },
  });
  if (!c) return <Spinner />;
  const isOpen = c.status === "open" && can("inventory.count");
  return (
    <div className="space-y-5">
      <PageHeader title={c.name} subtitle={<><Badge tone={countTone[c.status as keyof typeof countTone]}>{t(`count.${c.status}`)}</Badge> · {c.progress.counted}/{c.progress.total} · {t("count.discrepancies")}: {c.progress.discrepancies}</>}
        actions={isOpen && <><Button variant="secondary" onClick={() => setConfirm("cancel")}>{t("count.cancelCount")}</Button><Button variant="gold" onClick={() => setConfirm("finalize")}>{t("count.finalize")}</Button></>} />
      {isOpen && (
        <Card>
          <form className="relative" onSubmit={(e) => { e.preventDefault(); if (code.trim()) scan.mutate(code.trim()); setCode(""); ref.current?.focus(); }}>
            <ScanBarcode className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-gold-500" />
            <input ref={ref} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("count.scanHere")} className="input py-3 ps-11 text-base" />
          </form>
        </Card>
      )}
      <Card bodyClass="p-0" actions={
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44">
          <option value="">{t("common.all")}</option><option value="uncounted">{t("count.uncounted")}</option><option value="counted">{t("count.counted")}</option><option value="discrepancies">{t("count.discrepancies")}</option>
        </Select>}>
        <Table head={[t("common.code"), t("inv.item"), t("inv.karat"), t("inv.net"), t("count.expected"), t("count.counted"), t("count.weighed"), t("count.diff")]} empty={lines?.length === 0}>
          {lines?.map((l) => (
            <tr key={l.id} className={l.difference ? "bg-red-50/50" : ""}>
              <td className="font-mono text-xs">{l.product.code}</td><td>{l.product.name}</td><td>{l.product.karat_code}K</td>
              <td className="num">{weight(l.product.net_weight)}</td><td className="num">{l.expected_quantity}</td>
              <td>{isOpen ? <Input type="number" min={0} className="num w-20" defaultValue={l.counted_quantity ?? ""} onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== l.counted_quantity && setCount.mutate({ product: l.product.id, counted_quantity: Number(e.target.value), counted_gross_weight: l.counted_gross_weight })} /> : <span className="num">{l.counted_quantity ?? "—"}</span>}</td>
              <td>{isOpen ? <Input inputMode="decimal" className="num w-24" defaultValue={l.counted_gross_weight ?? ""} onBlur={(e) => e.target.value && setCount.mutate({ product: l.product.id, counted_quantity: l.counted_quantity ?? 0, counted_gross_weight: e.target.value })} /> : <span className="num">{l.counted_gross_weight ?? "—"}</span>}</td>
              <td className={`num font-bold ${l.difference ? "text-red-600" : "text-slate-400"}`}>{l.difference ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm("")} danger={confirm === "cancel"} loading={finish.isPending}
        title={confirm === "finalize" ? t("count.finalize") : t("count.cancelCount")} message={confirm === "finalize" ? t("count.finalizeConfirm") : t("count.cancelCount")}
        onConfirm={() => finish.mutate(confirm)} />
    </div>
  );
}
