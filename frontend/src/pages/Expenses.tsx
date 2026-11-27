import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useAll, useList } from "../lib/hooks";
import { date, money, todayISO } from "../lib/format";
import type { MoneyAccount } from "../lib/types";
import { useLocalName } from "../lib/useLookups";
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Pagination, Select, Table } from "../components/ui";

export default function Expenses() {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { can } = useAuth();
  const cats = useAll<any>("/expense-categories/").data ?? [];
  const accounts = (useAll<MoneyAccount>("/accounts/").data ?? []).filter((a) => a.is_active);
  const [f, setF] = useState({ category: "", date__gte: "", date__lte: "" });
  const [page, setPage] = useState(1);
  const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== ""));
  const { data } = useList<any>("/expenses/", params);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ category: "", amount: "", account: "", date: todayISO(), description: "" });
  const [voiding, setVoiding] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [cat, setCat] = useState({ name_ar: "", name_en: "" });
  const inv = [["/expenses/"], ["/accounts/", "all", {}], ["/reports/dashboard/"]];
  const save = useAction(() => api.post("/expenses/", { ...v, category: Number(v.category), account: Number(v.account) }), {
    success: t("common.saved"), invalidate: inv, onSuccess: () => { setOpen(false); setV({ ...v, amount: "", description: "" }); },
  });
  const voidIt = useAction(() => api.post(`/expenses/${voiding.id}/void/`, { reason }), { success: t("common.saved"), invalidate: inv, onSuccess: () => { setVoiding(null); setReason(""); } });
  const addCat = useAction(() => api.post("/expense-categories/", cat), { invalidate: [["/expense-categories/", "all", {}]], onSuccess: () => { setCatOpen(false); setCat({ name_ar: "", name_en: "" }); } });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <div className="space-y-5">
      <PageHeader title={t("exp.title")} actions={can("treasury.manage") && <>
        <Button variant="secondary" onClick={() => setCatOpen(true)}>{t("exp.categories")}</Button>
        <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>{t("exp.new")}</Button></>} />
      <Card bodyClass="p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <Select value={f.category} onChange={set("category")}><option value="">{t("exp.category")}: {t("common.all")}</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select>
          <Input type="date" value={f.date__gte} onChange={set("date__gte")} aria-label={t("common.from")} />
          <Input type="date" value={f.date__lte} onChange={set("date__lte")} aria-label={t("common.to")} />
        </div>
        <Table head={[t("common.code"), t("common.date"), t("exp.category"), t("common.description"), t("common.account"), t("common.amount"), ""]} empty={data?.results.length === 0}>
          {data?.results.map((e) => (
            <tr key={e.id} className={e.is_void ? "opacity-50" : ""}>
              <td className="font-mono text-xs">{e.number}</td><td>{date(e.date)}</td><td>{ln({ name_ar: e.category_name_ar, name_en: e.category_name_en })}</td>
              <td className="text-xs">{e.description}{e.is_void && <div className="text-red-600">{t("exp.voided")}: {e.void_reason}</div>}</td><td>{e.account_name}</td>
              <td className={`num font-semibold ${e.is_void ? "line-through" : ""}`}>{money(e.amount)}</td>
              <td>{e.is_void ? <Badge tone="red">{t("exp.voided")}</Badge> : can("treasury.manage") && <Button size="sm" variant="ghost" onClick={() => setVoiding(e)}>{t("exp.void")}</Button>}</td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title={t("exp.new")}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button loading={save.isPending} disabled={!v.category || !v.account || !(Number(v.amount) > 0) || !v.description.trim()} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("exp.category")}><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}><option value="" />{cats.filter((c: any) => c.is_active).map((c: any) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select></Field>
          <Field label={t("common.account")}><Select value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })}><option value="" />{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label={t("common.amount")}><Input className="num" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          <Field label={t("common.date")}><Input type="date" max={todayISO()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label={t("common.description")} className="col-span-2"><Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={300} /></Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} danger loading={voidIt.isPending} title={t("exp.void")} message={`${voiding?.number} · ${money(voiding?.amount)}`} onConfirm={() => voidIt.mutate(undefined)}>
        <Input className="mt-3" placeholder={t("common.reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
      <Modal open={catOpen} onClose={() => setCatOpen(false)} title={t("exp.categories")}
        footer={<Button loading={addCat.isPending} disabled={!cat.name_ar.trim() || !cat.name_en.trim()} onClick={() => addCat.mutate(undefined)}>{t("common.add")}</Button>}>
        <ul className="mb-3 space-y-1 text-sm">{cats.map((c: any) => <li key={c.id}>• {ln(c)}</li>)}</ul>
        <div className="grid grid-cols-2 gap-2"><Input placeholder={t("common.nameAr")} value={cat.name_ar} onChange={(e) => setCat({ ...cat, name_ar: e.target.value })} /><Input placeholder={t("common.nameEn")} value={cat.name_en} onChange={(e) => setCat({ ...cat, name_en: e.target.value })} /></div>
      </Modal>
    </div>
  );
}
