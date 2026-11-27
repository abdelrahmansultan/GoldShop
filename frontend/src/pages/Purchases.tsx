import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useList } from "../lib/hooks";
import { date, money, weight } from "../lib/format";
import { Button, Card, Input, PageHeader, Pagination, Table } from "../components/ui";

export default function Purchases() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useList<any>("/purchases/", { page, search: search || undefined });
  return (
    <div className="space-y-5">
      <PageHeader title={t("pur.title")} actions={<Button variant="gold" icon={<Plus className="size-4" />} onClick={() => nav("/purchases/new")}>{t("pur.new")}</Button>} />
      <Card bodyClass="p-0">
        <div className="border-b border-slate-100 p-4"><Input className="max-w-sm" placeholder={`${t("common.search")}…`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <Table head={[t("common.code"), t("common.date"), t("inv.supplier"), t("pur.supplierInvoice"), t("inv.net"), t("common.total"), t("pos.paid"), t("pos.remaining")]} empty={data?.results.length === 0}>
          {data?.results.map((p) => (
            <tr key={p.id}>
              <td><Link className="font-semibold text-navy-700 hover:underline" to={`/purchases/${p.id}`}>{p.number}</Link></td>
              <td>{date(p.date)}</td><td>{p.supplier_name}</td><td className="text-xs">{p.supplier_invoice_no}</td>
              <td className="num">{weight(p.total_weight)}</td><td className="num font-semibold">{money(p.total)}</td>
              <td className="num">{money(p.paid_amount)}</td><td className="num">{money(p.credit_amount)}</td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
    </div>
  );
}
