import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Info, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useAll, useGet, useList } from "../lib/hooks";
import { dateTime, money } from "../lib/format";
import type { GoldPrice, Karat } from "../lib/types";
import { useLocalName } from "../lib/useLookups";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table } from "../components/ui";

interface Board { as_of: string; stale_after_hours: number; rows: { karat: Karat; price: GoldPrice | null; is_stale: boolean }[] }

export function PriceBoard({ compact, onEnter }: { compact?: boolean; onEnter?(): void }) {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { data } = useGet<Board>("/price-board/");
  if (!data) return <Spinner />;
  return (
    <Card title={t("prices.board")} actions={onEnter && <Button size="sm" variant="gold" icon={<Plus className="size-4" />} onClick={onEnter}>{t("prices.enter")}</Button>}>
      <div className={`grid gap-3 ${compact ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
        {data.rows.map(({ karat, price, is_stale }) => (
          <div key={karat.id} className={`rounded-xl border p-4 ${!price ? "border-red-200 bg-red-50/50" : is_stale ? "border-amber-200 bg-amber-50/50" : "border-gold-200 bg-gradient-to-br from-gold-50 to-white"}`}>
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-navy-900">{ln(karat)}</span>
              {!price ? <Badge tone="red">{t("prices.missing")}</Badge> : is_stale ? <Badge tone="amber">{t("prices.stale")}</Badge> : <Badge tone="green">{t("prices.fresh")}</Badge>}
            </div>
            {price ? (
              <>
                <div className="mt-3 space-y-1">
                  <div className="flex items-baseline justify-between gap-2"><span className="text-[11px] font-semibold text-slate-500">{t("prices.sell")}</span><span className="num text-lg font-bold text-navy-900">{money(price.sell_price, { currency: false })}</span></div>
                  <div className="flex items-baseline justify-between gap-2"><span className="text-[11px] font-semibold text-slate-500">{t("prices.buy")}</span><span className="num text-base font-bold text-slate-600">{money(price.buy_price, { currency: false })}</span></div>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">{t("prices.lastUpdate")}: {dateTime(price.effective_at)} · {price.source_name}</div>
              </>
            ) : <div className="mt-3 text-xs text-red-700">{t("prices.missing")}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Prices() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [karat, setKarat] = useState("");
  const [page, setPage] = useState(1);
  const karats = useAll<Karat>("/karats/").data ?? [];
  const history = useList<GoldPrice>("/prices/", { page, karat: karat || undefined });
  const sources = useAll<any>("/price-sources/").data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title={t("prices.title")} subtitle={t("prices.perGram")} />
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"><Info className="mt-0.5 size-4 shrink-0" />{t("prices.warnNoInvent")}</div>
      <PriceBoard onEnter={can("prices.manage") ? () => setOpen(true) : undefined} />
      <Card title={t("prices.history")} bodyClass="p-0" actions={
        <Select value={karat} onChange={(e) => { setKarat(e.target.value); setPage(1); }} className="w-36">
          <option value="">{t("common.all")}</option>{karats.map((k) => <option key={k.id} value={k.id}>{k.code}K</option>)}
        </Select>}>
        <Table head={[t("prices.effectiveAt"), t("prices.karat"), t("prices.buy"), t("prices.sell"), t("prices.source"), t("prices.enteredBy"), t("prices.note")]}
          empty={history.data?.results.length === 0}>
          {history.data?.results.map((p) => (
            <tr key={p.id}>
              <td className="text-xs">{dateTime(p.effective_at)}</td><td className="font-bold">{p.karat_code}K</td>
              <td className="num">{money(p.buy_price)}</td><td className="num font-semibold">{money(p.sell_price)}</td>
              <td>{p.source_name}</td><td>{p.entered_by_name ?? "—"}</td><td className="text-xs text-slate-500">{p.note}</td>
            </tr>
          ))}
        </Table>
        {history.data && <Pagination page={page} count={history.data.count} onPage={setPage} />}
      </Card>
      {can("prices.manage") && sources.length > 0 && (
        <Card title={t("prices.sources")} bodyClass="p-0">
          <Table head={[t("common.name"), t("common.type"), t("prices.lastSync"), t("prices.lastError")]}>
            {sources.map((s: any) => (
              <tr key={s.id}><td className="font-semibold">{s.name}</td><td>{s.kind}</td><td>{dateTime(s.last_success_at)}</td>
                <td className="text-xs text-red-600">{s.last_error ? <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3" />{s.last_error} ({dateTime(s.last_error_at)})</span> : <CheckCircle2 className="size-4 text-emerald-500" />}</td></tr>
            ))}
          </Table>
        </Card>
      )}
      <EnterPrices open={open} onClose={() => setOpen(false)} karats={karats.filter((k) => k.is_active)} />
    </div>
  );
}

function EnterPrices({ open, onClose, karats }: { open: boolean; onClose(): void; karats: Karat[] }) {
  const { t } = useTranslation();
  const ln = useLocalName();
  const board = useGet<Board>("/price-board/").data;
  const [rows, setRows] = useState<Record<number, { buy: string; sell: string }>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open || !board) return;
    const init: Record<number, { buy: string; sell: string }> = {};
    board.rows.forEach((r) => { init[r.karat.id] = { buy: r.price?.buy_price ?? "", sell: r.price?.sell_price ?? "" }; });
    setRows(init); setNote("");
  }, [open, board]);
  const invalid = karats.some((k) => { const r = rows[k.id]; return r && r.buy && r.sell && Number(r.buy) > Number(r.sell); });
  const save = useAction(() => {
    const entries = karats.filter((k) => rows[k.id]?.buy && rows[k.id]?.sell)
      .map((k) => ({ karat: k.id, buy_price: rows[k.id].buy, sell_price: rows[k.id].sell }));
    return api.post("/prices/record/", { entries, note });
  }, { invalidate: [["/price-board/"], ["/prices/"], ["/reports/dashboard/"]], success: t("prices.saved"), onSuccess: onClose });
  return (
    <Modal open={open} onClose={onClose} title={t("prices.enter")}
      footer={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button variant="gold" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-xs font-semibold text-slate-500"><span>{t("prices.karat")}</span><span>{t("prices.buy")}</span><span>{t("prices.sell")}</span></div>
        {karats.map((k) => {
          const r = rows[k.id] ?? { buy: "", sell: "" };
          const bad = r.buy && r.sell && Number(r.buy) > Number(r.sell);
          return (
            <div key={k.id} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
              <span className="font-bold text-navy-900">{ln(k)}</span>
              <Input inputMode="decimal" className={`num ${bad ? "border-red-400" : ""}`} value={r.buy} onChange={(e) => setRows({ ...rows, [k.id]: { ...r, buy: e.target.value.replace(/[^\d.]/g, "") } })} />
              <Input inputMode="decimal" className={`num ${bad ? "border-red-400" : ""}`} value={r.sell} onChange={(e) => setRows({ ...rows, [k.id]: { ...r, sell: e.target.value.replace(/[^\d.]/g, "") } })} />
            </div>
          );
        })}
        {invalid && <div className="text-xs font-medium text-red-600">{t("prices.buyAboveSell")}</div>}
        <Field label={`${t("prices.note")} (${t("common.optional")})`}><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
      </div>
    </Modal>
  );
}
