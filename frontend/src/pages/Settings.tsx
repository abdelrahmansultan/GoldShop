import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAction, useAll, useGet } from "../lib/hooks";
import { dateTime } from "../lib/format";
import type { Karat, Lookup } from "../lib/types";
import { useLocalName } from "../lib/useLookups";
import { Button, Card, Checkbox, Field, Input, PageHeader, Spinner, Table } from "../components/ui";

export default function Settings() {
  const { t } = useTranslation();
  const { data } = useGet<any>("/settings/");
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (data) setS(data); }, [data]);
  const save = useAction(() => { const { logo: _l, ...rest } = s; return api.patch("/settings/", rest); }, { success: t("common.saved"), invalidate: [["/settings/"]] });
  if (!s) return <Spinner />;
  const f = (k: string, label: string, props: Record<string, unknown> = {}) => <Field label={label}><Input value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value })} {...props} /></Field>;
  return (
    <div className="space-y-5">
      <PageHeader title={t("settings.title")} actions={<Button variant="gold" loading={save.isPending} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button>} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title={t("settings.shop")}>
          <div className="grid grid-cols-2 gap-3">
            {f("name_ar", t("common.nameAr"))}{f("name_en", t("common.nameEn"), { dir: "ltr" })}
            {f("address", t("common.address"))}{f("phone", t("common.phone"))}
            {f("tax_registration_no", t("settings.taxNo"))}{f("commercial_registration_no", t("settings.crNo"))}
            {f("invoice_footer_ar", t("settings.footerAr"))}{f("invoice_footer_en", t("settings.footerEn"))}
          </div>
        </Card>
        <Card title={t("settings.tax")}>
          <div className="grid grid-cols-2 gap-3">
            {f("vat_rate", t("settings.vatRate"), { className: "num" })}{f("max_discount_percent_cashier", t("settings.maxDiscount"), { className: "num" })}
            {f("price_stale_after_hours", t("settings.staleHours"), { className: "num" })}
            <div className="col-span-2 flex flex-wrap gap-4">
              <Checkbox label={t("settings.vatOnMaking")} checked={s.vat_on_making_charge} onChange={(e) => setS({ ...s, vat_on_making_charge: e.target.checked })} />
              <Checkbox label={t("settings.vatOnGold")} checked={s.vat_on_gold} onChange={(e) => setS({ ...s, vat_on_gold: e.target.checked })} />
              <Checkbox label={t("settings.vatOnStones")} checked={s.vat_on_stones} onChange={(e) => setS({ ...s, vat_on_stones: e.target.checked })} />
              <Checkbox label={t("settings.requireDaily")} checked={s.require_daily_price} onChange={(e) => setS({ ...s, require_daily_price: e.target.checked })} />
            </div>
          </div>
        </Card>
        <KaratsCard />
        <LookupCard path="/categories/" title={t("inv.category")} />
        <LookupCard path="/jewelry-types/" title={t("inv.jewelryType")} />
        <Backups />
      </div>
    </div>
  );
}

function KaratsCard() {
  const { t } = useTranslation();
  const karats = useAll<Karat>("/karats/").data ?? [];
  const [n, setN] = useState({ code: "", name_ar: "", name_en: "", purity: "" });
  const add = useAction(() => api.post("/karats/", { ...n, sort_order: karats.length + 1 }), { success: t("common.saved"), invalidate: [["/karats/", "all", {}]], onSuccess: () => setN({ code: "", name_ar: "", name_en: "", purity: "" }) });
  const toggle = useAction((k: Karat) => api.patch(`/karats/${k.id}/`, { is_active: !k.is_active }), { invalidate: [["/karats/", "all", {}]] });
  return (
    <Card title={t("settings.karats")} bodyClass="p-0">
      <Table head={[t("common.code"), t("common.name"), t("settings.purity"), t("common.status")]}>
        {karats.map((k) => <tr key={k.id}><td className="font-bold">{k.code}K</td><td>{k.name_ar} / {k.name_en}</td><td className="num">{k.purity}</td>
          <td><Checkbox label={k.is_active ? t("common.active") : t("common.inactive")} checked={k.is_active} onChange={() => toggle.mutate(k)} /></td></tr>)}
      </Table>
      <div className="grid grid-cols-5 gap-2 p-3">
        <Input placeholder="14" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value })} />
        <Input placeholder={t("common.nameAr")} value={n.name_ar} onChange={(e) => setN({ ...n, name_ar: e.target.value })} />
        <Input placeholder={t("common.nameEn")} value={n.name_en} onChange={(e) => setN({ ...n, name_en: e.target.value })} />
        <Input placeholder="0.5850" className="num" value={n.purity} onChange={(e) => setN({ ...n, purity: e.target.value })} />
        <Button disabled={!n.code || !n.purity || !n.name_ar} loading={add.isPending} onClick={() => add.mutate(undefined)}>{t("common.add")}</Button>
      </div>
    </Card>
  );
}

function LookupCard({ path, title }: { path: string; title: string }) {
  const { t } = useTranslation();
  const ln = useLocalName();
  const items = useAll<Lookup>(path).data ?? [];
  const [n, setN] = useState({ code: "", name_ar: "", name_en: "" });
  const add = useAction(() => api.post(path, n), { success: t("common.saved"), invalidate: [[path, "all", {}]], onSuccess: () => setN({ code: "", name_ar: "", name_en: "" }) });
  const toggle = useAction((x: Lookup) => api.patch(`${path}${x.id}/`, { is_active: !x.is_active }), { invalidate: [[path, "all", {}]] });
  return (
    <Card title={title}>
      <div className="mb-3 flex flex-wrap gap-2">{items.map((x) => (
        <button type="button" key={x.id} onClick={() => toggle.mutate(x)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${x.is_active ? "bg-gold-50 text-gold-600 ring-gold-200" : "bg-slate-100 text-slate-400 line-through ring-slate-200"}`}>{ln(x)}</button>
      ))}</div>
      <div className="grid grid-cols-4 gap-2">
        <Input placeholder={t("common.code")} dir="ltr" value={n.code} onChange={(e) => setN({ ...n, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
        <Input placeholder={t("common.nameAr")} value={n.name_ar} onChange={(e) => setN({ ...n, name_ar: e.target.value })} />
        <Input placeholder={t("common.nameEn")} value={n.name_en} onChange={(e) => setN({ ...n, name_en: e.target.value })} />
        <Button disabled={!n.code || !n.name_ar || !n.name_en} loading={add.isPending} onClick={() => add.mutate(undefined)}>{t("common.add")}</Button>
      </div>
    </Card>
  );
}

function Backups() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useGet<any[]>("/backups/");
  const make = useAction(() => api.post("/backups/"), { success: t("common.saved"), onSuccess: () => qc.invalidateQueries({ queryKey: ["/backups/"] }) });
  return (
    <Card title={t("settings.backups")} actions={<Button size="sm" loading={make.isPending} onClick={() => make.mutate(undefined)}>{t("settings.createBackup")}</Button>} bodyClass="p-0">
      <Table head={[t("common.name"), t("common.date"), t("settings.size")]} empty={data?.length === 0}>
        {data?.map((b) => <tr key={b.name}><td className="font-mono text-xs">{b.name}</td><td className="text-xs">{dateTime(b.created_at)}</td><td className="num text-xs">{(b.size / 1024 / 1024).toFixed(2)} MB</td></tr>)}
      </Table>
    </Card>
  );
}
