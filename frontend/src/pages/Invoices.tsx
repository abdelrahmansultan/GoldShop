import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useList } from "../lib/hooks";
import { dateTime, money, weight } from "../lib/format";
import { Badge, Card, Input, PageHeader, Pagination, Select, Table } from "../components/ui";

export const invTone: Record<string, "green" | "amber" | "gray"> = { posted: "green", partially_returned: "amber", returned: "gray" };

export default function Invoices() {
  const { t } = useTranslation();
  const [f, setF] = useState({ search: "", status: "", issued_at__date__gte: "", issued_at__date__lte: "" });
  const [page, setPage] = useState(1);
  const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== ""));
  const { data } = useList<any>("/sales/", params);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <div className="space-y-5">
      <PageHeader title={t("sales.title")} />
      <Card bodyClass="p-0">
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
          <Input placeholder={`${t("common.search")}…`} value={f.search} onChange={set("search")} />
          <Select value={f.status} onChange={set("status")}><option value="">{t("common.status")}: {t("common.all")}</option>{Object.keys(invTone).map((s) => <option key={s} value={s}>{t(`sales.status.${s}`)}</option>)}</Select>
          <Input type="date" value={f.issued_at__date__gte} onChange={set("issued_at__date__gte")} aria-label={t("common.from")} />
          <Input type="date" value={f.issued_at__date__lte} onChange={set("issued_at__date__lte")} aria-label={t("common.to")} />
        </div>
        <Table head={[t("sales.number"), t("sales.issuedAt"), t("pos.customer"), t("sales.items"), t("inv.net"), t("pos.grandTotal"), t("pos.netPayable"), t("pos.remaining"), t("sales.cashier"), t("common.status")]}
          empty={data?.results.length === 0}>
          {data?.results.map((i) => (
            <tr key={i.id}>
              <td><Link to={`/sales/${i.id}`} className="font-semibold text-navy-700 hover:underline">{i.number}</Link></td>
              <td className="text-xs">{dateTime(i.issued_at)}</td><td>{i.customer_name || t("pos.walkIn")}</td><td className="num">{i.items}</td>
              <td className="num">{weight(i.total_weight)}</td><td className="num font-semibold">{money(i.grand_total)}</td>
              <td className="num">{money(i.net_payable)}</td><td className="num">{money(i.credit_amount)}</td>
              <td className="text-xs">{i.created_by_name}</td><td><Badge tone={invTone[i.status]}>{t(`sales.status.${i.status}`)}</Badge></td>
            </tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
    </div>
  );
}
