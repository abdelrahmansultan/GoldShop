import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useAll, useList } from "../lib/hooks";
import { dateTime, money } from "../lib/format";
import type { MoneyAccount } from "../lib/types";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Pagination, Select, Table } from "../components/ui";

export default function Treasury() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const accounts = useAll<MoneyAccount>("/accounts/").data ?? [];
  const [f, setF] = useState({ account: "", created_at__date__gte: "", created_at__date__lte: "" });
  const [page, setPage] = useState(1);
  const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== ""));
  const tx = useList<any>("/transactions/", params);
  const [modal, setModal] = useState<"" | "account" | "transfer" | "movement">("");
  const [acc, setAcc] = useState<Partial<MoneyAccount>>({ kind: "bank", is_active: true });
  const [tr, setTr] = useState({ source: "", destination: "", amount: "", note: "" });
  const [mv, setMv] = useState({ account: "", type: "deposit", amount: "", description: "" });
  const inv = [["/accounts/", "all", {}], ["/transactions/"], ["/reports/dashboard/"]];
  const close = () => setModal("");
  const saveAcc = useAction(() => (acc.id ? api.patch(`/accounts/${acc.id}/`, acc) : api.post("/accounts/", acc)), { success: t("common.saved"), invalidate: inv, onSuccess: close });
  const doTr = useAction(() => api.post("/transactions/transfer/", { ...tr, source: Number(tr.source), destination: Number(tr.destination) }), { success: t("common.saved"), invalidate: inv, onSuccess: close });
  const doMv = useAction(() => api.post("/transactions/movement/", { ...mv, account: Number(mv.account) }), { success: t("common.saved"), invalidate: inv, onSuccess: close });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <div className="space-y-5">
      <PageHeader title={t("tr.title")} actions={can("treasury.manage") && <>
        <Button variant="secondary" onClick={() => setModal("movement")}>{t("tr.movement")}</Button>
        <Button variant="secondary" icon={<ArrowLeftRight className="size-4" />} onClick={() => setModal("transfer")}>{t("tr.transfer")}</Button>
        <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => { setAcc({ kind: "bank", is_active: true }); setModal("account"); }}>{t("tr.newAccount")}</Button>
      </>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {accounts.map((a) => (
          <button type="button" key={a.id} onClick={() => { if (can("treasury.manage")) { setAcc(a); setModal("account"); } }} className="card p-4 text-start transition hover:border-gold-300">
            <div className="flex items-center justify-between"><span className="font-semibold text-navy-900">{a.name}</span>
              <span className="flex gap-1">{a.is_default && <Badge tone="gold">{t("tr.isDefault")}</Badge>}{!a.is_active && <Badge tone="red">{t("common.inactive")}</Badge>}</span></div>
            <div className="text-xs text-slate-500">{a.kind === "cash" ? t("tr.cashBox") : `${t("tr.bankAccount")} · ${a.bank_name}`}</div>
            <div className="num mt-2 text-start text-xl font-bold text-navy-900">{money(a.balance)}</div>
          </button>
        ))}
      </div>
      <Card title={t("tr.transactions")} bodyClass="p-0">
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
          <Select value={f.account} onChange={set("account")}><option value="">{t("common.account")}: {t("common.all")}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
          <Input type="date" value={f.created_at__date__gte} onChange={set("created_at__date__gte")} aria-label={t("common.from")} />
          <Input type="date" value={f.created_at__date__lte} onChange={set("created_at__date__lte")} aria-label={t("common.to")} />
        </div>
        <Table head={[t("common.date"), t("common.account"), t("common.type"), t("common.method"), t("common.description"), t("common.amount"), t("common.user")]} empty={tx.data?.results.length === 0}>
          {tx.data?.results.map((x) => (
            <tr key={x.id}><td className="text-xs">{dateTime(x.created_at)}</td><td>{x.account_name}</td><td>{t(`tx.${x.type}`)}</td>
              <td className="text-xs">{x.method ? t(`methods.${x.method}`) : ""}</td><td className="max-w-xs truncate text-xs">{x.description}</td>
              <td className={`num font-semibold ${String(x.amount).startsWith("-") ? "text-red-600" : "text-emerald-700"}`}>{money(x.amount)}</td><td className="text-xs">{x.created_by_name}</td></tr>
          ))}
        </Table>
        {tx.data && <Pagination page={page} count={tx.data.count} onPage={setPage} />}
      </Card>

      <Modal open={modal === "account"} onClose={close} title={acc.id ? acc.name! : t("tr.newAccount")}
        footer={<><Button variant="secondary" onClick={close}>{t("common.cancel")}</Button><Button loading={saveAcc.isPending} disabled={!acc.name?.trim()} onClick={() => saveAcc.mutate(undefined)}>{t("common.save")}</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.name")} className="col-span-2"><Input value={acc.name ?? ""} onChange={(e) => setAcc({ ...acc, name: e.target.value })} /></Field>
          <Field label={t("tr.kind")}><Select value={acc.kind} disabled={!!acc.id} onChange={(e) => setAcc({ ...acc, kind: e.target.value as "cash" | "bank" })}><option value="cash">{t("tr.cashBox")}</option><option value="bank">{t("tr.bankAccount")}</option></Select></Field>
          <Field label={t("tr.bankName")}><Input value={acc.bank_name ?? ""} onChange={(e) => setAcc({ ...acc, bank_name: e.target.value })} /></Field>
          <Field label={t("tr.accountNo")} className="col-span-2"><Input value={acc.account_number ?? ""} onChange={(e) => setAcc({ ...acc, account_number: e.target.value })} /></Field>
          <Checkbox label={t("tr.isDefault")} checked={!!acc.is_default} onChange={(e) => setAcc({ ...acc, is_default: e.target.checked })} />
          <Checkbox label={t("common.active")} checked={acc.is_active ?? true} onChange={(e) => setAcc({ ...acc, is_active: e.target.checked })} />
        </div>
      </Modal>
      <Modal open={modal === "transfer"} onClose={close} title={t("tr.transfer")}
        footer={<><Button variant="secondary" onClick={close}>{t("common.cancel")}</Button><Button loading={doTr.isPending} disabled={!tr.source || !tr.destination || !(Number(tr.amount) > 0)} onClick={() => doTr.mutate(undefined)}>{t("common.confirm")}</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("tr.source")}><Select value={tr.source} onChange={(e) => setTr({ ...tr, source: e.target.value })}><option value="" />{accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label={t("tr.destination")}><Select value={tr.destination} onChange={(e) => setTr({ ...tr, destination: e.target.value })}><option value="" />{accounts.filter((a) => a.is_active && String(a.id) !== tr.source).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label={t("common.amount")}><Input className="num" value={tr.amount} onChange={(e) => setTr({ ...tr, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          <Field label={t("common.notes")}><Input value={tr.note} onChange={(e) => setTr({ ...tr, note: e.target.value })} /></Field>
        </div>
      </Modal>
      <Modal open={modal === "movement"} onClose={close} title={t("tr.movement")}
        footer={<><Button variant="secondary" onClick={close}>{t("common.cancel")}</Button><Button loading={doMv.isPending} disabled={!mv.account || !(Number(mv.amount) > 0) || !mv.description.trim()} onClick={() => doMv.mutate(undefined)}>{t("common.confirm")}</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.account")}><Select value={mv.account} onChange={(e) => setMv({ ...mv, account: e.target.value })}><option value="" />{accounts.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label={t("common.type")}><Select value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })}><option value="opening">{t("tr.opening")}</option><option value="deposit">{t("tr.deposit")}</option><option value="withdrawal">{t("tr.withdrawal")}</option></Select></Field>
          <Field label={t("common.amount")}><Input className="num" value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          <Field label={t("common.description")}><Input value={mv.description} onChange={(e) => setMv({ ...mv, description: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
