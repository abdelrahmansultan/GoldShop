import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useList } from "../lib/hooks";
import { dateTime, weight } from "../lib/format";
import { Badge, Button, Card, ConfirmDialog, Input, PageHeader, Pagination, Select, Table } from "../components/ui";

const tone = { pending: "amber", approved: "green", rejected: "red" } as const;

export default function Adjustments() {
  const { t } = useTranslation();
  const { can, user } = useAuth();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [decide, setDecide] = useState<{ id: number; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const { data } = useList<any>("/adjustments/", { page, status: status || undefined });
  const act = useAction((d: { id: number; approve: boolean }) => api.post(`/adjustments/${d.id}/decide/`, { approve: d.approve, note }),
    { invalidate: [["/adjustments/"], ["/products/"], ["/reports/dashboard/"]], success: t("common.saved"), onSuccess: () => { setDecide(null); setNote(""); } });
  return (
    <div className="space-y-5">
      <PageHeader title={t("adj.title")} />
      <Card bodyClass="p-0" actions={
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44">
          <option value="">{t("common.all")}</option>{Object.keys(tone).map((s) => <option key={s} value={s}>{t(`adj.${s}`)}</option>)}
        </Select>}>
        <Table head={[t("common.date"), t("inv.item"), t("inv.qtyDelta"), t("inv.newGross"), t("common.reason"), t("adj.requestedBy"), t("common.status"), t("common.actions")]}
          empty={data?.results.length === 0}>
          {data?.results.map((a) => (
            <tr key={a.id}>
              <td className="text-xs">{dateTime(a.created_at)}</td>
              <td><Link className="font-semibold text-navy-700 hover:underline" to={`/inventory/${a.product}`}>{a.product_code}</Link> <span className="text-xs text-slate-500">{a.product_name}</span></td>
              <td className={`num font-bold ${a.quantity_delta < 0 ? "text-red-600" : "text-emerald-700"}`}>{a.quantity_delta > 0 ? "+" : ""}{a.quantity_delta}</td>
              <td className="num text-xs">{a.new_gross_weight ? weight(a.new_gross_weight) : "—"}{a.new_stone_weight ? ` / ${weight(a.new_stone_weight)}` : ""}</td>
              <td className="max-w-xs text-xs">{a.reason}</td><td className="text-xs">{a.requested_by_name}</td>
              <td><Badge tone={tone[a.status as keyof typeof tone]}>{t(`adj.${a.status}`)}</Badge>{a.decided_by_name && <div className="text-[11px] text-slate-500">{a.decided_by_name} · {a.decision_note}</div>}</td>
              <td>{a.status === "pending" && can("inventory.adjust.approve") && (user?.role === "owner" || a.requested_by !== user?.id) && (
                <div className="flex gap-1"><Button size="sm" onClick={() => setDecide({ id: a.id, approve: true })}>{t("common.approve")}</Button><Button size="sm" variant="secondary" onClick={() => setDecide({ id: a.id, approve: false })}>{t("common.reject")}</Button></div>
              )}</td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
      <ConfirmDialog open={!!decide} onClose={() => setDecide(null)} loading={act.isPending} danger={decide?.approve === false}
        title={decide?.approve ? t("common.approve") : t("common.reject")} message={decide?.approve ? t("adj.confirmApprove") : t("common.reject")}
        onConfirm={() => decide && act.mutate(decide)}>
        <Input className="mt-3" placeholder={t("adj.decision")} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
