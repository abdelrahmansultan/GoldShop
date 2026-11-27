import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useList } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { useLocalName, useLookups } from "../lib/useLookups";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, Select, Table } from "../components/ui";

export const countTone = { open: "amber", finalized: "green", cancelled: "gray" } as const;

export default function StockCounts() {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { can } = useAuth();
  const nav = useNavigate();
  const { categories } = useLookups();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", category: "" });
  const { data } = useList<any>("/stock-counts/", { page });
  const start = useAction(() => api.post("/stock-counts/", { name: v.name, category: v.category || null }), {
    invalidate: [["/stock-counts/"]], onSuccess: (r: any) => nav(`/stock-counts/${r.data.id}`),
  });
  return (
    <div className="space-y-5">
      <PageHeader title={t("count.title")} actions={can("inventory.count") && <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>{t("count.start")}</Button>} />
      <Card bodyClass="p-0">
        <Table head={[t("count.name"), t("common.date"), t("common.user"), t("count.progress"), t("count.discrepancies"), t("common.status")]} empty={data?.results.length === 0}>
          {data?.results.map((c) => (
            <tr key={c.id}>
              <td><Link className="font-semibold text-navy-700 hover:underline" to={`/stock-counts/${c.id}`}>{c.name}</Link></td>
              <td className="text-xs">{dateTime(c.created_at)}</td><td className="text-xs">{c.started_by_name}</td>
              <td className="num">{c.progress.counted} / {c.progress.total}</td><td className="num">{c.progress.discrepancies}</td>
              <td><Badge tone={countTone[c.status as keyof typeof countTone]}>{t(`count.${c.status}`)}</Badge></td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title={t("count.start")}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button loading={start.isPending} disabled={!v.name.trim()} onClick={() => start.mutate(undefined)}>{t("common.create")}</Button></>}>
        <div className="space-y-3">
          <Field label={t("count.name")}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label={`${t("inv.category")} (${t("common.optional")})`}><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}><option value="">{t("common.all")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select></Field>
        </div>
      </Modal>
    </div>
  );
}
