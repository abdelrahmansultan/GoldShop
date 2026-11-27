import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useList } from "../lib/hooks";
import { dateTime, money } from "../lib/format";
import type { Party } from "../lib/types";
import { PAYMENT_METHODS } from "../lib/useLookups";
import { Button, Card, Checkbox, Field, Input, Modal, PageHeader, Pagination, Select, Table, Textarea } from "../components/ui";

export default function Parties({ kind }: { kind: "customers" | "suppliers" }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const isC = kind === "customers";
  const [search, setSearch] = useState("");
  const [hasBalance, setHasBalance] = useState(false);
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Partial<Party> | null>(null);
  const [view, setView] = useState<Party | null>(null);
  const { data, refetch } = useList<Party>(`/${kind}/`, { page, search: search || undefined, has_balance: hasBalance ? 1 : undefined });
  useEffect(() => {
    const id = sp.get("open");
    if (id) { api.get<Party>(`/${kind}/${id}/`).then((r) => setView(r.data)).catch(() => undefined); setSp({}, { replace: true }); }
  }, [sp, setSp, kind]);
  const save = useAction(() => (edit?.id ? api.patch(`/${kind}/${edit.id}/`, edit) : api.post(`/${kind}/`, edit ?? {})), {
    success: t("common.saved"), invalidate: [[`/${kind}/`]], onSuccess: () => setEdit(null),
  });
  const s = (k: keyof Party) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <div className="space-y-5">
      <PageHeader title={isC ? t("party.customers") : t("party.suppliers")}
        actions={<Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: "", is_active: true })}>{isC ? t("party.newCustomer") : t("party.newSupplier")}</Button>} />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-4">
          <Input className="max-w-sm" placeholder={`${t("common.search")}…`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <Checkbox label={t("party.hasBalance")} checked={hasBalance} onChange={(e) => setHasBalance(e.target.checked)} />
        </div>
        <Table head={[t("common.name"), t("common.phone"), t("party.nationalId"), isC ? t("party.creditLimit") : t("party.taxNo"), t("common.balance"), t("common.status"), ""]} empty={data?.results.length === 0}>
          {data?.results.map((p) => (
            <tr key={p.id}>
              <td className="font-semibold"><button type="button" className="text-navy-700 hover:underline" onClick={() => setView(p)}>{p.name}</button></td>
              <td>{p.phone}</td><td className="text-xs">{p.national_id}</td>
              <td className="num">{isC ? money(p.credit_limit) : p.tax_registration_no}</td>
              <td className={`num font-semibold ${Number(p.balance) > 0 ? "text-amber-700" : ""}`}>{money(p.balance)}</td>
              <td>{p.is_active ? t("common.active") : t("common.inactive")}</td>
              <td><Button size="sm" variant="ghost" onClick={() => setEdit(p)}>{t("common.edit")}</Button></td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t("common.edit") : isC ? t("party.newCustomer") : t("party.newSupplier")}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{t("common.cancel")}</Button><Button loading={save.isPending} disabled={!edit?.name?.trim()} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></>}>
        {edit && <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.name")} className="col-span-2"><Input value={edit.name ?? ""} onChange={s("name")} /></Field>
          <Field label={t("common.phone")}><Input value={edit.phone ?? ""} onChange={s("phone")} /></Field>
          <Field label={t("party.nationalId")}><Input value={edit.national_id ?? ""} onChange={s("national_id")} /></Field>
          {isC ? (can("sales.discount_override") || can("treasury.manage")) && <Field label={t("party.creditLimit")}><Input className="num" value={edit.credit_limit ?? "0"} onChange={s("credit_limit")} /></Field>
            : <Field label={t("party.taxNo")}><Input value={edit.tax_registration_no ?? ""} onChange={s("tax_registration_no")} /></Field>}
          <Field label={t("common.address")} className="col-span-2"><Input value={edit.address ?? ""} onChange={s("address")} /></Field>
          <Field label={t("common.notes")} className="col-span-2"><Textarea value={edit.notes ?? ""} onChange={s("notes")} /></Field>
          <Checkbox label={t("common.active")} checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
        </div>}
      </Modal>
      {view && <Statement kind={kind} party={view} onClose={() => { setView(null); void refetch(); }} />}
    </div>
  );
}

function Statement({ kind, party, onClose }: { kind: string; party: Party; onClose(): void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pay, setPay] = useState({ amount: "", method: "cash", reference_no: "", note: "" });
  const [cur, setCur] = useState(party);
  const { data, refetch } = useList<any>(`/${kind}/${party.id}/ledger/`, { page });
  const canPay = kind === "customers" ? can("sales.create") : can("purchases.manage");
  const doPay = useAction(() => api.post<Party>(`/${kind}/${party.id}/payment/`, pay), {
    success: t("common.saved"), invalidate: [["/reports/dashboard/"]], onSuccess: (r) => { setCur(r.data); setPay({ ...pay, amount: "", reference_no: "", note: "" }); void refetch(); },
  });
  return (
    <Modal wide open onClose={onClose} title={`${t("party.ledger")} — ${cur.name}`}>
      <div className="mb-3 flex items-center justify-between rounded-lg bg-navy-900 px-4 py-3 text-white">
        <span>{t("common.balance")}</span><span className="num text-lg font-bold text-gold-300">{money(cur.balance)}</span>
      </div>
      {canPay && (
        <div className="mb-4 grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
          <Field label={t("common.amount")}><Input className="num" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          <Field label={t("common.method")}><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</Select></Field>
          <Field label={t("pos.refNo")}><Input value={pay.reference_no} onChange={(e) => setPay({ ...pay, reference_no: e.target.value })} /></Field>
          <Field label={t("common.notes")}><Input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
          <Button loading={doPay.isPending} disabled={!(Number(pay.amount) > 0)} onClick={() => doPay.mutate(undefined)}>{kind === "customers" ? t("party.receivePayment") : t("party.paySupplier")}</Button>
        </div>
      )}
      <Table head={[t("common.date"), t("common.description"), t("common.amount")]} empty={data?.results.length === 0}>
        {data?.results.map((e) => (
          <tr key={e.id}><td className="text-xs">{dateTime(e.created_at)}</td><td>{e.description}</td>
            <td className={`num font-semibold ${String(e.amount).startsWith("-") ? "text-emerald-700" : "text-amber-700"}`}>{money(e.amount)}</td></tr>
        ))}
      </Table>
      {data && <Pagination page={page} count={data.count} onPage={setPage} />}
    </Modal>
  );
}
