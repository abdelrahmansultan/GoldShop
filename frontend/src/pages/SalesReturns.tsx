import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useList } from "../lib/hooks";
import { dateTime, money } from "../lib/format";
import { Card, Input, PageHeader, Pagination, Table } from "../components/ui";

export default function SalesReturns() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useList<any>("/sales-returns/", { page, search: search || undefined });
  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.returns")} />
      <Card bodyClass="p-0">
        <div className="border-b border-slate-100 p-4"><Input className="max-w-sm" placeholder={`${t("common.search")}…`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <Table head={[t("common.code"), t("common.date"), t("sales.number"), t("sales.items"), t("common.reason"), t("sales.settlement"), t("common.amount")]} empty={data?.results.length === 0}>
          {data?.results.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-xs font-semibold">{r.number}</td><td className="text-xs">{dateTime(r.created_at)}</td>
              <td><Link className="text-navy-700 hover:underline" to={`/sales/${r.invoice}`}>{r.invoice_number}</Link></td>
              <td className="text-xs">{r.lines.map((l: any) => `${l.product_code} ×${l.quantity}`).join(", ")}</td>
              <td className="text-xs">{r.reason}</td><td>{t(`sales.${r.settlement}`)}</td><td className="num font-semibold">{money(r.amount)}</td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
    </div>
  );
}
