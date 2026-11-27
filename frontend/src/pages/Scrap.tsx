import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGet, useList } from "../lib/hooks";
import { dateTime, money, weight } from "../lib/format";
import { Card, PageHeader, Pagination, Table } from "../components/ui";

export default function Scrap() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data } = useList<any>("/scrap-gold/", { page });
  const val = useGet<any[]>("/inventory/valuation/").data;
  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.scrap")} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {val?.map((v) => <div key={v.karat_id} className="card p-3"><div className="font-bold text-navy-900">{v.karat}K</div><div className="num text-start text-lg font-bold text-gold-600">{weight(v.scrap_weight)}</div></div>)}
      </div>
      <Card bodyClass="p-0">
        <Table head={[t("common.date"), t("inv.karat"), t("common.type"), t("pos.weight"), t("common.amount"), t("common.reference")]} empty={data?.results.length === 0}>
          {data?.results.map((s) => (
            <tr key={s.id}><td className="text-xs">{dateTime(s.created_at)}</td><td>{s.karat_code}K</td><td>{t(`scrapTypes.${s.type}`)}</td>
              <td className="num">{weight(s.weight)}</td><td className="num">{money(s.value)}</td><td className="text-xs">{s.note}</td></tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
    </div>
  );
}
