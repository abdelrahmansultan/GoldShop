import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Download, ExternalLink, Globe, Info, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/ui/Toast";
import { api, downloadCsv, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useAll, useGet, useList } from "../lib/hooks";
import { dateTime, isZero, money } from "../lib/format";
import type { GoldPrice, Karat } from "../lib/types";
import { useLocalName } from "../lib/useLookups";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table } from "../components/ui";

interface Board {
  as_of: string; stale_after_hours: number; rows: { karat: Karat; price: GoldPrice | null; is_stale: boolean }[];
  ounce: { price: string; source: string; at: string; derived: boolean } | null;
}
export interface Proposal {
  source: number; source_name: string; ounce_price: string; gram_24k: string; provider_time: string;
  entries: { karat: number; karat_code: string; buy_price: string; sell_price: string }[];
}
interface Source {
  id: number; name: string; kind: string; provider_key: string; provider_label: string; signup_url: string; is_active: boolean;
  has_api_key: boolean; sell_adjust_percent: string; buy_adjust_percent: string; auto_apply: boolean; sync_interval_minutes: number;
  last_quote: { ounce_price?: string; gram_24k?: string; fetched_at?: string; provider_time?: string };
  last_success_at: string | null; last_error: string; last_error_at: string | null;
}

export function PriceBoard({ compact, onEnter, onFetch, fetching }: { compact?: boolean; onEnter?(): void; onFetch?(): void; fetching?: boolean }) {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { data } = useGet<Board>("/price-board/");
  if (!data) return <Spinner />;
  return (
    <Card title={<span className="flex flex-wrap items-center gap-3">{t("prices.board")}
        {data.ounce && <span className="rounded-full bg-navy-900 px-3 py-1 text-xs font-semibold text-gold-300">
          {t("auto.ounce")}: <span className="num">{money(data.ounce.price)}</span>
          <span className="ms-1 font-normal text-slate-300">· {data.ounce.derived ? t("auto.ounceDerived") : `${data.ounce.source} ${dateTime(data.ounce.at)}`}</span></span>}</span>}
      actions={<>
        {onFetch && <Button size="sm" variant="secondary" loading={fetching} icon={<Globe className="size-4" />} onClick={onFetch}>{t("auto.fetch")}</Button>}
        {onEnter && <Button size="sm" variant="gold" icon={<Plus className="size-4" />} onClick={onEnter}>{t("prices.enter")}</Button>}
      </>}>
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
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ karat: "", entered_by: "", effective_at__date__gte: "", effective_at__date__lte: "" });
  const [page, setPage] = useState(1);
  const karats = useAll<Karat>("/karats/").data ?? [];
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const history = useList<GoldPrice>("/prices/", { page, ...params });
  const editors = useGet<{ id: number; name: string }[]>("/prices/editors/").data ?? [];
  const sources = useAll<Source>("/price-sources/").data ?? [];
  const manager = can("prices.manage");
  const toast = useToast();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const provider = sources.find((x) => x.kind === "provider" && x.is_active);
  const qc = useQueryClient();
  const fetchNow = useMutation({
    mutationFn: async () => (await api.post<Proposal>(`/price-sources/${provider!.id}/fetch/`)).data,
    onSuccess: (d) => { setProposal(d); setOpen(true); qc.invalidateQueries({ queryKey: ["/price-sources/"] }); },
    onError: (e) => { toast.error(errorMessage(e)); qc.invalidateQueries({ queryKey: ["/price-sources/"] }); },
  });
  const startFetch = () => {
    if (!provider?.has_api_key) { toast.error(t("auto.noKey")); document.getElementById("auto-pricing")?.scrollIntoView({ behavior: "smooth" }); return; }
    fetchNow.mutate();
  };
  useEffect(() => { if (sp.get("enter") && manager) { setOpen(true); setSp({}, { replace: true }); } }, [sp, setSp, manager]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const change = (v: string | null) => v == null ? <span className="text-xs text-slate-400">{t("prices2.firstPrice")}</span>
    : <span className={`num text-xs font-semibold ${v.startsWith("-") ? "text-red-600" : isZero(v) ? "text-slate-400" : "text-emerald-700"}`}>{v.startsWith("-") || isZero(v) ? "" : "+"}{money(v, { currency: false })}</span>;
  return (
    <div className="space-y-5">
      <PageHeader title={t("prices.title")} subtitle={t("prices.perGram")} />
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"><Info className="mt-0.5 size-4 shrink-0" />
        <span>{t("prices.warnNoInvent")} {!manager && <b>{t("prices2.managerOnly")}</b>}</span></div>
      <PriceBoard onEnter={manager ? () => { setProposal(null); setOpen(true); } : undefined}
        onFetch={manager && provider ? startFetch : undefined} fetching={fetchNow.isPending} />
      <Card title={t("prices2.log")} bodyClass="p-0" actions={
        <Button size="sm" variant="secondary" icon={<Download className="size-3" />} onClick={() => void downloadCsv("/prices/", params, "gold-price-log.csv")}>{t("rep2.exportCsv")}</Button>}>
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
          <Select value={f.karat} onChange={set("karat")}><option value="">{t("prices.karat")}: {t("common.all")}</option>{karats.map((k) => <option key={k.id} value={k.id}>{k.code}K</option>)}</Select>
          <Select value={f.entered_by} onChange={set("entered_by")}><option value="">{t("prices.enteredBy")}: {t("prices2.allUsers")}</option>{editors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <Input type="date" value={f.effective_at__date__gte} onChange={set("effective_at__date__gte")} aria-label={t("common.from")} />
          <Input type="date" value={f.effective_at__date__lte} onChange={set("effective_at__date__lte")} aria-label={t("common.to")} />
        </div>
        <Table head={[t("prices.effectiveAt"), t("prices.karat"), t("prices.buy"), t("prices2.change"), t("prices.sell"), t("prices2.change"), t("prices.enteredBy"), t("prices.source"), t("prices.note")]}
          empty={history.data?.results.length === 0}>
          {history.data?.results.map((p) => (
            <tr key={p.id}>
              <td className="text-xs">{dateTime(p.effective_at)}</td><td className="font-bold">{p.karat_code}K</td>
              <td className="num">{money(p.buy_price, { currency: false })}{p.prev_buy && <div className="text-[11px] text-slate-400">{t("prices2.previous")}: {money(p.prev_buy, { currency: false })}</div>}</td>
              <td>{change(p.buy_change)}</td>
              <td className="num font-semibold">{money(p.sell_price, { currency: false })}{p.prev_sell && <div className="text-[11px] font-normal text-slate-400">{t("prices2.previous")}: {money(p.prev_sell, { currency: false })}</div>}</td>
              <td>{change(p.sell_change)}</td>
              <td className="font-medium">{p.entered_by_name ?? <Badge tone="blue">{t("auto.automatic")}</Badge>}</td><td className="text-xs">{p.source_name}</td><td className="text-xs text-slate-500">{p.note}</td>
            </tr>
          ))}
        </Table>
        {history.data && <Pagination page={page} count={history.data.count} onPage={setPage} />}
      </Card>
      {manager && provider && <AutoPricing src={provider} onFetch={startFetch} fetching={fetchNow.isPending} />}
      <EnterPrices open={open} onClose={() => { setOpen(false); setProposal(null); }} proposal={proposal} karats={karats.filter((k) => k.is_active)} />
    </div>
  );
}

function EnterPrices({ open, onClose, karats, proposal }: { open: boolean; onClose(): void; karats: Karat[]; proposal: Proposal | null }) {
  const { t } = useTranslation();
  const ln = useLocalName();
  const board = useGet<Board>("/price-board/").data;
  const [rows, setRows] = useState<Record<number, { buy: string; sell: string }>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open || !board) return;
    const init: Record<number, { buy: string; sell: string }> = {};
    board.rows.forEach((r) => { init[r.karat.id] = { buy: r.price?.buy_price ?? "", sell: r.price?.sell_price ?? "" }; });
    proposal?.entries.forEach((e) => { init[e.karat] = { buy: e.buy_price, sell: e.sell_price }; });
    setRows(init); setNote("");
  }, [open, board, proposal]);
  const invalid = karats.some((k) => { const r = rows[k.id]; return r && r.buy && r.sell && Number(r.buy) > Number(r.sell); });
  const save = useAction(() => {
    const entries = karats.filter((k) => rows[k.id]?.buy && rows[k.id]?.sell)
      .map((k) => ({ karat: k.id, buy_price: rows[k.id].buy, sell_price: rows[k.id].sell }));
    return api.post("/prices/record/", { entries, note, ...(proposal ? { source: proposal.source } : {}) });
  }, { invalidate: [["/price-board/"], ["/prices/"], ["/prices/editors/"], ["/reports/dashboard/"], ["/notifications/"]], success: t("prices.saved"), onSuccess: onClose });
  return (
    <Modal open={open} onClose={onClose} title={t("prices.enter")}
      footer={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button variant="gold" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></>}>
      <div className="space-y-3">
        {proposal && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            <div className="mb-1 flex items-center gap-1.5 font-bold"><Globe className="size-3.5" />{t("auto.review")}</div>
            <div>{proposal.source_name} · {t("auto.ounce")}: <b className="num">{money(proposal.ounce_price)}</b> · {t("auto.gram24")}: <b className="num">{money(proposal.gram_24k)}</b></div>
            <div className="text-sky-700">{t("auto.providerTime")}: {dateTime(proposal.provider_time)}</div>
          </div>
        )}
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

function AutoPricing({ src, onFetch, fetching }: { src: Source; onFetch(): void; fetching: boolean }) {
  const { t } = useTranslation();
  const [v, setV] = useState({ api_key: "", sell: src.sell_adjust_percent, buy: src.buy_adjust_percent, auto: src.auto_apply,
    hours: String(Math.round(src.sync_interval_minutes / 60)) });
  useEffect(() => { setV((x) => ({ ...x, sell: src.sell_adjust_percent, buy: src.buy_adjust_percent, auto: src.auto_apply,
    hours: String(Math.round(src.sync_interval_minutes / 60)) })); }, [src]);
  const save = useAction(() => api.patch(`/price-sources/${src.id}/`, {
    ...(v.api_key.trim() ? { api_key: v.api_key.trim() } : {}), sell_adjust_percent: v.sell || "0", buy_adjust_percent: v.buy || "0",
    auto_apply: v.auto, sync_interval_minutes: Math.max(1, Number(v.hours || 8)) * 60,
  }), { success: t("common.saved"), invalidate: [["/price-sources/"]], onSuccess: () => setV((x) => ({ ...x, api_key: "" })) });
  const pct = (x: string) => x.replace(/[^\d.-]/g, "");
  return (
    <section id="auto-pricing">
    <Card title={<span className="flex items-center gap-2"><Globe className="size-4 text-gold-500" />{t("auto.title")} — {src.provider_label || src.name}</span>}
      actions={<Button size="sm" variant="secondary" loading={fetching} disabled={!src.has_api_key} onClick={onFetch}>{t("auto.testFetch")}</Button>}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label={t("auto.apiKey")} hint={src.has_api_key ? t("auto.keySaved") : undefined}>
            <Input type="password" autoComplete="off" dir="ltr" value={v.api_key} placeholder={src.has_api_key ? "••••••••••••" : ""}
              onChange={(e) => setV({ ...v, api_key: e.target.value })} />
          </Field>
          {src.signup_url && <a href={src.signup_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-gold-600 hover:underline"><ExternalLink className="size-3" />{t("auto.getKey")}</a>}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("auto.sellAdj")}><Input className="num" inputMode="decimal" value={v.sell} onChange={(e) => setV({ ...v, sell: pct(e.target.value) })} /></Field>
            <Field label={t("auto.buyAdj")}><Input className="num" inputMode="decimal" value={v.buy} onChange={(e) => setV({ ...v, buy: pct(e.target.value) })} /></Field>
          </div>
          <p className="text-xs text-slate-500">{t("auto.adjHint")}</p>
        </div>
        <div className="space-y-3">
          <Checkbox label={t("auto.autoApply")} checked={v.auto} onChange={(e) => setV({ ...v, auto: e.target.checked })} />
          <Field label={t("auto.interval")} hint={t("auto.quota")}><Input className="num w-28" inputMode="numeric" value={v.hours} disabled={!v.auto} onChange={(e) => setV({ ...v, hours: e.target.value.replace(/\D/g, "") })} /></Field>
          <div className="rounded-lg bg-slate-50 p-3 text-xs">
            <div className="font-semibold text-slate-600">{t("auto.lastFetch")}</div>
            {src.last_quote?.ounce_price
              ? <div className="mt-1">{t("auto.ounce")}: <b className="num">{money(src.last_quote.ounce_price)}</b> · {t("auto.gram24")}: <b className="num">{money(src.last_quote.gram_24k)}</b> · {dateTime(src.last_success_at)}</div>
              : <div className="mt-1 text-slate-400">—</div>}
            {src.last_error && <div className="mt-1 flex items-start gap-1 text-red-600"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{src.last_error} ({dateTime(src.last_error_at)})</div>}
          </div>
          <Button variant="gold" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("auto.saveSettings")}</Button>
        </div>
      </div>
    </Card>
    </section>
  );
}
